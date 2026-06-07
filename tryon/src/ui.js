import { ITEMS, SLOTS, PALETTE, PRESETS } from './catalog.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Builds the wardrobe panel and wires it to the Wardrobe instance.
export function buildUI(wardrobe, { onShuffle, onTurntable } = {}) {
  const panel = document.getElementById('panel');

  // --- Presets row ---
  const presetWrap = document.createElement('div');
  presetWrap.className = 'presets';
  PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'preset';
    b.textContent = p.name;
    b.onclick = () => { wardrobe.applyPreset(p); refresh(); };
    presetWrap.appendChild(b);
  });
  panel.appendChild(presetWrap);

  // --- Action row ---
  const actions = document.createElement('div');
  actions.className = 'actions';
  const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'action'; b.textContent = label; b.onclick = fn; return b; };
  actions.appendChild(mk('🎲 Shuffle', () => { onShuffle?.(); refresh(); }));
  actions.appendChild(mk('🧹 Clear', () => { wardrobe.clearAll(); refresh(); }));
  const ttBtn = mk('🔄 Turntable: On', function () {
    const on = onTurntable?.();
    this.textContent = '🔄 Turntable: ' + (on ? 'On' : 'Off');
  });
  actions.appendChild(ttBtn);
  panel.appendChild(actions);

  // --- Slot groups (the "swarm" of clothing) ---
  const cards = {}; // itemId -> { el, swatches }
  SLOTS.forEach((slot) => {
    const section = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = slot.label + (slot.multi ? '  (stackable)' : '');
    section.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'grid';
    ITEMS.filter((i) => i.slot === slot.id).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = item.id;

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.name;

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = item.tag;

      const swatches = document.createElement('div');
      swatches.className = 'swatches';
      PALETTE.forEach((c) => {
        const sw = document.createElement('button');
        sw.className = 'sw';
        sw.style.background = hex(c.hex);
        sw.title = c.name;
        sw.onclick = (e) => { e.stopPropagation(); wardrobe.setColor(item.id, c.hex); markColor(item.id, c.hex); };
        swatches.appendChild(sw);
      });

      card.appendChild(name);
      card.appendChild(tag);
      card.appendChild(swatches);
      card.onclick = () => { wardrobe.toggle(item.id); refresh(); };

      grid.appendChild(card);
      cards[item.id] = { el: card, swatches };
    });

    section.appendChild(grid);
    panel.appendChild(section);
  });

  function markColor(itemId, h) {
    const { swatches } = cards[itemId];
    [...swatches.children].forEach((sw, idx) => {
      sw.classList.toggle('active', PALETTE[idx].hex === h);
    });
  }

  function refresh() {
    ITEMS.forEach((item) => {
      const on = wardrobe.isEquipped(item.id);
      cards[item.id].el.classList.toggle('equipped', on);
      markColor(item.id, wardrobe.colors[item.id]);
    });
    updateCount();
  }

  const count = document.getElementById('count');
  function updateCount() {
    const n = Object.keys(wardrobe.mounted).length;
    count.textContent = `${ITEMS.length} pieces · ${n} worn`;
  }

  refresh();
  return { refresh };
}
