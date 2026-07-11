#!/usr/bin/env bash
# surface-engine golden checklist.
#
# Unlike a build-only check, this proves DETECTION: it builds a fixture image
# with KNOWN planted structures (encrypted containers, a hidden volume nested in
# free space, a stego anomaly) and asserts the engine finds them — blind.
#
#   ./golden-check.sh
#
# Exit 0 only if every AUTO check passes. [MANUAL] checks (real GPU, real drive,
# real terminal color) never fail the run — they are for a human on hardware.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
pass=0; fail=0
ok(){ printf "  [PASS] %s\n" "$1"; pass=$((pass+1)); }
no(){ printf "  [FAIL] %s\n" "$1"; fail=$((fail+1)); }
hr(){ printf "\n== %s ==\n" "$1"; }
BIN="target/release/surface-engine"
FIX="/tmp/xray-golden-fixture.img"

hr "BUILD"
if cargo build --release >/tmp/se_build.log 2>&1; then
  ok "cargo build --release"
  if ! grep -q "^warning" /tmp/se_build.log; then ok "zero warnings"; else no "warnings (see /tmp/se_build.log)"; fi
else
  no "build failed (see /tmp/se_build.log)"; printf "\nGOLDEN: RED (build)\n"; exit 1
fi

hr "FIXTURE (planted ground truth)"
# 1M blocks. zeroed | text | ENC1(16) | free(16) | HIDDEN(8) | free(8) | ENC2(16) | STEGO(1) | mixed(7)
rm -f "$FIX"
{
  dd if=/dev/zero bs=1M count=8 status=none
  yes "forensic log line the quick brown fox 0123456789 lorem ipsum dolor sit amet" | head -c 12M
  dd if=/dev/urandom bs=1M count=16 status=none
  dd if=/dev/zero bs=1M count=16 status=none
  dd if=/dev/urandom bs=1M count=8 status=none
  dd if=/dev/zero bs=1M count=8 status=none
  dd if=/dev/urandom bs=1M count=16 status=none
  { printf '\xFF\xD8\xFF\xE0'; head -c $((1024*1024-4)) /dev/urandom; }
  for i in $(seq 1 7); do head -c 512K /dev/zero; head -c 512K /dev/urandom; done
} >> "$FIX" 2>/dev/null
if [[ -s "$FIX" ]]; then ok "fixture built ($(du -h "$FIX" | cut -f1))"; else no "fixture build"; fi

hr "DETECTION (blind — engine never told where anything is)"
"$BIN" --image "$FIX" --json >/tmp/se_field.json 2>/dev/null
if python3 -c "import json; json.load(open('/tmp/se_field.json'))" 2>/dev/null; then
  ok "emits valid JSON SurfaceField"
else
  no "invalid JSON (see /tmp/se_field.json)"; printf "\nGOLDEN: RED (json)\n"; exit 1
fi

python3 - "$FIX" <<'PY'
import json, sys
d = json.load(open('/tmp/se_field.json'))
f = d["findings"]
checks = []
# read_only must be asserted
checks.append(("read-only asserted", d.get("read_only") is True))
# 3 planted high-entropy regions
checks.append((">=3 high-entropy layers detected", f["layered_high_entropy_regions"] >= 3))
# the hidden volume: a layer classified isolated_in_free_space
placements = [l["placement"] for l in f["layers"]]
checks.append(("hidden-volume shape (isolated_in_free_space) found", "isolated_in_free_space" in placements))
# that layer should rank notable (location elevates it above content-identical peers)
hid = [l for l in f["layers"] if l["placement"] == "isolated_in_free_space"]
checks.append(("hidden-volume ranked 'notable' on placement", any(l["confidence"] == "notable" for l in hid)))
# boundaries with no partition table
checks.append((">=6 aligned boundaries detected", len(f["boundaries"]) >= 6))
# stego anomaly: jpeg signature with high entropy
checks.append(("stego/mask anomaly (jpeg + high entropy) flagged",
               any(a["sig"] == "jpeg" and a["entropy"] > 7.5 for a in f["anomalies"])))
# all high-entropy layers are ~8.0 (sanity on the entropy math)
checks.append(("layer mean entropy ~8.0 (entropy math sane)",
               all(l["mean_entropy"] > 7.8 for l in f["layers"])))
# honest caveat present
checks.append(("honest caveat present in output", "not proof" in f["caveat"].lower()))
rc = 0
for name, good in checks:
    print(f"  [{'PASS' if good else 'FAIL'}] {name}")
    if not good: rc = 1
sys.exit(rc)
PY
if [[ $? -eq 0 ]]; then det_ok=1; else det_ok=0; fi

hr "SAFETY INVARIANT"
before=$(sha256sum "$FIX" | cut -d' ' -f1)
"$BIN" --image "$FIX" >/dev/null 2>&1
after=$(sha256sum "$FIX" | cut -d' ' -f1)
if [[ "$before" == "$after" ]]; then ok "image unchanged after scan (read-only honored)"; else no "IMAGE MUTATED — read-only violated"; fi

hr "MANUAL — hardware/scale-bound (confirm on real gear)"
cat <<'MANUAL'
  [MANUAL] Run against a REAL forensic image behind a write blocker:
     surface-engine --image /path/to/evidence.dd
     Confirm: layer count is plausible, boundaries land on real partition edges.
  [MANUAL] Generate a real VeraCrypt (bare) and LUKS (has header) container and
     confirm the placement/geometry read is sane — LUKS should surface a header
     signature; VeraCrypt should read as bare flat-high whose PLACEMENT is the tell.
  [MANUAL] Large-drive timing: on a 500GB+ image, confirm runtime is acceptable
     (this is where the GPU entropy kernel — planned phase — earns its place).
  [MANUAL] Once the scribe View::Surface renderer exists: confirm the heatmap
     COLOR makes the isolated-in-free-space island visibly bloom vs neighbors.
MANUAL

hr "RESULT"
[[ "$det_ok" -ne 1 ]] && fail=$((fail+1))
printf "  AUTO: %d passed, %d failed\n" "$pass" "$fail"
if [[ "$fail" -eq 0 && "$det_ok" -eq 1 ]]; then
  printf "  GOLDEN: GREEN (auto). Detection proven blind on planted fixture. Do the [MANUAL] items on real gear.\n"; exit 0
else
  printf "  GOLDEN: RED — see failures above.\n"; exit 1
fi
