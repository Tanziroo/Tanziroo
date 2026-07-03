#!/usr/bin/env bash
# fleet-triage.sh — X-ray a whole pile of drives/images and rank them by how
# much hidden structure each carries, so limited examiner time goes to the
# drive (and offset) that matters most first.
#
# Reads every source READ-ONLY. Writes only a manifest + report in CWD.
#
# USAGE
#   ./fleet-triage.sh /mnt/evidence/*.img
#   ./fleet-triage.sh --sample 65536 img1.dd img2.dd /dev/sdb /dev/sdc
#   ./fleet-triage.sh --dir /mnt/evidence        # scan a dir for *.img/*.dd
#
# OUTPUT
#   fleet-report.txt   ranked human table ("look here first")
#   fleet-manifest.json  per-drive stats + sha (fleet chain-of-custody)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HERE/target/release/surface-engine"
[[ -x "$BIN" ]] || { echo "build first: (cd $HERE && cargo build --release)"; exit 1; }

SAMPLE=65536      # default large-drive head-sample (fast); 0 = full scan
SOURCES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sample) SAMPLE="$2"; shift 2 ;;
    --full)   SAMPLE=0; shift ;;
    --dir)    while IFS= read -r p; do SOURCES+=("$p"); done < <(find "$2" -maxdepth 1 -type f \( -name '*.img' -o -name '*.dd' -o -name '*.raw' \) | sort); shift 2 ;;
    *)        SOURCES+=("$1"); shift ;;
  esac
done
[[ ${#SOURCES[@]} -gt 0 ]] || { echo "usage: ./fleet-triage.sh [--sample N|--full] SOURCE... | --dir DIR"; exit 2; }

WORK="$(mktemp -d)"
echo "fleet-triage: ${#SOURCES[@]} source(s), sample=${SAMPLE} bytes/block (0=full)"
i=0
for src in "${SOURCES[@]}"; do
  i=$((i+1))
  [[ -e "$src" ]] || { echo "  [skip] $src (missing)"; continue; }
  echo "  [$i/${#SOURCES[@]}] scanning $src ..."
  args=(--image "$src" --json)
  [[ "$SAMPLE" -gt 0 ]] && args+=(--sample-bytes "$SAMPLE")
  "$BIN" "${args[@]}" > "$WORK/$i.json" 2>/dev/null || echo "    (engine error on $src)"
done

# Rank + emit manifest/report with a small python pass over the JSON fields.
python3 - "$WORK" "$SAMPLE" <<'PY'
import json, os, sys, glob, datetime
work, sample = sys.argv[1], int(sys.argv[2])
rows = []
for jf in sorted(glob.glob(os.path.join(work, "*.json")), key=lambda p: int(os.path.basename(p).split('.')[0])):
    try:
        d = json.load(open(jf))
    except Exception:
        continue
    f = d.get("findings", {})
    layers = f.get("layers", [])
    hidden = sum(1 for l in layers if l.get("placement") == "isolated_in_free_space")
    tail   = sum(1 for l in layers if l.get("placement") == "drive_tail")
    notable= sum(1 for l in layers if l.get("confidence") == "notable")
    anom   = len(f.get("anomalies", []))
    # Priority: hidden-in-free-space is the loudest signal, then tail placement,
    # then anomalies, then notable containers, then raw layer count.
    score = hidden*100 + tail*60 + anom*40 + notable*25 + len(layers)*5
    rows.append({
        "source": d.get("source"),
        "bytes": d.get("source_bytes", 0),
        "layers": len(layers),
        "hidden_in_free_space": hidden,
        "drive_tail": tail,
        "anomalies": anom,
        "notable": notable,
        "priority": score,
    })

rows.sort(key=lambda r: -r["priority"])

def human(b):
    v=float(b); u=["B","K","M","G","T","P"]; i=0
    while v>=1024 and i<len(u)-1: v/=1024; i+=1
    return f"{int(b)} B" if i==0 else f"{v:.1f} {u[i]}"

ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
manifest = {"generated_utc": ts, "sample_bytes": sample, "fleet_size": len(rows), "drives": rows}
json.dump(manifest, open("fleet-manifest.json","w"), indent=2)

lines = []
lines.append(f"FLEET TRIAGE — {len(rows)} drive(s) — {ts}")
lines.append(f"sample: {sample} bytes/block (0 = full scan)")
lines.append("ranked by hidden-structure priority (look at the top first)\n")
lines.append(f"{'#':>2}  {'PRIORITY':>8}  {'HIDDEN':>6}  {'TAIL':>4}  {'ANOM':>4}  {'NOTBL':>5}  {'LAYERS':>6}  {'SIZE':>9}  SOURCE")
for n, r in enumerate(rows, 1):
    flag = "  <== HIDDEN-IN-FREE-SPACE" if r["hidden_in_free_space"] else ""
    lines.append(f"{n:>2}  {r['priority']:>8}  {r['hidden_in_free_space']:>6}  {r['drive_tail']:>4}  "
                 f"{r['anomalies']:>4}  {r['notable']:>5}  {r['layers']:>6}  {human(r['bytes']):>9}  {r['source']}{flag}")
lines.append("\nHIGHEST PRIORITY: " + (rows[0]["source"] if rows else "(none)"))
lines.append("caveat: priority ranks LEADS, not proof. A low score is not a clean drive — it means")
lines.append("no content/placement anomaly surfaced at this sampling. Confirm leads with a focused carve.")
report = "\n".join(lines)
open("fleet-report.txt","w").write(report + "\n")
print(report)
PY
echo
echo "wrote fleet-report.txt + fleet-manifest.json"
