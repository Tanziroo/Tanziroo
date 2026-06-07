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

// ---- Material factory -------------------------------------------------------

// Named finishes used across the catalog so colour swaps stay consistent.
export function makeMaterial(color, finish = 'matte') {
  switch (finish) {
    case 'leather': // glossy PU / patent leather
      return new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.15 });
    case 'latex':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.2 });
    case 'metal': // studs, chains, buckles
      return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 1.0 });
    case 'denim':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
    case 'velvet':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.0 });
    case 'mesh': {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0 });
      m.transparent = true;
      m.opacity = 0.55;
      m.side = THREE.DoubleSide;
      return m;
    }
    case 'matte':
    default:
      return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.0 });
  }
}

export const SKIN = new THREE.MeshStandardMaterial({ color: 0xe8c4a8, roughness: 0.6, metalness: 0.0 });
export const HAIR = new THREE.MeshStandardMaterial({ color: 0x121016, roughness: 0.55, metalness: 0.05 });
