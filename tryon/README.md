# ⛧ Crypt Couture — 3D Goth & Industrial Try-On

A browser-based dress-up studio. A stylized 3D avatar stands on a lit turntable
and you **mix & match** goth / grunge / industrial garments on her — swap colours,
stack accessories, and one-click full looks.

Everything is built **procedurally in Three.js** — no external 3D model files,
no image scraping. It runs from a single folder.

## Run it

ES modules need to be served over HTTP (opening `index.html` with `file://`
won't work). From this folder:

```bash
# any static server works — pick one
python3 -m http.server 8000
#   then open http://localhost:8000/
```

Three.js itself is loaded from a CDN via an import map, so the page needs
internet access in the browser the first time.

## What's inside

| File | Role |
|------|------|
| `index.html` | layout + import map |
| `styles.css` | dark goth UI |
| `src/proportions.js` | shared body landmarks so clothes line up |
| `src/materials.js` | finishes (leather/latex/mesh/metal…) + plaid & fishnet textures |
| `src/avatar.js` | the procedural feminine avatar |
| `src/garments.js` | every garment builder |
| `src/catalog.js` | the catalog: items, palette, slots, presets |
| `src/wardrobe.js` | equip / unequip / recolour state |
| `src/ui.js` | the wardrobe panel |
| `src/main.js` | scene, lights, turntable, render loop |

## Controls

- **Drag** to rotate · **scroll** to zoom
- **Click a piece** to wear/remove it
- **Click a swatch** to recolour that piece
- **Presets** apply a full look · **Shuffle** randomises · **Clear** strips down
- **Turntable** toggles the auto-spin

## The catalog (21 pieces)

- **Tops** — Cropped Tank · Lace-Up Corset · Long-Sleeve Mesh · Cropped Band Tee
- **Outerwear** — Studded Moto Jacket · O-Ring Harness · Belted Trench Coat
- **Bottoms** — Plaid Pleated Skirt · Vinyl Mini Skirt · Faux-Leather Pants · Strap Cargo Pants
- **Legwear** — Fishnet Stockings · Striped Tights
- **Footwear** — Platform Buckle Boots · Laced Combat Boots
- **Accessories** (stackable) — Spiked Choker · Studded Belt · Fingerless Gloves · Thigh Garters · Cat Ears

Single slots (top/outerwear/bottom/legwear/footwear) hold one item at a time;
accessories stack.

## A note on the source website

The request started from a ROMWE "Gothic Grunge" category URL. ROMWE (a SHEIN
brand) returns **HTTP 403** to automated requests and its Terms of Service
prohibit scraping/reproducing its catalog and product photos, so this app does
**not** copy their listings or images. Instead it models the *style genre* —
the same categories of garment that define that aesthetic.

### Slotting in real products

The catalog is data-driven. To represent specific products you legally own or
have rights to, add entries in `src/catalog.js`:

```js
{ id: 'myItem', name: 'My Top', slot: 'top',
  build: G.cropTop, finish: 'leather', color: 0x14131a, tag: 'goth' }
```

To map a real garment **photo** onto a piece, load it as a texture in
`src/materials.js` and have the builder use that material — point me at images
you have the rights to and I'll wire them up.
