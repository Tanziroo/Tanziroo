# Permission Model — the Capital, kingdoms, and root

The governance model as a Linux permission system. This is the canonical spec every
other system (cert gate, realm scope, attestation, transfer) is an expression of.

## Mental model
- **Capital safety guidelines = the kernel + mandatory access control (MAC).**
  Supreme. Applies to everyone, *including kingdom-root*. Non-overridable.
- **A personal kingdom owner = root on their own realm.** Sovereign locally,
  bounded by the Capital floor.
- **`su` = an owner may act-as the users they *own*** (attested ownership only) —
  a parent into a child account, an owner into a sub-account. Like `su`, it
  requires the *right* to that account; you cannot `su` into someone you don't own.
- **Visitors = unprivileged guests.** They act under the kingdom's local rules
  **and** remain protected by the Capital floor at all times.

## The three rings
### Ring 0 — CAPITAL FLOOR (kernel / MAC) — supreme, non-overridable
Enforced in **every** realm, for **every** actor, including kingdom-root:
- content integrity & provenance (content-hash, no tampering)
- no illegal content (CSAM, stolen/real IP) — legal floor
- no security exploits / no client-harming payloads
- performance floor (can't tank a visitor's client)
- **protection of visitors and minors** — a root cannot harm or over-expose a guest
These are the "hard cert gates." Toggling into your own realm does **not** lift them.

### Ring 1 — KINGDOM ROOT (local superuser) — sovereign, bounded by Ring 0
Within their realm, the owner controls:
- the local ruleset (what's allowed, tone, rating ceiling for the space)
- **realm-scoped powers** (godmode / fly / etc. — active here, suppressed in shared realms)
- content curation (which certified mods render, their own IP/brand)
- visitor permissions (who may enter, what guests may do)
Everything here is real authority — but it stops at the Capital floor.

### Ring 2 — USERS & VISITORS (unprivileged)
- operate under the host kingdom's local rules
- **always** retain Ring 0 protections (a hostile root can't strip them)
- see an age-/rating-scoped view of the world (per attested credentials)

## `su` — ownership delegation
- An owner may assume/act-as accounts they **own**, proven by an attested ownership
  edge (family, guardianship, sub-account). Parent `su` child; guild-lead within
  delegated scope.
- Free transfer follows the ownership graph: family (free) → guild (rules) → public
  (market). Same as file ownership + group permissions.
- You can never `su` into an account you don't own — ownership is attested, not claimed.

## The invariant that wins both audiences
> **Even root obeys the kernel.**

A kingdom-root can grant godmode, run edgy content, and set local rules — but cannot
breach the Capital floor: cannot harm a visitor, expose a visiting minor to gated
content, host stolen IP, or ship an exploit. That one rule is why hardcore kingdoms
and a visiting kid coexist safely: the sovereign feels free, the platform stays safe.

## Earned privilege — the commons is not for sale
Two things people conflate; only one is purchasable.
- **Sovereignty in your OWN realm = purchasable.** Pay for your kingdom, be root
  in it (godmode, local rules). It is *isolated* — bounded by Ring 0, affecting
  only your space and consenting visitors. Buying this is fine.
- **Standing in the COMMONS = earned, never bought.** Any elevated permission that
  affects *other people's* experience — trust/priority, write access to shared
  space, moderation authority, "elite" rank — is earned through a **time gate**
  (tenure + verified contribution history, attested) and granted by **edict**
  (a deliberate, revocable grant from an owner or the Capital). You cannot buy
  status that governs others.

**Why this is the only way to stay high-class:** the moment commons-standing can
be purchased, the place collapses into pay-to-power and rank stops meaning
anything. Earned-only standing creates real prestige, filters for proven long-term
contributors over transient buyers, aligns incentives toward contribution, and
keeps the shared world's tone in the hands of the earned, not the rich.

Mechanics:
- **Time gate** — privileges unlock with tenure + a verified contribution record.
- **Edict** — an owner/authority (or the Capital) may grant or revoke standing
  deliberately (sponsorship, promotion, appointment). Always revocable.
- **Trust = earned standing.** The `trust` value that decides conflict priority
  (`modbench.html`) is *earned reputation/history*, never a settable or
  purchasable field. Sovereignty is bought; standing is earned.

## Mapping to the engine (what's already demonstrated)
| Model layer | Built in |
|---|---|
| Ring 0 — Capital floor (hard cert gates) | `modbench.html` — provenance/perf/IP/policy block in **all** realms |
| Ring 1 — kingdom root + realm-scoped powers | `modbench.html` — 🌐 shared vs 🏰 paid-realm toggle |
| Ring 2 — visitor / age-scoped view | `gate.html` (peer view), `attest.html` (age-scoped render) |
| `su` / ownership + transfer | `attest.html` — attested owner + free family transfer |
| IP districts (kingdoms as leasable land) | `capital.html`, `world.html` |

## Open (backend / later)
- Real identity/age attestation (COPPA/GDPR-K), signed credentials, ownership ledger.
- The policy engine that evaluates Ring 0 ∧ Ring 1 ∧ Ring 2 per action at runtime.
- Guild/market transfer rules beyond family-free.
