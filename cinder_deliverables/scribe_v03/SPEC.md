# scribe — Product & UI/UX Spec

Status: draft v1 · target binary: `scribe 0.2.x` → `0.3` (visual sim)
See `screenshot.png` for the reference look (folders view + heatmap + live sim popup).

---

## 1. Purpose

A rescue-time TUI that lets an operator look at a mounted, possibly-broken disk,
**see where the data weight is**, **choose what matters**, and hand that choice to
an external tool as a **machine-readable plan** — including a "mod" that
**simulates the outcome visually** before anything is written.

Context: it was built to triage an Arch install from a SystemRescue live USB,
where reinstalling would have destroyed real data (`medical_backups/`, vaults).
The guiding rule is **look before you touch** — scribe never copies or deletes.

## 2. Goals / Non-goals

**Goals**
- Read-only scan of "important areas"; never mutate the scanned tree.
- A heatmap that makes "where are the big things" obvious in <5 seconds.
- Select by **folder location** (drill-down) or **extension**.
- Emit a stable **plan** other tools consume (`scribe-plan.json`).
- A **pluggable executor hook** so a sim/mod attaches with no teardown.
- The mod's simulation is **shown visually inside scribe**, not just logged.

**Non-goals**
- scribe does not copy/restore itself (it emits an rsync script; you run it).
- Not a file manager; no rename/delete/move of source files.
- No network features.

## 3. Primary scenario

1. Operator boots SystemRescue, mounts the target **read-only** at `/mnt/sys`.
2. Runs `scribe /mnt/sys --executor ./sim-mod`.
3. Scans the heatmap, ticks `medical_backups` + `backup` (+ extension `pdf`).
4. Presses `x` → the mod simulates the copy to `sdb1` and scribe shows the
   projected result visually (what copies, what dedups, will it fit, ETA).
5. Satisfied, presses `w` → writes the plan + `scribe-copy.sh`.
6. Runs `bash scribe-copy.sh` to perform the real backup.

---

## 4. Data model

```
FileRec { rel: String, size: u64, ext: String, group: String }
```
- `rel`   — path relative to root, e.g. `home/khet/notes.txt`
- `group` — folder key at `--depth` (default 2), e.g. `home/khet`
- `ext`   — lowercased extension or `(no ext)`

Aggregations (sorted by size desc): **folders** (by `group`) and **extensions**
(by `ext`), each a `Row { key, size, count }`.

Selection is two sets: `selected_folders`, `selected_extensions`.
A file is **in the plan** iff `group ∈ folders OR ext ∈ extensions` (union).

---

## 5. UI/UX spec

### 5.1 Layout (top → bottom)

| region | height | contents |
|--------|--------|----------|
| Header | 3 | `scribe <ver>` badge · tab bar `Folders`/`Extensions` · `root:` · `executor:` |
| List   | flex | one row per folder/extension: checkbox · name · size · count · **heatmap bar** |
| Footer | 6 | selection **gauge** · summary line · status/help line |
| Popup  | overlay | simulation output (only when `x` was pressed) |

### 5.2 Heatmap (the core visual)

Each row's bar length is proportional to `size / max_in_view`. Color encodes the
same ratio so weight reads instantly:

| ratio | color | meaning |
|-------|-------|---------|
| ≥ 0.75 | red | dominant |
| ≥ 0.50 | light red | very large |
| ≥ 0.30 | yellow | large |
| ≥ 0.15 | green | moderate |
| > 0 | cyan | small |
| 0 | dark gray | empty |

### 5.3 Selection gauge (footer)

A horizontal gauge showing `selected_bytes / total_bytes` as a percent, label
`"14.8 G / 32.5 G selected (46%)"`. Answers "how much am I about to copy?" at a
glance and updates live as rows are toggled.

### 5.4 Keybindings

| key | action |
|-----|--------|
| `Tab` | switch Folders ↔ Extensions |
| `↑/↓`, `j/k` | move cursor |
| `Space`/`Enter` | toggle select on highlighted row |
| `a` / `n` | select all / none (current view) |
| `w` | write `scribe-plan.json`, `-selection.txt`, `-copy.sh` |
| `x` | simulate: pipe live plan to `--executor`, show output popup |
| `Esc` | close popup |
| `q` | quit |

### 5.5 States & messages

- **Scanning** — stderr line before TUI: `scribe: scanning <root> ...`
- **Empty** — if no files in areas: explanatory exit, lists the areas searched.
- **Nothing selected** + `w`/`x` — status: "Nothing selected — pick first."
- **No executor** + `x` — status: "No --executor set. Run with --executor …".
- **Popup open** — list keys are suppressed; only `Esc`/`Enter`/`x`/`q` act.
- Status line resets on the next keypress; otherwise shows the help hint.

### 5.6 Invariants (must always hold)

- The scanned tree is **never modified**. Only the three artifacts are written,
  in the CWD.
- Toggling never loses other selections (folders and extensions are independent).
- The plan's `files[].path` are always relative to `root`.

---

## 6. The hook — how the mod attaches (no teardown)

Three interfaces, in increasing power:

### 6.1 `--json` (batch)
`scribe /mnt/sys --json` → `{ root, total_bytes, folders[], extensions[] }`.
For scripted selection / inventory.

### 6.2 `scribe-plan.json` (the contract, written on `w`)
```json
{
  "scribe_version": "0.2.0",
  "root": "/mnt/sys",
  "selection": { "folders": ["medical_backups","home/khet"], "extensions": ["pdf"] },
  "summary": { "files": 1234, "bytes": 5678901 },
  "files": [ { "path": "medical_backups/scan.pdf", "bytes": 2000000 } ]
}
```

### 6.3 `--executor PROG` (the live hook)
On `x`, scribe runs `PROG`, writes the plan to its **stdin**, and renders its
**stdout** in the popup. The mod needs only: read stdin → write report → exit.
It sits *between* the plan and the real copy and never touches scribe's code.

---

## 7. Visual simulation spec (the part that matters most)

> "It actually sims visually." The mod's job is to show the *projected outcome*
> of the plan, inside scribe, before any bytes move.

### 7.1 v0.2 (today): text popup
`PROG`'s stdout is shown verbatim. Already enough for a mod to print a readable
projection (see screenshot). Contract is loose: any text.

### 7.2 v0.3 (proposed): structured sim-result → rendered visually
To make the sim a real *visual*, the mod may instead emit a JSON **sim-result**
on stdout, which scribe renders as a colored panel:

```json
{
  "sim_version": 1,
  "dest": "/mnt/backup/KHETPRIME-rescue",
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

**Rendering rules (scribe side):**
- Each `rows[]` entry → a line with a **projected heatmap bar** (same scale as the
  main list) + an **action badge**:
  - `COPY` green · `SKIP` yellow · `CONFLICT` red · `DEDUP` cyan
- A **fit gauge**: `copy_bytes` vs `dest_free_bytes`; **red** if `fits=false`.
- Header line: `dest`, free space, `ETA`, `conflicts` (red if > 0).
- If stdout is **not** valid sim-result JSON, fall back to §7.1 (raw text). This
  keeps every existing mod working — additive, no teardown.

### 7.3 Why this shape
- The mod stays a dumb filter (stdin JSON → stdout JSON); all rendering lives in
  scribe, so the *visual* is consistent regardless of which mod is plugged in.
- The action/þbar/gauge vocabulary is small and fixed, so a screenshot of one
  mod's sim looks like any other's.

---

## 8. Artifacts written (on `w`)

| file | purpose |
|------|---------|
| `scribe-plan.json` | the contract (§6.2) — for your mod / tooling |
| `scribe-selection.txt` | `rsync --files-from` manifest (paths rel to root) |
| `scribe-copy.sh` | ready-to-run rsync to `DEST` (edit `DEST`, then run) |

## 9. Roadmap

- [x] v0.1 — scan, heatmap, select by folder/ext, manifest + rsync.
- [x] v0.2 — folder drill-down, selection gauge, JSON plan, executor sim hook.
- [ ] v0.3 — structured sim-result rendering (§7.2): projected bars, action
      badges, fit gauge.
- [ ] v0.3 — subfolder expand/collapse in the list; per-row include/exclude.
- [ ] v0.4 — scan progress bar for very large trees; saved selection profiles.
