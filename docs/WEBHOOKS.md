# Inclufy Marketing — Webhooks

Real-time notifications when something happens in your Inclufy account.

When a tracked event occurs — a post is published, a contact is created, a campaign reaches a milestone — Inclufy sends an HTTP POST to a URL you configure. Your server uses this to keep CRMs in sync, trigger downstream automations, or feed your own analytics warehouse without polling our API.

---

## 1. Quick start

1. **Get an endpoint.** Spin up an HTTPS endpoint on your server that accepts `POST` with a JSON body. For local testing, use [webhook.site](https://webhook.site) or `ngrok http`.

2. **Register the webhook** in Inclufy:
   - In the app: **Settings → Integrations → Webhooks → New webhook**
   - Or via API: `POST /rest/v1/webhooks` with `{url, secret, events}`. Generate a strong random `secret` (≥ 32 bytes, hex-encoded). Inclufy never sees it again after creation — store it server-side.

3. **Receive a delivery.** When an event fires, you'll get a POST within seconds:

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: Inclufy-Webhooks/1.0
X-Inclufy-Event: post.published
X-Inclufy-Delivery: 9e59816f-de7f-4277-a18a-5f92bf40488a
X-Inclufy-Signature: t=1717920000,v1=4f5a9b2c8e1d3f6a...

{
  "event": "post.published",
  "delivery_id": "9e59816f-de7f-4277-a18a-5f92bf40488a",
  "occurred_at": "2026-06-09T06:00:00.000Z",
  "organization_id": "8be330bb-2f4f-42d6-bed3-71a372164129",
  "payload": {
    "post_id": "abc-123",
    "channel": "linkedin",
    "title": "Hello world"
  }
}
```

4. **Verify the signature** — see § 4. Skip verification only in local dev.

5. **Respond with 2xx within 10 seconds.** Inclufy reads the HTTP status; anything in `200..299` marks the delivery successful. The response body is captured (first 1 KB) for debugging but not parsed.

---

## 2. Event catalog

Subscribe to specific events or leave the `events` array empty to receive everything.

| Event | When it fires | Payload keys |
|-------|---------------|--------------|
| `post.published` | A post is successfully published to a channel | `post_id`, `channel`, `title`, `url?`, `published_at` |
| `post.failed` | A scheduled post fails to publish | `post_id`, `channel`, `error`, `attempted_at` |
| `post.approval_requested` | A post enters the approval queue | `post_id`, `requested_by`, `channels[]` |
| `post.approved` | Approver greenlights a queued post | `post_id`, `approved_by`, `approved_at` |
| `post.rejected` | Approver rejects a queued post | `post_id`, `rejected_by`, `reason` |
| `contact.created` | New contact added (manual / import / lead form) | `contact_id`, `email?`, `source` |
| `contact.consent_changed` | Marketing consent toggled | `contact_id`, `consent`, `changed_at` |
| `campaign.created` | New ad campaign queued in dry-run | `campaign_id`, `channel`, `budget` |
| `campaign.approved` | Campaign moves from dry-run to live | `campaign_id`, `approved_by` |
| `campaign.metric_threshold` | Spend/CPL/ROAS crosses a configured threshold | `campaign_id`, `metric`, `value`, `threshold` |
| `event.scanned` | Event scanner extracts a new lead via QR/OCR | `event_id`, `lead_id`, `confidence` | *(planned: persistence layer ships Q3 2026)* |
| `lead.scored` | Predictive lead-scoring assigns/updates a score | `lead_id`, `score`, `tier` | *(planned: persistence layer ships Q3 2026)* |
| `agent.run_completed` | A multi-agent run finishes (success or fail) | `run_id`, `agent_name`, `outcome` |

New events are added without breaking existing subscriptions — your handler should ignore events it doesn't recognise.

---

## 3. Headers

Every delivery carries:

| Header | Example | Purpose |
|--------|---------|---------|
| `Content-Type` | `application/json` | Always JSON |
| `User-Agent` | `Inclufy-Webhooks/1.0` | Identify us in your logs |
| `X-Inclufy-Event` | `post.published` | Same as `event` in body, for quick routing |
| `X-Inclufy-Delivery` | `<uuid>` | Stable per delivery — use for idempotency dedup |
| `X-Inclufy-Signature` | `t=<unix_ts>,v1=<hex_hmac>` | See § 4 |

---

## 4. Verifying signatures

Every payload is signed with HMAC-SHA256 using your webhook's `secret`. **Verify on every request.** A failed verification means the body was tampered with, replayed, or sent by an attacker — drop with 401, do not process.

### 4.1 Algorithm

```
signed_payload = `${timestamp}.${raw_body}`
expected_v1    = HMAC_SHA256(secret, signed_payload)
received_v1    = parse 'v1=' segment from X-Inclufy-Signature
valid          = constant_time_eq(expected_v1, received_v1)
                 AND abs(now_unix - timestamp) <= 300
```

The 300-second replay window prevents an attacker who recorded a past delivery from re-playing it later. Tighten it if your server clocks are tightly synced; widen only if you see clock drift.

### 4.2 Code samples

**Node.js (Express)**

```ts
import crypto from 'crypto';
import express from 'express';

const app = express();
const SECRET = process.env.INCLUFY_WEBHOOK_SECRET!;

// IMPORTANT: capture the RAW body before any JSON parsing — re-stringifying
// after parsing reorders keys and breaks the signature.
app.post('/webhooks/inclufy',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sigHeader = req.header('X-Inclufy-Signature') ?? '';
    const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
    const ts = parseInt(parts.t ?? '0', 10);
    const v1 = parts.v1 ?? '';

    if (Math.abs(Date.now() / 1000 - ts) > 300) return res.status(401).end('replay');

    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(`${ts}.${req.body.toString('utf8')}`)
      .digest('hex');

    const safe = expected.length === v1.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
    if (!safe) return res.status(401).end('bad signature');

    const body = JSON.parse(req.body.toString('utf8'));
    // Idempotency: dedup on body.delivery_id in your DB before side effects.
    handle(body);
    res.status(200).end();
  });
```

**Python (Flask)**

```python
import hmac, hashlib, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = b"whsec_..."

@app.post("/webhooks/inclufy")
def receive():
    sig_header = request.headers.get("X-Inclufy-Signature", "")
    parts = dict(p.split("=") for p in sig_header.split(",") if "=" in p)
    ts = int(parts.get("t", "0"))
    v1 = parts.get("v1", "")

    if abs(time.time() - ts) > 300:
        abort(401)

    body = request.get_data()  # raw bytes — do not call get_json() first
    expected = hmac.new(SECRET, f"{ts}.{body.decode()}".encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, v1):
        abort(401)

    payload = request.get_json(force=True)
    # Dedup on payload['delivery_id']
    handle(payload)
    return "", 200
```

**PHP**

```php
<?php
$secret = getenv('INCLUFY_WEBHOOK_SECRET');
$sigHeader = $_SERVER['HTTP_X_INCLUFY_SIGNATURE'] ?? '';
$parts = [];
foreach (explode(',', $sigHeader) as $p) {
    [$k, $v] = array_pad(explode('=', $p, 2), 2, '');
    $parts[$k] = $v;
}
$ts = (int)($parts['t'] ?? 0);
$v1 = $parts['v1'] ?? '';

if (abs(time() - $ts) > 300) { http_response_code(401); exit; }

$body = file_get_contents('php://input'); // raw, never $_POST
$expected = hash_hmac('sha256', "$ts.$body", $secret);

if (!hash_equals($expected, $v1)) { http_response_code(401); exit; }

$payload = json_decode($body, true);
// Dedup on $payload['delivery_id']
handle($payload);
http_response_code(200);
```

**Go**

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "io"
    "net/http"
    "strconv"
    "strings"
    "time"
)

var secret = []byte("whsec_...")

func receive(w http.ResponseWriter, r *http.Request) {
    sigHeader := r.Header.Get("X-Inclufy-Signature")
    var ts int64
    var v1 string
    for _, p := range strings.Split(sigHeader, ",") {
        kv := strings.SplitN(p, "=", 2)
        if len(kv) != 2 { continue }
        switch kv[0] {
        case "t": ts, _ = strconv.ParseInt(kv[1], 10, 64)
        case "v1": v1 = kv[1]
        }
    }

    if abs64(time.Now().Unix() - ts) > 300 { http.Error(w, "replay", 401); return }

    body, _ := io.ReadAll(r.Body)
    mac := hmac.New(sha256.New, secret)
    mac.Write([]byte(strconv.FormatInt(ts, 10) + "." + string(body)))
    expected := hex.EncodeToString(mac.Sum(nil))

    if !hmac.Equal([]byte(expected), []byte(v1)) {
        http.Error(w, "bad signature", 401)
        return
    }

    // Dedup on parsed body.delivery_id
    handle(body)
    w.WriteHeader(200)
}

func abs64(x int64) int64 { if x < 0 { return -x }; return x }
```

---

## 5. Retry & dead-letter

If your endpoint doesn't return `2xx` within 10 seconds (or returns an error), Inclufy retries.

| Failure cause | Retry? | Backoff schedule |
|---------------|--------|------------------|
| Network timeout / connection refused | yes | 30s · 2m · 10m · 1h · 6h |
| HTTP 5xx | yes | same as above |
| HTTP 429 | yes | same as above (honors `Retry-After` if sent) |
| HTTP 4xx (other than 429) | **no** | straight to dead-letter |
| 5 retries exhausted | **no** | dead-letter |

When a delivery enters dead-letter:

1. The `webhooks.failure_count` counter on your registered webhook increments.
2. After 10 consecutive dead-lettered deliveries, the webhook is **auto-paused** to protect your endpoint from a feedback loop. Re-enable it in **Settings → Integrations → Webhooks**.
3. The full delivery row is retained in `webhook_deliveries` for 30 days — visible in the UI as "Recent deliveries" with the response body we received. After 30 days the row is purged.

Pure 4xx → dead-letter immediately is deliberate: a 404 or 401 from your endpoint indicates a configuration error our retries won't fix.

---

## 6. Best practices

- **Always verify the signature.** Without it, anyone who guesses your endpoint URL can spoof events.
- **Respond fast (< 1 s).** Move slow work to a queue. Inclufy's 10-second timeout starts from connection open.
- **Idempotency.** Use `delivery_id` as your dedup key. Inclufy may re-deliver the same event after a 5xx retry; your handler must produce the same effect either way.
- **Ignore unknown events.** New event types ship without breaking changes; respond `200` and skip rather than `400`.
- **Rotate secrets quarterly.** Generate a new secret in the UI; Inclufy supports a brief overlap window where both old and new are accepted (`X-Inclufy-Signature` may include `v0=` for the previous key). After 24 h the old key is rejected.
- **Allowlist by source IP only as defense-in-depth, not primary auth.** Inclufy sends from Supabase Edge runtimes in EU-Central; the ranges shift. Signature verification is the canonical check.
- **Don't leak secrets in logs.** A logged `Authorization` header or the raw secret means anyone with log access can forge requests. Scrub before logging.

---

## 7. Troubleshooting

| Symptom | Probable cause |
|---------|----------------|
| Signature always fails | You parsed the body to JSON then re-stringified before HMAC. Capture **raw bytes**. |
| "replay" rejection | Server clock drift > 5 min from UTC. Run `chrony` / `ntpd`. |
| Deliveries paused | `failure_count` reached 10. Check **Recent deliveries** for the 4xx/5xx response, fix the endpoint, hit **Re-enable**. |
| Some events missing | Subscribed events array doesn't include them. Either add the event slug or empty the array to receive everything. |
| Webhook works in test, not prod | Production URL behind a firewall/VPN. Inclufy needs public HTTPS. |
| Lots of duplicates | Endpoint returned a 5xx briefly — Inclufy retried. Dedup on `delivery_id`. |

---

## 8. Reference

- **HMAC algorithm**: SHA-256 (RFC 6234), hex-encoded
- **Signature header format**: `t=<unix>,v1=<hex>`. Future keys will append `v2=` etc.
- **Replay window**: 300 seconds
- **Max retries**: 5
- **Backoff schedule**: 30s · 2m · 10m · 1h · 6h
- **Delivery timeout**: 10 seconds connect+read
- **Auto-pause threshold**: 10 consecutive dead-lettered deliveries
- **Retention**: 30 days for delivered/dead-letter rows in `webhook_deliveries`
- **Concurrency**: up to 25 parallel deliveries per dispatcher tick (1 tick/min)
- **Source**: Supabase Edge runtime, EU-Central region

---

## 9. Support

- **Status**: <https://marketing.inclufy.com/status>
- **Sub-processors**: <https://marketing.inclufy.com/sub-processors>
- **Issues**: open a ticket from the in-app Help menu (creates a row in `product_issues` and emails support).
- **Security disclosures**: <security@inclufy.com> — PGP key fingerprint in our [security.txt](https://inclufy.com/.well-known/security.txt).
