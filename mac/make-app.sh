#!/bin/bash
# Builds "Pocket Presenter.app", a double-clickable Mac app with present.py and app/ inside it, so it works from
# anywhere. Usage: mac/make-app.sh [destination folder]   (default: ~/Applications)
set -euo pipefail
cd "$(dirname "$0")"
DEST="${1:-$HOME/Applications}"
APP="$DEST/Pocket Presenter.app"
BUILD="$(mktemp -d)"; trap 'rm -rf "$BUILD"' EXIT

osacompile -s -o "$BUILD/Pocket Presenter.app" PocketPresenter.applescript
RES="$BUILD/Pocket Presenter.app/Contents/Resources"
cp ../present.py launch.sh "$RES/"; cp -R ../app "$RES/app"; chmod +x "$RES/launch.sh"

# icon: icon.svg -> applet.icns (skipped quietly if Quick Look can't render it)
if qlmanage -t -s 1024 -o "$BUILD" icon.svg >/dev/null 2>&1 && [ -f "$BUILD/icon.svg.png" ]; then
  mkdir "$BUILD/icon.iconset"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$BUILD/icon.svg.png" --out "$BUILD/icon.iconset/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) "$BUILD/icon.svg.png" --out "$BUILD/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns -o "$RES/applet.icns" "$BUILD/icon.iconset"
  rm -f "$RES/Assets.car"   # newer osacompile puts the default icon here, and it wins over applet.icns
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$BUILD/Pocket Presenter.app/Contents/Info.plist" 2>/dev/null || true
fi

PL="$BUILD/Pocket Presenter.app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string io.github.treggs6.pocket-presenter" "$PL" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier io.github.treggs6.pocket-presenter" "$PL"
codesign --force --deep -s - "$BUILD/Pocket Presenter.app" 2>/dev/null || true

mkdir -p "$DEST"; rm -rf "$APP"; mv "$BUILD/Pocket Presenter.app" "$APP"
echo "Built: $APP"
