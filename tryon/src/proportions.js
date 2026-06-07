// Shared body proportions so the avatar and every garment line up.
// Units are roughly meters; feet sit on the ground plane at y = 0.
// A stylized feminine figure, ~1.72 tall.

export const P = {
  groundY: 0,

  // Vertical landmarks (world Y)
  ankleY: 0.09,
  kneeY: 0.52,
  hipY: 0.96,
  waistY: 1.07,
  chestY: 1.27,
  shoulderY: 1.44,
  neckY: 1.50,
  chinY: 1.56,
  headY: 1.64,
  topY: 1.74,

  // Horizontal placement
  legX: 0.095, // distance of each leg from the centre line
  shoulderX: 0.175, // distance of each shoulder from the centre line

  // Radii used to fit clothing snugly over the body
  hipR: 0.165,
  waistR: 0.125,
  chestR: 0.155,
  thighR: 0.095,
  calfR: 0.07,
  upperArmR: 0.05,
  foreArmR: 0.042,
  neckR: 0.052,
  headR: 0.10,
};

// The hourglass torso silhouette (radius, y) used by a LatheGeometry.
// Shared so corsets / crop tops can reuse the same curve.
export const TORSO_PROFILE = [
  [0.150, P.hipY - 0.02],
  [0.165, P.hipY + 0.02],
  [0.150, P.hipY + 0.06],
  [0.125, P.waistY],
  [0.135, P.waistY + 0.07],
  [0.155, P.chestY - 0.02],
  [0.150, P.chestY + 0.04],
  [0.110, P.shoulderY - 0.04],
  [0.072, P.neckY - 0.02],
  [0.058, P.neckY + 0.02],
];
