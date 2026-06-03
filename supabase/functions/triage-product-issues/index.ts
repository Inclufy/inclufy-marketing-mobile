// =============================================================================
// triage-product-issues — automated ProductIssue triage for AMOS / Inclufy Marketing.
//
// Deno/Supabase port of ProjeXtPal's `python manage.py triage_product_issues`
// (backend/product_issues/management/commands/triage_product_issues.py).
// Same two-phase shape, adapted to AMOS's stack:
//
//   Phase A — Catalog cross-match (cheap, no LLM).
//     Reads ./known_issues.json and resolves any open product_issue that matches
//     a `fixed_verified` / `fix_pending_deploy` entry (endpoint substring in
//     error_trace, OR >=2 previous_error_contains keywords in the text blob).
//
//   Phase B — LLM classification (OpenAI — AMOS's provider, like event-studio-ai).
//     For unmatched issues, ask gpt-4o-mini for strict JSON:
//     classification (bug|duplicate|feature|needs-info|wontfix|escalate),
//     priority (P0..P3), affected_area, reasoning, reporter_message, dev_notes.
//     Writes TWO sibling comments: public (reporter-facing) + internal (dev),
//     using product_issue_comments.visibility.
//
// Idempotency: comments start with `[auto-triage-YYYY-MM-DD] #<id>`; a re-run the
//   same calendar day skips already-triaged issues unless the reporter responded.
// Email-storm prevention: triage writes set triaged_by='agent:issue-triage-validator',
//   which the lifecycle trigger (migration 20260603110000) skips — we send ONE
//   digest to ADMIN_EMAILS at the end instead.
//
// Invocation (verify_jwt=false; this fn does its own auth):
//   - pg_cron → net.http_post with `Authorization: Bearer <service-role-key>`
//   - manual  → header `X-Triage-Token: <TRIAGE_TRIGGER_TOKEN>`
//   Body / query params: { dry_run?: bool, limit?: number, issue_id?: uuid }
// =============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const TRIAGE_MODEL = Deno.env.get("TRIAGE_MODEL") ?? "gpt-4o-mini";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "AMOS by Inclufy <noreply@inclufy.com>";
const TRIAGE_TRIGGER_TOKEN = Deno.env.get("TRIAGE_TRIGGER_TOKEN") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://marketing.inclufy.com";

const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "sami@inclufy.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const TRIAGE_AUTHOR = "agent:issue-triage-validator";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-triage-token",
};

// ─── Types ──────────────────────────────────────────────────────────────────
interface CatalogEntry {
  id?: string;
  title?: string;
  endpoint?: string;
  previous_error_contains?: string[];
  severity?: string;
  status?: string;
  fix_location?: string;
}
interface Issue {
  id: string;
  title: string;
  description: string | null;
  reproduction_steps: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  error_trace: string | null;
  category: string | null;
  source: string | null;
  module_context: string | null;
  environment: Record<string, unknown> | null;
  status: string;
  priority: string | null;
  triaged_at: string | null;
  resolution_summary: string | null;
}

// ─── Catalog loader ──────────────────────────────────────────────────────────
async function loadCatalog(): Promise<CatalogEntry[]> {
  try {
    const url = new URL("./known_issues.json", import.meta.url);
    const data = JSON.parse(await Deno.readTextFile(url));
    return Array.isArray(data?.issues) ? data.issues : [];
  } catch (e) {
    console.warn("[triage] catalog load failed — Phase A disabled:", e);
    return [];
  }
}

const CATALOG_FIXED = new Set(["fixed_verified", "fix_pending_deploy"]);

function severityToPriority(sev?: string): string {
  const s = (sev ?? "").trim().toUpperCase();
  return ["P0", "P1", "P2", "P3"].includes(s) ? s : "P3";
}
function priorityToSeverity(p: string): string {
  return ({ P0: "blocker", P1: "critical", P2: "major", P3: "minor" } as Record<string, string>)[p] ?? "major";
}

function phaseAMatch(issue: Issue, entry: CatalogEntry): boolean {
  if (!CATALOG_FIXED.has((entry.status ?? "").toLowerCase())) return false;
  const trace = (issue.error_trace ?? "").toLowerCase();
  const endpoint = (entry.endpoint ?? "").trim().toLowerCase();
  if (endpoint && trace.includes(endpoint)) return true;
  const blob = [
    issue.title, issue.description, issue.error_trace, issue.actual_behavior,
  ].map((x) => (x ?? "").toLowerCase()).join(" ");
  const kws = entry.previous_error_contains ?? [];
  if (!Array.isArray(kws)) return false;
  const hits = kws.filter((k) => typeof k === "string" && k.trim() && blob.includes(k.toLowerCase())).length;
  return hits >= 2;
}

// ─── Idempotency helpers ──────────────────────────────────────────────────────
function todaySignature(issueId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `[auto-triage-${today}] #${issueId}`;
}

// Has this issue a successful (non-llm-error) triage comment dated today, with NO
// later non-agent (reporter) comment? Then skip.
async function alreadyTriagedToday(db: SupabaseClient, issue: Issue): Promise<boolean> {
  const sig = todaySignature(issue.id);
  const { data: triage } = await db
    .from("product_issue_comments")
    .select("id, created_at, body")
    .eq("issue_id", issue.id)
    .like("body", `${sig}%`)
    .order("created_at", { ascending: false });
  const lastTriage = (triage ?? []).find((c) => !String(c.body).startsWith(`${sig} llm-error`));
  if (!lastTriage) return false;

  const { data: later } = await db
    .from("product_issue_comments")
    .select("author, created_at")
    .eq("issue_id", issue.id)
    .gt("created_at", lastTriage.created_at);
  const reporterResponded = (later ?? []).some((c) => !String(c.author).startsWith("agent:"));
  return !reporterResponded;
}

// ─── Language resolution (NL default — Inclufy is NL-first) ──────────────────
const SUPPORTED_LANGS = new Set(["en", "nl"]);
function resolveLang(issue: Issue): string {
  const env = (issue.environment && typeof issue.environment === "object") ? issue.environment : {};
  const hint = String((env as Record<string, unknown>).language ?? (env as Record<string, unknown>).locale ?? "")
    .toLowerCase().slice(0, 2);
  return SUPPORTED_LANGS.has(hint) ? hint : "nl";
}

// ─── LLM (Phase B) ────────────────────────────────────────────────────────────
const SYSTEM_PROMPTS: Record<string, string> = {
  nl:
    "Je bent productmanager voor AMOS (Inclufy Marketing — mobiele app voor event-marketing & multi-channel publishing). " +
    "Classificeer een gemelde ProductIssue en schrijf twee aparte berichten: één voor de reporter (eindgebruiker) en één voor het dev/admin-team.\n\n" +
    "Reporters zijn EINDGEBRUIKERS — geen developers. Ze hebben GEEN toegang tot DevTools, HTTP-codes, stack traces of logs. Vraag NOOIT om zulke technische details. Reporter-berichten zijn vriendelijk en in alledaagse taal.\n" +
    "dev_notes worden alleen door dev/admin gelezen — jargon, file paths, edge-fn namen, Sentry-zoektermen mogen.\n\n" +
    "Geef ALLEEN een JSON-object terug (geen markdown-fence). Schema:\n" +
    "{\"classification\":\"bug|duplicate|feature|needs-info|wontfix|escalate\",\"priority\":\"P0|P1|P2|P3\",\"affected_area\":\"<bv. capture/publish/oauth/agents/analytics>\",\"reasoning\":\"<2-3 zinnen NL>\",\"reporter_message\":\"<vriendelijke zin(nen), geen jargon>\",\"dev_notes\":\"<technische notities voor dev>\"}\n\n" +
    "Heuristieken: 'bug'=code-defect met genoeg info; 'duplicate'=sterke overlap met bekende bug; 'feature'=nieuw verzoek; 'needs-info'=reporter kan helpen met screenshot/URL/beschrijving; 'escalate'=alleen met developer/admin-toegang diagnoseerbaar (logs, Sentry, security, infra); 'wontfix'=test-data/by-design/out-of-scope.\n" +
    "Priority: P0=blocker (dataverlies, productie down, security), P1=raakt meerdere users, P2=standaard, P3=kosmetisch.",
  en:
    "You are a product manager for AMOS (Inclufy Marketing — a mobile app for event marketing & multi-channel publishing). " +
    "Classify a reported ProductIssue and write two separate messages: one for the reporter (end user) and one for the dev/admin team.\n\n" +
    "Reporters are END USERS — not developers. They have NO access to DevTools, HTTP codes, stack traces or logs. NEVER ask for such technical details. Reporter-facing messages are friendly and in plain language.\n" +
    "dev_notes are read only by dev/admin — jargon, file paths, edge-fn names, Sentry queries allowed.\n\n" +
    "Return ONLY a JSON object (no markdown fence). Schema:\n" +
    "{\"classification\":\"bug|duplicate|feature|needs-info|wontfix|escalate\",\"priority\":\"P0|P1|P2|P3\",\"affected_area\":\"<e.g. capture/publish/oauth/agents/analytics>\",\"reasoning\":\"<2-3 sentences>\",\"reporter_message\":\"<friendly plain sentence(s), no jargon>\",\"dev_notes\":\"<technical notes for dev>\"}\n\n" +
    "Heuristics: 'bug'=code defect with enough info; 'duplicate'=strong overlap with a known bug; 'feature'=new request; 'needs-info'=reporter can help with screenshot/URL/description; 'escalate'=only diagnosable with developer/admin access (logs, Sentry, security, infra); 'wontfix'=test data/by-design/out-of-scope.\n" +
    "Priority: P0=blocker (data loss, production down, security), P1=affects multiple users, P2=standard, P3=cosmetic.",
};

function llmUserMessage(issue: Issue): string {
  return [
    `Title: ${issue.title}`,
    `Description: ${issue.description || "(none)"}`,
    `Reproduction steps: ${issue.reproduction_steps || "(none)"}`,
    `Expected: ${issue.expected_behavior || "(none)"}`,
    `Actual: ${issue.actual_behavior || "(none)"}`,
    `Error trace: ${(issue.error_trace || "").slice(0, 1200)}`,
    `Category: ${issue.category || "(none)"}`,
    `Module: ${issue.module_context || "(none)"}`,
    `Source: ${issue.source || "(none)"}`,
  ].join("\n");
}

async function callOpenAI(issue: Issue): Promise<Record<string, unknown> | null> {
  if (!OPENAI_API_KEY) {
    console.warn("[triage] OPENAI_API_KEY missing — Phase B disabled");
    return null;
  }
  const lang = resolveLang(issue);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: TRIAGE_MODEL,
        temperature: 0,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[lang] ?? SYSTEM_PROMPTS.en },
          { role: "user", content: llmUserMessage(issue) },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[triage] OpenAI ${res.status} for #${issue.id}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    console.warn(`[triage] OpenAI call failed for #${issue.id}:`, e);
    return null;
  }
}

// ─── classification → AMOS column mapping ─────────────────────────────────────
// AMOS status enum: new|triaging|needs-info|accepted|in-progress|resolved|wont-fix|duplicate|closed
// AMOS classification enum: bug|error|functionality|best-practice|missing-feature|duplicate|user-error|not-applicable
const STATUS_MAP: Record<string, string> = {
  bug: "triaging", duplicate: "duplicate", feature: "accepted",
  "needs-info": "needs-info", wontfix: "wont-fix", escalate: "triaging",
};
const CLASSIFICATION_MAP: Record<string, string | null> = {
  bug: "bug", duplicate: "duplicate", feature: "missing-feature",
  "needs-info": null, wontfix: "not-applicable", escalate: "bug",
};
function normPriority(p: unknown): string {
  const s = String(p ?? "").trim().toUpperCase();
  return ["P0", "P1", "P2", "P3"].includes(s) ? s : "P2";
}
function normClassification(c: unknown): string {
  const s = String(c ?? "").trim().toLowerCase();
  return s in STATUS_MAP ? s : "needs-info";
}

const PUBLIC_STATUS_LABELS: Record<string, Record<string, string>> = {
  en: {
    bug: "Bug confirmed — dev team notified", feature: "Feature request — added to backlog",
    "needs-info": "We need a bit more info from you", escalate: "Routed to our team for direct investigation",
    duplicate: "Already being tracked", wontfix: "Reviewed — won't be addressed",
  },
  nl: {
    bug: "Bug bevestigd — dev-team is op de hoogte", feature: "Functieverzoek — toegevoegd aan de backlog",
    "needs-info": "We hebben nog wat extra info van je nodig", escalate: "Doorgestuurd naar ons team voor direct onderzoek",
    duplicate: "Wordt al elders gevolgd", wontfix: "Bekeken — gaan we niet oppakken",
  },
};
const T: Record<string, Record<string, string>> = {
  en: { public_header: "Update on your report", status: "Status", next: "What happens next",
        internal: "INTERNAL — admin/owner only", analysis: "Triage analysis",
        classification: "Classification", priority: "Priority", area: "Affected area",
        reasoning: "Reasoning", dev: "Dev/admin notes", none: "(none)" },
  nl: { public_header: "Update over je melding", status: "Status", next: "Wat gaat er nu gebeuren",
        internal: "INTERN — alleen admin/owner", analysis: "Triage-analyse",
        classification: "Classificatie", priority: "Prioriteit", area: "Betrokken gebied",
        reasoning: "Redenering", dev: "Dev/admin-notities", none: "(geen)" },
};
function tr(lang: string, k: string): string { return (T[lang] ?? T.en)[k] ?? (T.en)[k] ?? k; }

function publicBody(sig: string, lang: string, classification: string, reporterMsg: string): string {
  const label = (PUBLIC_STATUS_LABELS[lang] ?? PUBLIC_STATUS_LABELS.en)[classification] ?? classification;
  return [
    `${sig} llm-triage (public)`, "",
    tr(lang, "public_header"),
    `• ${tr(lang, "status")}: ${label}`, "",
    tr(lang, "next"), reporterMsg || tr(lang, "none"), "",
  ].join("\n");
}
function internalBody(sig: string, lang: string, c: string, p: string, area: string, reasoning: string, dev: string): string {
  return [
    `${sig} llm-triage (internal)`, "",
    `🔒 ${tr(lang, "internal")}`, "",
    tr(lang, "analysis"),
    `• ${tr(lang, "classification")}: ${c}`,
    `• ${tr(lang, "priority")}: ${p}`,
    `• ${tr(lang, "area")}: ${area || tr(lang, "none")}`, "",
    tr(lang, "reasoning"), reasoning || tr(lang, "none"), "",
    tr(lang, "dev"), dev || tr(lang, "none"), "",
  ].join("\n");
}

async function insertComment(
  db: SupabaseClient, issueId: string, body: string, visibility: "public" | "internal",
): Promise<void> {
  await db.from("product_issue_comments").insert({
    issue_id: issueId, author: TRIAGE_AUTHOR, body, is_triage_step: true, visibility,
  });
}

// ─── Digest email (direct Resend, like the other AMOS fns) ───────────────────
async function sendDigest(buckets: {
  catalog: Array<[string, string, string]>;
  llm: Array<[string, string, string, string]>;
  needs: Array<[string, string]>;
  errors: Array<[string, string]>;
}): Promise<void> {
  const total = buckets.catalog.length + buckets.llm.length + buckets.needs.length;
  if (total === 0 && buckets.errors.length === 0) return;
  if (!RESEND_API_KEY || ADMIN_EMAILS.length === 0) {
    console.warn("[triage] digest skipped — RESEND_API_KEY or ADMIN_EMAILS missing");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [`Auto-triage digest — run ${today}.`, ""];
  if (buckets.catalog.length) {
    lines.push(`Catalog-match (resolved): ${buckets.catalog.length}`);
    buckets.catalog.forEach(([id, title, bug]) => lines.push(`  · ${id.slice(0, 8)} — ${title.slice(0, 60)}  →  ${bug}`));
    lines.push("");
  }
  if (buckets.llm.length) {
    lines.push(`LLM classification: ${buckets.llm.length}`);
    buckets.llm.forEach(([id, title, c, p]) => lines.push(`  · ${id.slice(0, 8)} — ${title.slice(0, 50)}  →  ${c} / ${p}`));
    lines.push("");
  }
  if (buckets.needs.length) {
    lines.push(`Needs info: ${buckets.needs.length}`);
    buckets.needs.forEach(([id, title]) => lines.push(`  · ${id.slice(0, 8)} — ${title.slice(0, 60)}`));
    lines.push("");
  }
  if (buckets.errors.length) {
    lines.push(`Errors: ${buckets.errors.length}`);
    buckets.errors.forEach(([id, msg]) => lines.push(`  · ${id.slice(0, 8)} — ${msg}`));
    lines.push("");
  }
  lines.push(`Manage: ${APP_BASE_URL}`);
  const text = lines.join("\n");
  const html = `<pre style="font-family:ui-monospace,monospace;font-size:13px;">${
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }</pre>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: EMAIL_FROM_ADDRESS, to: ADMIN_EMAILS,
        subject: `[AMOS · Auto-triage] ${today} — ${buckets.catalog.length} catalog · ${buckets.llm.length} LLM`,
        text, html,
      }),
    });
    if (!res.ok) console.warn(`[triage] digest Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    console.warn("[triage] digest send failed:", e);
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth — verify_jwt=false, so the function itself gates access.
  const auth = req.headers.get("Authorization") ?? "";
  const token = req.headers.get("X-Triage-Token") ?? "";
  const okBearer = auth === `Bearer ${SERVICE_ROLE_KEY}`;
  const okToken = !!TRIAGE_TRIGGER_TOKEN && token === TRIAGE_TRIGGER_TOKEN;
  if (!okBearer && !okToken) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Params (body or query)
  let dryRun = false, limit = 50;
  let issueId: string | null = null;
  try {
    const url = new URL(req.url);
    const qp = url.searchParams;
    let body: Record<string, unknown> = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { /* empty body ok */ } }
    dryRun = body.dry_run === true || qp.get("dry_run") === "true";
    limit = Number(body.limit ?? qp.get("limit") ?? 50) || 50;
    issueId = (body.issue_id as string) ?? qp.get("issue_id") ?? null;
  } catch { /* defaults */ }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const catalog = await loadCatalog();

  // ── Candidate selection ──
  // Stream 1: new + never triaged. Stream 2: needs-info with a reporter reply since triaged_at.
  let candidates: Issue[] = [];
  const cols = "id,title,description,reproduction_steps,expected_behavior,actual_behavior,error_trace,category,source,module_context,environment,status,priority,triaged_at,resolution_summary";
  if (issueId) {
    const { data } = await db.from("product_issues").select(cols).eq("id", issueId).limit(1);
    candidates = (data ?? []) as Issue[];
  } else {
    const { data: fresh } = await db.from("product_issues").select(cols)
      .eq("status", "new").is("triaged_at", null).order("created_at", { ascending: true }).limit(limit);
    const { data: needs } = await db.from("product_issues").select(cols)
      .eq("status", "needs-info").not("triaged_at", "is", null).order("triaged_at", { ascending: true }).limit(limit);

    const seen = new Set<string>();
    const merged: Issue[] = [];
    for (const i of [...((fresh ?? []) as Issue[]), ...((needs ?? []) as Issue[])]) {
      if (seen.has(i.id)) continue;
      // for needs-info, only keep if a reporter replied after triaged_at
      if (i.status === "needs-info") {
        const { data: later } = await db.from("product_issue_comments")
          .select("author").eq("issue_id", i.id).gt("created_at", i.triaged_at!);
        if (!(later ?? []).some((c) => !String(c.author).startsWith("agent:"))) continue;
      }
      seen.add(i.id); merged.push(i);
    }
    candidates = merged.slice(0, limit);
  }

  const buckets = {
    catalog: [] as Array<[string, string, string]>,
    llm: [] as Array<[string, string, string, string]>,
    needs: [] as Array<[string, string]>,
    errors: [] as Array<[string, string]>,
  };
  let nSkipped = 0;

  for (const issue of candidates) {
    if (await alreadyTriagedToday(db, issue)) { nSkipped++; continue; }
    const sig = todaySignature(issue.id);
    const lang = resolveLang(issue);

    // ── Phase A — catalog cross-match ──
    const matched = catalog.find((e) => { try { return phaseAMatch(issue, e); } catch { return false; } });
    if (matched) {
      const bug = matched.id ?? "?";
      const fix = matched.fix_location ?? "(catalog)";
      const priority = severityToPriority(matched.severity);
      if (!dryRun) {
        const { error } = await db.from("product_issues").update({
          status: "resolved", priority, severity: priorityToSeverity(priority),
          agent_triage_result: { matched_bug: bug, fix_location: fix, catalog_status: matched.status, phase: "catalog" },
          triaged_by: TRIAGE_AUTHOR, triaged_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          resolution_summary: issue.resolution_summary || `Resolved via catalog cross-match ${bug} (fix: ${fix}).`,
        }).eq("id", issue.id);
        if (error) { buckets.errors.push([issue.id, `catalog-save: ${error.message}`]); continue; }
        const body = lang === "nl"
          ? `${sig} catalog-match\n\nAutomatische triage — opgelost via catalogus-cross-match.\nMatch: ${bug} — ${matched.title ?? ""}\nFix: ${fix}\n\nNog steeds last hiervan? Meld een nieuwe issue, dan kijken we opnieuw.`
          : `${sig} catalog-match\n\nAuto-triage — resolved via catalog cross-match.\nMatch: ${bug} — ${matched.title ?? ""}\nFix: ${fix}\n\nStill seeing this? File a new issue and we'll re-check.`;
        await insertComment(db, issue.id, body, "public");
      }
      buckets.catalog.push([issue.id, issue.title, bug]);
      continue;
    }

    // ── Phase B — LLM classification ──
    if (dryRun) continue;
    const parsed = await callOpenAI(issue);
    if (!parsed) {
      const body = `${sig} llm-error\n\n` + (lang === "nl"
        ? "Auto-triage tijdelijk niet beschikbaar (LLM-call faalde). Volgende cron-cycle probeert opnieuw."
        : "Auto-triage temporarily unavailable (LLM call failed). The next cron cycle will retry.");
      await insertComment(db, issue.id, body, "internal");
      buckets.errors.push([issue.id, "llm-call-failed"]);
      continue;
    }

    const classification = normClassification(parsed.classification);
    const priority = normPriority(parsed.priority);
    const newStatus = STATUS_MAP[classification];
    const classCol = CLASSIFICATION_MAP[classification];
    const reasoning = String(parsed.reasoning ?? "").slice(0, 1000);
    const reporterMsg = String(parsed.reporter_message ?? "").slice(0, 600);
    const devNotes = String(parsed.dev_notes ?? "").slice(0, 800);
    const area = String(parsed.affected_area ?? "").slice(0, 80);

    const update: Record<string, unknown> = {
      status: newStatus, priority, severity: priorityToSeverity(priority),
      agent_triage_result: { ...parsed, phase: "llm" },
      triaged_by: TRIAGE_AUTHOR, triaged_at: new Date().toISOString(),
    };
    if (classCol) update.classification = classCol;
    if (classification === "duplicate") {
      update.resolution_summary = issue.resolution_summary || "Marked duplicate by auto-triage.";
    }
    const { error } = await db.from("product_issues").update(update).eq("id", issue.id);
    if (error) { buckets.errors.push([issue.id, `llm-save: ${error.message}`]); continue; }

    await insertComment(db, issue.id, publicBody(sig, lang, classification, reporterMsg), "public");
    await insertComment(db, issue.id, internalBody(sig, lang, classification, priority, area, reasoning, devNotes), "internal");

    if (classification === "needs-info") buckets.needs.push([issue.id, issue.title]);
    else buckets.llm.push([issue.id, issue.title, classification, priority]);
  }

  if (!dryRun) await sendDigest(buckets);

  const summary = {
    triaged: buckets.catalog.length + buckets.llm.length + buckets.needs.length,
    by_catalog: buckets.catalog.length, by_llm: buckets.llm.length,
    needs_info: buckets.needs.length, errors: buckets.errors.length,
    idempotent_skipped: nSkipped, candidates: candidates.length, dry_run: dryRun,
  };
  console.log("[triage]", JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
