import * as THREE from 'three';

// ---- Procedural textures (no external files needed) -------------------------

// A fishnet / mesh pattern drawn to a canvas, tiled. Transparent gaps.
export function makeFishnetTexture(color = '#0a0a0a', scale = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  // diagonal lattice
  for (let i = -64; i < 128; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 64, 0);
    ctx.lineTo(i, 64);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(scale, scale * 1.4);
  return tex;
}

// A tartan / plaid pattern for grunge skirts.
export function makePlaidTexture(base = '#6e1023', dark = '#2a0710', line = '#d8c08a') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = dark;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillRect(0, 0, 64, 32);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  [10, 22, 42, 54].forEach((p) => {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(64, p); ctx.stroke();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Procedural micro-surface (bump) maps for real PBR depth ---------------
// Grayscale height detail consumed as a bumpMap — leather grain, fabric weave,
// brushed metal. Cached per (kind, repeat) so garments share one texture.
const _grainCache = {};
export function makeGrain(kind = 'fabric', repeat = 6) {
  const key = kind + ':' + repeat;
  if (_grainCache[key]) return _grainCache[key];
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, S, S);
  const img = x.getImageData(0, 0, S, S);
  const d = img.data;
  const put = (i, v) => { v = v < 0 ? 0 : v > 255 ? 255 : v; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; };
  for (let y = 0; y < S; y++) {
    for (let xx = 0; xx < S; xx++) {
      const i = (y * S + xx) * 4;
      let v = 128;
      if (kind === 'leather') {
        v = 128 + (Math.random() * 46 - 23) + Math.sin(xx * 0.20) * Math.cos(y * 0.17) * 14;
      } else if (kind === 'metal') {
        v = 128 + (Math.random() * 10 - 5) + Math.sin(y * 1.9) * 22; // horizontal brushed streaks
      } else { // fabric weave
        const weave = ((xx + y) % 8 < 4 ? 1 : -1) * 16 + Math.sin(xx * 0.8) * 8 + Math.sin(y * 0.8) * 8;
        v = 128 + weave + (Math.random() * 8 - 4);
      }
      put(i, v);
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.NoColorSpace;
  _grainCache[key] = t;
  return t;
}

// ---- Material factory -------------------------------------------------------

// Named finishes used across the catalog so colour swaps stay consistent.
export function makeMaterial(color, finish = 'matte') {
  let m;
  switch (finish) {
    case 'leather': // glossy PU / patent leather
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.15 });
      m.bumpMap = makeGrain('leather', 5); m.bumpScale = 0.004; break;
    case 'latex':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.2 });
      m.bumpMap = makeGrain('leather', 6); m.bumpScale = 0.0015; break;
    case 'metal': // studs, chains, buckles
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 1.0 });
      m.bumpMap = makeGrain('metal', 3); m.bumpScale = 0.003; break;
    case 'denim':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
      m.bumpMap = makeGrain('fabric', 8); m.bumpScale = 0.006; break;
    case 'velvet':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 });
      m.bumpMap = makeGrain('fabric', 6); m.bumpScale = 0.003; break;
    case 'mesh': {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0 });
      m.transparent = true;
      m.opacity = 0.55;
      m.side = THREE.DoubleSide;
      break;
    }
    case 'matte':
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.0 });
      m.bumpMap = makeGrain('fabric', 7); m.bumpScale = 0.004; break;
  }
  return m;
}

export const SKIN = new THREE.MeshStandardMaterial({ color: 0xe8c4a8, roughness: 0.6, metalness: 0.0 });
export const HAIR = new THREE.MeshStandardMaterial({ color: 0x121016, roughness: 0.55, metalness: 0.05 });
