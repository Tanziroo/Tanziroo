// Executes the real modular source (tryon/src/*.js) with mocked THREE + DOM to
// catch wiring bugs (missing exports, broken module graph, builders that throw)
// without a browser. It bundles via build-standalone.js's buildBundle(), so the
// test tracks exactly what ships — no dependency on any generated HTML file.
// Run:  node tryon/smoke-test.cjs
const { buildBundle } = require('./build-standalone.js');

let src = buildBundle();
// Strip the two external module imports; THREE/OrbitControls are injected below.
src = src.replace(/^\s*import \* as THREE from 'three';\s*$/m, '');
src = src.replace(/^\s*import \{ OrbitControls \} from 'three\/addons\/[^']*';\s*$/m, '');

// A recursive proxy that absorbs any THREE/DOM call, property, or construction.
function rp() {
  const f = function () { return rp(); };
  return new Proxy(f, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === Symbol.iterator) return function* () {};
      if (p === 'then') return undefined;
      if (p === 'toString' || p === 'valueOf') return () => 0;
      return rp();
    },
    set() { return true; },
    apply() { return rp(); },
    construct() { return rp(); },
  });
}
const THREE = rp();
const OrbitControls = function () { return rp(); };
const document = rp();
const window = rp();
const requestAnimationFrame = () => 0;
const cancelAnimationFrame = () => 0;
const performance = { now: () => 0 };

// After the entry (main) runs, exercise every builder + the wardrobe lifecycle.
const epilogue = `
;(function(){
  const cat = __require('catalog');
  if (!Array.isArray(cat.ITEMS)) throw new Error('ITEMS not exported');
  let n = 0;
  cat.ITEMS.forEach((it) => {
    if (typeof it.build !== 'function') throw new Error('item "'+it.id+'" has no build()');
    if (!it.build(0x888888, it.finish)) throw new Error('item "'+it.id+'" build() returned nothing');
    n++;
  });
  if (typeof __require('avatar').buildAvatar !== 'function') throw new Error('buildAvatar missing');
  __require('avatar').buildAvatar();
  const W = __require('wardrobe').Wardrobe;
  if (typeof W !== 'function') throw new Error('Wardrobe missing');
  // lifecycle: equip every item then clear, exercising _mount/_unmount/dispose
  const wr = new W(rp());
  cat.ITEMS.forEach((it) => wr.equip(it.id));
  wr.clearAll();
  if (typeof __require('ui').buildUI !== 'function') throw new Error('buildUI missing');
  console.log('SMOKE OK — '+n+' garment builders + avatar + wardrobe lifecycle executed cleanly');
})();
`;

try {
  // `rp()` inside the epilogue needs the proxy factory in scope, so run it all
  // in one Function with rp passed in.
  const fn = new Function(
    'rp', 'THREE', 'OrbitControls', 'document', 'window',
    'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'console',
    src + epilogue
  );
  fn(rp, THREE, OrbitControls, document, window, requestAnimationFrame, cancelAnimationFrame, performance, console);
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
}
// main.js's createSync opens a BroadcastChannel that keeps Node's event loop
// alive; the test work is done, so exit cleanly rather than hang.
process.exit(0);
