/* THE CAPITAL — canonical runtime gate resolver (M4).
 *
 * One pure function answers: "given who is looking, where they are, and what is
 * equipped — what actually renders?" Every client runs this same logic, so every
 * honest client shows the same world. The demos (gate/attest/modbench/engine)
 * embed copies of pieces of this; this file is the reference implementation and
 * the one that grows tests.
 *
 * Rings (see PERMISSIONS.md):
 *   Ring 0 — Capital floor: certification + manifest; non-overridable, any realm.
 *   Ring 1 — realm context: sovereign powers active only in the owner's realm.
 *   Ring 2 — viewer scoping: age tier, visitor protection.
 *
 * Works in Node (module.exports) and browser (window.CapitalResolver).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CapitalResolver = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- defaults (a realm may tighten these, never loosen: Ring 0) ----
  var BUDGET = { tris: 9000, texKB: 2048 };
  var UNIVERSAL_ABILITIES = ['emberflare', 'glow', 'sparkle', 'heal', 'trail'];
  var REALM_BOUND_ABILITIES = ['godmode', 'invuln', 'fly', 'oneshot', 'noclip'];
  var RATING_RANK = { E: 0, T: 1, M: 2 };

  function djb2(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }
  // canonical bytes an asset is hashed over (what "content-addressed" means here)
  function canonical(mod) {
    return JSON.stringify({ id: mod.id, type: mod.type, slot: mod.slot, tris: mod.tris });
  }

  function tierForAge(age) { return age >= 17 ? 'M' : age >= 13 ? 'T' : 'E'; }

  /* ---- Ring 0: forensic certification (pure; same checks as modbench) ---- */
  function certify(mod, opts) {
    opts = opts || {};
    var budget = opts.budget || BUDGET;
    var checks = [];
    var push = function (name, ok, reason) { checks.push({ name: name, ok: !!ok, reason: reason }); };

    push('provenance', djb2(canonical(mod)) === mod.contentHash,
      djb2(canonical(mod)) === mod.contentHash ? 'hash matches bytes' : 'declared hash != recomputed (tampered)');

    var required = ['id', 'author', 'type', 'slot', 'contentHash', 'tris', 'texKB'];
    var missing = required.filter(function (k) { return mod[k] == null; });
    push('schema', missing.length === 0, missing.length ? 'missing: ' + missing.join(',') : 'contract fields valid');

    var perfOk = mod.tris <= budget.tris && (mod.texKB || 0) <= budget.texKB;
    push('perf', perfOk, perfOk ? 'within budget' : 'over budget (' + mod.tris + ' tris / ' + mod.texKB + 'KB)');

    var flags = mod.flags || {};
    push('policy', !flags.ip && !flags.nsfw && !flags.illegal,
      flags.ip ? 'IP-infringement flag' : flags.illegal ? 'illegal-content flag' : flags.nsfw ? 'NSFW flag' : 'clean');

    var abilities = mod.abilities || [];
    var known = UNIVERSAL_ABILITIES.concat(REALM_BOUND_ABILITIES);
    var unknown = abilities.filter(function (a) { return known.indexOf(a) < 0; });
    var bound = abilities.filter(function (a) { return REALM_BOUND_ABILITIES.indexOf(a) >= 0; });
    push('abilityScope', unknown.length === 0,
      unknown.length ? 'unknown/exploit ability: ' + unknown.join(',') : (bound.length ? bound.join(',') + ' -> realm-scoped' : 'universal'));

    return {
      certified: checks.every(function (c) { return c.ok; }),
      scope: bound.length ? 'owner-realm' : 'universal',
      checks: checks
    };
  }

  /* ---- manifest: the server-signed approved set (Ring 0 authority) ---- */
  function buildManifest(registry, revoked) {
    revoked = revoked || {};
    var ids = Object.keys(registry).filter(function (id) {
      var m = registry[id];
      return (m.certification || certify(m)).certified && !revoked[id];
    }).sort();
    return { ids: ids, sig: djb2(ids.join(',')) };
  }
  function inManifest(manifest, id) { return manifest.ids.indexOf(id) >= 0; }

  /* ---- the resolver ----
   * equip:  { slotName: modId, ... }             (IDs only — what crosses the wire)
   * viewer: { id, age, isOwner?, standing? }      (attested credential claims)
   * realm:  { type: 'shared'|'owner', ownerId?, ratingCeiling? }
   * registry: { modId: mod }                      (each mod may carry .certification)
   * manifest: from buildManifest (server-signed approved set)
   * opts: { trustClientClaims?: bool }            (true = the INSECURE model, for demos)
   *
   * returns { items: [ { slot, modId, decision, reason, powers } ], summary }
   *   decision: 'render' | 'fallback' | 'hide'
   *   powers:   'active' | 'suppressed' | 'none'
   */
  function resolve(equip, viewer, realm, registry, manifest, opts) {
    opts = opts || {};
    realm = realm || { type: 'shared' };
    var viewerTier = viewer.tier || tierForAge(viewer.age != null ? viewer.age : 18);
    var items = [];
    var bySlot = {};

    Object.keys(equip || {}).forEach(function (slot) {
      var id = equip[slot];
      if (!id) return;
      var mod = registry[id];

      // unknown asset — never render what you can't verify
      if (!mod) { items.push(out(slot, id, 'fallback', 'unknown asset id', 'none')); return; }

      var cert = mod.certification || certify(mod);

      // Ring 0: manifest is the only authority (unless demoing the insecure model)
      var approved = opts.trustClientClaims ? !!mod.clientClaimsApproved || inManifest(manifest, id)
                                            : inManifest(manifest, id);
      if (!approved) {
        var why = !cert.certified
          ? 'Ring 0: ' + cert.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.reason; }).join('; ')
          : 'not in signed manifest (unapproved or revoked)';
        items.push(out(slot, id, 'fallback', why, 'none'));
        return;
      }

      // Realm rating ceiling: content rated above the realm's ceiling is blocked
      // for EVERYONE there (a family realm never shows M content — it does not
      // get "clamped down", it falls back; ceilings tighten, never launder).
      var rating = mod.rating || 'E';
      var ceiling = realm.ratingCeiling || 'M';
      if (RATING_RANK[rating] > RATING_RANK[ceiling]) {
        items.push(out(slot, id, 'fallback', 'exceeds realm rating ceiling (' + rating + ' > ' + ceiling + ')', 'none'));
        return;
      }
      // Ring 2: age tier — mature content resolves to safe fallback for young viewers
      if (RATING_RANK[rating] > RATING_RANK[viewerTier]) {
        items.push(out(slot, id, 'fallback', 'age-gated: rated ' + rating + ', viewer tier ' + viewerTier, 'none'));
        return;
      }

      // Ring 1: realm-scoped powers — active only in the owner's own realm,
      // and NEVER active in a young visitor's view (Ring 0 beats Ring 1).
      var powers = 'none';
      if (cert.scope === 'owner-realm') {
        var sovereign = realm.type === 'owner' && (!realm.ownerId || realm.ownerId === (viewer.avatarOwnerId || realm.ownerId));
        var viewerProtected = viewerTier !== 'M' && (mod.powerRating || 'T') !== 'E';
        powers = sovereign && !viewerProtected ? 'active' : 'suppressed';
      }

      // slot conflict: earned standing decides (commons standing, never bought)
      var prior = bySlot[slot];
      if (prior) {
        var priorMod = registry[prior.modId];
        var keep = (mod.standing || 0) >= (priorMod.standing || 0) ? id : prior.modId;
        if (keep === id) {
          prior.decision = 'hide';
          prior.reason = 'slot conflict: displaced by higher earned standing';
        } else {
          items.push(out(slot, id, 'hide', 'slot conflict: lower earned standing than ' + prior.modId, 'none'));
          return;
        }
      }

      var entry = out(slot, id, 'render', 'approved', powers);
      bySlot[slot] = entry;
      items.push(entry);
    });

    var rendered = items.filter(function (i) { return i.decision === 'render'; }).length;
    return {
      items: items,
      summary: { rendered: rendered, gated: items.length - rendered, viewerTier: viewerTier, realm: realm.type, manifestSig: manifest.sig }
    };

    function out(slot, modId, decision, reason, powers) {
      return { slot: slot, modId: modId, decision: decision, reason: reason, powers: powers };
    }
  }

  return {
    certify: certify,
    buildManifest: buildManifest,
    resolve: resolve,
    tierForAge: tierForAge,
    hash: djb2,
    canonical: canonical,
    BUDGET: BUDGET,
    UNIVERSAL_ABILITIES: UNIVERSAL_ABILITIES,
    REALM_BOUND_ABILITIES: REALM_BOUND_ABILITIES
  };
});
