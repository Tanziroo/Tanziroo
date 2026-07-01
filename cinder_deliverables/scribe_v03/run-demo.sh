#!/usr/bin/env bash
# scribe demo runner — builds a fixture, then launches scribe against it with
# the sample simulation mod wired in. No real disk needed.
#
#   ./run-demo.sh          # interactive TUI demo (press x to see the sim panel)
#   ./run-demo.sh --json   # headless: print the scan JSON and exit
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HERE/scribe/target/release/scribe"
MOD="$HERE/scribe-mod-sim"
FIX="$HERE/fixture"

if [[ ! -x "$BIN" ]]; then
  echo "building scribe (release) ..." >&2
  ( cd "$HERE/scribe" && cargo build --release )
fi
chmod +x "$MOD" 2>/dev/null || true

# Build a demo fixture tree if missing.
if [[ ! -d "$FIX" ]]; then
  echo "creating demo fixture at $FIX ..." >&2
  mkdir -p "$FIX"/{medical_backups,backup/2025,home/khet,images,forensics}
  head -c 8000000  /dev/zero > "$FIX/medical_backups/scan.pdf"
  head -c 3000000  /dev/zero > "$FIX/medical_backups/labs.pdf"
  head -c 3000000  /dev/zero > "$FIX/backup/2025/vault.tar"
  head -c 1500000  /dev/zero > "$FIX/home/khet/notes.txt"
  head -c 500000   /dev/zero > "$FIX/home/khet/config.json"
  head -c 12000000 /dev/zero > "$FIX/images/disk.img"
  head -c 200000   /dev/zero > "$FIX/forensics/report.pdf"
fi

AREAS="medical_backups,backup,home,images,forensics"
export SCRIBE_DEST="${SCRIBE_DEST:-/tmp/scribe-demo-dest}"

if [[ "${1:-}" == "--json" ]]; then
  exec "$BIN" "$FIX" --areas "$AREAS" --json
fi

echo "launching scribe TUI. Try: Tab, arrows, Space to pick, then 'x' to simulate, 'q' to quit."
exec "$BIN" "$FIX" --areas "$AREAS" --executor "$MOD"
