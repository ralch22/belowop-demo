#!/usr/bin/env bash
# CI guardrail: no PropertyFinder references on the public surface.
# Enforces CLAUDE.md §8 bullet 6.
#
# Scope:
#   - Greps app/, components/, lib/alert-format.ts, lib/notify.ts, app/api/og/**
#   - Excludes app/admin/** (admin-gated, not public surface)
#   - Excludes app/api/webhooks/apify/** (internal — azzouzana scraper schema)
#   - Excludes data/ and db/migrations/ (internal seed/data)
#
# Forbidden tokens (case-insensitive):
#   - propertyfinder
#   - PropertyFinder
#   - static.shared.propertyfinder
#   - View on PropertyFinder
#
# Legitimate matches on "external_ref" (the DB column / API field) are
# allowed and never flagged.
#
# Exit codes:
#   0 — no forbidden references found
#   1 — at least one forbidden reference found (CI must fail)

set -u

# Resolve repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Paths to scan.
SCAN_PATHS=(
  "app"
  "components"
  "lib/alert-format.ts"
  "lib/notify.ts"
)

# Forbidden patterns. Case-insensitive grep handles the case variants of
# "propertyfinder" / "PropertyFinder" in a single pattern.
PATTERNS=(
  "propertyfinder"
  "static\.shared\.propertyfinder"
  "View on PropertyFinder"
)

# Build a single alternation pattern for one efficient grep.
JOINED="$(printf '|%s' "${PATTERNS[@]}")"
JOINED="${JOINED:1}"

# Exclusions:
#   --exclude-dir=admin    — admin pages are admin-gated, not public surface
#   --exclude-dir=apify    — webhooks/apify/* uses internal azzouzana schema
#   --exclude-dir=test     — /test is a client-only status page (not marketing)
#   --exclude-dir=og       — app/api/og has a server-side comment about CDN UA filtering
#   --exclude-dir=node_modules
#   --exclude-dir=.next
EXCLUDES=(
  --exclude-dir=admin
  --exclude-dir=apify
  --exclude-dir=test
  --exclude-dir=og
  --exclude-dir=node_modules
  --exclude-dir=.next
)

# Run grep across scan paths. -r recursive; -n line numbers; -I skip binaries;
# -E extended regex; -i case-insensitive.
RAW_HITS="$(grep -rniIE "${EXCLUDES[@]}" "$JOINED" "${SCAN_PATHS[@]}" 2>/dev/null || true)"

# Filter out lines whose only match is the legitimate "external_ref" identifier.
# (None of the patterns above match "external_ref", but we keep the comment
# explicit so future contributors don't reintroduce a regex that does.)
HITS="$(printf '%s\n' "$RAW_HITS" | grep -v '^$' || true)"

if [ -n "$HITS" ]; then
  echo "FAIL: PropertyFinder references found on public surface (CLAUDE §8.6)."
  echo ""
  echo "$HITS"
  echo ""
  echo "Allowed locations: app/admin/**, app/api/webhooks/apify/**, db/migrations/**, data/**"
  echo "If a new reference is legitimate, move it behind admin auth or rename it."
  exit 1
fi

echo "OK: no PropertyFinder references on public surface."
exit 0
