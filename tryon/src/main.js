import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildAvatar } from './avatar.js';
import { Wardrobe } from './wardrobe.js';
import { buildUI } from './ui.js';
import { ITEMS, SLOTS } from './catalog.js';
import { createSync } from './sync.js';

// ---- Renderer / scene / camera ---------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a10);
scene.fog = new THREE.Fog(0x0b0a10, 4.5, 10);

// Environment map so glossy goth materials have something to reflect.
function buildEnv() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#4a4566'); g.addColorStop(0.55, '#1a1726'); g.addColorStop(1, '#070710');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  x.globalAlpha = 0.55;
  x.fillStyle = '#ff2e88'; x.beginPath(); x.arc(120, 140, 70, 0, 7); x.fill();
  x.fillStyle = '#21d4fd'; x.beginPath(); x.arc(400, 110, 70, 0, 7); x.fill();
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(buildEnv()).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 1.2, 3.0);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.minDistance = 1.3;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.92;

// ---- Lighting: dark studio with magenta / cyan rim lights ------------------
scene.add(new THREE.HemisphereLight(0xbfb9e0, 0x16121f, 0.9));

const key = new THREE.SpotLight(0xffffff, 90, 20, Math.PI / 5, 0.4, 1.5);
key.position.set(2.5, 4.5, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
scene.add(key, key.target);

const rimMagenta = new THREE.PointLight(0xff2e88, 55, 14, 2);
rimMagenta.position.set(-2.6, 1.7, -1.4);
scene.add(rimMagenta);

const rimCyan = new THREE.PointLight(0x21d4fd, 48, 14, 2);
rimCyan.position.set(2.5, 1.5, -1.9);
scene.add(rimCyan);

const fill = new THREE.DirectionalLight(0xb9beff, 0.7);
fill.position.set(-1.5, 2, 2.5);
scene.add(fill);

// ---- Floor (reflective-looking disc + grid) --------------------------------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(2.2, 64),
  new THREE.MeshStandardMaterial({ color: 0x111018, roughness: 0.35, metalness: 0.6 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.PolarGridHelper(2.2, 16, 6, 64, 0x3a3550, 0x201d30);
grid.position.y = 0.001;
scene.add(grid);

// ---- Avatar + wardrobe ------------------------------------------------------
const avatar = buildAvatar();
scene.add(avatar);

const wardrobe = new Wardrobe(avatar);

// ---- UI hooks ---------------------------------------------------------------
let turntable = true;

function shuffle() {
  wardrobe.clearAll();
  SLOTS.forEach((slot) => {
    const pool = ITEMS.filter((i) => i.slot === slot.id);
    if (slot.multi) {
      pool.forEach((i) => { if (Math.random() < 0.4) pick(i); });
    } else if (Math.random() < 0.85) {
      pick(pool[Math.floor(Math.random() * pool.length)]);
    }
  });
  function pick(item) {
    // random colour from the catalog palette occasionally
    wardrobe.equip(item.id);
  }
}

let sync = null;
const ui = buildUI(wardrobe, {
  onShuffle: shuffle,
  onTurntable: () => { turntable = !turntable; return turntable; },
  onShare: () => sync?.share(wardrobe.serialize()),
  onChange: () => sync?.push(wardrobe.serialize()),
});

// Start on a vivid, textured look so colour + texture read immediately.
Object.assign(wardrobe.colors, { corset: 0xc01f7b, platform: 0x5b2a86, choker: 0xff9ec7, ears: 0x2a1430 });
['corset', 'plaid', 'stripe', 'platform', 'choker', 'ears'].forEach((id) => wardrobe.equip(id));
ui.refresh();

// Live + shareable sync: a shared #look=... link (or another device) overrides
// the default look; local changes broadcast outward.
sync = createSync({ onRemote: (state) => ui.applyRemote(state) });

// Installable PWA (only on a real http(s) origin; harmless no-op elsewhere).
if (typeof navigator !== 'undefined' && navigator.serviceWorker &&
    typeof location !== 'undefined' && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ---- Resize + render loop ---------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === 0 || h === 0) return; // pre-layout frame: skip to avoid NaN aspect
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  if (turntable) avatar.rotation.y += dt * 0.35;
  resize();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
