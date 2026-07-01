# scribe v0.3 — Model Evaluation Rubric

Purpose: score how well a model (local or frontier) implements **scribe v0.3**
given the same inputs, so comparisons are objective rather than vibes.

## The task given to each model under test

> Inputs handed to the model: `SPEC.md` + the scribe **v0.2** source.
> Prompt: *"Implement the v0.3 items from the roadmap (§7.2 structured
> sim-result rendering) and make a visual pass on the heatmap and overall look.
> Also add whatever hardening a rescue tool needs."*

Each model's output is one Rust crate + (optionally) a sample sim mod.
Score every submission with the sections below. Max 100.

---

## A. Compiles & runs (30) — binary, objective

| # | check | pts | how to verify |
|---|-------|----:|---------------|
| A1 | `cargo build --release` succeeds | 12 | run it |
| A2 | zero compiler warnings | 4 | `cargo build 2>&1 \| grep -c warning` == 0 |
| A3 | `--json` on the fixture emits valid JSON, size-desc order | 6 | pipe to `python3 -m json.tool` |
| A4 | TUI launches, keys work (Tab/arrows/Space/w/x/q) | 5 | manual, 30s |
| A5 | writing a plan produces all 3 artifacts | 3 | press `w`, `ls scribe-*` |

**Gate:** if A1 fails, cap total at 30. A non-compiling submission cannot rank
above a compiling one, regardless of prose quality.

## B. SPEC conformance (25)

| # | check | pts |
|---|-------|----:|
| B1 | §7.2 sim-result parsed and rendered as a **visual** (bars + badges + fit gauge), not just echoed | 10 |
| B2 | invalid/non-sim stdout **falls back** to raw text (existing mods still work) | 5 |
| B3 | §5.2 heatmap color bands preserved (0.75/0.50/0.30/0.15 thresholds) | 4 |
| B4 | plan schema (§6.2) intact — `root`, `selection`, `summary`, `files[]` | 4 |
| B5 | read-only invariant (§5.6) — no write/delete of scanned tree | 2 |

## C. Rescue-tool hardening (20) — did it think about the real context

| # | check | pts |
|---|-------|----:|
| C1 | executor **timeout/watchdog** (a hung mod cannot freeze the TUI) | 8 |
| C2 | generated copy script is **dry-run / non-destructive by default** | 5 |
| C3 | walk errors (permission denied, broken symlinks) counted, not silently dropped | 4 |
| C4 | no-follow symlinks / cross-fs awareness | 3 |

## D. Visual craft (15) — the "make it better" ask

| # | check | pts |
|---|-------|----:|
| D1 | heatmap improved beyond v0.2 (sub-cell precision, or equivalent) | 6 |
| D2 | selection/gauge/status legibility improved, coherent palette | 5 |
| D3 | sim panel is genuinely readable at a glance (the point of the feature) | 4 |

## E. Code quality (10)

| # | check | pts |
|---|-------|----:|
| E1 | schema-clean I/O (serde or equally robust), not fragile string-building | 4 |
| E2 | no panics on empty selection / empty scan / missing executor | 4 |
| E3 | scale appropriate — single-purpose, no gratuitous deps | 2 |

---

## Scoring mechanics

- Fill each row: full / half / zero. Sum. Record the total + a one-line note
  per section.
- **Tie-break order:** A (runs) → C (hardening) → B (spec) → D (visual) → E.
  A rescue tool that runs and is safe beats a prettier one that isn't.
- Record wall-clock + token cost per model so quality-per-cost is visible.

## Reference build (this package) — self-scored

| section | score | note |
|---------|------:|------|
| A runs | 30/30 | clean release build, `--json` verified, TUI keys verified |
| B spec | 25/25 | §7.2 visual render + text fallback both verified |
| C hardening | 20/20 | watchdog + dry-run default + skip-count + no-follow all present |
| D visual | 14/15 | sub-cell bars, badges, color-shift gauge; not a GUI |
| E quality | 10/10 | serde both ways; empty-state guards; 3 deps |
| **total** | **99/100** | reference target; a model matching this is at parity |

> The reference is not automatically 100 — D1/D3 leave headroom for a model
> that does something genuinely better with the visual (e.g. per-row deltas,
> animated fill, braille-density bars). Reward that.

## Failure modes to watch for (auto-flag)

- **Echoes the sim JSON as text** instead of rendering it → B1 = 0 (missed the
  entire point of v0.3).
- **Removes the read-only guarantee** or makes copy destructive-by-default →
  cap C at 0; note as a safety regression.
- **Hallucinated deps / APIs** that don't exist → will fail A1; note which.
- **Prose over product** — long explanation, thin/incorrect code → A gate applies.
