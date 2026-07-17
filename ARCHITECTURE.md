# THE CAPITAL — Platform Architecture (the larger view)

One sentence: **a governed interop layer for user-made worlds** — anyone builds
anything; attestation + forensic certification make it all compose safely; the
Capital is the hub, kingdoms are sovereign realms, black holes are the doors.

Governance spine (see `PERMISSIONS.md`): Ring 0 Capital floor → Ring 1 kingdom
root → Ring 2 users/visitors; `su` over owned accounts; commons standing earned
(time gate + edict), never bought.

Ten modules. Each lists: PURPOSE → CONTRACT (what it promises the others) →
PROVEN (the demo that exists) → **THE NOW** (the next real body of work).

---

## M1 · IDENTITY & ATTESTATION  — the trust root
**Purpose:** verified identity, age, family/ownership graph; signed credentials
everything else keys off.
**Contract:** `attest(account) → {identityId, ageTier, familyEdges[], standing}`
— signed, verifiable offline by any client.
**Proven:** `attest.html` (age-tiered rendering, family transfer).
**THE NOW:** credential format + verification lib. Define the signed-credential
JSON (JWT-style), key rotation, and a tiny `verifyCredential()` js lib every
client embeds. No provider integration yet — spec + lib + fixtures so every
other module can build against real credential shapes.

## M2 · ASSET CONTRACT & REGISTRY — what a "mod" is
**Purpose:** the one schema all content conforms to; the registry that stores it.
**Contract:** `{id, author, type, slot|zone, contentHash, tris, texKB, abilities[],
scope, rating, deps[]}` + `register(mod) → contentHash`.
**Proven:** `modbench.html` (working schema, 9 mods).
**THE NOW:** write the public **Creator Spec v0** (doc + JSON Schema + 3 example
GLB-backed mods) so a stranger can author a conforming mod without reading our
code. This is E1 — the doc that turns the schema into a standard.

## M3 · FORENSIC CERTIFICATION — the gate
**Purpose:** submit-time pipeline that certifies or blocks: provenance/hash,
schema, perf budget, content policy, ability scope, conflict scan.
**Contract:** `certify(mod) → {certified, checks[], scope, ring0Flags[]}`.
**Proven:** `modbench.html` (live checks, 6/3 split, Ring 0 display).
**THE NOW:** extract the validator out of the demo into a standalone
`certify.js` module + CLI (`node certify.js mod.json`) with a test suite of
20+ fixture mods (valid, over-budget, tampered, banned, realm-scoped). Same
code runs in browser and CI — certification becomes infrastructure, not a demo.

## M4 · RUNTIME GATE & COMPOSITOR — peers render only truth
**Purpose:** client-side resolver: equip state (IDs only) → validate vs signed
manifest → mount; slot conflicts resolved by earned standing; age/realm scoping.
**Contract:** `resolve(equipState, viewerCred, realmCtx) → renderList` — pure
function, same answer on every honest client.
**Proven:** `gate.html`, `attest.html`, `modbench.html` (all three scopes).
**THE NOW:** unify the three demo implementations into one `resolver.js` used by
every page — one pure function with unit tests. Kills drift between demos and
becomes the reference client implementation.

## M5 · AVATAR & WEARABLES — the body pipeline
**Purpose:** base bodies (male/female), garment fitting, look serialization.
**Proven:** `standalone.html`, `engine.html` (procedural); `demo.html` (GLB+IBL).
**THE NOW:** **A1 — the real body.** Land a MakeHuman/CC0 (or Ryan-authored) GLB
male + female in-repo, served via jsDelivr; refit 3+ garments to skeleton bones.
The larger in-game body of work starts here — every look/trailer asset hangs off
these two meshes. *(Blocked only on choosing/dropping the base mesh.)*

## M6 · WORLD & REALMS — hub, kingdoms, districts, travel
**Purpose:** the Capital + Spire, black-hole transport, kingdom instancing,
leasable IP districts.
**Proven:** `world.html` (hub + portals + 4 worlds), `capital.html` (district tour).
**THE NOW:** **realm manifest format** — a kingdom as data, not code:
`realm.json {owner, ruleset, allowedMods[], districts[], rating}` + loader that
builds a world from it. Turns "worlds" from hardcoded scenes into user-ownable
content — the file a vendor's district or a player's kingdom actually IS.

## M7 · SIM & FEEL — cloth, physics, companions
**Purpose:** garment drape, fabric feel, companion behaviors/abilities.
**Proven:** `cloth.html` (XPBD solver + 5 PBR fabrics), companion in `modbench`.
**THE NOW:** wire the cloth solver onto ONE worn garment in the engine slice
(A3 — hero skirt/cape that sways with turntable). One garment, real motion —
proves sim-on-avatar without boiling the ocean.

## M8 · ECONOMY & TRANSFER — ownership that moves
**Purpose:** item ownership ledger; transfer policies scoped to the social graph
(family free → guild rules → market); earned standing (time gate + edict).
**Proven:** `attest.html` (owner + family-free transfer + signed ledger).
**THE NOW:** the **policy engine**: `canTransfer(item, from, to, graph) →
{ok, fee, reason}` as a pure tested module covering family/guild/market +
standing checks. Data model first; storefronts later.

## M9 · PRESENTATION — trailers, showcase, the shock layer
**Purpose:** the high-end lure (trailers, capital showcase) and the pitch path.
**Proven:** `capital.html` (AAA vibe, look-swap, credibility card), trailer reel.
**THE NOW:** **the `/demos` index** — one page, the ordered pitch walk
(lure → world → moat → trust → spec), one line of context each, Ryan's card at
top. Turns ten files into one sendable link. *(Smallest task on this list,
highest leverage for gaining interest.)*

## M10 · BACKEND SERVICES — the part that makes it real multiplayer
**Purpose:** manifest signing service, registry storage, realm hosting/instancing,
presence/netcode, moderation queue, attestation providers (COPPA/GDPR-K).
**Proven:** nothing — deliberately. Everything so far is client + data model.
**THE NOW:** a one-page **service map** (which services, which contracts from
M1–M8 they implement, build vs buy) — so when funding/interest lands, the build
plan is on the shelf. No code yet; decisions.

---

## Dependency spine
```
M1 attestation ─┬→ M4 runtime gate ←─ M3 certification ←─ M2 contract
                └→ M8 economy
M5 avatar ──→ M7 sim      M6 realms ←─ M2 (mods are what realms contain)
M9 presentation ← everything (it shows the rest)
M10 backend ← implements M1/M2/M3/M6/M8 contracts at scale
```

## THE NOW — priority order across modules
1. **M9 `/demos` index** — smallest, unlocks pitching everything else. (hours)
2. **M4 `resolver.js` unification** — one reference gate implementation. (a day)
3. **M3 `certify.js` extraction + fixtures** — the moat becomes infrastructure. (days)
4. **M2 Creator Spec v0** — the standard strangers can build against. (days)
5. **M5 real body (A1)** — the in-game look leap; needs the base-mesh decision. (days, blocked on mesh)
6. **M6 realm manifest** — kingdoms as ownable data. (days)
7. **M7 cloth-on-garment (A3)** — one hero garment moves. (a day)
8. **M8 transfer policy engine** — economy data model. (a day)
9. **M1 credential spec + lib** — trust-root formats. (days)
10. **M10 service map** — decisions on paper for when interest lands. (hours)
```
1–4 are pure momentum (no external blockers). 5 needs the mesh call.
```
