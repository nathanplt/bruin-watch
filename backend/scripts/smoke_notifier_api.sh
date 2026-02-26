#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BACKEND_BASE_URL:-http://127.0.0.1:8000}"
API_KEY="${BACKEND_API_KEY:-}"
COURSE_NUMBER="${COURSE_NUMBER:-31}"
TERM_CODE="${TERM_CODE:-26S}"
ALERT_TARGET="${ALERT_TARGET:-${PHONE_TO:-${ALERT_TO_EMAIL:-${ALERT_TO_NUMBER:-test@example.com}}}}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-60}"

if [[ -z "${API_KEY}" ]]; then
  echo "BACKEND_API_KEY is required."
  exit 1
fi

HTTP_STATUS=""
HTTP_BODY=""

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${BASE_URL%/}${path}"
  local response

  if [[ -n "${body}" ]]; then
    response="$(curl -sS -X "${method}" "${url}" \
      -H "X-API-Key: ${API_KEY}" \
      -H "Content-Type: application/json" \
      --data "${body}" \
      -w $'\n%{http_code}')"
  else
    response="$(curl -sS -X "${method}" "${url}" \
      -H "X-API-Key: ${API_KEY}" \
      -w $'\n%{http_code}')"
  fi

  HTTP_STATUS="$(printf '%s' "${response}" | tail -n 1)"
  HTTP_BODY="$(printf '%s' "${response}" | sed '$d')"
}

expect_status() {
  local expected="$1"
  local step="$2"
  if [[ "${HTTP_STATUS}" != "${expected}" ]]; then
    echo "FAIL ${step}: expected HTTP ${expected}, got ${HTTP_STATUS}"
    echo "Body: ${HTTP_BODY}"
    exit 1
  fi
  echo "OK   ${step}: HTTP ${HTTP_STATUS}"
}

extract_json_field() {
  local field="$1"
  printf '%s' "${HTTP_BODY}" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('${field}',''))"
}

echo "Smoke test against ${BASE_URL}"

request "GET" "/healthz"
expect_status "200" "healthz"

request "POST" "/api/v1/check" "{\"course_number\":\"${COURSE_NUMBER}\",\"term\":\"${TERM_CODE}\"}"
expect_status "200" "check course"

request "POST" "/api/v1/notifiers" "{\"course_number\":\"${COURSE_NUMBER}\",\"term\":\"${TERM_CODE}\",\"phone_to\":\"${ALERT_TARGET}\",\"interval_seconds\":${INTERVAL_SECONDS}}"
expect_status "201" "create notifier"
NOTIFIER_ID="$(extract_json_field "id")"
if [[ -z "${NOTIFIER_ID}" ]]; then
  echo "FAIL create notifier: missing id in response"
  echo "Body: ${HTTP_BODY}"
  exit 1
fi
echo "Created notifier id=${NOTIFIER_ID}"

request "GET" "/api/v1/notifiers"
expect_status "200" "list notifiers"
if ! printf '%s' "${HTTP_BODY}" | grep -q "${NOTIFIER_ID}"; then
  echo "FAIL list notifiers: created notifier ${NOTIFIER_ID} not found"
  echo "Body: ${HTTP_BODY}"
  exit 1
fi

request "PATCH" "/api/v1/notifiers/${NOTIFIER_ID}" '{"active":false}'
expect_status "200" "pause notifier"

request "PATCH" "/api/v1/notifiers/${NOTIFIER_ID}" '{"active":true}'
expect_status "200" "resume notifier"

request "DELETE" "/api/v1/notifiers/${NOTIFIER_ID}"
expect_status "200" "delete notifier"

echo "Smoke test passed."
