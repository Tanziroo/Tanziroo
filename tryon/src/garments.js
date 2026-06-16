import * as THREE from 'three';
import { P } from './proportions.js';
import { makeMaterial, makeFishnetTexture, makePlaidTexture } from './materials.js';

// Every builder returns a THREE.Group positioned in the avatar's local space.
// Signature: build(color:number, finish:string) => THREE.Group
// `color` is a hex int chosen by the user; `finish` selects the material look.

const DBL = THREE.DoubleSide;
const TWO_PI = Math.PI * 2;

function group(name) { const g = new THREE.Group(); g.name = name; return g; }
function shadow(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// shell with an opening at the front (+Z), used for jackets / coats / corsets
function openShell(rTop, rBot, h, yCenter, mat, gap = 0) {
  const theta0 = Math.PI / 2 + gap / 2;
  const thetaLen = TWO_PI - gap;
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, 28, 1, true, theta0, thetaLen);
  const m = shadow(new THREE.Mesh(geo, mat));
  m.position.y = yCenter;
  return m;
}

// a tube that follows one leg (thigh + calf), slightly larger than the skin
function legTube(side, mat, opts = {}) {
  const g = group('legtube');
  const rT = (opts.thigh ?? P.thighR) + (opts.pad ?? 0.012);
  const rC = (opts.calf ?? P.calfR) + (opts.pad ?? 0.012);
  const topY = opts.topY ?? P.hipY - 0.02;
  const botY = opts.botY ?? P.ankleY + 0.02;
  const kneeY = P.kneeY;
  const thigh = shadow(new THREE.Mesh(new THREE.CylinderGeometry(rC + 0.01, rT, topY - kneeY, 16, 1, true), mat));
  thigh.position.set(side * P.legX, (topY + kneeY) / 2, 0);
  const calf = shadow(new THREE.Mesh(new THREE.CylinderGeometry(rC - 0.005, rC + 0.01, kneeY - botY, 16, 1, true), mat));
  calf.position.set(side * P.legX, (kneeY + botY) / 2, 0);
  g.add(thigh, calf);
  return g;
}

// ---------------------------------------------------------------------------
// TOPS
// ---------------------------------------------------------------------------

export function cropTop(color, finish = 'matte') {
  const g = group('cropTop');
  const mat = makeMaterial(color, finish); mat.side = DBL;
  const pts = [
    new THREE.Vector2(0.140, P.chestY - 0.10),
    new THREE.Vector2(0.165, P.chestY - 0.02),
    new THREE.Vector2(0.162, P.chestY + 0.04),
    new THREE.Vector2(0.120, P.shoulderY - 0.06),
    new THREE.Vector2(0.090, P.shoulderY - 0.02),
  ];
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat)));
  // straps
  [-1, 1].forEach((s) => {
    const strap = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.02), mat));
    strap.position.set(s * 0.07, P.shoulderY - 0.02, 0.02);
    g.add(strap);
  });
  return g;
}

export function corset(color, finish = 'leather') {
  const g = group('corset');
  const mat = makeMaterial(color, finish); mat.side = DBL;
  const pts = [
    new THREE.Vector2(0.170, P.hipY + 0.00),
    new THREE.Vector2(0.150, P.hipY + 0.06),
    new THREE.Vector2(0.130, P.waistY),
    new THREE.Vector2(0.142, P.waistY + 0.08),
    new THREE.Vector2(0.162, P.chestY - 0.02),
    new THREE.Vector2(0.150, P.chestY + 0.05),
  ];
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat)));
  // lacing across the front
  const lace = makeMaterial(0xdddddd, 'matte');
  for (let i = 0; i < 7; i++) {
    const y = P.waistY - 0.04 + i * 0.045;
    const x = i % 2 ? 0.02 : -0.02;
    const l = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), lace));
    l.rotation.z = Math.PI / 2 + (i % 2 ? 0.5 : -0.5);
    l.position.set(x, y, 0.16);
    g.add(l);
  }
  // vertical boning seams
  const bone = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.45), roughness: 0.3, metalness: 0.1 });
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const ang = k * 0.34, r = 0.150;
    const bn = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.27, 0.015), bone));
    bn.position.set(Math.sin(ang) * r, P.waistY + 0.045, Math.cos(ang) * r);
    bn.rotation.y = ang;
    g.add(bn);
  }
  return g;
}

export function meshTop(color, finish = 'mesh') {
  const g = group('meshTop');
  const mat = makeMaterial(color, 'mesh');
  const pts = [
    new THREE.Vector2(0.158, P.waistY - 0.02),
    new THREE.Vector2(0.135, P.waistY + 0.04),
    new THREE.Vector2(0.160, P.chestY),
    new THREE.Vector2(0.118, P.shoulderY - 0.03),
    new THREE.Vector2(0.072, P.neckY),
  ];
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat)));
  // long sleeves over arms
  [-1, 1].forEach((s) => {
    const sl = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(P.upperArmR + 0.015, 0.5, 6, 12), mat));
    sl.position.set(s * (P.shoulderX + 0.06), P.shoulderY - 0.30, 0);
    sl.rotation.z = s * 0.12;
    g.add(sl);
  });
  return g;
}

export function bandTee(color, finish = 'matte') {
  const g = group('bandTee');
  const mat = makeMaterial(color, finish); mat.side = DBL;
  const pts = [
    new THREE.Vector2(0.150, P.hipY + 0.04),
    new THREE.Vector2(0.140, P.waistY),
    new THREE.Vector2(0.160, P.chestY),
    new THREE.Vector2(0.115, P.shoulderY - 0.03),
    new THREE.Vector2(0.085, P.shoulderY + 0.01),
  ];
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat)));
  // short sleeves
  [-1, 1].forEach((s) => {
    const sl = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.058, 0.12, 12, 1, true), mat));
    sl.position.set(s * (P.shoulderX + 0.02), P.shoulderY - 0.10, 0);
    sl.rotation.z = s * 0.5;
    g.add(sl);
  });
  // a little band-logo plate on the chest
  const logo = shadow(new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), makeMaterial(0xf2f2f2, 'matte')));
  logo.position.set(0, P.chestY, 0.158);
  g.add(logo);
  return g;
}

// ---------------------------------------------------------------------------
// OUTERWEAR
// ---------------------------------------------------------------------------

export function leatherJacket(color, finish = 'leather') {
  const g = group('leatherJacket');
  const mat = makeMaterial(color, finish); mat.side = DBL;
  // open body shell, cropped at the waist
  g.add(openShell(0.165, 0.175, P.shoulderY - P.waistY + 0.05, (P.shoulderY + P.waistY) / 2, mat, 1.0));
  // popped collar (open at front)
  const collar = openShell(0.105, 0.085, 0.09, P.neckY + 0.0, mat, 1.0);
  collar.scale.set(1.05, 1, 1.05);
  g.add(collar);
  // sleeves
  [-1, 1].forEach((s) => {
    const up = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(P.upperArmR + 0.02, 0.26, 6, 12), mat));
    up.position.set(s * (P.shoulderX + 0.03), P.shoulderY - 0.16, 0);
    up.rotation.z = s * 0.14;
    const lo = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(P.foreArmR + 0.018, 0.24, 6, 12), mat));
    lo.position.set(s * (P.shoulderX + 0.085), P.shoulderY - 0.44, 0);
    lo.rotation.z = s * 0.10;
    g.add(up, lo);
  });
  // zipper + studs accents
  const metal = makeMaterial(0xc9ccd1, 'metal');
  for (let i = 0; i < 5; i++) {
    const stud = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), metal));
    stud.position.set(-0.10, P.shoulderY - 0.10 - i * 0.02, 0.16);
    g.add(stud);
  }
  // peaked lapels + cuffs
  [-1, 1].forEach((s) => {
    const lap = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.02), mat));
    lap.position.set(s * 0.075, P.chestY + 0.03, 0.135);
    lap.rotation.z = s * 0.32; lap.rotation.y = -s * 0.30;
    const cf = shadow(new THREE.Mesh(new THREE.TorusGeometry(P.foreArmR + 0.022, 0.013, 8, 18), mat));
    cf.position.set(s * (P.shoulderX + 0.095), P.shoulderY - 0.555, 0);
    cf.rotation.y = Math.PI / 2;
    g.add(lap, cf);
  });
  // asymmetric moto zipper: offset flap edge + metal zip line + pull tab
  const midY = (P.shoulderY + P.waistY) / 2;
  const zlen = P.shoulderY - P.waistY + 0.02;
  const flap = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.05, zlen, 0.014), mat));
  flap.position.set(0.035, midY, 0.152); flap.rotation.z = 0.06;
  const zip = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.012, zlen, 0.012), metal));
  zip.position.set(-0.005, midY, 0.158); zip.rotation.z = 0.06;
  const pull = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.03, 0.01), metal));
  pull.position.set(-0.01, P.waistY + 0.10, 0.163);
  g.add(flap, zip, pull);
  return g;
}

export function harness(color, finish = 'leather') {
  const g = group('harness');
  const mat = makeMaterial(color, finish);
  const metal = makeMaterial(0xc9ccd1, 'metal');
  const strap = (w, h, d) => shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  // under-bust band
  const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 8, 28), mat));
  band.rotation.x = Math.PI / 2;
  band.position.y = P.chestY - 0.06;
  band.scale.set(1, 0.85, 1);
  g.add(band);
  // O-ring at sternum
  const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 18), metal));
  ring.position.set(0, P.chestY, 0.15);
  g.add(ring);
  // vertical + diagonal straps
  [-1, 1].forEach((s) => {
    const v = strap(0.022, 0.18, 0.02);
    v.position.set(s * 0.05, P.chestY + 0.06, 0.14);
    g.add(v);
    const d = strap(0.022, 0.20, 0.02);
    d.position.set(s * 0.10, P.chestY - 0.02, 0.12);
    d.rotation.z = s * 0.5;
    g.add(d);
  });
  // neck loop
  const loop = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.011, 8, 24), mat));
  loop.rotation.x = Math.PI / 2;
  loop.position.set(0, P.neckY + 0.02, 0.0);
  loop.scale.set(1, 1, 0.7);
  g.add(loop);
  // waist O-ring band + connector rings at strap junctions
  const wband = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.150, 0.011, 8, 28), mat));
  wband.rotation.x = Math.PI / 2; wband.position.y = P.waistY + 0.02; wband.scale.set(1, 0.88, 1);
  g.add(wband);
  [[0, P.chestY + 0.06], [0, P.chestY - 0.10]].forEach(([px, py]) => {
    const or = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 8, 16), metal));
    or.position.set(px, py, 0.145);
    g.add(or);
  });
  [-1, 1].forEach((s) => {
    const sr = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.005, 8, 14), metal));
    sr.position.set(s * 0.10, P.waistY + 0.02, 0.135); sr.rotation.y = Math.PI / 2;
    const connect = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.018), mat));
    connect.position.set(s * 0.085, P.chestY - 0.10, 0.135);
    g.add(sr, connect);
  });
  return g;
}

export function trenchCoat(color, finish = 'leather') {
  const g = group('trenchCoat');
  const mat = makeMaterial(color, finish); mat.side = DBL;
  // long open body from shoulders to knees, flaring out
  const pts = [
    new THREE.Vector2(0.20, P.kneeY - 0.02),
    new THREE.Vector2(0.185, P.hipY),
    new THREE.Vector2(0.165, P.waistY + 0.02),
    new THREE.Vector2(0.180, P.chestY),
    new THREE.Vector2(0.150, P.shoulderY),
  ];
  // build as half-open: lathe then cut front by using a shell instead
  const shell = openShell(0.165, 0.205, P.shoulderY - (P.kneeY - 0.02), (P.shoulderY + P.kneeY - 0.02) / 2, mat, 0.8);
  g.add(shell);
  // collar
  const collar = openShell(0.10, 0.08, 0.10, P.neckY + 0.01, mat, 0.9);
  g.add(collar);
  // sleeves full length
  [-1, 1].forEach((s) => {
    const sl = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(P.upperArmR + 0.025, 0.5, 6, 12), mat));
    sl.position.set(s * (P.shoulderX + 0.05), P.shoulderY - 0.28, 0);
    sl.rotation.z = s * 0.12;
    g.add(sl);
  });
  // belt
  const belt = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 28), makeMaterial(0x141414, 'leather')));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = P.waistY;
  g.add(belt);
  return g;
}

// ---------------------------------------------------------------------------
// BOTTOMS
// ---------------------------------------------------------------------------

export function pleatedSkirt(color, finish = 'matte', plaid = true) {
  const g = group('pleatedSkirt');
  const mat = plaid
    ? new THREE.MeshStandardMaterial({ map: makePlaidTexture(), roughness: 0.85, side: DBL })
    : (() => { const m = makeMaterial(color, finish); m.side = DBL; return m; })();
  mat.flatShading = true;
  const topY = P.hipY - 0.02;
  const hemY = P.hipY - 0.30;
  const N = 28;
  // real accordion pleats: cone shell with alternating radial segments pushed in/out
  const geo = new THREE.CylinderGeometry(0.155, 0.235, topY - hemY, N, 1, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const seg = Math.round((ang / (Math.PI * 2)) * N);
    const r = Math.sqrt(x * x + z * z) * ((seg % 2) ? 0.86 : 1.0);
    pos.setX(i, Math.cos(ang) * r);
    pos.setZ(i, Math.sin(ang) * r);
  }
  geo.computeVertexNormals();
  const skirt = shadow(new THREE.Mesh(geo, mat));
  skirt.position.y = (topY + hemY) / 2;
  g.add(skirt);
  // waistband
  const wb = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.016, 8, 26), makeMaterial(0x111111, 'leather')));
  wb.rotation.x = Math.PI / 2;
  wb.position.y = topY;
  g.add(wb);
  return g;
}

export function miniSkirt(color, finish = 'leather') {
  const g = group('miniSkirt');
  const mat = makeMaterial(color, finish); mat.side = DBL;
  const topY = P.hipY + 0.01;
  const hemY = P.hipY - 0.18;
  const pts = [
    new THREE.Vector2(0.150, topY),
    new THREE.Vector2(0.158, topY - 0.02),
    new THREE.Vector2(0.190, P.hipY - 0.08),
    new THREE.Vector2(0.208, hemY),
  ];
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat)));
  // waistband + stud row + side D-ring
  const wb = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.150, 0.014, 8, 28), makeMaterial(0x111111, 'leather')));
  wb.rotation.x = Math.PI / 2; wb.position.y = topY;
  g.add(wb);
  const metal = makeMaterial(0xc9ccd1, 'metal');
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const stud = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), metal));
    stud.position.set(Math.cos(a) * 0.150, topY, Math.sin(a) * 0.150);
    g.add(stud);
  }
  const dring = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 8, 16), metal));
  dring.position.set(0.06, P.hipY - 0.03, 0.150);
  g.add(dring);
  return g;
}

export function leatherPants(color, finish = 'leather') {
  const g = group('leatherPants');
  const mat = makeMaterial(color, finish);
  [-1, 1].forEach((s) => g.add(legTube(s, mat, { pad: 0.014, botY: P.ankleY })));
  // hip/seat cover
  const hips = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), mat));
  hips.position.set(0, P.hipY - 0.05, 0);
  hips.scale.set(1, 0.7, 0.9);
  g.add(hips);
  return g;
}

export function cargoPants(color, finish = 'matte') {
  const g = group('cargoPants');
  const mat = makeMaterial(color, finish);
  const dk = makeMaterial(0x111111, 'matte');
  const metal = makeMaterial(0xc9ccd1, 'metal');
  [-1, 1].forEach((s) => {
    g.add(legTube(s, mat, { pad: 0.03, botY: P.ankleY }));
    // thigh cargo pocket with flap
    const pkt = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.06), mat));
    pkt.position.set(s * (P.legX + 0.105), P.kneeY + 0.14, 0);
    const flap = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.065), dk));
    flap.position.set(s * (P.legX + 0.105), P.kneeY + 0.195, 0);
    // lower knee pocket
    const pkt2 = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.055), mat));
    pkt2.position.set(s * (P.legX + 0.105), P.kneeY - 0.10, 0);
    g.add(pkt, flap, pkt2);
    // buckle straps around the calf
    [0.0, -0.16].forEach((dy) => {
      const strap = shadow(new THREE.Mesh(new THREE.TorusGeometry(P.calfR + 0.035, 0.01, 8, 22), dk));
      strap.rotation.x = Math.PI / 2; strap.position.set(s * P.legX, P.kneeY - 0.04 + dy, 0);
      const bk = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.012), metal));
      bk.position.set(s * P.legX, P.kneeY - 0.04 + dy, P.calfR + 0.04);
      g.add(strap, bk);
    });
  });
  const hips = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.185, 20, 14), mat));
  hips.position.set(0, P.hipY - 0.05, 0);
  hips.scale.set(1, 0.7, 0.95);
  g.add(hips);
  return g;
}

// ---------------------------------------------------------------------------
// LEGWEAR
// ---------------------------------------------------------------------------

export function fishnets(color, finish = 'mesh') {
  const g = group('fishnets');
  const tex = makeFishnetTexture('#0a0a0a', 10);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaMap: tex, roughness: 0.7, side: DBL, color });
  [-1, 1].forEach((s) => g.add(legTube(s, mat, { pad: 0.006, topY: P.hipY - 0.02, botY: P.ankleY - 0.01 })));
  return g;
}

export function stripedTights(color, finish = 'matte') {
  const g = group('stripedTights');
  // horizontal stripes via canvas
  const c = document.createElement('canvas'); c.width = 16; c.height = 32;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#1a1a1a' : '#dddddd'; ctx.fillRect(0, i * 4, 16, 4); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 8); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: DBL, color });
  [-1, 1].forEach((s) => g.add(legTube(s, mat, { pad: 0.004, topY: P.hipY - 0.04, botY: P.ankleY })));
  return g;
}

// ---------------------------------------------------------------------------
// FOOTWEAR
// ---------------------------------------------------------------------------

export function platformBoots(color, finish = 'leather') {
  const g = group('platformBoots');
  const mat = makeMaterial(color, finish);
  const sole = makeMaterial(0x0a0a0a, 'matte');
  [-1, 1].forEach((s) => {
    // tall shaft to below the knee
    const shaft = shadow(new THREE.Mesh(new THREE.CylinderGeometry(P.calfR + 0.018, P.calfR + 0.012, P.kneeY - 0.10, 14), mat));
    shaft.position.set(s * P.legX, (P.kneeY - 0.10) / 2 + 0.08, 0);
    // foot
    const foot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.21), mat));
    foot.position.set(s * P.legX, 0.10, 0.045);
    // chunky platform sole
    const platform = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.24), sole));
    platform.position.set(s * P.legX, 0.035, 0.05);
    g.add(shaft, foot, platform);
    // sole tread ridges
    for (let j = 0; j < 5; j++) {
      const tr = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.012, 0.022), sole));
      tr.position.set(s * P.legX, 0.012, -0.05 + j * 0.045);
      g.add(tr);
    }
    // buckles
    const metal = makeMaterial(0xc9ccd1, 'metal');
    for (let i = 0; i < 3; i++) {
      const bk = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 6, 14), metal));
      bk.position.set(s * (P.legX), 0.18 + i * 0.10, P.calfR + 0.02);
      g.add(bk);
    }
    // front laces
    const lace = makeMaterial(0xe8e8e8, 'matte');
    for (let n = 0; n < 5; n++) {
      const lc = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 6), lace));
      lc.rotation.z = Math.PI / 2;
      lc.position.set(s * P.legX, 0.155 + n * 0.062, P.calfR + 0.028);
      g.add(lc);
    }
  });
  return g;
}

export function combatBoots(color, finish = 'leather') {
  const g = group('combatBoots');
  const mat = makeMaterial(color, finish);
  const sole = makeMaterial(0x0a0a0a, 'matte');
  [-1, 1].forEach((s) => {
    const shaft = shadow(new THREE.Mesh(new THREE.CylinderGeometry(P.calfR + 0.02, P.calfR + 0.01, 0.22, 14), mat));
    shaft.position.set(s * P.legX, 0.22, 0);
    const foot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.21), mat));
    foot.position.set(s * P.legX, 0.10, 0.045);
    const platform = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.05, 0.23), sole));
    platform.position.set(s * P.legX, 0.04, 0.05);
    g.add(shaft, foot, platform);
    // laces
    const lace = makeMaterial(0xe8e8e8, 'matte');
    for (let i = 0; i < 5; i++) {
      const l = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), lace));
      l.rotation.z = Math.PI / 2;
      l.position.set(s * P.legX, 0.14 + i * 0.035, P.calfR + 0.02);
      g.add(l);
    }
  });
  return g;
}

// ---------------------------------------------------------------------------
// ACCESSORIES (can stack)
// ---------------------------------------------------------------------------

export function choker(color, finish = 'leather') {
  const g = group('choker');
  const mat = makeMaterial(color, finish);
  const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(P.neckR + 0.01, 0.012, 10, 28), mat));
  band.rotation.x = Math.PI / 2;
  band.position.y = P.neckY + 0.04;
  band.scale.set(1, 1, 0.85);
  g.add(band);
  // spikes
  const metal = makeMaterial(0xc9ccd1, 'metal');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TWO_PI;
    const spike = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.022, 8), metal));
    spike.position.set(Math.cos(a) * (P.neckR + 0.012), P.neckY + 0.04, Math.sin(a) * (P.neckR + 0.012) * 0.85);
    spike.lookAt(spike.position.clone().multiplyScalar(2));
    spike.rotateX(Math.PI / 2);
    g.add(spike);
  }
  return g;
}

export function spikedBelt(color, finish = 'leather') {
  const g = group('spikedBelt');
  const mat = makeMaterial(color, finish);
  const belt = shadow(new THREE.Mesh(new THREE.TorusGeometry(P.hipR - 0.005, 0.016, 10, 30), mat));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = P.hipY + 0.01;
  belt.scale.set(1, 1, 0.92);
  g.add(belt);
  const metal = makeMaterial(0xc9ccd1, 'metal');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TWO_PI;
    const stud = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.02, 8), metal));
    const r = P.hipR + 0.006;
    stud.position.set(Math.cos(a) * r, P.hipY + 0.01, Math.sin(a) * r * 0.92);
    stud.lookAt(stud.position.clone().multiplyScalar(2));
    stud.rotateX(Math.PI / 2);
    g.add(stud);
  }
  return g;
}

export function fingerlessGloves(color, finish = 'leather') {
  const g = group('gloves');
  const mat = makeMaterial(color, finish);
  [-1, 1].forEach((s) => {
    const fore = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(P.foreArmR + 0.012, 0.22, 6, 12), mat));
    fore.position.set(s * (P.shoulderX + 0.085), P.shoulderY - 0.44, 0);
    fore.rotation.z = s * 0.10;
    const palm = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mat));
    palm.position.set(s * (P.shoulderX + 0.10), P.shoulderY - 0.56, 0);
    palm.scale.set(0.8, 1.1, 0.5);
    g.add(fore, palm);
  });
  return g;
}

export function catEars(color, finish = 'velvet') {
  const g = group('catEars');
  const mat = makeMaterial(color, finish);
  const pink = makeMaterial(0xff7bbf, 'velvet');
  [-1, 1].forEach((s) => {
    const ear = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), mat));
    ear.position.set(s * 0.06, P.topY + 0.02, -0.01);
    ear.rotation.z = s * 0.2;
    const inner = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 4), pink));
    inner.position.set(s * 0.06, P.topY + 0.02, 0.01);
    inner.rotation.z = s * 0.2;
    g.add(ear, inner);
  });
  return g;
}

export function thighGarters(color, finish = 'leather') {
  const g = group('garters');
  const mat = makeMaterial(color, finish);
  const metal = makeMaterial(0xc9ccd1, 'metal');
  [-1, 1].forEach((s) => {
    const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(P.thighR + 0.018, 0.01, 8, 22), mat));
    band.rotation.x = Math.PI / 2;
    band.position.set(s * P.legX, P.kneeY + 0.22, 0);
    g.add(band);
    // dangling clip strap
    const strap = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.10, 0.012), mat));
    strap.position.set(s * P.legX, P.kneeY + 0.16, P.thighR + 0.01);
    g.add(strap);
    const clip = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), metal));
    clip.position.set(s * P.legX, P.kneeY + 0.11, P.thighR + 0.01);
    g.add(clip);
  });
  return g;
}
