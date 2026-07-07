#!/bin/bash
# Push modified SQLite DB back to phone (requires debuggable release build, v8.13+).
# Usage: scripts/db-push.sh [input_path]   (default: /tmp/uspevatel.db)
# IMPORTANT: force-stops the app first — SQLite must not be open during replace.
set -e
IN="${1:-/tmp/uspevatel.db}"
PKG=com.uspevatel.app
[ -f "$IN" ] || { echo "No file: $IN"; exit 1; }
sqlite3 "$IN" "PRAGMA integrity_check;" | grep -q "^ok$" || { echo "DB integrity check failed, aborting"; exit 1; }
adb shell am force-stop $PKG
adb push "$IN" /data/local/tmp/uspevatel.db >/dev/null
adb shell "run-as $PKG sh -c 'cat /data/local/tmp/uspevatel.db > files/SQLite/uspevatel.db; rm -f files/SQLite/uspevatel.db-wal files/SQLite/uspevatel.db-shm'"
adb shell rm /data/local/tmp/uspevatel.db
echo "Pushed: $IN -> phone. App was force-stopped; open it to reload."
