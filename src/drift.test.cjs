/* Drift test: modbench.html's live certification MUST agree with the canonical
 * resolver (src/resolver.js). The demo can't import the module in-browser
 * (htmlpreview + relative paths), so instead the module is the ORACLE: we run
 * the real page headlessly and assert its verdicts match canon. If either side's
 * rules change without the other, this fails. That's what keeps a copy honest.
 *
 * Run: node src/drift.test.cjs
 */
const fs = require('fs');
const path = require('path');
const R = require('./resolver.js');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

/* ---- the same 9 mods modbench ships (kept in sync by this very test) ---- */
function mk(o) { const m = Object.assign({ type: 'wearable', abilities: [], flags: {}, texKB: 100 }, o); m.contentHash = m.tamper ? 'deadbeef01' : R.hash(R.canonical(m)); return m; }
const FIXTURES = [
  mk({ id: 'corset',    author: '@nyx',   name: 'Void Corset',    slot: 'torso', tris: 2100, texKB: 180 }),
  mk({ id: 'choker',    author: '@rune',  name: 'Rune Choker',    slot: 'neck',  tris: 900,  texKB: 60 }),
  mk({ id: 'sprite',    author: '@kobo',  name: 'Ember Sprite',   slot: 'companion', type: 'companion', tris: 1400, texKB: 120, abilities: ['emberflare'] }),
  mk({ id: 'halo',      author: '@lux',   name: 'Halo of Dawn',   slot: 'head',  tris: 800,  texKB: 50, abilities: ['glow'] }),
  mk({ id: 'circlet',   author: '@vega',  name: 'Star Circlet',   slot: 'head',  tris: 700,  texKB: 48 }),
  mk({ id: 'megacrown', author: '@glit',  name: 'MegaCrown',      slot: 'head',  tris: 82000, texKB: 90 }),
  mk({ id: 'rippr',     author: '@xx0',   name: 'Ripp’r Tee',      slot: 'torso', tris: 1500, texKB: 8000, flags: { ip: true } }),
  mk({ id: 'godhalo',   author: '@troll', name: 'Godmode Halo',   slot: 'head',  tris: 600,  texKB: 40, abilities: ['godmode'] }),
  mk({ id: 'copyfae',   author: '@mim',   name: 'Copyfae Wings',  slot: 'back',  tris: 1200, texKB: 70, tamper: true })
];

/* ---- run the real page headlessly ---- */
function rp() { const f = function () { return rp(); }; return new Proxy(f, { get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === Symbol.iterator) return function* () {}; if (p === 'then') return undefined; if (p === 'toString' || p === 'valueOf') return () => 0; return rp(); }, set() { return true; }, apply() { return rp(); }, construct() { return rp(); } }); }

function makeEl() {
  const el = { _ch: [], _html: '', onclick: null, textContent: '', className: '',
    classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {},
    appendChild(c) { this._ch.push(c); return c; }, querySelector() { return null; },
    querySelectorAll() { return []; }, addEventListener() {}, remove() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    setAttribute() {}, getContext() { return rp(); }, width: 300, height: 150 };
  // real DOM semantics: assigning innerHTML='' wipes children (the page re-renders
  // the queue on every certification step, so without this they accumulate)
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = v; if (v === '') this._ch = []; },
    enumerable: true, configurable: true
  });
  return el;
}

function runPage(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const src = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)
    .map(s => s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')).join('\n');
  const els = {};
  const document = { head: makeEl(), body: makeEl(),
    getElementById(id) { return els[id] || (els[id] = makeEl()); },
    createElement() { return makeEl(); } };
  const window = { devicePixelRatio: 1, addEventListener() {} };
  const fn = new Function('THREE', 'document', 'window', 'navigator', 'performance',
    'requestAnimationFrame', 'showFatal', src + '\n;return typeof start==="function"?start:null;');
  const start = fn(rp(), document, window, {}, { now: () => 0 }, () => 0, () => {});
  start();
  return { els, document };
}

console.log('modbench certification vs canonical resolver');
const { els } = runPage('modbench.html');
els.runBtn.onclick.call(els.runBtn);

setTimeout(() => {
  // parse the rendered queue: each card carries the mod name + a status badge
  const rendered = els.queue._ch.map(c => c.innerHTML);
  t('page rendered all 9 mods', rendered.length === FIXTURES.length, `(got ${rendered.length})`);

  let mismatches = [];
  for (const mod of FIXTURES) {
    const card = rendered.find(h => h.includes('>' + mod.name + '<'));
    if (!card) { mismatches.push(`${mod.name}: not rendered`); continue; }
    const pageSaysCertified = /class="st cert"/.test(card);
    const canon = R.certify(mod);
    if (pageSaysCertified !== canon.certified) {
      mismatches.push(`${mod.name}: page=${pageSaysCertified ? 'certified' : 'blocked'} canon=${canon.certified ? 'certified' : 'blocked'}`);
    }
  }
  t('every verdict matches canon', mismatches.length === 0, mismatches.join(' | '));

  const canonCertified = FIXTURES.filter(m => R.certify(m).certified).length;
  const pageCertified = rendered.filter(h => /class="st cert"/.test(h)).length;
  t(`certified count agrees (${canonCertified})`, canonCertified === pageCertified, `page=${pageCertified}`);

  const scoped = FIXTURES.filter(m => R.certify(m).scope === 'owner-realm').map(m => m.name);
  t('godmode is the realm-scoped one', scoped.length === 1 && scoped[0] === 'Godmode Halo', scoped.join(','));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 2600);
