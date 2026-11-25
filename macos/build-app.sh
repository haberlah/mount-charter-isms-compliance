#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="Mount Charter"
APP_BUNDLE="${PROJ_DIR}/${APP_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"

rm -rf "${APP_BUNDLE}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

echo "[1/4] Generating macOS AppIcon.icns (shield-peak)..."
ICON_TMP_DIR="${PROJ_DIR}/macos/icon-build"
rm -rf "${ICON_TMP_DIR}"
mkdir -p "${ICON_TMP_DIR}"

swift "${PROJ_DIR}/macos/make-icon.swift" "${ICON_TMP_DIR}"
iconutil -c icns "${ICON_TMP_DIR}/AppIcon.iconset" -o "${RESOURCES_DIR}/AppIcon.icns"
cp "${ICON_TMP_DIR}/StatusGlyph.png" "${ICON_TMP_DIR}/StatusGlyph@2x.png" "${ICON_TMP_DIR}/StatusGlyph@3x.png" "${RESOURCES_DIR}/"
cp "${ICON_TMP_DIR}/favicon.ico" "${ICON_TMP_DIR}/favicon-32.png" "${ICON_TMP_DIR}/apple-touch-icon-180.png" "${PROJ_DIR}/client/public/"
if [[ -d "${PROJ_DIR}/dist/public" ]]; then
  cp "${ICON_TMP_DIR}/favicon.ico" "${ICON_TMP_DIR}/favicon-32.png" "${ICON_TMP_DIR}/apple-touch-icon-180.png" "${PROJ_DIR}/dist/public/"
fi
rm -rf "${ICON_TMP_DIR}"

echo "[2/4] Writing Info.plist & Entitlements..."
cat > "${CONTENTS_DIR}/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>MountCharter</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>com.local.mountcharter</string>
  <key>CFBundleName</key>
  <string>Mount Charter</string>
  <key>CFBundleDisplayName</key>
  <string>Mount Charter</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>3.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
EOF

ENTITLEMENTS="${PROJ_DIR}/macos/entitlements.plist"
cat > "${ENTITLEMENTS}" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
</dict>
</plist>
EOF

echo "[3/4] Compiling native macOS app (Swift + AppKit + WebKit)..."
swiftc "${PROJ_DIR}/macos/PaperTokens.swift" "${PROJ_DIR}/macos/main.swift" \
  -O \
  -framework Cocoa \
  -framework WebKit \
  -o "${MACOS_DIR}/MountCharter"

SIGN_IDENTITY="${MOUNT_CHARTER_SIGN_IDENTITY:-}"
if [[ -z "${SIGN_IDENTITY}" ]]; then
  if security find-identity -v -p codesigning 2>/dev/null | grep -q '"Local Dev Signing"'; then
    SIGN_IDENTITY="Local Dev Signing"
  else
    SIGN_IDENTITY="-"
  fi
fi

echo "Signing bundle inside-out with identity: ${SIGN_IDENTITY}"
codesign --force --options runtime --timestamp=none --sign "${SIGN_IDENTITY}" --entitlements "${ENTITLEMENTS}" "${MACOS_DIR}/MountCharter"
codesign --force --options runtime --timestamp=none --sign "${SIGN_IDENTITY}" --entitlements "${ENTITLEMENTS}" "${APP_BUNDLE}"

echo "[4/4] Installing to /Applications/${APP_NAME}.app..."
rm -rf "/Applications/${APP_NAME}.app"
cp -R "${APP_BUNDLE}" "/Applications/${APP_NAME}.app"
rm -rf "${APP_BUNDLE}"

echo "Build complete: /Applications/${APP_NAME}.app"
