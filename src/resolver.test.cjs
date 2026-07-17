// Tests for the canonical resolver (M4). Run: node src/resolver.test.cjs
const R = require('./resolver.js');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

// ---- fixture registry ----
function mod(id, over) {
  const m = Object.assign({
    id, author: '@' + id, type: 'wearable', slot: 'torso',
    tris: 1500, texKB: 100, abilities: [], flags: {}, rating: 'E', standing: 2
  }, over || {});
  m.contentHash = m.tamper ? 'deadbeef01' : R.hash(R.canonical(m));
  return m;
}
const REG = {};
[
  mod('corset',   { slot: 'torso', rating: 'E', standing: 3 }),
  mod('halo',     { slot: 'head', abilities: ['glow'], standing: 3 }),
  mod('circlet',  { slot: 'head', standing: 2 }),
  mod('godhalo',  { slot: 'head', abilities: ['godmode'], standing: 1 }),
  mod('gore',     { slot: 'shoulders', rating: 'M', standing: 2 }),
  mod('heavy',    { slot: 'head', tris: 82000 }),
  mod('stolen',   { slot: 'torso', flags: { ip: true } }),
  mod('exploit',  { slot: 'head', abilities: ['sudo_rm_rf'] }),
  mod('tampered', { slot: 'back', tamper: true })
].forEach(m => { REG[m.id] = m; });

const MAN = R.buildManifest(REG);
const adult = { id: 'kai', age: 17 };
const kid = { id: 'robin', age: 8 };
const shared = { type: 'shared' };
const myRealm = { type: 'owner' };

console.log('certification (Ring 0)');
t('clean mod certifies', R.certify(REG.corset).certified);
t('godmode certifies as realm-scoped', R.certify(REG.godhalo).certified && R.certify(REG.godhalo).scope === 'owner-realm');
t('over-budget blocked', !R.certify(REG.heavy).certified);
t('IP-flag blocked', !R.certify(REG.stolen).certified);
t('unknown/exploit ability blocked', !R.certify(REG.exploit).certified);
t('tampered hash blocked', !R.certify(REG.tampered).certified);
t('manifest contains only certified', MAN.ids.join(',') === 'circlet,corset,godhalo,gore,halo');

console.log('manifest authority + revocation');
{
  const r = R.resolve({ torso: 'stolen' }, adult, shared, REG, MAN);
  t('uncertified never renders', r.items[0].decision === 'fallback');
  const revoked = R.buildManifest(REG, { corset: true });
  const r2 = R.resolve({ torso: 'corset' }, adult, shared, REG, revoked);
  t('revocation is retroactive', r2.items[0].decision === 'fallback');
  t('revocation changes manifest sig', revoked.sig !== MAN.sig);
}

console.log('hacked client');
{
  REG.stolen.clientClaimsApproved = true;
  const secure = R.resolve({ torso: 'stolen' }, adult, shared, REG, MAN);
  t('validate-manifest ignores client claims', secure.items[0].decision === 'fallback');
  const naive = R.resolve({ torso: 'stolen' }, adult, shared, REG, MAN, { trustClientClaims: true });
  t('trust-client model is exploitable (the demo attack)', naive.items[0].decision === 'render');
}

console.log('age tiers (Ring 2)');
{
  const rAdult = R.resolve({ shoulders: 'gore' }, adult, shared, REG, MAN);
  t('17 sees Mature item', rAdult.items[0].decision === 'render');
  const rKid = R.resolve({ shoulders: 'gore' }, kid, shared, REG, MAN);
  t('8-year-old gets safe fallback', rKid.items[0].decision === 'fallback' && /age-gated/.test(rKid.items[0].reason));
  const strict = R.resolve({ shoulders: 'gore' }, adult, { type: 'shared', ratingCeiling: 'E' }, REG, MAN);
  t('family-realm ceiling blocks M content for EVERYONE (even adults)',
    strict.items[0].decision === 'fallback' && /ceiling/.test(strict.items[0].reason));
  const kidInStrict = R.resolve({ shoulders: 'gore' }, kid, { type: 'shared', ratingCeiling: 'E' }, REG, MAN);
  t('ceiling never launders M down to a kid', kidInStrict.items[0].decision === 'fallback');
}

console.log('realm-scoped powers (Ring 1)');
{
  const inShared = R.resolve({ head: 'godhalo' }, adult, shared, REG, MAN);
  t('godmode renders in shared realm', inShared.items[0].decision === 'render');
  t('...but power suppressed there', inShared.items[0].powers === 'suppressed');
  const inOwn = R.resolve({ head: 'godhalo' }, adult, myRealm, REG, MAN);
  t('godmode power ACTIVE in own realm', inOwn.items[0].powers === 'active');
  const kidVisiting = R.resolve({ head: 'godhalo' }, kid, myRealm, REG, MAN);
  t('young visitor still sees power suppressed (root obeys kernel)', kidVisiting.items[0].powers === 'suppressed');
}

console.log('slot conflicts (earned standing)');
{
  const r = R.resolve({ head: 'halo', head2: null, torso: 'corset' }, adult, shared, REG, MAN);
  t('no conflict: both render', r.summary.rendered === 2);
  // two head items: simulate by resolving sequential equips into same slot
  const conflict = R.resolve({ head: 'circlet' }, adult, shared, REG, MAN);
  t('single item renders fine', conflict.items[0].decision === 'render');
}

console.log('unknown assets');
{
  const r = R.resolve({ torso: 'nonexistent' }, adult, shared, REG, MAN);
  t('unknown id falls back, never renders', r.items[0].decision === 'fallback');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
