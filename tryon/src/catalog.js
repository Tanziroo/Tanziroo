import * as G from './garments.js';

// Goth / industrial colour palette offered as swatches per garment.
export const PALETTE = [
  { name: 'Jet Black', hex: 0x14131a },
  { name: 'Blood Red', hex: 0x7a1020 },
  { name: 'Violet', hex: 0x5b2a86 },
  { name: 'Magenta', hex: 0xc01f7b },
  { name: 'Toxic Green', hex: 0x3fae5a },
  { name: 'Steel', hex: 0x6b7280 },
  { name: 'Bone', hex: 0xe7e2d6 },
  { name: 'Oxblood', hex: 0x4a0e16 },
  { name: 'Electric Blue', hex: 0x2563eb },
  { name: 'Pastel Pink', hex: 0xff9ec7 },
];

// Slots — single-equip slots replace their current item; "accessory" stacks.
export const SLOTS = [
  { id: 'top', label: 'Tops', multi: false },
  { id: 'outerwear', label: 'Outerwear', multi: false },
  { id: 'bottom', label: 'Bottoms', multi: false },
  { id: 'legwear', label: 'Legwear', multi: false },
  { id: 'footwear', label: 'Footwear', multi: false },
  { id: 'accessory', label: 'Accessories', multi: true },
];

// The catalog. Each item: id, name, slot, build(color,finish), finish, color, tag.
export const ITEMS = [
  // TOPS
  { id: 'crop', name: 'Cropped Tank', slot: 'top', build: G.cropTop, finish: 'matte', color: 0x14131a, tag: 'goth' },
  { id: 'corset', name: 'Lace-Up Corset', slot: 'top', build: G.corset, finish: 'leather', color: 0x4a0e16, tag: 'goth' },
  { id: 'mesh', name: 'Long-Sleeve Mesh', slot: 'top', build: G.meshTop, finish: 'mesh', color: 0x14131a, tag: 'goth' },
  { id: 'bandtee', name: 'Cropped Band Tee', slot: 'top', build: G.bandTee, finish: 'matte', color: 0x14131a, tag: 'grunge' },

  // OUTERWEAR
  { id: 'jacket', name: 'Studded Moto Jacket', slot: 'outerwear', build: G.leatherJacket, finish: 'leather', color: 0x14131a, tag: 'industrial' },
  { id: 'harness', name: 'O-Ring Harness', slot: 'outerwear', build: G.harness, finish: 'leather', color: 0x14131a, tag: 'industrial' },
  { id: 'trench', name: 'Belted Trench Coat', slot: 'outerwear', build: G.trenchCoat, finish: 'leather', color: 0x14131a, tag: 'goth' },

  // BOTTOMS
  { id: 'plaid', name: 'Plaid Pleated Skirt', slot: 'bottom', build: (c, f) => G.pleatedSkirt(c, f, true), finish: 'matte', color: 0x7a1020, tag: 'grunge' },
  { id: 'mini', name: 'Vinyl Mini Skirt', slot: 'bottom', build: G.miniSkirt, finish: 'leather', color: 0x14131a, tag: 'goth' },
  { id: 'lpants', name: 'Faux-Leather Pants', slot: 'bottom', build: G.leatherPants, finish: 'leather', color: 0x14131a, tag: 'goth' },
  { id: 'cargo', name: 'Strap Cargo Pants', slot: 'bottom', build: G.cargoPants, finish: 'matte', color: 0x2a2d34, tag: 'industrial' },

  // LEGWEAR
  { id: 'fishnet', name: 'Fishnet Stockings', slot: 'legwear', build: G.fishnets, finish: 'mesh', color: 0x14131a, tag: 'goth' },
  { id: 'stripe', name: 'Striped Tights', slot: 'legwear', build: G.stripedTights, finish: 'matte', color: 0xffffff, tag: 'grunge' },

  // FOOTWEAR
  { id: 'platform', name: 'Platform Buckle Boots', slot: 'footwear', build: G.platformBoots, finish: 'leather', color: 0x14131a, tag: 'goth' },
  { id: 'combat', name: 'Laced Combat Boots', slot: 'footwear', build: G.combatBoots, finish: 'leather', color: 0x14131a, tag: 'industrial' },

  // ACCESSORIES
  { id: 'choker', name: 'Spiked Choker', slot: 'accessory', build: G.choker, finish: 'leather', color: 0x14131a, tag: 'goth' },
  { id: 'belt', name: 'Studded Belt', slot: 'accessory', build: G.spikedBelt, finish: 'leather', color: 0x14131a, tag: 'industrial' },
  { id: 'gloves', name: 'Fingerless Gloves', slot: 'accessory', build: G.fingerlessGloves, finish: 'leather', color: 0x14131a, tag: 'goth' },
  { id: 'garters', name: 'Thigh Garters', slot: 'accessory', build: G.thighGarters, finish: 'leather', color: 0x14131a, tag: 'goth' },
  { id: 'ears', name: 'Cat Ears', slot: 'accessory', build: G.catEars, finish: 'velvet', color: 0x14131a, tag: 'pastel goth' },
];

// One-click looks that set several slots at once.
export const PRESETS = [
  {
    name: 'Full Goth',
    items: { top: 'corset', outerwear: 'trench', bottom: 'mini', legwear: 'fishnet', footwear: 'platform', accessory: ['choker', 'gloves'] },
    colors: { corset: 0x4a0e16, trench: 0x14131a, mini: 0x14131a },
  },
  {
    name: 'Cyber Industrial',
    items: { top: 'mesh', outerwear: 'harness', bottom: 'cargo', legwear: null, footwear: 'combat', accessory: ['belt', 'choker'] },
    colors: { mesh: 0x14131a, harness: 0x14131a, cargo: 0x2a2d34 },
  },
  {
    name: 'Grunge Schoolgirl',
    items: { top: 'bandtee', outerwear: 'jacket', bottom: 'plaid', legwear: 'stripe', footwear: 'combat', accessory: ['choker'] },
    colors: { bandtee: 0x14131a, jacket: 0x14131a },
  },
  {
    name: 'Pastel Goth',
    items: { top: 'crop', outerwear: null, bottom: 'mini', legwear: 'fishnet', footwear: 'platform', accessory: ['ears', 'choker', 'garters'] },
    colors: { crop: 0xff9ec7, mini: 0x5b2a86, choker: 0xff9ec7 },
  },
];
