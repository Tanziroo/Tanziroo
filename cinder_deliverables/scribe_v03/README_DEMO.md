# scribe 0.3 — Demo Package

A rescue-time TUI: scan a disk, **see where the data weight is** as a heatmap,
**select what matters**, and hand it to an external tool as a machine-readable
plan — with a **mod that simulates the outcome visually** before any bytes move.

Guiding rule: **look before you touch.** scribe never copies or deletes.

---

## What's in this package

| path | what it is |
|------|-----------|
| `scribe/` | the Rust TUI (source). `cargo build --release` → `scribe/target/release/scribe` |
| `scribe-mod-sim` | sample **simulation module** (Python 3, stdlib only). Reads a plan, emits a `sim_version:1` projection scribe renders visually. |
| `run-demo.sh` | one-command demo: builds a fixture disk tree, launches scribe wired to the sim mod. No real disk needed. |
| `SPEC.md` | the product/UX spec this implementation targets. |
| `EVAL_RUBRIC.md` | scoring rubric for comparing model implementations (this build is the reference). |

---

## Quick start (60 seconds)

```bash
# needs a Rust toolchain (rustup) + Python 3
./run-demo.sh          # builds fixture + scribe, launches the TUI
#   Tab      switch Folders / Extensions
#   ↑↓ / jk  move
#   Space    pick a row
#   x        SIMULATE → colored projection panel (this is the headline feature)
#   r        (in sim popup) toggle raw JSON view
#   w        write plan + selection + dry-run copy script
#   q        quit
```

Headless (no TUI, for scripting / CI):

```bash
./run-demo.sh --json   # prints the scan as JSON and exits
```

---

## The three interfaces a "mod" can attach to

1. **`--json`** — full scan as JSON, no TUI. For scripted inventory.
2. **`scribe-plan.json`** (written on `w`) — the stable contract: selection +
   file list + sizes + `ext`. Downstream tools copy / dedupe / verify from this.
3. **`--executor PROG`** (the live hook) — on `x`, scribe pipes the plan to
   `PROG`'s stdin and renders its stdout. If stdout is a `sim_version:1`
   document it becomes a **visual panel** (projected heatmap bars + action
   badges + fit gauge); otherwise the raw text is shown. Additive — every
   text-only mod keeps working.

### sim-result schema (what a visual mod emits)

```json
{
  "sim_version": 1,
  "dest": "/mnt/backup/rescue",
  "dest_free_bytes": 62277025792,
  "fits": true,
  "eta_seconds": 420,
  "totals": { "copy_bytes": 15676941107, "skip_bytes": 251658240, "conflicts": 0 },
  "rows": [
    { "key": "medical_backups", "bytes": 8700000000, "action": "COPY" },
    { "key": "backup",          "bytes": 7200000000, "action": "COPY" },
    { "key": "(dedup)",         "bytes": 251658240,  "action": "SKIP" }
  ]
}
```

Action badges: `COPY` green · `SKIP` yellow · `CONFLICT` red · `DEDUP` cyan.

---

## Safety model

- The scanned tree is **read-only**. scribe writes only three artifacts, in CWD.
- `scribe-copy.sh` ships with **`--dry-run` on by default** and a clear UNLOCK
  comment — you must consciously remove it to perform a real copy.
- No network. No rename/move/delete of source files.

---

## Verified (this reference build)

- `cargo build --release` — **clean, zero warnings** (rustc via rustup).
- Headless `--json` scan on the fixture — correct size-desc ordering, folder
  grouping at `--depth`, extension aggregation.
- `scribe-mod-sim` end-to-end — emits valid `sim_version:1`; dedup logic
  correctly skips a duplicate basename+size file.
- Executor watchdog — a hung mod is killed at `--executor-timeout` (default 60s)
  and the popup reports the timeout; scribe stays responsive.

---

## v0.2 → v0.3 changelog

- §7.2 **visual sim-result rendering** (projected bars, action badges, fit gauge).
- Executor **watchdog** (`--executor-timeout`, default 60s) — no more freeze on a hung mod.
- Plan `files[]` now carry `ext` (free downstream filtering).
- `scribe-copy.sh` defaults to `--dry-run` + `set -euo pipefail` + `chmod 755`.
- Sub-cell heatmap bars (Unicode eighths — 8× resolution at same width).
- ◉/○ selection marks, rounded borders, colored status dot, gauge color-shift.
- `Esc` reserved for popup-close only (`q` is the sole quit).
- serde / serde_json for schema-clean plan / scan / sim I/O.
