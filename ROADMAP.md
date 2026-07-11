# Crypt Engine — Near-Term Checklist ("the marks")

Goal of this phase: reach a state where the project can **gain interest** — a
demo-grade engine slice that looks like the vision, and a 45s trailer that says
what it is, shows it's real, and names who's behind it.

Each mark has a **DONE =** line so "done" isn't a feeling. `[owner]` /
`(blocked: …)` noted where it matters.

---

## Where we are (proofs banked)
- [x] Try-on app (self-view), viewable — `standalone.html`
- [x] Perf/LOD bench with stress-to-wall — `bench.html`
- [x] Real glTF model + HDRI IBL loads with no hosting — `demo.html`
- [x] Real-time cloth sim + swappable PBR fabrics — `cloth.html`
- [x] Approval gate (self vs peer, revocation, hacked-client) — `gate.html`
- [x] Vertical slice: body + wardrobe + gate + fabric feel — `engine.html`
- [x] AAA showcase hub: cinematic looks + auto-cycle + credibility card — `capital.html`
- [x] Rough 45s trailer (AI mood reel) — needs proof shot + credibility card

---

## TRACK A — Engine slice → demo-grade (this is the trailer's proof shot)
- [ ] **A1. Real body.** Swap the procedural muse for a MakeHuman (CC0) female +
  male GLB; place garments from the body's skeleton bones, not hardcoded
  proportions. **ONLY remaining piece of the immediate 3.**
  **DONE =** a real-looking figure wears ≥3 garments that actually fit.
  *(needs the base mesh — you drop a MakeHuman/your GLB, or I source a placeholder)*
- [x] **A2. Cinematic lighting.** — delivered in `capital.html`: procedural cosmic
  IBL, ACES, magenta/cyan rims, reflective floor, portal backdrop, particles,
  vignette + grain. Reads AAA, not toy.
- [ ] **A3. One hero garment with live cloth.** Wire `cloth.html`'s solver onto a
  worn skirt/cape so it drapes and sways as the avatar turns.
  **DONE =** one garment visibly moves under gravity/motion. *[unblocked]*
- [x] **A4. The look-swap moment.** — delivered in `capital.html`: one muse
  transforms through 5 cinematic looks (celestial→circuit→molten→rune→tree),
  auto-cycles every ~4.5s = screen-recordable proof shot. Ties to trailer B2.

## TRACK B — Trailer → converts (not just "nice art")
- [ ] **B1.** Cut A4's real-time swap shot into the trailer (the proof it's real).
- [ ] **B2.** Re-cut so it's **one avatar transforming**, not 8 different women —
  the edit secretly demos "wear anything."
- [ ] **B3. Credibility card:** *"From Ryan Cashman — [titles]"* on the end sigil.
- [ ] **B4. Words:** promise line up front + name + CTA (wishlist / site / join).
- [ ] **B5. Sound:** beat-driven cut, bass hit lands on the logo.
  **DONE (B) =** a 45s cut that states what it is, shows it's real, names who's behind it.

## TRACK C — Shareable (turn a demo into a link you can send)
- [ ] **C1. Hosting live.** Engine slice on a real URL, not htmlpreview.
  **DONE =** `tanziroo.github.io/…` (or a domain) loads the slice.
  *(blocked: Pages toggle — Tanzia; or drop a static-host/Vercel token and I wire it)*
- [ ] **C2. Landing page.** Sigil + one-liner + CTA + trailer embed + "from [name]".
  **DONE =** one link that carries the whole pitch. *[unblocked once C1]*
- [ ] **C3. Repo reads as one project.** A `/demos` index so the six HTMLs aren't
  loose files. **DONE =** a single clean entry point. *[unblocked]*

## TRACK D — Product depth (start now, matures after interest)
- [ ] **D1.** Asset registry → real schema: `{contentHash, cdnUrl, perfBudget, moderationState}`.
- [ ] **D2.** Validate the garment pipeline: one real Marvelous/Blender garment GLB
  through the gate, fitted on the real body.
- [ ] **D3.** Lock the base bodies (MakeHuman male + female) + the skeleton-driven
  fitting method as the standard.

---

## THE IMMEDIATE 3 (do these next, in order)
1. **A1 — real body in the slice** (the perceptual unlock; everything hangs off it)
2. **A2 — cinematic lighting** on it (makes it read as real)
3. **A4 — the 5s outfit-swap shot** (the single missing piece of the trailer)

Hitting these three = you have both a demo worth showing *and* the proof shot the
trailer needs. Everything else can follow.

> Dependencies worth knowing: A2/A3/A4 all sit on A1. B1 needs A4. C2 needs C1
> (the only externally-blocked item). So the critical path is **A1 → A2 → A4 → B**,
> all of which I can build now without waiting on hosting.

---

## THE THESIS (locked — this is what we optimize for)
Not a game, not a Minecraft clone, not a graphics play. **A governed interop
layer for user-made content** — anyone builds anything (wearables, companions,
districts, abilities = "mods"), and the platform makes them **compose seamlessly**
and safely. The moat is the interop standard + forensic governance + the network
of creators. **Priority order: it works > it's interoperable > people feel like
co-authors >>> visual polish.** Quality is nice-to-have, not the point.

## TRACK E — Interop + Forensics + Co-builder loop  ← THE ACTUAL PRODUCT
- [~] **E1. The asset contract.** — embodied in `modbench.html`:
  `{id, author, type, slot, contentHash, tris, texKB, abilities, flags, trust}`.
  Working schema mods conform to; still to do: write it up as public docs.
- [x] **E2. Forensic validation pass.** — delivered in `modbench.html`: real
  checks (provenance/hash, schema, perf budget, content policy, ability sanity)
  run live per mod with pass/fail + reasons; 5 certify, 4 blocked (over-budget,
  IP-flag, banned ability, tampered hash).
- [x] **E3. Seamless interop demo.** — delivered in `modbench.html`: certified
  mods from different authors compose on one avatar; a real HEAD slot conflict
  (@lux Halo vs @vega Circlet) is caught and resolved by trust priority, both
  authors notified — no crash, seamless.
- [~] **E4. Contributor loop.** — partial in `modbench.html`: submit→certify→
  signed shared manifest with per-author attribution + "◉ live" is visible.
  Still to do: real submission UI + "you built this" moment end-to-end.
- [ ] **E5. Forensic testing ground.** The Capital as the sandbox where the whole
  toolchain (anti-cheat, integrity, moderation, conflict) runs against real chaos.

> Reprioritization (per direction): TRACK A (AAA polish) drops to "pitch skin —
> good enough, done in capital.html." TRACK E is now the core build. The demo that
> matters next isn't prettier — it's **two mods interoperating under forensic
> certification** (E2 + E3), because that's the thing no clone can copy.
