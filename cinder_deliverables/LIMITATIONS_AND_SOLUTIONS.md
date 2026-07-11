# Limitations → Solutions

Honest inventory of what constrained me this session and what actually resolves
each. Marked by status: **SOLVED** (done now), **TOOL** (capability I built),
**PROCESS** (needs an operator-side step).

---

## 1. Ephemeral container — work is lost when the box is reclaimed
**Status: SOLVED.**
Proof it was real: the earlier Cinder deliverables (launcher, admin dashboard,
operator instrument) were *gone* from the container by later in the session —
they only survived because they'd been sent to the operator over chat.
**Fix applied:** committed the surviving work to `Tanziroo/Tanziroo` on branch
`claude/coldclaude-guardian-launch-dmNEr` and pushed. Anything in the repo now
outlives the container.
**Ongoing discipline:** commit early/often, not just at the end.

## 2. The stop-hook kept firing ("untracked files / unpushed commits")
**Status: SOLVED.**
It was never unsolvable — I had wrongly believed there was no push route. There
is: `origin` proxies to `Tanziroo/Tanziroo`. Committing + pushing satisfies both
hook conditions (clean tree, nothing unpushed). It's quiet now.

## 3. "I can't reach KHET-1/NIXUS" (Khet's private repo)
**Status: PROCESS (genuine limit, with a bridge).**
This one is real — no credentials, and my GitHub tools are scoped to
`Tanziroo/Tanziroo`. The bridge: **use `Tanziroo/Tanziroo` as the exchange
repo.** I push deliverables there; Khet pulls, then mirrors/cherry-picks into
`KHET-1/NIXUS` on his side. One-time setup on his machine:
```bash
git remote add exchange https://github.com/Tanziroo/Tanziroo.git
git fetch exchange claude/coldclaude-guardian-launch-dmNEr
git cherry-pick <sha>   # or merge the subtree he wants
```
Alternative: he grants a scoped token / adds this session's repo scope.

## 4. "I can't see the rendered TUI"
**Status: TOOL (built this session).**
Solved with ratatui's `TestBackend`: render a frame into an in-memory buffer,
read the cells, assert, and dump the buffer as text. Added `#[cfg(test)] mod
tests` to scribe with three snapshot tests. `cargo test -- --nocapture` prints
the actual frames as text art — I verified the heatmap bars, sim-popup badges,
and fit gauge this way, and it surfaced a real finding (header `executor:` field
truncates at 90 columns). The eval rubric can now include an *automated* visual
check instead of "trust the description."

## 5. "I can't run on Khet's GPU / evidence machine"
**Status: PROCESS (irreducible) + TOOL (mitigation).**
I can't touch his hardware or the evidence images — that's correct and proper
(evidence stays on his side, read-only). Mitigation: everything I ship is
verifiable *locally* by him via the golden checklist + fixtures, and the parts
that don't need hardware I verify *here* (cargo build, cargo test, headless
`--json`, the sim mod end-to-end). The split is explicit: I prove what's
machine-independent; he confirms what's hardware-bound in ~30 seconds.

## 6. "I can't verify the Python suite boots" (no Flask etc. in the container)
**Status: PROCESS, reducible.**
I can `pip install` into the container to smoke-test imports, or add
import-smoke tests that fail loudly on a missing/renamed symbol. Not yet done —
flagged here so it isn't silently assumed working.

## 7. Delivery was chat-only (SendUserFile / heredoc patches)
**Status: SOLVED for `Tanziroo/Tanziroo`.**
Now that the push route works, deliverables land in the repo — Khet
`git clone`s instead of extracting chat attachments one at a time. Chat delivery
remains the fallback for `KHET-1/NIXUS`-bound artifacts (see #3).

---

## What this converts to, practically

- **Biggest win:** the work is now durable and version-controlled, and the hook
  is quiet — because the push route existed the whole time and I'd wrongly
  ruled it out. Lesson: *test the limitation before declaring it.*
- **New capability:** the TUI is now machine-verifiable (snapshot tests), so
  visual claims are checkable, not asserted.
- **Honest residue:** Khet's private repo and his hardware/evidence stay on his
  side by necessity — bridged by the exchange repo and the golden checklist, not
  pretended away.
