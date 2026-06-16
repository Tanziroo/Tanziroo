// Executes the generated standalone.html bundle with mocked THREE + DOM to catch
// transform/wiring bugs (missing exports, broken module graph) without a browser.
// Run after build:  node tryon/build-standalone.js && node tryon/smoke-test.cjs
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'standalone.html');
let h = fs.readFileSync(file, 'utf8');
let src = h.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

src = src.replace(/^\s*import \* as THREE from 'three';\s*$/m, '');
src = src.replace(/^\s*import \{ OrbitControls \} from 'three\/addons\/[^']*';\s*$/m, '');

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
  if (typeof __require('wardrobe').Wardrobe !== 'function') throw new Error('Wardrobe missing');
  if (typeof __require('ui').buildUI !== 'function') throw new Error('buildUI missing');
  console.log('SMOKE OK — '+n+' garment builders + avatar executed cleanly');
})();
`;

try {
  const fn = new Function(
    'THREE', 'OrbitControls', 'document', 'window',
    'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'console',
    src + epilogue
  );
  fn(THREE, OrbitControls, document, window, requestAnimationFrame, cancelAnimationFrame, performance, console);
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
}
