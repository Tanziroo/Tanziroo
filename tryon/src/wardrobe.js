import * as THREE from 'three';
import { ITEMS, SLOTS } from './catalog.js';

// Owns the equip state and the live garment meshes attached to the avatar.
export class Wardrobe {
  constructor(avatarGroup) {
    this.avatar = avatarGroup;
    this.byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
    // slotId -> equipped item id(s). Single slots hold a string|null, multi hold a Set.
    this.equipped = {};
    // itemId -> { group, color } for currently mounted meshes
    this.mounted = {};
    // itemId -> chosen color (persists across re-equips)
    this.colors = Object.fromEntries(ITEMS.map((i) => [i.id, i.color]));
    SLOTS.forEach((s) => { this.equipped[s.id] = s.multi ? new Set() : null; });
  }

  isEquipped(itemId) {
    const item = this.byId[itemId];
    const slot = SLOTS.find((s) => s.id === item.slot);
    return slot.multi ? this.equipped[item.slot].has(itemId) : this.equipped[item.slot] === itemId;
  }

  _mount(itemId) {
    const item = this.byId[itemId];
    const grp = item.build(this.colors[itemId], item.finish);
    grp.userData.itemId = itemId;
    this.avatar.add(grp);
    this.mounted[itemId] = grp;
  }

  _unmount(itemId) {
    const grp = this.mounted[itemId];
    if (!grp) return;
    this.avatar.remove(grp);
    grp.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    delete this.mounted[itemId];
  }

  // Toggle an item on/off. Returns the resulting equipped state (bool).
  toggle(itemId) {
    const item = this.byId[itemId];
    const slot = SLOTS.find((s) => s.id === item.slot);
    if (slot.multi) {
      const set = this.equipped[item.slot];
      if (set.has(itemId)) { set.delete(itemId); this._unmount(itemId); return false; }
      set.add(itemId); this._mount(itemId); return true;
    }
    const current = this.equipped[item.slot];
    if (current === itemId) { this.equipped[item.slot] = null; this._unmount(itemId); return false; }
    if (current) this._unmount(current);
    this.equipped[item.slot] = itemId;
    this._mount(itemId);
    return true;
  }

  equip(itemId) { if (!this.isEquipped(itemId)) this.toggle(itemId); }
  unequip(itemId) { if (this.isEquipped(itemId)) this.toggle(itemId); }

  setColor(itemId, hex) {
    this.colors[itemId] = hex;
    if (this.mounted[itemId]) { // re-mount with new colour
      this._unmount(itemId);
      this._mount(itemId);
    }
  }

  clearAll() {
    Object.keys(this.mounted).forEach((id) => this._unmount(id));
    SLOTS.forEach((s) => { this.equipped[s.id] = s.multi ? new Set() : null; });
  }

  applyPreset(preset) {
    this.clearAll();
    for (const [slotId, val] of Object.entries(preset.items)) {
      if (!val) continue;
      const ids = Array.isArray(val) ? val : [val];
      ids.forEach((id) => {
        if (preset.colors && preset.colors[id] != null) this.colors[id] = preset.colors[id];
        this.equip(id);
      });
    }
  }

  // ---- sync: compact, serialisable snapshot of the whole look ----
  serialize() {
    const equipped = {};
    for (const s of SLOTS) {
      const v = this.equipped[s.id];
      equipped[s.id] = s.multi ? [...v] : v;
    }
    return { equipped, colors: { ...this.colors } };
  }

  apply(state) {
    if (!state) return;
    this.clearAll();
    if (state.colors) Object.assign(this.colors, state.colors);
    if (state.equipped) {
      for (const s of SLOTS) {
        const v = state.equipped[s.id];
        if (!v) continue;
        (Array.isArray(v) ? v : [v]).forEach((id) => { if (this.byId[id]) this.equip(id); });
      }
    }
  }
}
