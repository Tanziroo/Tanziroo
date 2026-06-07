import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildAvatar } from './avatar.js';
import { Wardrobe } from './wardrobe.js';
import { buildUI } from './ui.js';
import { ITEMS, SLOTS } from './catalog.js';

// ---- Renderer / scene / camera ---------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a10);
scene.fog = new THREE.Fog(0x0b0a10, 4, 9);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 1.2, 3.0);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.minDistance = 1.3;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.92;

// ---- Lighting: dark studio with magenta / cyan rim lights ------------------
scene.add(new THREE.HemisphereLight(0x4a4660, 0x080810, 0.5));

const key = new THREE.SpotLight(0xffffff, 60, 20, Math.PI / 6, 0.4, 1.5);
key.position.set(2.5, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0004;
scene.add(key, key.target);

const rimMagenta = new THREE.PointLight(0xff2e88, 30, 12, 2);
rimMagenta.position.set(-2.5, 1.6, -1.5);
scene.add(rimMagenta);

const rimCyan = new THREE.PointLight(0x21d4fd, 26, 12, 2);
rimCyan.position.set(2.4, 1.4, -1.8);
scene.add(rimCyan);

const fill = new THREE.DirectionalLight(0x8a8fb0, 0.4);
fill.position.set(-1, 2, 2);
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

buildUI(wardrobe, {
  onShuffle: shuffle,
  onTurntable: () => { turntable = !turntable; return turntable; },
});

// Start on a styled look so the avatar is never naked on load.
import('./catalog.js').then(({ PRESETS }) => {
  wardrobe.applyPreset(PRESETS[0]);
  // reflect initial state in the UI
  document.querySelectorAll('.card').forEach((c) => {
    c.classList.toggle('equipped', wardrobe.isEquipped(c.dataset.id));
  });
  document.getElementById('count').textContent =
    `${ITEMS.length} pieces · ${Object.keys(wardrobe.mounted).length} worn`;
});

// ---- Resize + render loop ---------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
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
