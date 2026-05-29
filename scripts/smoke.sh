#!/usr/bin/env bash
# Smoke test: boot the Next dev server and assert the rendered HTML for the
# main public routes contains none of the forbidden placeholder strings.
#
# Enforces BUILD_BRIEF.md FIX-20 (smoke-test arm).
#
# Routes checked: /, /alerts, /about, /alert-preview
#
# Forbidden in rendered HTML:
#   NaN, <pending, <TBD, 000 0000, hello@belowop.ae
#
# Exit codes:
#   0 — every route fetched and no forbidden string found
#   1 — at least one forbidden string surfaced, or the server failed to boot
#
# Run: npm run test:smoke

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PORT="${PORT:-3456}"
BASE="http://127.0.0.1:${PORT}"
ROUTES=("/" "/alerts" "/about" "/alert-preview")

# Forbidden strings — same list as scripts/check-no-placeholders.sh, but
# applied to the rendered HTML response (not the source).
FORBIDDEN_REGEX='NaN BR|>NaN<|<pending|<TBD|000 0000|hello@belowop\.ae'

# Boot dev server in the background.
echo "smoke: starting next dev on port ${PORT}..."
LOG="$(mktemp)"
npx next dev -p "${PORT}" >"${LOG}" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -f "${LOG}" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 60s for the server to respond.
READY=0
for i in $(seq 1 60); do
  if curl -fsS "${BASE}/" -o /dev/null 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [ "${READY}" -ne 1 ]; then
  echo "smoke: FAIL — dev server did not respond at ${BASE} within 60s"
  echo "----- dev server log -----"
  cat "${LOG}" || true
  exit 1
fi

FAIL=0
for ROUTE in "${ROUTES[@]}"; do
  URL="${BASE}${ROUTE}"
  BODY="$(curl -fsS "${URL}" 2>/dev/null || true)"
  if [ -z "${BODY}" ]; then
    echo "smoke: FAIL — empty response from ${URL}"
    FAIL=1
    continue
  fi

  HITS="$(printf '%s' "${BODY}" | grep -nE "${FORBIDDEN_REGEX}" || true)"
  if [ -n "${HITS}" ]; then
    echo "smoke: FAIL — forbidden strings in ${URL}:"
    printf '%s\n' "${HITS}"
    FAIL=1
  else
    echo "smoke: OK — ${URL}"
  fi
done

if [ "${FAIL}" -ne 0 ]; then
  exit 1
fi

echo "smoke: all routes clean."
exit 0
