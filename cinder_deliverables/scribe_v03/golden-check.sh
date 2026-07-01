#!/usr/bin/env bash
# scribe golden checklist — run on the target machine before demo/eval.
#
# Auto-runs every machine-independent check and prints PASS/FAIL. The last
# section lists HARDWARE/TERMINAL-bound checks that only a human at a real
# terminal can confirm (marked [MANUAL]) — because a snapshot buffer proves
# layout, but only a real TTY proves colors + input actually work.
#
#   ./golden-check.sh
#
# Exit code 0 only if every AUTO check passes. Manual checks never fail the run.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
pass=0; fail=0
ok(){ printf "  [PASS] %s\n" "$1"; pass=$((pass+1)); }
no(){ printf "  [FAIL] %s\n" "$1"; fail=$((fail+1)); }
hr(){ printf "\n== %s ==\n" "$1"; }

hr "BUILD"
if ( cd scribe && cargo build --release ) >/tmp/gc_build.log 2>&1; then
  ok "cargo build --release"
  if ! grep -q "warning" /tmp/gc_build.log; then ok "zero warnings"; else no "warnings present (see /tmp/gc_build.log)"; fi
else
  no "cargo build --release (see /tmp/gc_build.log)"
fi
BIN="scribe/target/release/scribe"

hr "TEST"
if ( cd scribe && cargo test --release ) >/tmp/gc_test.log 2>&1; then
  ok "cargo test (snapshot + safety tests)"
else
  no "cargo test (see /tmp/gc_test.log)"
fi

hr "HEADLESS PIPELINE"
if [[ -x "$BIN" ]]; then
  ./run-demo.sh --json >/tmp/gc_scan.json 2>/dev/null
  if python3 -c "import json; d=json.load(open('/tmp/gc_scan.json')); assert d['scribe_version'] and d['total_bytes']>0 and d['folders']" 2>/dev/null; then
    ok "--json scan: valid JSON, non-empty, folders present"
  else
    no "--json scan (see /tmp/gc_scan.json)"
  fi
  # size-desc ordering
  if python3 -c "import json; f=json.load(open('/tmp/gc_scan.json'))['folders']; assert all(f[i]['bytes']>=f[i+1]['bytes'] for i in range(len(f)-1))" 2>/dev/null; then
    ok "folders sorted size-desc"
  else
    no "folder ordering"
  fi
else
  no "binary missing — build failed upstream"
fi

hr "SIM MOD"
if printf '{"files":[{"path":"a/x.pdf","bytes":8000000,"ext":"pdf"},{"path":"b/x.pdf","bytes":8000000,"ext":"pdf"}]}' \
     | SCRIBE_DEST=/tmp python3 scribe-mod-sim 2>/dev/null \
     | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['sim_version']==1 and d['totals']['skip_bytes']==8000000" 2>/dev/null; then
  ok "scribe-mod-sim emits sim_version:1 and dedups correctly"
else
  no "scribe-mod-sim"
fi

hr "ARTIFACTS PRESENT"
for f in scribe/src/main.rs scribe/Cargo.toml scribe/Cargo.lock scribe-mod-sim run-demo.sh README_DEMO.md EVAL_RUBRIC.md SPEC.md; do
  [[ -e "$f" ]] && ok "$f" || no "$f missing"
done

hr "MANUAL — hardware/terminal-bound (confirm by eye, ~30s)"
cat <<'MANUAL'
  [MANUAL] Launch the real TUI:   ./run-demo.sh
     Confirm on your terminal:
       1. Heatmap bars show COLOR (red→cyan by size), not just monochrome.
       2. Arrow keys / j,k move the cursor; Space toggles ◉/○.
       3. Press 'x' → sim panel appears with COPY/SKIP badges + fit gauge.
       4. Press 'r' in the panel → toggles raw JSON view.
       5. Press 'q' → clean exit, terminal restored (no garbled prompt).
       6. Header 'executor:' field readable (widen terminal if truncated).
  [MANUAL] If a GPU/large-disk build of the wider Cinder suite is in scope,
     run its own checklist there — scribe itself needs no GPU.
MANUAL

hr "RESULT"
printf "  AUTO: %d passed, %d failed\n" "$pass" "$fail"
if [[ "$fail" -eq 0 ]]; then
  printf "  GOLDEN: GREEN (auto checks). Complete the [MANUAL] items on a real terminal.\n"; exit 0
else
  printf "  GOLDEN: RED — %d auto check(s) failed. See /tmp/gc_*.log.\n" "$fail"; exit 1
fi
