#!/usr/bin/env bash
# CI guardrail: no template placeholders, NaN strings, or fake contact details
# on the public surface.
# Enforces BUILD_BRIEF.md FIX-07 / FIX-20.
#
# Scope (mirrors scripts/check-no-pf-refs.sh):
#   - Greps app/, components/, lib/alert-format.ts, lib/notify.ts
#   - Excludes app/admin/** (admin-gated, not public surface)
#   - Excludes app/api/webhooks/apify/** (internal — azzouzana scraper schema)
#   - Excludes app/api/og/** (server-side CDN UA handling)
#   - Excludes node_modules, .next
#
# Forbidden tokens:
#   - >NaN<            JSX rendered "NaN" between tags
#   - "NaN"            string literal "NaN" (likely user-visible)
#   - 'NaN'            single-quoted string literal "NaN"
#   - `NaN`            template-literal string "NaN"
#   - NaN BR           the specific symptom from FIX-02
#   - <pending         template placeholder (FIX-07)
#   - <TBD             template placeholder (FIX-07)
#   - 000 0000         fake placeholder phone (FIX-07)
#   - hello@belowop.ae placeholder email until domain is decided (FIX-07)
#
# Note: legitimate JS uses of the `NaN` identifier (e.g. `Number.isNaN`,
# `Number.isFinite`, comments) are NOT flagged. We only flag string/JSX
# occurrences of "NaN" that can reach the rendered DOM.
#
# Exit codes:
#   0 — no forbidden references found
#   1 — at least one forbidden reference found (CI must fail)

set -u

# Resolve repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Paths to scan (same as the PF check).
SCAN_PATHS=(
  "app"
  "components"
  "lib/alert-format.ts"
  "lib/notify.ts"
)

# Forbidden patterns. Each entry is an extended-regex alternative.
# NaN matchers are deliberately narrow so legitimate `Number.isNaN` / comments
# aren't flagged.
PATTERNS=(
  '>NaN<'
  '"NaN"'
  "'NaN'"
  '`NaN`'
  'NaN BR'
  'NaN bedroom'
  '<pending'
  '<TBD'
  '000 0000'
  'hello@belowop\.ae'
)

# Build a single alternation pattern for one efficient grep.
JOINED="$(printf '|%s' "${PATTERNS[@]}")"
JOINED="${JOINED:1}"

# Exclusions mirror the PF check.
EXCLUDES=(
  --exclude-dir=admin
  --exclude-dir=apify
  --exclude-dir=og
  --exclude-dir=node_modules
  --exclude-dir=.next
)

# Run grep across scan paths. -r recursive; -n line numbers; -I skip binaries;
# -E extended regex. (No -i: we want case-sensitive NaN matches.)
RAW_HITS="$(grep -rnIE "${EXCLUDES[@]}" "$JOINED" "${SCAN_PATHS[@]}" 2>/dev/null || true)"

HITS="$(printf '%s\n' "$RAW_HITS" | grep -v '^$' || true)"

if [ -n "$HITS" ]; then
  echo "FAIL: placeholder / NaN / fake-contact references found on public surface."
  echo "(See BUILD_BRIEF.md FIX-07 / FIX-20 and scripts/check-no-placeholders.sh.)"
  echo ""
  echo "$HITS"
  echo ""
  echo "Allowed locations: app/admin/**, app/api/webhooks/apify/**, app/api/og/**, data/**"
  echo "Fix: replace placeholders with real values, guard NaN at parse time"
  echo "(Number.isFinite check), and render null beds as 'Studio' or '—'."
  exit 1
fi

echo "OK: no placeholder / NaN / fake-contact references on public surface."
exit 0
