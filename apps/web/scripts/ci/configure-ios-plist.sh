#!/usr/bin/env bash
# Patches Capacitor-generated Info.plist for App Store submission.
set -euo pipefail

PLIST="${1:-ios/App/App/Info.plist}"

if [ ! -f "$PLIST" ]; then
  echo "[ci] skipping Info.plist — not found at $PLIST"
  exit 0
fi

if ! command -v plutil >/dev/null 2>&1; then
  echo "[ci] plutil not available — skip Info.plist configuration"
  exit 0
fi

set_plist_bool() {
  local key="$1"
  local value="$2"
  plutil -insert "$key" -bool "$value" "$PLIST" 2>/dev/null || \
    plutil -replace "$key" -bool "$value" "$PLIST"
}

set_plist_string() {
  local key="$1"
  local value="$2"
  plutil -insert "$key" -string "$value" "$PLIST" 2>/dev/null || \
    plutil -replace "$key" -string "$value" "$PLIST"
}

# Standard HTTPS only — skip export compliance prompts in App Store Connect.
set_plist_bool ITSAppUsesNonExemptEncryption false

set_plist_string NSPhotoLibraryUsageDescription "ClearTask needs photo access to let you attach images to tasks."
set_plist_string NSCameraUsageDescription "ClearTask needs camera access to let you take photos for tasks."
set_plist_string NSMicrophoneUsageDescription "ClearTask needs microphone access for audio messages."

echo "[ci] configured $PLIST"
