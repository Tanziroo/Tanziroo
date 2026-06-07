import * as THREE from 'three';
import { P } from './proportions.js';
import { SKIN, HAIR } from './materials.js';

// Builds a stylized feminine avatar from primitives and returns a Group.
// The Group is the parent that every garment also attaches to, so clothing
// and body move/rotate together on the turntable.
export function buildAvatar() {
  const g = new THREE.Group();
  g.name = 'avatar';

  const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };

  // --- Torso (hourglass via lathe) ---
  const torsoPts = [];
  // smooth hourglass profile
  const prof = [
    [0.155, P.hipY - 0.04], [0.168, P.hipY + 0.02], [0.150, P.hipY + 0.07],
    [0.122, P.waistY], [0.135, P.waistY + 0.08],
    [0.156, P.chestY - 0.02], [0.150, P.chestY + 0.05],
    [0.105, P.shoulderY - 0.03], [0.070, P.neckY - 0.02], [0.056, P.neckY + 0.02],
  ];
  prof.forEach(([r, y]) => torsoPts.push(new THREE.Vector2(r, y)));
  const torso = add(new THREE.Mesh(new THREE.LatheGeometry(torsoPts, 32), SKIN));

  // chest definition
  const bustGeo = new THREE.SphereGeometry(0.072, 20, 16);
  [-1, 1].forEach((s) => {
    const b = add(new THREE.Mesh(bustGeo, SKIN));
    b.position.set(s * 0.062, P.chestY + 0.01, 0.105);
    b.scale.set(1, 0.9, 0.8);
  });

  // --- Pelvis cap ---
  const pelvis = add(new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 16), SKIN));
  pelvis.position.set(0, P.hipY - 0.05, 0);
  pelvis.scale.set(1, 0.7, 0.85);

  // --- Neck + head ---
  const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(P.neckR, P.neckR + 0.01, 0.09, 16), SKIN));
  neck.position.set(0, P.neckY + 0.05, 0);

  const head = add(new THREE.Mesh(new THREE.SphereGeometry(P.headR, 28, 24), SKIN));
  head.position.set(0, P.headY, 0);
  head.scale.set(0.92, 1.08, 0.95);

  // hair: back volume + fringe
  const hairBack = add(new THREE.Mesh(new THREE.SphereGeometry(P.headR + 0.02, 24, 20), HAIR));
  hairBack.position.set(0, P.headY + 0.01, -0.015);
  hairBack.scale.set(1.05, 1.18, 1.05);
  // carve the face by hiding front with a flattened scale + a fringe slab
  const fringe = add(new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.07, 0.12), HAIR));
  fringe.position.set(0, P.headY + 0.07, 0.045);
  fringe.rotation.x = -0.15;
  // long side strands
  [-1, 1].forEach((s) => {
    const strand = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 6, 10), HAIR));
    strand.position.set(s * 0.095, P.headY - 0.12, 0.02);
  });

  // simple eyes
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.3 });
  [-1, 1].forEach((s) => {
    const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 12), eyeMat));
    eye.position.set(s * 0.038, P.headY + 0.01, P.headR * 0.92);
  });

  // --- Arms (slightly out, hanging) ---
  function limb(rTop, rBot, len) {
    const geo = new THREE.CapsuleGeometry((rTop + rBot) / 2, len, 8, 14);
    return geo;
  }
  [-1, 1].forEach((s) => {
    const shoulder = add(new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 14), SKIN));
    shoulder.position.set(s * P.shoulderX, P.shoulderY, 0);

    const upper = add(new THREE.Mesh(limb(P.upperArmR, P.foreArmR, 0.26), SKIN));
    upper.position.set(s * (P.shoulderX + 0.03), P.shoulderY - 0.16, 0);
    upper.rotation.z = s * 0.14;

    const elbow = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), SKIN));
    elbow.position.set(s * (P.shoulderX + 0.07), P.shoulderY - 0.30, 0);

    const fore = add(new THREE.Mesh(limb(P.foreArmR, 0.034, 0.24), SKIN));
    fore.position.set(s * (P.shoulderX + 0.085), P.shoulderY - 0.44, 0.0);
    fore.rotation.z = s * 0.10;

    const hand = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), SKIN));
    hand.position.set(s * (P.shoulderX + 0.10), P.shoulderY - 0.57, 0.0);
    hand.scale.set(0.8, 1.3, 0.5);
  });

  // --- Legs ---
  [-1, 1].forEach((s) => {
    const thigh = add(new THREE.Mesh(new THREE.CapsuleGeometry(P.thighR, 0.34, 8, 14), SKIN));
    thigh.position.set(s * P.legX, (P.hipY + P.kneeY) / 2 + 0.02, 0);
    thigh.scale.set(1, 1, 0.95);

    const knee = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), SKIN));
    knee.position.set(s * P.legX, P.kneeY, 0);

    const calf = add(new THREE.Mesh(new THREE.CapsuleGeometry(P.calfR, 0.32, 8, 14), SKIN));
    calf.position.set(s * P.legX, (P.kneeY + P.ankleY) / 2 + 0.02, 0);

    const foot = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.18), SKIN));
    foot.position.set(s * P.legX, P.ankleY - 0.04, 0.04);
  });

  return g;
}
