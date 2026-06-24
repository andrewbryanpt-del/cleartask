#!/usr/bin/env bash
# Regenerates Capacitor native shells (gitignored locally), builds the web app,
# syncs assets, generates icons, and patches Android Gradle for CI signing.
set -euo pipefail

ROOT="${CM_BUILD_DIR:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
WEB_DIR="$ROOT/apps/web"

cd "$WEB_DIR"

if [ ! -d android ]; then
  echo "[ci] adding Android platform"
  npx cap add android
fi

if [ ! -d ios ]; then
  echo "[ci] adding iOS platform"
  npx cap add ios
fi

echo "[ci] building web app"
export VITE_API_URL="${VITE_API_URL:-https://api-production-332f.up.railway.app}"
echo "[ci] VITE_API_URL=$VITE_API_URL"
VITE_API_URL="$VITE_API_URL" npm run build

echo "[ci] syncing Capacitor"
npx cap sync

if [ -f assets/icon.png ]; then
  echo "[ci] generating native icons"
  npx capacitor-assets generate --iconBackgroundColor "#1E3A5F"
fi

echo "[ci] patching Android release signing"
node scripts/ci/patch-android-build.mjs

if [ -f ios/App/App/Info.plist ]; then
  bash scripts/ci/configure-ios-plist.sh ios/App/App/Info.plist
fi
