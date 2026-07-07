#!/bin/bash
# Pull live SQLite DB from phone (requires debuggable release build, v8.13+).
# Usage: scripts/db-pull.sh [output_path]   (default: /tmp/uspevatel.db)
set -e
OUT="${1:-/tmp/uspevatel.db}"
PKG=com.uspevatel.app
adb exec-out run-as $PKG cat files/SQLite/uspevatel.db > "$OUT"
# WAL may hold recent writes not yet in main file — pull and checkpoint if present
if adb shell run-as $PKG ls files/SQLite/uspevatel.db-wal >/dev/null 2>&1; then
  adb exec-out run-as $PKG cat files/SQLite/uspevatel.db-wal > "$OUT-wal" 2>/dev/null || true
  adb exec-out run-as $PKG cat files/SQLite/uspevatel.db-shm > "$OUT-shm" 2>/dev/null || true
  sqlite3 "$OUT" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
  rm -f "$OUT-wal" "$OUT-shm"
fi
echo "Pulled: $OUT ($(du -h "$OUT" | cut -f1))"
sqlite3 "$OUT" "SELECT 'tasks: '||COUNT(*) FROM tasks; SELECT 'workout_logs: '||COUNT(*)||', last '||MAX(date) FROM workout_logs;"
