#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mobile"
API_URL="${API_URL:-${API_BASE_URL:-https://funint.online/api}}"
RTC_GATEWAY_CLIENT_APP_ID="${RTC_GATEWAY_CLIENT_APP_ID:-}"
RTC_GATEWAY_APP_USER_TOKEN="${RTC_GATEWAY_APP_USER_TOKEN:-}"
OUTPUT_APK="${OUTPUT_APK:-$MOBILE_DIR/build/api-only/rtc-service-api-only.apk}"

mkdir -p "$(dirname "$OUTPUT_APK")"

echo "Building API-only RTC APK"
echo "API_URL: $API_URL"
if [[ -n "$RTC_GATEWAY_CLIENT_APP_ID" ]]; then
  echo "RTC_GATEWAY_CLIENT_APP_ID: $RTC_GATEWAY_CLIENT_APP_ID"
else
  echo "RTC_GATEWAY_CLIENT_APP_ID: app/runtime default"
fi

BUILD_DEFINES=(
  "--dart-define=API_URL=$API_URL"
  "--dart-define=API_BASE_URL=$API_URL"
  "--dart-define=RTC_API_URL=$API_URL"
)

if [[ -n "$RTC_GATEWAY_CLIENT_APP_ID" ]]; then
  BUILD_DEFINES+=(
    "--dart-define=RTC_GATEWAY_CLIENT_APP_ID=$RTC_GATEWAY_CLIENT_APP_ID"
  )
fi

if [[ -n "$RTC_GATEWAY_APP_USER_TOKEN" ]]; then
  BUILD_DEFINES+=(
    "--dart-define=RTC_GATEWAY_APP_USER_TOKEN=$RTC_GATEWAY_APP_USER_TOKEN"
  )
fi

(
  cd "$MOBILE_DIR"
  flutter pub get
  API_URL="$API_URL" API_BASE_URL="$API_URL" flutter build apk --release \
    "${BUILD_DEFINES[@]}"
)

cp "$MOBILE_DIR/build/app/outputs/flutter-apk/app-release.apk" "$OUTPUT_APK"

echo "APK: $OUTPUT_APK"
sha256sum "$OUTPUT_APK"
