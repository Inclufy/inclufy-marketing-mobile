#!/usr/bin/env bash
# =============================================================================
# safe-redeploy.sh — AMOS / Inclufy Marketing
# -----------------------------------------------------------------------------
# Adapted from ~/Projects/inclufy-auto-finance-main/safe-redeploy.sh
# (itself adapted from ~/Projects/projextpal/safe-redeploy.sh — battle-tested).
#
# AMOS has TWO deploy surfaces. This script handles the one that maps cleanly to
# a health-gate + auto-rollback: SUPABASE EDGE FUNCTIONS.
# The mobile app (EAS Build/Submit → TestFlight/Play) has no curl-health-gate —
# use `--mobile` for the guided checklist (delegates to mobile-deploy-engineer).
#
# Usage:
#   bash safe-redeploy.sh fn-one fn-two ...   # deploy named functions
#   bash safe-redeploy.sh --changed           # deploy fns changed since ROLLBACK_REF
#   bash safe-redeploy.sh --all               # deploy ALL functions (rarely needed)
#   bash safe-redeploy.sh --mobile            # print EAS mobile-release checklist only
#
# What it does (edge-function mode):
#   1. Remembers current commit as ROLLBACK target
#   2. PRE-DEPLOY GATES — git status clean, on target ref, deno/tsc check
#   3. `supabase functions deploy <fn>` per function (shared prod project)
#   4. HEALTH GATE — curl each function URL; 200/401/204/400/405 = deployed-and-responding,
#      404/000/5xx = broken → rollback
#   5. On failure: git checkout ROLLBACK_REF -- supabase/functions/<fn> + redeploy
#
# NEVER auto-runs migrations — those are MANUAL via Supabase SQL Editor.
# NEVER touches the mobile app — that path is `--mobile` (informational) only.
# =============================================================================
set -euo pipefail

# ─── Config (override via env) ──────────────────────────────────────────────
PROJECT_REF="${SUPABASE_PROJECT_REF:-mpxkugfqzmxydxnlxqoj}"
FUNCTIONS_BASE="https://${PROJECT_REF}.functions.supabase.co"
SOURCE_DIR="${SOURCE_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
TARGET_REF="${TARGET_REF:-main}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-20}"        # seconds per function
# HTTP codes that mean "function is deployed and responding" (401 = needs JWT = healthy)
HEALTHY_CODES="200 201 204 400 401 405"

cd "$SOURCE_DIR"

# ─── --mobile branch (informational only — no build triggered) ──────────────
if [ "${1:-}" = "--mobile" ]; then
  cat <<'EOF'
═══ AMOS MOBILE RELEASE — guided checklist (no build triggered here) ═══

This script does NOT build mobile. Delegate to the mobile-deploy-engineer agent.
The pre-deploy gates (see docs/deploy-roadmaps/PRE_DEPLOY_GATES.md) still apply.

  Pre-flight:
    1. git status clean + on main
    2. npx tsc --noEmit                      → 0 errors
    3. Run PRE-DEPLOY agent-gates (Phase 1)
    4. Bump version/build in app.json if needed (production profile autoIncrements)

  iOS (TestFlight):
    eas build  -p ios     --profile production
    eas submit -p ios     --profile production

  Android (Play internal/production):
    eas build  -p android --profile production
    eas submit -p android --profile production

  Rollback = HALT phased rollout in App Store Connect / Play Console,
             or submit the previous successful build. There is no curl health-gate.

  Post-deploy:
    - Smoke-test on a real device: capture → AI generate → PostReview → publish
    - tests/audits/<area>_$(date +%Y-%m-%d)-post-deploy.md
EOF
  exit 0
fi

# ─── Resolve target function list ───────────────────────────────────────────
ROLLBACK_REF=$(git rev-parse HEAD)
declare -a FUNCS=()

case "${1:-}" in
  "")
    echo "❌ No functions given. Use: <names...> | --changed | --all | --mobile"; exit 1 ;;
  --all)
    while IFS= read -r d; do FUNCS+=("$(basename "$d")"); done \
      < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_*') ;;
  --changed)
    # functions with changes since ROLLBACK_REF working tree (staged+unstaged+committed-vs-origin)
    while IFS= read -r f; do
      [ -n "$f" ] && FUNCS+=("$f")
    done < <(git diff --name-only "origin/${TARGET_REF}"...HEAD -- supabase/functions/ 2>/dev/null \
             | sed -nE 's#supabase/functions/([^/]+)/.*#\1#p' | grep -v '^_' | sort -u)
    if [ ${#FUNCS[@]} -eq 0 ]; then echo "ℹ️  No changed functions vs origin/${TARGET_REF}. Nothing to deploy."; exit 0; fi ;;
  *)
    FUNCS=("$@") ;;
esac

echo "🔖 Rollback target commit: $ROLLBACK_REF"
echo "🎯 Target ref:             $TARGET_REF"
echo "🛰️  Project:                $PROJECT_REF"
echo "📦 Functions to deploy:    ${FUNCS[*]}"

# ─── PHASE 1 — PRE-DEPLOY GATES ─────────────────────────────────────────────
echo ""
echo "═══ PHASE 1 — PRE-DEPLOY GATES ═══"

# 1a. git status must be clean
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Uncommitted changes. Commit or stash first."; git status --short; exit 1
fi
echo "✓ git status clean"

# 1b. on target ref + up to date
git fetch origin "$TARGET_REF" 2>/dev/null || true
if [ "$(git rev-parse --abbrev-ref HEAD)" != "$TARGET_REF" ]; then
  echo "⚠️  HEAD is not on $TARGET_REF (on $(git rev-parse --abbrev-ref HEAD)). Continuing — deploying current HEAD."
fi

# 1c. each named function must exist
for fn in "${FUNCS[@]}"; do
  if [ ! -d "supabase/functions/$fn" ]; then
    echo "❌ supabase/functions/$fn does not exist"; exit 1
  fi
done
echo "✓ all target functions exist"

# 1d. supabase CLI present + linked
if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ supabase CLI not found. Install: brew install supabase/tap/supabase"; exit 1
fi
echo "✓ supabase CLI present ($(supabase --version 2>/dev/null | head -1))"

# 1e. TypeScript check on the repo (best-effort — functions are Deno, app is RN)
if [ -d node_modules ]; then
  echo "🔍 npx tsc --noEmit (app types)…"
  npx tsc --noEmit 2>&1 | tail -8 || { echo "❌ TS check failed — fix before deploy"; exit 1; }
  echo "✓ TypeScript clean"
else
  echo "⚠️  node_modules missing — skipping tsc"
fi

# ─── Health helper ──────────────────────────────────────────────────────────
fn_health() {
  local fn="$1" code
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    code=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" -X OPTIONS "$FUNCTIONS_BASE/$fn" 2>/dev/null || echo 000)
    for h in $HEALTHY_CODES; do [ "$code" = "$h" ] && { echo "$code"; return 0; }; done
    sleep 1
  done
  echo "$code"; return 1
}

rollback() {
  echo ""
  echo "🚨 Deploy FAILED — rolling back affected functions to $ROLLBACK_REF"
  for fn in "${DEPLOYED[@]:-}"; do
    [ -z "$fn" ] && continue
    git checkout "$ROLLBACK_REF" -- "supabase/functions/$fn" 2>/dev/null || true
    echo "  ↩️  redeploying previous $fn"
    supabase functions deploy "$fn" --project-ref "$PROJECT_REF" 2>&1 | tail -3 || true
  done
  echo "🩺 Post-rollback health:"
  for fn in "${DEPLOYED[@]:-}"; do
    [ -z "$fn" ] && continue
    printf "  %s → HTTP %s\n" "$fn" "$(fn_health "$fn" || true)"
  done
  exit 1
}
trap 'rollback' ERR

# ─── PHASE 2 — DEPLOY ───────────────────────────────────────────────────────
echo ""
echo "═══ PHASE 2 — DEPLOY (shared prod $PROJECT_REF) ═══"
declare -a DEPLOYED=()
for fn in "${FUNCS[@]}"; do
  echo "🚀 supabase functions deploy $fn"
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  DEPLOYED+=("$fn")
done
echo "✓ ${#DEPLOYED[@]} function(s) deployed"

# ─── PHASE 3 — HEALTH GATE ──────────────────────────────────────────────────
echo ""
echo "═══ PHASE 3 — HEALTH GATE (${HEALTH_TIMEOUT}s/fn) ═══"
for fn in "${DEPLOYED[@]}"; do
  if code=$(fn_health "$fn"); then
    echo "✓ $fn responding (HTTP $code)"
  else
    echo "❌ $fn NOT healthy (last HTTP $code)"; false
  fi
done

# ─── PHASE 4 — POST-DEPLOY SMOKE (dry-run gate) ─────────────────────────────
# For functions that expose a non-destructive dry-run, exercise the real code
# path (auth + DB read + catalog load) WITHOUT writing or calling the LLM. Runs
# while the rollback trap is still armed, so a broken deploy auto-reverts.
# Currently wired for: triage-product-issues.
echo ""
echo "═══ PHASE 4 — POST-DEPLOY SMOKE (dry-run) ═══"

smoke_triage() {
  local url="$FUNCTIONS_BASE/triage-product-issues"
  local hdr_auth=() label
  if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    hdr_auth=(-H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"); label="service-role bearer"
  elif [ -n "${TRIAGE_TRIGGER_TOKEN:-}" ]; then
    hdr_auth=(-H "X-Triage-Token: ${TRIAGE_TRIGGER_TOKEN}"); label="X-Triage-Token"
  else
    echo "⚠️  triage-product-issues dry-run SKIPPED — set SUPABASE_SERVICE_ROLE_KEY or TRIAGE_TRIGGER_TOKEN to enable"
    return 0
  fi

  echo "🧪 triage-product-issues dry-run (auth: $label)…"
  local body code
  body=$(curl -sS -m 30 -X POST "$url" "${hdr_auth[@]}" \
           -H "Content-Type: application/json" \
           -d '{"dry_run":true,"limit":1}' -w $'\n%{http_code}' 2>/dev/null || echo $'\n000')
  code=$(printf '%s' "$body" | tail -n1)
  body=$(printf '%s' "$body" | sed '$d')

  if [ "$code" != "200" ]; then
    echo "❌ dry-run HTTP $code — body: $(printf '%s' "$body" | head -c 300)"
    return 1
  fi
  case "$body" in
    *'"dry_run":true'*) echo "✓ dry-run OK — $body" ;;
    *) echo "❌ dry-run returned 200 but no valid summary — body: $(printf '%s' "$body" | head -c 300)"; return 1 ;;
  esac
}

for fn in "${DEPLOYED[@]}"; do
  case "$fn" in
    triage-product-issues) smoke_triage || false ;;
  esac
done

# ─── PHASE 5 — POST-DEPLOY TODO ─────────────────────────────────────────────
trap - ERR
echo ""
echo "✅ Edge-function deploy complete. Commit: $(git rev-parse --short HEAD)"
echo ""
echo "POST-DEPLOY TODO:"
echo "  1. Run any pending migrations MANUALLY via Supabase SQL Editor"
echo "  2. Smoke-test affected flows from the app (capture → AI → PostReview → publish)"
echo "  3. Write tests/audits/<area>_$(date +%Y-%m-%d)-post-deploy.md"
echo "  4. Update docs/deploy-roadmaps/$(date +%Y-%m-%d)-<stack>.md"
