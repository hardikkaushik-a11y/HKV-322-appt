// The configurator: swap finishes, move furniture, change the light.
//
// The mechanics follow Ryan Sael's "Set the Mood" (sael.net/interior): samples in a
// tray that go onto surfaces, furniture that can be picked up and turned, a sun that
// moves, and a meter that reads the room. Rebuilt here for B-34, in our own code.
//
// What this layer changes is the viewer's play, never Ar. Shivangi Kaushik's design:
// every finish is a concept option, every moved piece is marked as moved from her
// layout and can be put back. Her four bedrooms open with her own finishes and can be
// changed room by room; Toilet 3 stays as she specified it.
import { api } from './diorama.js';
import { createProducts } from './products.js';
import { createWalk } from './walk.js';
import { persian, marble, wood, fabric, shutter, paint, terrazzo, boucle, velvet, leather, limewash, travertine,
         normalFrom, swatchURL } from './textures.js';

const { THREE, M, B, zone, W, CX, CY, scene, camera, renderer, controls, pieces, pieceGroups, inRing, inWall, mesh, rbox } = api;
const V3 = THREE.Vector3, CUT = api.CUT;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ samples
// L = how light it is, warm = cool (-1) to warm (+1), soft = how soft it looks. The
// meter reads the room from these. Colours are concept options; the defaults are the
// palette the diorama already used, extended from her finished rooms.
const SAMPLES = [
  { id: 'teak',      cat: 'wood',   name: 'Teak',             c: 0x8A5A32, dark: 0x3E2413, L: .42, warm: .75, soft: .45 },
  { id: 'walnut',    cat: 'wood',   name: 'Walnut',           c: 0x6A4731, dark: 0x2E1C10, L: .32, warm: .5,  soft: .45 },
  { id: 'oak',       cat: 'wood',   name: 'Natural oak',      c: 0xB08F6A, dark: 0x6E5843, L: .6,  warm: .5,  soft: .45 },
  { id: 'ash',       cat: 'wood',   name: 'White ash',        c: 0xE0D3BE, dark: 0xB09E82, L: .84, warm: .15, soft: .4 },
  { id: 'smoked',    cat: 'wood',   name: 'Smoked oak',       c: 0x5A4636, dark: 0x2A1F17, L: .28, warm: .2,  soft: .4 },
  { id: 'wenge',     cat: 'wood',   name: 'Wenge',            c: 0x3A2B22, dark: 0x15100C, L: .15, warm: 0,   soft: .35 },
  { id: 'botticino', cat: 'stone',  name: 'Botticino marble', c: 0xDCCFBC, vein: 0xA88E6E, L: .8,  warm: .35, soft: .1, tile: 0.8 },
  { id: 'bianco',    cat: 'stone',  name: 'Bianco marble',    c: 0xEEE9E0, vein: 0xB8AD9A, veins: 7, L: .9, warm: .15, soft: .1 },
  { id: 'statuario', cat: 'stone',  name: 'Statuario marble', c: 0xF2F0EC, vein: 0x8F8D89, veins: 4, L: .94, warm: 0, soft: .05, cc: .6 },
  { id: 'travertine',cat: 'stone',  name: 'Travertine',       c: 0xD8C4A4, kind: 'travertine', L: .74, warm: .45, soft: .25 },
  { id: 'jaisalmer', cat: 'stone',  name: 'Jaisalmer stone',  c: 0xD3AF6E, vein: 0xB08A4E, veins: 2, L: .66, warm: .75, soft: .2, rough: .4, cc: .1 },
  { id: 'kota',      cat: 'stone',  name: 'Kota stone',       c: 0x7B847F, vein: 0x69716D, veins: 0, L: .44, warm: -.3, soft: .15, tile: 0.6, rough: .35, cc: .15 },
  { id: 'terrazzo',  cat: 'stone',  name: 'Terrazzo',         c: 0xD9CDBA, kind: 'terrazzo', L: .78, warm: .2, soft: .2 },
  { id: 'nero',      cat: 'stone',  name: 'Nero marquina',    c: 0x1F1E1D, vein: 0xE6E1D8, veins: 6, L: .1, warm: -.1, soft: .05, cc: .6 },
  { id: 'oat',       cat: 'fabric', name: 'Oat linen',        c: 0xB7A993, L: .66, warm: .35, soft: .75 },
  { id: 'ivory',     cat: 'fabric', name: 'Ivory bouclé',     c: 0xE9E2D4, kind: 'boucle', L: .88, warm: .2, soft: 1 },
  { id: 'grey',      cat: 'fabric', name: 'Grey wool',        c: 0x8E9094, L: .55, warm: -.2, soft: .75 },
  { id: 'rust',      cat: 'fabric', name: 'Rust wool',        c: 0x8C5A3C, L: .38, warm: .85, soft: .8 },
  { id: 'mustard',   cat: 'fabric', name: 'Mustard velvet',   c: 0xB8862A, kind: 'velvet', L: .52, warm: .9, soft: .9 },
  { id: 'olive',     cat: 'fabric', name: 'Olive velvet',     c: 0x5A5C37, kind: 'velvet', L: .3, warm: .2, soft: .9 },
  { id: 'ink',       cat: 'fabric', name: 'Ink velvet',       c: 0x263045, kind: 'velvet', L: .18, warm: -.6, soft: .9 },
  { id: 'cognac',    cat: 'fabric', name: 'Cognac leather',   c: 0x8E5530, kind: 'leather', L: .4, warm: .75, soft: .4 },
  { id: 'warmwhite', cat: 'paint',  name: 'Warm white',       c: 0xEDE6DA, L: .9,  warm: .25, soft: .3 },
  { id: 'chalk',     cat: 'paint',  name: 'Chalk white',      c: 0xF4F2EC, L: .95, warm: 0,   soft: .3 },
  { id: 'sand',      cat: 'paint',  name: 'Sand limewash',    c: 0xD8C3A2, kind: 'limewash', L: .76, warm: .55, soft: .5 },
  { id: 'sage',      cat: 'paint',  name: 'Sage',             c: 0xA3AD94, L: .66, warm: -.1, soft: .35 },
  { id: 'terracotta',cat: 'paint',  name: 'Terracotta',       c: 0xB06848, kind: 'limewash', L: .45, warm: .9, soft: .45 },
  { id: 'dusk',      cat: 'paint',  name: 'Dusty blue',       c: 0x7C8E9F, L: .55, warm: -.5, soft: .3 },
  { id: 'taupe',     cat: 'paint',  name: 'Taupe',            c: 0x8A7F72, L: .48, warm: .2,  soft: .3 },
  { id: 'forest',    cat: 'paint',  name: 'Deep green',       c: 0x33443A, L: .2,  warm: -.2, soft: .35 },
  { id: 'charcoal',  cat: 'paint',  name: 'Charcoal',         c: 0x3A3937, L: .17, warm: -.1, soft: .3 },
  // the finishes of her four bedrooms, read off her renders: each room opens with these
  { id: 'beigemarble', cat: 'stone', name: 'Beige marble',    c: 0xE4D6C6, vein: 0xB39A7E, L: .82, warm: .4, soft: .1, tile: 0.8 },
  { id: 'dovemarble', cat: 'stone', name: 'Dove grey marble', c: 0xDCD9D4, vein: 0xA7A29B, L: .84, warm: -.05, soft: .1, tile: 0.8 },
  { id: 'darkoak',   cat: 'wood',   name: 'Dark oak',         c: 0x5E4A3A, dark: 0x2A1F17, L: .26, warm: .35, soft: .45 },
  { id: 'dove',      cat: 'fabric', name: 'Dove grey linen',  c: 0xBAB6AF, L: .7,  warm: 0,   soft: .75 },
  { id: 'stone',     cat: 'fabric', name: 'Stone linen',      c: 0xD6CDBF, L: .8,  warm: .25, soft: .75 },
  { id: 'blush',     cat: 'fabric', name: 'Blush bouclé',     c: 0xC9A897, kind: 'boucle', L: .64, warm: .6, soft: 1 },
  { id: 'navy',      cat: 'fabric', name: 'Navy linen',       c: 0x2F3743, L: .16, warm: -.6, soft: .75 },
  { id: 'rosewash',  cat: 'fabric', name: 'Rose rug',         c: 0xCDBDB2, vein: 0x9A8274, kind: 'marbled', rug: true, L: .72, warm: .45, soft: .8 },
  { id: 'swirl',     cat: 'fabric', name: 'Grey swirl rug',   c: 0xD9D6D1, vein: 0x7C7873, kind: 'marbled', rug: true, L: .8, warm: 0, soft: .8 },
  { id: 'agate',     cat: 'fabric', name: 'Agate rug',        c: 0xE7DCCB, vein: 0x6E4A2C, kind: 'marbled', rug: true, L: .74, warm: .5, soft: .8 },
  { id: 'linen',     cat: 'paint',  name: 'Linen white',      c: 0xE4DED3, L: .87, warm: .25, soft: .3 },
  { id: 'pebble',    cat: 'paint',  name: 'Pebble grey',      c: 0xB8B3AC, L: .68, warm: 0,   soft: .3 },
  { id: 'greige',    cat: 'paint',  name: 'Greige',           c: 0xB9AD9D, L: .66, warm: .3,  soft: .3 },
  // a flat's own finishes (flat.json `samples`, colours as '#rrggbb'), e.g. what is there today
  ...(api.flat.samples || []).map(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : v]))),
];
const SAMPLE = Object.fromEntries(SAMPLES.map(s => [s.id, s]));
const CATS = [['wood', 'Wood'], ['stone', 'Stone'], ['fabric', 'Fabric'], ['paint', 'Paint']];

// the surfaces a sample can go on, and which material each one drives
M.rug ||= new THREE.MeshPhysicalMaterial({ roughness: 0.95 });
const SLOTS = {
  floor:      { name: 'Floor', the: 'the floor', cats: ['wood', 'stone'], mat: 'floor' },
  walls:      { name: 'Walls', the: 'the walls', cats: ['paint', 'stone'], mat: 'walls' },
  joinery:    { name: 'Joinery fronts', the: 'kitchen and cupboard fronts', cats: ['paint', 'wood'], mat: 'shutters' },
  worktop:    { name: 'Worktops', the: 'worktops and table tops', cats: ['stone'], mat: 'top' },
  upholstery: { name: 'Upholstery', the: 'the sofas and chairs', cats: ['fabric'], mat: 'fabric' },
  accent:     { name: 'Cushions', the: 'cushions and bench seats', cats: ['fabric'], mat: 'accent' },
  woodwork:   { name: 'Woodwork', the: 'tables, chair frames and the TV unit', cats: ['wood'], mat: 'walnut' },
  doors:      { name: 'Doors', the: 'the doors', cats: ['wood', 'paint'], mat: 'door' },
  rug:        { name: 'Rugs', the: 'the rugs', cats: ['fabric'], mat: 'rug' },
};
// Original: the flat's own finishes from flat.json `original` (what is there today, or
// the architect's specification); any surface it leaves out takes a quiet default.
const DEFAULTS = { floor: 'oak', walls: 'warmwhite', joinery: 'teak', worktop: 'bianco', upholstery: 'stone',
                   accent: 'rust', woodwork: 'walnut', doors: 'teak', rug: 'ivory', ...(api.flat.original || {}) };
// Each bedroom has its own slots, keyed '<room>.<surface>', on its own materials and
// starting from her finishes. In a bedroom, the tray, presets and meter work on that
// room; in the whole-flat view, on the flat's shared surfaces.
const ROOM_SLOT = {
  floor:      { name: 'Floor', thing: 'floor', cats: ['wood', 'stone'] },
  walls:      { name: 'Walls', thing: 'walls', cats: ['paint', 'stone'] },
  feature:    { name: 'Feature wall', thing: 'feature wall', cats: ['paint', 'wood', 'stone'] },
  upholstery: { name: 'Upholstery', thing: 'bed and chairs', cats: ['fabric'] },
  accent:     { name: 'Accents', thing: 'cushions and accents', cats: ['fabric'] },
  joinery:    { name: 'Wardrobe fronts', thing: 'wardrobe', cats: ['paint', 'wood'] },
  woodwork:   { name: 'Woodwork', thing: 'woodwork', cats: ['wood'] },
  rug:        { name: 'Rug', thing: 'rug', cats: ['fabric'] },
};
for (const d of api.bedroomSlots) {
  const k = `${d.rid}.${d.base}`, t = ROOM_SLOT[d.base], room = zone.rooms.find(r => r.id === d.rid).name;
  SLOTS[k] = { name: t.name, the: `the ${room} ${t.thing}`, cats: t.cats, mat: d.mat, room: d.rid };
  DEFAULTS[k] = d.def;
}
const baseOf = (slot) => slot.split('.').pop();
// a flat-wide surface key, read in the room on screen when that room has its own
const scoped = (k) => { const f = api.focused, rk = f && `${f.id}.${k}`; return rk && SLOTS[rk] ? rk : k; };
const inScope = () => { const f = api.focused; return Object.keys(SLOTS).filter(k => f && SLOTS[`${f.id}.floor`] ? SLOTS[k].room === f.id : !SLOTS[k].room); };
const FIRST_SLOT = { wood: 'floor', stone: 'floor', paint: 'walls', fabric: 'upholstery' };
/* Client-facing floor and wall choices stay within the quiet material language of
   the project. The larger library remains available for joinery, worktops and soft
   furnishings, but saturated green, blue, yellow and novelty dark floors are not
   offered for the two largest surfaces. */
const CURATED_SURFACES = {
  floor: new Set(['beigetile', 'teak', 'walnut', 'oak', 'ash', 'smoked', 'darkoak',
                  'botticino', 'bianco', 'statuario', 'travertine', 'terrazzo', 'beigemarble', 'dovemarble']),
  walls: new Set(['warmwhite', 'chalk', 'sand', 'taupe', 'linen', 'pebble', 'greige',
                  'botticino', 'bianco', 'travertine'])
};
// rug patterns go only on rugs
const allowedOn = (slot, id) => { const b = baseOf(slot); return (!CURATED_SURFACES[b] || CURATED_SURFACES[b].has(id)) && (!SAMPLE[id]?.rug || b === 'rug'); };
const MAT2SLOT = new Map(Object.entries(SLOTS).map(([k, s]) => [M[s.mat], k]));
const LOCKED = new Set([M.tlt3wall, M.t3walnut, M.terrazzo]);

// ------------------------------------------------------------------ finishes
// A finish is a colour texture plus a relief map read off it, and physical values:
// fabrics get sheen, polished stone and lacquer a clearcoat. Pattern and scale follow
// the surface: wood on a floor is laid planks, on a table it is long grain.
const texCache = new Map();
function finishFor(s, room_slot) {
  const slot = baseOf(room_slot), key = s.id + ':' + slot;
  if (texCache.has(key)) return texCache.get(key);
  const seed = [...s.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) & 0xffff;
  let map, rough = 0.6, cc = 0, ccr = 0.2, sheen = 0, sheenR = 0.6, ns = 0.4, str = 2;
  if (s.cat === 'wood') {
    const o = { base: s.c, dark: s.dark, seed };
    if (slot === 'floor') { map = wood({ ...o, plank: 0.19, length: 1.6, ends: true }); rough = 0.36; cc = 0.25; ns = 0.35; }
    else if (slot === 'joinery') { map = wood({ ...o, plank: 0.6, length: 0.9 }); rough = 0.45; cc = 0.1; }
    else if (slot === 'doors') { map = wood({ ...o, plank: 0.9, length: 2.1 }); rough = 0.55; }
    else { map = wood({ ...o, plank: 0.3, length: 1.8 }); rough = 0.5; cc = 0.12; }
    str = 2.5;
  } else if (s.cat === 'stone') {
    const tile = slot === 'floor' ? (s.tile || 0.8) : slot === 'walls' ? 1.2 : 1.4, joint = slot !== 'worktop';
    if (s.kind === 'travertine') { map = travertine({ base: s.c, tile, seed }); rough = 0.5; }
    else if (s.kind === 'terrazzo') { map = terrazzo({ base: s.c, tile: 0.6, seed }); rough = 0.32; cc = 0.2; }
    else { map = marble({ base: s.c, vein: s.vein, tile, joint, veins: s.veins ?? 5, seed }); rough = s.rough ?? 0.18; cc = s.cc ?? 0.4; ccr = 0.08; }
    ns = 0.2; str = 1.5;
  } else if (s.cat === 'fabric') {
    const k = s.kind || 'weave';
    map = k === 'boucle' ? boucle({ base: s.c, seed }) : k === 'velvet' ? velvet({ base: s.c, seed })
        : k === 'leather' ? leather({ base: s.c, seed })
        : k === 'marbled' ? marble({ base: s.c, vein: s.vein, joint: false, veins: 12, tile: 1.2, seed })
        : k === 'persian' ? persian({ base: s.c, seed })
        : fabric({ base: s.c, seed });
    rough = k === 'leather' ? 0.5 : 0.92;
    sheen = k === 'velvet' ? 1 : k === 'leather' ? 0 : 0.45; sheenR = k === 'velvet' ? 0.35 : 0.7;
    cc = k === 'leather' ? 0.2 : 0; ns = k === 'velvet' ? 0.3 : 0.9; str = k === 'boucle' ? 5 : 3.5;
  } else {
    if (slot === 'joinery') { map = shutter({ base: s.c, seed }); rough = 0.36; cc = 0.25; ns = 0.5; str = 3; }
    else if (slot === 'feature') { map = paint({ base: s.c, seed }); rough = 0.8; ns = 0.3; str = 3; }
    else if (s.kind === 'limewash') { map = limewash({ base: s.c, seed }); rough = 0.95; ns = 0.5; str = 3; }
    else { map = paint({ base: s.c, seed }); rough = slot === 'doors' ? 0.55 : 0.9; ns = 0.3; str = 3; }
  }
  // the relief map is made the first time the finish goes on a surface; a tray swatch
  // only needs the colour
  let relief = null;
  const f = { map, get normalMap() { return relief ??= normalFrom(map, str); }, rough, cc, ccr, sheen, sheenR, ns,
              sheenColor: new THREE.Color(s.c).lerp(new THREE.Color(0xffffff), 0.45) };
  texCache.set(key, f);
  return f;
}

const state = { f: {}, t: 10.5, c: {}, p: {} };
const DEFAULT_T = 10.5;
function setSlot(slot, id) {
  const s = SAMPLE[id], m = M[SLOTS[slot].mat];
  if (!s) return;
  const f = finishFor(s, slot);
  m.map = f.map; m.normalMap = f.normalMap; m.normalScale.set(f.ns, f.ns);
  m.color.set(0xffffff); m.metalness = 0; m.roughness = f.rough;
  m.clearcoat = f.cc; m.clearcoatRoughness = f.ccr;
  m.sheen = f.sheen; m.sheenRoughness = f.sheenR; m.sheenColor.copy(f.sheenColor);
  m.needsUpdate = true;
  state.f[slot] = id;
  api.wake();
}

// ------------------------------------------------------------------ new pieces
// What the Furniture tray adds. None of these are in her layout; they are marked
// "added here" wherever they appear.
M.shade = new THREE.MeshPhysicalMaterial({ color: 0xEFE4CF, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xFFB35C, emissiveIntensity: 0 });
M.leaf = new THREE.MeshPhysicalMaterial({ color: 0x3C5A32, roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(0x9DBB84), side: THREE.DoubleSide });
M.leaf2 = new THREE.MeshPhysicalMaterial({ color: 0x55743F, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xA9C58E), side: THREE.DoubleSide });
M.pot = new THREE.MeshPhysicalMaterial({ color: 0xA9694A, roughness: 0.85 });
M.soil = new THREE.MeshStandardMaterial({ color: 0x2A2019, roughness: 1 });
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function at(p) { const g = new THREE.Group(), c = W(p.obb.cx, p.obb.cy); g.position.set(c.x, 0, c.z); g.rotation.y = p.obb.angle; return g; }
B.sofa3 = (p) => B.sofa(p, 3);
B.rug = (p) => {
  const g = at(p), o = p.obb;
  const r = mesh(rbox(o.w, 0.014, o.d, 0.006), M.rug, 0, 0.007, 0); r.castShadow = false; g.add(r);
  return g;
};
B.pouf = (p) => {
  const g = at(p), r = Math.min(p.obb.w, p.obb.d) / 2;
  const m = mesh(new THREE.SphereGeometry(1, 40, 20), M.accent, 0, 0.21, 0); m.scale.set(r, 0.21, r); g.add(m);
  return g;
};
B.floor_lamp = (p) => {
  const g = at(p);
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.025, 40), M.brass, 0, 0.0125, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.42, 12), M.brass, 0, 0.72, 0));
  const shade = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.3, 40, 1, true), M.shade, 0, 1.5, 0);
  shade.castShadow = false; g.add(shade);
  const light = new THREE.PointLight(0xFFB766, 0, 5.5, 2); light.position.set(0, 1.4, 0); light.userData.lamp = true;
  g.add(light);
  return g;
};
B.plant = (p) => {
  const g = at(p), r = rng(p.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 3));
  g.add(mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.36, 36), M.pot, 0, 0.18, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.02, 36), M.soil, 0, 0.35, 0));
  const leafGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, h = 0.55 + r() * 0.85, out = 0.08 + r() * 0.26 * (h / 1.4);
    const stem = mesh(new THREE.CylinderGeometry(0.006, 0.008, h - 0.3, 5), M.leaf2, Math.cos(a) * out / 2, 0.35 + (h - 0.35) / 2, Math.sin(a) * out / 2);
    stem.rotation.z = -Math.cos(a) * out / h; stem.rotation.x = Math.sin(a) * out / h; stem.castShadow = false; g.add(stem);
    const leaf = mesh(leafGeo, r() < 0.5 ? M.leaf : M.leaf2, Math.cos(a) * out, h, Math.sin(a) * out);
    leaf.scale.set(0.07 + r() * 0.03, 0.008, 0.15 + r() * 0.06);
    leaf.rotation.set(-0.5 - r() * 0.5, -a + Math.PI / 2, 0, 'YXZ');
    g.add(leaf);
  }
  return g;
};
// ---- more of the library: pieces a flat like this one is furnished with, drawn in the
// flat's own style and wearing its shared finishes (woodwork, upholstery, joinery).
// Local +Z is the piece's front.
const P = (g, w, h, d, x, y, z, mat, r = 0.008) => { const m = mesh(rbox(w, h, d, r), mat, x, y, z); g.add(m); return m; };
const cyl = (g, r0, r1, h, x, y, z, mat, seg = 16) => { const m = mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z); g.add(m); return m; };
M.piano = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
M.keys = new THREE.MeshPhysicalMaterial({ color: 0xF4F1EA, roughness: 0.3 });
M.linen = new THREE.MeshPhysicalMaterial({ color: 0xF1EEE8, roughness: 0.95, sheen: 0.4, sheenColor: new THREE.Color(0xFFFFFF) });
M.vase = new THREE.MeshPhysicalMaterial({ color: 0xC9B79C, roughness: 0.7 });
M.stems = new THREE.MeshStandardMaterial({ color: 0xB89A6A, roughness: 0.9 });
const BOOKS = [0x7A5A3E, 0x3F4A52, 0xB9A487, 0x6E3B2E, 0xD8CFC0, 0x2F3A2F].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
// a wall mandir: a shuttered base, an open niche under a brass arch, a brass jaali back
B.pooja = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d, top = 0.78, H = 0.92, nd = 0.3, nz = -d / 2 + nd / 2;
  P(g, w - 0.02, 0.06, d - 0.04, 0, 0.03, -0.01, M.toekick, 0.004);
  P(g, w, 0.72, d, 0, 0.06 + 0.36, 0, M.walnut, 0.01);
  P(g, 0.004, 0.62, 0.004, 0, 0.42, d / 2 + 0.001, M.toekick, 0.001);
  for (const sx of [-1, 1]) P(g, 0.06, H, nd, sx * (w / 2 - 0.03), top + H / 2, nz, M.walnut, 0.008);
  P(g, w + 0.02, 0.08, nd + 0.03, 0, top + H + 0.04, nz + 0.01, M.walnut, 0.01);
  P(g, w - 0.12, H, 0.012, 0, top + H / 2, -d / 2 + 0.006, M.brass, 0.003);
  const r = (w - 0.12) / 2, arch = mesh(new THREE.TorusGeometry(r, 0.016, 8, 32, Math.PI), M.brass, 0, top + H - r - 0.03, nz + nd / 2 - 0.02); g.add(arch);
  cyl(g, 0.03, 0.02, 0.03, 0, top + 0.015, nz + 0.06, M.brass);                        // a diya
  return g;
};
B.bookshelf = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d, H = 1.9, r = rng(7);
  for (const sx of [-1, 1]) P(g, 0.025, H, d, sx * (w / 2 - 0.0125), H / 2, 0, M.walnut, 0.004);
  for (let i = 0; i < 6; i++) P(g, w - 0.05, 0.022, d - 0.01, 0, 0.04 + i * 0.365, 0, M.walnut, 0.003);
  for (let s = 0; s < 5; s++) {
    let x = -w / 2 + 0.04;
    while (x < w / 2 - 0.12) {
      const bw = 0.025 + r() * 0.03, bh = 0.2 + r() * 0.1;
      if (r() < 0.12) { x += 0.08; continue; }
      P(g, bw, bh, d * 0.75, x + bw / 2, 0.051 + s * 0.365 + bh / 2, 0.01, BOOKS[Math.floor(r() * BOOKS.length)], 0.002);
      x += bw + 0.003;
    }
  }
  return g;
};
B.sideboard = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.014, 0.01, 0.14, sx * (w / 2 - 0.06), 0.07, sz * (d / 2 - 0.06), M.brass, 10);
  P(g, w, 0.6, d, 0, 0.44, 0, M.walnut, 0.01);
  for (const k of [-1, 1]) P(g, 0.004, 0.54, 0.004, k * w / 6, 0.44, d / 2 + 0.001, M.toekick, 0.001);
  P(g, w + 0.01, 0.025, d + 0.01, 0, 0.7525, 0, M.top, 0.004);
  return g;
};
B.console = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  P(g, w, 0.03, d, 0, 0.785, 0, M.walnut, 0.006);
  P(g, w - 0.08, 0.02, d - 0.06, 0, 0.18, 0, M.walnut, 0.004);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.012, 0.012, 0.77, sx * (w / 2 - 0.04), 0.385, sz * (d / 2 - 0.04), M.brass, 10);
  return g;
};
B.desk = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  P(g, w, 0.03, d, 0, 0.745, 0, M.walnut, 0.006);
  for (const sx of [-1, 1]) P(g, 0.03, 0.73, d - 0.04, sx * (w / 2 - 0.03), 0.365, 0, M.lacquer, 0.004);
  P(g, 0.4, 0.14, d - 0.08, w / 2 - 0.25, 0.66, 0.0, M.lacquer, 0.004);
  return g;
};
B.desk_chair = (p) => {
  const g = at(p);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.014, 0.012, 0.45, sx * 0.2, 0.225, sz * 0.19, M.walnut, 10);
  P(g, 0.46, 0.06, 0.44, 0, 0.47, 0.01, M.fabric, 0.02);
  const back = P(g, 0.44, 0.34, 0.05, 0, 0.72, -0.2, M.fabric, 0.02); back.rotation.x = -0.1;
  return g;
};
B.nightstand = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.012, 0.009, 0.14, sx * (w / 2 - 0.04), 0.07, sz * (d / 2 - 0.04), M.walnut, 10);
  P(g, w, 0.36, d, 0, 0.32, 0, M.lacquer, 0.01);
  P(g, w - 0.03, 0.004, 0.004, 0, 0.38, d / 2 + 0.001, M.toekick, 0.001);
  P(g, w + 0.004, 0.02, d + 0.004, 0, 0.51, 0, M.walnut, 0.004);
  return g;
};
B.dresser = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  P(g, w - 0.03, 0.08, d - 0.04, 0, 0.04, -0.01, M.toekick, 0.004);
  P(g, w, 0.76, d, 0, 0.46, 0, M.lacquer, 0.008);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
    const x = (i - 0.5) * w / 2, y = 0.08 + 0.76 * (j + 0.5) / 3;
    P(g, w / 2 - 0.01, 0.76 / 3 - 0.008, 0.012, x, y, d / 2 + 0.002, M.lacquer, 0.003);
    cyl(g, 0.012, 0.012, 0.02, x, y, d / 2 + 0.016, M.brass, 10).rotation.x = Math.PI / 2;
  }
  return g;
};
B.ottoman = (p) => {
  const g = at(p), r = Math.min(p.obb.w, p.obb.d) / 2;
  cyl(g, r, r, 0.4, 0, 0.2, 0, M.accent, 40);
  return g;
};
B.chaise = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.014, 0.01, 0.12, sx * (w / 2 - 0.08), 0.06, sz * (d / 2 - 0.08), M.brass, 10);
  P(g, w, 0.22, d, 0, 0.23, 0, M.fabric, 0.05);
  const back = P(g, 0.5, 0.45, d - 0.04, -w / 2 + 0.3, 0.46, 0, M.fabric, 0.08); back.rotation.z = -0.55;
  P(g, 0.4, 0.12, 0.3, -w / 2 + 0.45, 0.44, 0, M.accent, 0.05);
  return g;
};
B.lounger = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d, n = 11;
  for (const sx of [-1, 1]) P(g, w, 0.05, 0.04, 0, 0.18, sx * (d / 2 - 0.02), M.walnut, 0.006);
  for (let i = 0; i < n; i++) P(g, (w * 0.62) / n - 0.012, 0.02, d - 0.02, w / 2 - (w * 0.62) * (i + 0.5) / n, 0.22, 0, M.walnut, 0.004);
  const back = P(g, w * 0.36, 0.02, d - 0.02, -w / 2 + w * 0.2, 0.36, 0, M.walnut, 0.004); back.rotation.z = -0.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.04, 0.16, 0.04, sx * (w / 2 - 0.06), 0.08, sz * (d / 2 - 0.02), M.walnut, 0.004);
  P(g, w * 0.6, 0.05, d - 0.08, w * 0.18, 0.255, 0, M.linen, 0.02);
  return g;
};
B.floor_vase = (p) => {
  const g = at(p), r = Math.min(p.obb.w, p.obb.d) / 2;
  const pts = [[0, 0], [r * 0.7, 0], [r, 0.2], [r * 0.9, 0.5], [r * 0.45, 0.72], [r * 0.5, 0.78], [0, 0.78]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(mesh(new THREE.LatheGeometry(pts, 32), M.vase));
  const rr = rng(11);
  for (let i = 0; i < 9; i++) {
    const a = rr() * Math.PI * 2, h = 0.6 + rr() * 0.5, s = cyl(g, 0.004, 0.006, h, Math.cos(a) * 0.03, 0.72 + h / 2, Math.sin(a) * 0.03, M.stems, 5);
    s.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); s.castShadow = false;
  }
  return g;
};
B.piano = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  P(g, w, 1.22, d * 0.45, 0, 0.61, -d / 2 + d * 0.225, M.piano, 0.01);
  P(g, w, 0.06, d * 0.4, 0, 0.72, d * 0.02, M.piano, 0.006);
  P(g, w - 0.14, 0.015, 0.14, 0, 0.757, d * 0.06, M.keys, 0.003);
  for (const sx of [-1, 1]) P(g, 0.06, 0.7, 0.06, sx * (w / 2 - 0.05), 0.35, d * 0.15, M.piano, 0.006);
  return g;
};
B.crib = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d, H = 0.95;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(g, 0.04, H, 0.04, sx * (w / 2 - 0.02), H / 2, sz * (d / 2 - 0.02), M.lacquer, 0.006);
  for (const sz of [-1, 1]) {
    for (const y of [0.3, H - 0.03]) P(g, w - 0.04, 0.03, 0.03, 0, y, sz * (d / 2 - 0.02), M.lacquer, 0.004);
    for (let i = 1; i < 12; i++) cyl(g, 0.009, 0.009, H - 0.33, -w / 2 + w * i / 12, 0.3 + (H - 0.33) / 2, sz * (d / 2 - 0.02), M.lacquer, 8);
  }
  for (const sx of [-1, 1]) P(g, 0.03, H - 0.3, d - 0.04, sx * (w / 2 - 0.02), 0.3 + (H - 0.3) / 2, 0, M.lacquer, 0.004);
  P(g, w - 0.08, 0.1, d - 0.08, 0, 0.35, 0, M.linen, 0.03);
  return g;
};
B.shoe_cabinet = (p) => {
  const g = at(p), w = p.obb.w, d = p.obb.d;
  P(g, w - 0.03, 0.1, d - 0.04, 0, 0.05, -0.01, M.toekick, 0.004);
  P(g, w, 0.9, d, 0, 0.55, 0, M.shutters, 0.006);
  for (const y of [0.4, 0.7]) P(g, w - 0.02, 0.004, 0.004, 0, y, d / 2 + 0.001, M.toekick, 0.001);
  P(g, w + 0.01, 0.025, d + 0.01, 0, 1.0125, 0, M.walnut, 0.004);
  return g;
};
// `tags` are what the search box also matches
const CATALOGUE = [
  { type: 'sofa3', name: 'Sofa', w: 2.1, d: 0.92, tags: 'couch seating living' },
  { type: 'armchair', name: 'Armchair', w: 0.85, d: 0.85, tags: 'chair seating' },
  { type: 'chaise', name: 'Chaise', w: 1.6, d: 0.7, tags: 'daybed lounge divan' },
  { type: 'ottoman', name: 'Ottoman', w: 0.6, d: 0.6, tags: 'footstool pouffe seat' },
  { type: 'coffee_table', name: 'Coffee table', w: 1.1, d: 0.6, tags: 'centre table living' },
  { type: 'side_table', name: 'Side table', w: 0.5, d: 0.5, tags: 'end table' },
  { type: 'pouf', name: 'Pouf', w: 0.55, d: 0.55, tags: 'pouffe stool' },
  { type: 'bench', name: 'Bench', w: 1.3, d: 0.42, tags: 'seat entry' },
  { type: 'console', name: 'Console table', w: 1.2, d: 0.35, tags: 'hall entry foyer table' },
  { type: 'sideboard', name: 'Sideboard', w: 1.6, d: 0.45, tags: 'buffet credenza crockery storage' },
  { type: 'bookshelf', name: 'Bookshelf', w: 0.9, d: 0.35, tags: 'books shelves library storage' },
  { type: 'pooja', name: 'Pooja unit', w: 0.9, d: 0.45, tags: 'mandir temple prayer puja' },
  { type: 'dining_chair', name: 'Dining chair', w: 0.5, d: 0.5, tags: 'chair' },
  { type: 'stool', name: 'Bar stool', w: 0.45, d: 0.45, tags: 'counter seat' },
  { type: 'desk', name: 'Study desk', w: 1.2, d: 0.6, tags: 'work table study office' },
  { type: 'desk_chair', name: 'Desk chair', w: 0.55, d: 0.55, tags: 'study office chair' },
  { type: 'nightstand', name: 'Nightstand', w: 0.5, d: 0.4, tags: 'bedside table' },
  { type: 'dresser', name: 'Dresser', w: 1.2, d: 0.5, tags: 'chest of drawers storage bedroom' },
  { type: 'crib', name: 'Crib', w: 1.3, d: 0.7, tags: 'cot baby nursery' },
  { type: 'shoe_cabinet', name: 'Shoe cabinet', w: 1.0, d: 0.35, tags: 'shoes foyer entry storage' },
  { type: 'piano', name: 'Upright piano', w: 1.5, d: 0.6, tags: 'music' },
  { type: 'lounger', name: 'Sun lounger', w: 1.9, d: 0.7, tags: 'balcony outdoor deck chair' },
  { type: 'rug', name: 'Rug', w: 2.4, d: 1.7, tags: 'carpet dhurrie' },
  { type: 'floor_lamp', name: 'Floor lamp', w: 0.45, d: 0.45, tags: 'light lighting' },
  { type: 'plant', name: 'Plant', w: 0.6, d: 0.6, tags: 'green planter pot' },
  { type: 'floor_vase', name: 'Floor vase', w: 0.35, d: 0.35, tags: 'decor dried flowers' },
];

// ------------------------------------------------------------------ real products
// Kohler basins and rain showers, the balcony and washroom tiles, dining sets: see
// products.js. Their choices sit in state.p (keys like 'basin.tlt1'), in the link.
const PR = createProducts(api);

// ------------------------------------------------------------------ furniture rules
// A piece has to stand inside a room that is open to change (not her bedrooms, not
// Toilet 3), clear of the walls, and not through another piece. Pairs that already
// overlap in her drawing (the nesting tables, chairs tucked under the table) may keep
// doing so. Moves snap to 10 cm from where the piece started, so a piece she lined up
// with a wall stays lined up; turns go in 15 degree steps.
const OPEN = zone.rooms.filter(r => !r.designed || r.model);
const area = (ring) => Math.abs(ring.reduce((a, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return a + x * y2 - x2 * y; }, 0) / 2);
function roomAt(x, y) { return zone.rooms.filter(r => inRing([x, y], r.outline)).sort((a, b) => area(a.outline) - area(b.outline))[0] || null; }
function corners(q, w, d, shrink = 0) {
  const c = Math.cos(q.angle), s = Math.sin(q.angle), hw = Math.max(0.01, w / 2 - shrink), hd = Math.max(0.01, d / 2 - shrink);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [q.cx + u * c - v * s, q.cy + u * s + v * c]);
}
function samples(q, w, d, shrink) {
  const k = corners(q, w, d, shrink), pts = [...k, [q.cx, q.cy]];
  for (let i = 0; i < 4; i++) pts.push([(k[i][0] + k[(i + 1) % 4][0]) / 2, (k[i][1] + k[(i + 1) % 4][1]) / 2]);
  return pts;
}
function overlap(A, Bq) {
  for (const P of [A, Bq]) for (let i = 0; i < 4; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4], nx = y1 - y2, ny = x2 - x1;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of A) { const t = x * nx + y * ny; a0 = Math.min(a0, t); a1 = Math.max(a1, t); }
    for (const [x, y] of Bq) { const t = x * nx + y * ny; b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}
const pose = (p) => p.pose || (p.pose = { cx: p.obb.cx, cy: p.obb.cy, angle: p.obb.angle });
const pairKey = (a, b) => a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
const allowed = new Set();
for (let i = 0; i < zone.pieces.length; i++) for (let j = i + 1; j < zone.pieces.length; j++) {
  const a = zone.pieces[i], b = zone.pieces[j];
  if (overlap(corners(a.obb, a.obb.w, a.obb.d, 0.02), corners(b.obb, b.obb.w, b.obb.d, 0.02))) allowed.add(pairKey(a, b));
}
// the bedrooms' fixed joinery (wardrobes, desks, wall-hung tables), and which pieces
// already overlap it in her layout (a chair tucked under a desk)
const fixedBoxes = api.obstacles.map(o => corners(o, o.w, o.d, 0.02));
const fixedOk = new Set();
for (const p of zone.pieces) fixedBoxes.forEach((b, i) => { if (overlap(corners(p.obb, p.obb.w, p.obb.d, 0.02), b)) fixedOk.add(p.id + '|' + i); });
// why a piece cannot stand at q (null when it can), said to the viewer while dragging
function whyNot(p, q) {
  const pts = samples(q, p.obb.w, p.obb.d, 0.05);
  if (pts.some(pt => inWall(pt))) return 'It would go into a wall';
  if (!pts.every(pt => OPEN.some(r => inRing(pt, r.outline)))) return 'It has to stand inside an open room';
  if (p.type === 'rug') return null;
  const mine = corners(q, p.obb.w, p.obb.d, 0.02);
  if (fixedBoxes.some((b, i) => !fixedOk.has(p.id + '|' + i) && overlap(mine, b))) return 'Overlaps fitted joinery';
  for (const g of pieceGroups) {
    const o = g.userData.piece;
    if (o === p || g.userData.removed || o.type === 'rug' || allowed.has(pairKey(p, o))) continue;
    if (overlap(mine, corners(pose(o), o.obb.w, o.obb.d, 0.02))) return 'Overlaps other furniture';
  }
  return null;
}
const fits = (p, q) => !whyNot(p, q);
// Pull a piece flush against a wall it has come within 15 cm of, on any side, the way
// a piece of furniture is pushed back against a wall.
function snapFlush(p, q) {
  const c = Math.cos(q.angle), s = Math.sin(q.angle), hw = p.obb.w / 2, hd = p.obb.d / 2;
  const sides = [[c, s, hw, -s, c, hd], [-c, -s, hw, -s, c, hd], [-s, c, hd, c, s, hw], [s, -c, hd, c, s, hw]];
  let best = null;
  for (const [nx, ny, h, tx, ty, l] of sides) {
    let gap = Infinity;
    for (const k of [-0.8, 0, 0.8]) {
      const bx = q.cx + nx * h + tx * l * k, by = q.cy + ny * h + ty * l * k;
      for (let dd = -0.03; dd <= 0.15; dd += 0.01) if (inWall([bx + nx * dd, by + ny * dd])) { gap = Math.min(gap, dd); break; }
    }
    if (gap <= 0.15 && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { nx, ny, gap };
  }
  if (best) { const shift = best.gap - 0.012; q.cx += best.nx * shift; q.cy += best.ny * shift; }
  return q;
}
function setPose(pivot, q) {
  const p = pivot.userData.piece;
  p.pose = { cx: q.cx, cy: q.cy, angle: q.angle };
  const c = W(q.cx, q.cy);
  pivot.position.set(c.x, 0, c.z);
  pivot.rotation.y = q.angle - p.obb.angle;
  p.moved = !p.added && (Math.abs(q.cx - p.obb.cx) > 1e-3 || Math.abs(q.cy - p.obb.cy) > 1e-3 || Math.abs(q.angle - p.obb.angle) > 1e-3);
  // a moved piece belongs to the room it now stands in; one in place keeps her room
  const r = (p.moved || p.added) && roomAt(q.cx, q.cy);
  pivot.userData.home = r ? r.id : p.home;
}
function refreshVisibility() {
  const f = api.focused, members = f ? (f.members || [f.id]) : null;
  for (const g of pieceGroups) g.visible = !g.userData.removed && (!members || members.includes(g.userData.home));
}
const rectRing = (o) => { const k = corners(o, o.w, o.d); return [...k, k[0]]; };
let addN = 0;
function addPiece(type, q) {
  const c = CATALOGUE.find(i => i.type === type);
  if (!c) return null;
  const o = { cx: q.cx, cy: q.cy, w: c.w, d: c.d, angle: 0 };
  const p = { id: 'add' + (++addN), type, name: c.name, obb: o, footprint: rectRing(o), facing: null,
              added: true, movable: true, home: roomAt(q.cx, q.cy)?.id || null, room: null };
  const pivot = api.placePiece(p);
  setPose(pivot, { cx: q.cx, cy: q.cy, angle: q.angle || 0 });
  if (type === 'floor_lamp') relight();
  return pivot;
}
function dropAdded(g) {
  pieces.remove(g);
  pieceGroups.splice(pieceGroups.indexOf(g), 1);
}

// ------------------------------------------------------------------ daylight
// The sun follows its real path over Delhi (latitude 28.6 N, equinox, solar noon at
// about 12:20 IST), turned into the plan by her north arrow. Both are approximate.
// After dark there is no fixture light to show (her ceiling plan is not in yet), so the
// flat gets a generic warm fill and any floor lamps added here switch on.
const LAT = THREE.MathUtils.degToRad(28.6), NOON = 12.35;
const NORTH = (() => { const [x, y] = zone.north_sheet || [0, 1], l = Math.hypot(x, y); return [x / l, y / l]; })();
function sunAt(t) {
  const H = THREE.MathUtils.degToRad((t - NOON) * 15);
  const el = Math.asin(Math.cos(LAT) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT)) + Math.PI;     // compass bearing, clockwise from north
  return { el: THREE.MathUtils.radToDeg(el), az };
}
function planDir(az) {
  const [nx, ny] = NORTH, c = Math.cos(az), s = Math.sin(az);
  return [nx * c + ny * s, -nx * s + ny * c];
}
const glow = new THREE.HemisphereLight(0xFFC88E, 0x2A1D12, 0); scene.add(glow);
// a low sun sweeps the flat at a slant; widen the shadow box so the far rooms stay in it
Object.assign(api.sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13 });
api.sun.shadow.camera.updateProjectionMatrix();
const SUNSET = new THREE.Color(0xFFA062), NIGHTSKY = new THREE.Color(0x46557A);
function relight() {
  const { el, az } = sunAt(state.t), studio = api.studioOn;
  const day = smooth(-5, 8, el), low = 1 - smooth(3, 32, el);
  let [px, py] = planDir(az), sunEl = Math.max(el, 3);
  if (el > -1.5) {
    api.sun.color.setHex(0xFFF1DE).lerp(SUNSET, low * low * 0.8);
    api.sun.intensity = 3.6 * smooth(-1.5, 10, el);
  } else {                                     // the moon, on the sun's path 12 h behind
    const m = sunAt(state.t - 12);
    [px, py] = planDir(m.az); sunEl = Math.max(m.el, 3);
    api.sun.color.setHex(0x9DB0D6); api.sun.intensity = 0.4 * smooth(-1.5, -7, el) * smooth(-2, 12, m.el);
  }
  api.placeSun(THREE.MathUtils.radToDeg(Math.atan2(px, -py)), sunEl);
  // The sun does the modelling; ambient stays low so rooms keep their contrast. A
  // single room gets a camera-side fill so her deeper bedrooms still read.
  api.hemi.intensity = (studio ? 0.72 : 0.48) * (0.4 + 0.6 * day);
  api.hemi.color.setHex(0xFFF1E0).lerp(NIGHTSKY, 1 - day);
  scene.environmentIntensity = (studio ? 0.72 : 0.52) * (0.4 + 0.6 * day);
  api.fill.intensity = studio ? 1.0 * (0.45 + 0.55 * day) : 0;
  glow.intensity = (1 - day) * (studio ? 0.7 : 0.55);
  pieces.traverse(o => { if (o.userData.lamp) o.intensity = (1 - day) * 4.5; });
  M.shade.emissiveIntensity = (1 - day) * 1.8;
  renderer.toneMappingExposure = 1 + (1 - day) * 0.15;
  api.dirtyShadows();
}
api.lightHooks.relight = relight;
// times run 6:00 to 30:00 (6 am the next morning); the clock reads them round the dial
const clock = (t) => { const m = ((Math.round(t * 60) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const TIMES = [['Morning', 7.5, 'sunrise'], ['Midday', 12.35, 'sun'], ['Evening', 17.6, 'lamp'], ['Night', 21, 'moon']];

// ------------------------------------------------------------------ mood
const PRESETS = [
  { id: 'original', name: 'Original', sub: api.flat.original_sub || 'as designed', f: DEFAULTS, t: 10.5 },
  { id: 'cozy', name: 'Cozy', sub: 'golden hour', t: 17.3,
    f: { floor: 'teak', walls: 'sand', joinery: 'oak', worktop: 'travertine', upholstery: 'oat', accent: 'rust', woodwork: 'teak', doors: 'teak', rug: 'rust' } },
  { id: 'bright', name: 'Bright', sub: 'midday', t: 12.35,
    f: { floor: 'statuario', walls: 'chalk', joinery: 'chalk', worktop: 'statuario', upholstery: 'ivory', accent: 'oat', woodwork: 'ash', doors: 'ash', rug: 'ivory' } },
  { id: 'moody', name: 'Moody', sub: 'after dark', t: 19.4,
    f: { floor: 'smoked', walls: 'taupe', joinery: 'charcoal', worktop: 'nero', upholstery: 'ink', accent: 'mustard', woodwork: 'wenge', doors: 'smoked', rug: 'olive' } },
];
const WEIGHT = { floor: 0.3, walls: 0.34, joinery: 0.08, worktop: 0.04, upholstery: 0.12, accent: 0.04, woodwork: 0.08 };
function meter() {
  let L = 0, warm = 0, soft = 0;
  for (const [k, w] of Object.entries(WEIGHT)) { const s = SAMPLE[state.f[scoped(k)]]; L += s.L * w; warm += s.warm * w; soft += s.soft * w; }
  const { el } = sunAt(state.t);
  const high = smooth(10, 50, el), golden = el > -2 ? Math.exp(-((el - 8) ** 2) / 110) : 0, dark = 1 - smooth(-5, 6, el);
  const bright = L * 0.75 + high * 0.55;
  const cozy = (warm * 0.5 + 0.5) * 0.55 + soft * 0.3 + golden * 0.6;
  const moody = (1 - L) * 0.85 + dark * 0.75;
  const raw = [cozy, bright, moody].map(v => Math.max(0.02, v) ** 2.5), sum = raw.reduce((a, b) => a + b);
  const pct = raw.map(v => Math.round(v / sum * 100));
  pct[pct.indexOf(Math.max(...pct))] += 100 - pct.reduce((a, b) => a + b);
  return pct;
}
function reading(pct) {
  const { el } = sunAt(state.t), n = (k) => SAMPLE[state.f[scoped(k)]].name;
  const light = el < -2 ? 'lamplight after dark' : el < 14 ? 'a low gold sun' : el > 48 ? 'the high midday sun' : 'soft sun from the side';
  const mood = ['cozy', 'bright', 'moody'][pct.indexOf(Math.max(...pct))];
  return `<b>${n('walls')} walls</b>, a <b>${n('floor').toLowerCase()} floor</b> and ${light}. It reads <em class="${mood}">${mood}</em>.`;
}

// ------------------------------------------------------------------ state, undo, link
function serialize() {
  const s = {}, f = {}, m = {}, x = [], a = [];
  for (const k in SLOTS) if (state.f[k] !== DEFAULTS[k]) f[k] = state.f[k];
  const r3 = (v) => Math.round(v * 1000) / 1000, deg = (q) => Math.round(THREE.MathUtils.radToDeg(q.angle) * 10) / 10;
  for (const g of pieceGroups) {
    const p = g.userData.piece, q = pose(p);
    if (p.added) { a.push([p.type, r3(q.cx), r3(q.cy), deg(q)]); continue; }
    if (g.userData.removed) x.push(p.id);
    else if (p.moved) m[p.id] = [r3(q.cx), r3(q.cy), deg(q)];
  }
  if (Object.keys(f).length) s.f = f;
  const pp = {}; for (const k in PR.DEFAULTS) if (state.p[k] && state.p[k] !== PR.DEFAULTS[k]) pp[k] = state.p[k];
  if (Object.keys(pp).length) s.p = pp;
  if (Math.abs(state.t - DEFAULT_T) > 1e-3) s.t = Math.round(state.t * 100) / 100;
  const c = Object.keys(state.c).filter(rid => state.c[rid]);
  if (c.length) s.c = c;
  if (Object.keys(m).length) s.m = m;
  if (x.length) s.x = x;
  if (a.length) s.a = a;
  return s;
}
function applyState(s, { furniture = true } = {}) {
  deselect();
  for (const k in SLOTS) { const id = s.f?.[k] || DEFAULTS[k]; if (state.f[k] !== id) setSlot(k, id); }
  state.t = s.t ?? DEFAULT_T;
  const open = new Set(s.c || []);
  for (const rid of Object.keys(api.curtainMode || {})) {
    state.c[rid] = open.has(rid);
    api.setCurtainsOpen(rid, state.c[rid]);
  }
  if (furniture) {
    for (const g of [...pieceGroups]) if (g.userData.piece.added) dropAdded(g);
    for (const g of pieceGroups) {
      const p = g.userData.piece, mv = s.m?.[p.id];
      setPose(g, mv ? { cx: mv[0], cy: mv[1], angle: THREE.MathUtils.degToRad(mv[2]) } : { cx: p.obb.cx, cy: p.obb.cy, angle: p.obb.angle });
      g.userData.removed = !!s.x?.includes(p.id);
    }
    for (const [type, cx, cy, d] of s.a || []) addPiece(type, { cx, cy, angle: THREE.MathUtils.degToRad(d) });
  }
  state.p = { ...PR.DEFAULTS, ...(s.p || {}) };
  PR.apply(state.p);
  if (furniture) { arrangeChairs(s.m || {}); refreshVisibility(); }
  relight();
}
// a round table seats its chairs around it; any chair the viewer placed stays put
function arrangeChairs(userMoves = {}) {
  const table = pieceGroups.find(g => g.userData.piece.type === 'dining_table')?.userData.piece;
  if (!table) return;
  const chairs = pieceGroups.filter(g => g.userData.piece.type === 'dining_chair' && !g.userData.removed &&
    Math.hypot(g.userData.piece.obb.cx - table.obb.cx, g.userData.piece.obb.cy - table.obb.cy) < 1.6);
  const round = state.p.table === 'travertine_round';
  const poses = round ? PR.roundChairPoses(table, chairs.map(g => g.userData.piece)) : null;
  chairs.forEach((g, i) => {
    const p = g.userData.piece;
    if (userMoves[p.id]) return;
    setPose(g, round ? poses[i] : { cx: p.obb.cx, cy: p.obb.cy, angle: p.obb.angle });
    p.moved = false;                   // part of the table choice, not a move
  });
  api.dirtyShadows();
}
const b64 = { enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
              dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };
let undoStack = [], redoStack = [], current = null;
function writeHash() {
  const s = serialize(), url = location.pathname + location.search + (Object.keys(s).length ? '#s=' + b64.enc(JSON.stringify(s)) : '');
  history.replaceState(null, '', url);
}
function commit() {
  const now = JSON.stringify(serialize());
  if (now === current) return refresh();
  if (current !== null) undoStack.push(current);
  redoStack = []; current = now;
  writeHash(); anchorAz = null; refresh();
}
function stepHistory(from, to) {
  if (!from.length) return;
  to.push(current); current = from.pop();
  applyState(JSON.parse(current)); writeHash(); refresh();
}
let pendingCommit = 0;
const commitSoon = () => { clearTimeout(pendingCommit); pendingCommit = setTimeout(commit, 450); };

// ------------------------------------------------------------------ picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), el = renderer.domElement;
const floorPlane = new THREE.Plane(new V3(0, 1, 0), 0);
function setRay(e) {
  const r = el.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
const floorAt = (e) => { setRay(e); return ray.ray.intersectPlane(floorPlane, new V3()); };
const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const pivotOf = (o) => { while (o && o.parent !== pieces) o = o.parent; return o; };
function pickPiece(e) {
  setRay(e);
  const h = ray.intersectObject(pieces, true).find(h => h.object.isMesh && shown(h.object));
  return h ? pivotOf(h.object) : null;
}
function pickSurface(e) {
  setRay(e);
  const objs = [api.activeShell(), pieces, api.models, ...scene.children.filter(o => o.userData.cladding)];
  const h = ray.intersectObjects(objs, true).find(h => h.object.isMesh && h.face && shown(h.object));
  if (!h) return null;
  const mat = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material;
  if (LOCKED.has(mat)) return { locked: 'Finishes in Toilet 3 are fixed' };
  return { slot: MAT2SLOT.get(mat) || null, pivot: pivotOf(h.object), point: h.point };
}
const overCanvas = (e) => document.elementFromPoint(e.clientX, e.clientY) === el;

// ------------------------------------------------------------------ selection
const outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xC9A227, depthTest: false, transparent: true }));
outline.renderOrder = 20; outline.visible = false; outline.frustumCulled = false; scene.add(outline);
function drawOutline(p, q, ok = true) {
  outline.geometry.setFromPoints(corners(q, p.obb.w + 0.1, p.obb.d + 0.1).map(([x, y]) => W(x, y).setY(0.025)));
  outline.material.color.setHex(ok ? 0xC9A227 : 0xD2553F);
  outline.visible = true;
  api.wake();
}
let sel = null;           // { pivot } or { slot }
let glowSlot = null;
function highlight(slot) {
  if (glowSlot) { const m = M[SLOTS[glowSlot].mat]; m.emissive.setHex(0); m.emissiveIntensity = 1; }
  glowSlot = slot;
  api.wake();
}
api.frameHooks.push(() => {
  if (sel?.pivot && !shown(sel.pivot)) deselect();       // its room was closed
  if (!glowSlot) return;
  const m = M[SLOTS[glowSlot].mat];
  m.emissive.setHex(0xC9A227); m.emissiveIntensity = 0.1 + 0.07 * Math.sin(performance.now() / 180);
  return true;                                            // keep drawing while it pulses
});
function selectPiece(g) {
  sel = { pivot: g }; highlight(null);
  drawOutline(g.userData.piece, pose(g.userData.piece));
  showCard(); refresh();
}
function selectSlot(slot, point = null) {
  sel = { slot, point }; outline.visible = false; highlight(slot);
  const cats = SLOTS[slot].cats;
  if (!cats.includes(tab)) setTab(cats[0]); else renderTray();
  hideCard(); refresh();
  toast(`${SLOTS[slot].name}: pick a ${cats.join(' or ')} sample below, or drag one onto it`);
}
function deselect() { sel = null; outline.visible = false; highlight(null); hideCard(); renderTray(); refresh(); api.wake(); }

function turn(g, deg) {
  const p = g.userData.piece, q0 = pose(p), q = { ...q0, angle: q0.angle + THREE.MathUtils.degToRad(deg) };
  if (!fits(p, q)) return toast('No room to turn it there');
  setPose(g, q); drawOutline(p, q); api.dirtyShadows(); commitSoon(); showCard();
}
function putBack(g) {
  const p = g.userData.piece;
  const q = { cx: p.obb.cx, cy: p.obb.cy, angle: p.obb.angle };
  setPose(g, q); g.userData.removed = false; refreshVisibility();
  drawOutline(p, q); api.dirtyShadows(); commit(); showCard();
}
function takeOut(g) {
  const p = g.userData.piece;
  if (p.added) dropAdded(g); else { g.userData.removed = true; g.visible = false; }
  if (p.type === 'floor_lamp') relight();
  deselect(); api.dirtyShadows(); commit();
  toast(p.added ? `${p.name} removed` : `${p.name} taken out. Reset furniture brings it back`);
}

// ------------------------------------------------------------------ canvas: drag furniture
let drag = null;
el.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || api.walking) return;
  const g = pickPiece(e);
  if (g && g.userData.piece.movable) {
    controls.enabled = false;                // capture phase: runs before the orbit controls
    const f = floorAt(e) || g.position.clone();
    drag = { g, p: g.userData.piece, start: { ...pose(g.userData.piece) }, x0: e.clientX, y0: e.clientY, moved: false,
             off: f.clone().sub(g.position), turn: 0 };
    try { el.setPointerCapture(e.pointerId); } catch {}
  } else drag = { none: true, x0: e.clientX, y0: e.clientY };
}, true);
el.addEventListener('pointermove', (e) => {
  if (api.walking) return;
  if (drag?.g) {
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    if (!drag.moved) { drag.moved = true; sel = { pivot: drag.g }; hideCard(); highlight(null); }
    api.tip.hidden = true; el.style.cursor = 'grabbing';
    drag.free = e.altKey; drag.x = e.clientX; drag.y = e.clientY;
    moveTo(drag, floorAt(e));
    return;
  }
  if (!drag) el.style.cursor = pickPiece(e)?.userData.piece.movable ? 'grab' : '';
}, true);
// Moves snap to 10 cm and pull flush to a near wall; holding Option (Alt) places freely.
function moveTo(d, f) {
  if (!f) return;
  const raw = f.sub(d.off), rx = raw.x + CX, ry = CY - raw.z, st = d.start;
  const angle = st.angle + THREE.MathUtils.degToRad(d.turn);
  const q = d.free ? { cx: rx, cy: ry, angle }
    : { cx: st.cx + Math.round((rx - st.cx) / 0.1) * 0.1, cy: st.cy + Math.round((ry - st.cy) / 0.1) * 0.1, angle };
  if (!d.free && d.p.type !== 'rug') snapFlush(d.p, q);
  const why = whyNot(d.p, q);
  if (!why) { setPose(d.g, q); d.ok = true; api.dirtyShadows(); }
  drawOutline(d.p, q, !why);
  showWhy(why, d.x, d.y);
  d.lastF = f.add(d.off);
}
el.addEventListener('wheel', (e) => {
  if (!drag?.g || !drag.moved) return;
  e.preventDefault(); e.stopImmediatePropagation();
  drag.turn += Math.sign(e.deltaY) * 15;
  moveTo(drag, drag.lastF?.clone());
}, { capture: true, passive: false });
el.addEventListener('pointerup', (e) => {
  if (api.walking) return;
  const d = drag; drag = null;
  controls.enabled = true; el.style.cursor = '';
  showWhy(null);
  if (!d) return;
  if (d.g) {
    try { el.releasePointerCapture(e.pointerId); } catch {}
    if (d.moved) { drawOutline(d.p, pose(d.p)); if (d.p.added) d.p.home = d.g.userData.home; commit(); selectPiece(d.g); }
    else if (api.focused) selectPiece(d.g);
    return;
  }
  // a plain click on a surface, in a single-room view, picks it for a sample
  if (!api.focused || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 5) return;
  const s = pickSurface(e);
  if (!s) return deselect();
  if (s.locked) { deselect(); return toast(s.locked); }
  if (s.slot) selectSlot(s.slot, s.point); else deselect();
}, true);

// ------------------------------------------------------------------ the interface
const $ = (sel, root = document) => root.querySelector(sel);
const ui = document.createElement('div'); ui.id = 'ui';
const ICON = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  save: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  hide: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
  sunrise: '<path d="M12 3v3"/><path d="m5.6 8.6 1.4 1.4"/><path d="m18.4 8.6-1.4 1.4"/><path d="M3 16h18"/><path d="M7 16a5 5 0 0 1 10 0"/><path d="M8 20h8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lamp: '<path d="M8 3h8l3 8H5l3-8Z"/><path d="M12 11v8"/><path d="M8 21h8"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  curtains: '<path d="M5 3v18M19 3v18M5 5h14"/><path d="M6 5c4 3 4 11 0 14M18 5c-4 3-4 11 0 14"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="m9 21 2.5-6.5 3 2.5V21"/><path d="M7 12.5 10 9l3.5 1.5 2 3 2.5 1"/><path d="m11.5 14.5.8-4.2"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
ui.innerHTML = `
  <section class="panel mood">
    <div class="presets">${PRESETS.map((p, i) => `<button class="preset" data-p="${p.id}" title="Key ${i + 1}">
      <span class="chips">${['walls', 'floor', 'upholstery', 'accent'].map(k => `<i style="background:#${new THREE.Color(SAMPLE[p.f[k]].c).getHexString()}"></i>`).join('')}</span>
      <b>${p.name}</b><small>${p.sub}</small></button>`).join('')}</div>
    <div class="meter">${['Cozy', 'Bright', 'Moody'].map(n => `<div class="m"><small>${n}</small><b>0%</b><span><i></i></span></div>`).join('')}</div>
    <p class="read"></p>
    <button class="layout-reset" hidden>Reset furniture</button>
  </section>
  <nav class="tools">
    <button data-t="undo" title="Undo (⌘Z)">${icon('undo')}</button><button data-t="redo" title="Redo (⇧⌘Z)">${icon('redo')}</button>
    <span></span>
    <button data-t="save" title="Save an image">${icon('save')}</button><button data-t="link" title="Copy a link to this setup">${icon('link')}</button>
    <button data-t="walk" title="Walk through the flat">${icon('walk')}</button><button data-t="hide" title="Show or hide the moodboard (N)">${icon('hide')}</button><button data-t="reset" title="Reset the view (R)">${icon('reset')}</button>
    <button data-t="help" title="How it works (?)">${icon('help')}</button>
  </nav>
  <section class="panel daylight">
    <header><small>Daylight</small><b class="clock"></b></header>
    <div class="times">${TIMES.map(([n, t, ic]) => `<button data-time="${t}">${icon(ic)}<span><b>${n}</b><small>${clock(t)}</small></span></button>`).join('')}</div>
    <input type="range" min="6" max="30" step="0.05" aria-label="Time of day, 6 am to 6 am">
    <button class="curtain-toggle" hidden>${icon('curtains')}<span><b>Draw the curtains</b><small>Close them across the windows</small></span></button>
    <p class="fine">Sun by day, moon by night, 6 am to 6 am, for Delhi, approximate. Drag it along its path.</p>
  </section>
  <section class="panel dock">
    <div class="tabs">${CATS.map(([k, n]) => `<button data-cat="${k}">${n}</button>`).join('')}<span class="sep"></span><button data-cat="furniture">Furniture</button>${PR.GROUPS.length ? '<button data-cat="products">Products</button>' : ''}
      <span class="target" hidden><span></span><button title="Clear">×</button></span></div>
    <div class="tray"></div>
  </section>
  <div class="walkbar"><span>${matchMedia('(max-width:700px)').matches ? 'Drag to look · Tap the floor to walk' : 'Drag to look around · Tap the floor to walk there · WASD or arrow keys'}</span><button>Back to plan</button></div>
  <div class="why" hidden></div>
  <button class="turn-dot" hidden title="Drag to turn · hold Option to turn freely"></button>
  <div class="panel card" hidden><div class="who"><b></b><small></small></div>
    <button data-c="turn">Turn</button><button data-c="back">Put back</button><button data-c="out">Take out</button></div>
  <div class="toast" hidden></div>
  <dialog class="help">
    <button class="x" title="Close">×</button>
    <h2>Play with the flat</h2>
    <p>Try finishes, move the furniture and watch the light change through the day. Nothing here is permanent: undo, or reset the furniture, at any time.</p>
    <h3>Finishes</h3>
    <p>Drag a sample from the tray onto a surface and it previews in place; let go to keep it. Or open a room, click a surface, then click a sample. Wood goes on floors, woodwork, fronts and doors; stone on floors, walls and worktops; paint on walls, fronts and doors; fabric on upholstery, cushions and rugs. ${api.flat.original_note || ''}</p>
    <h3>Furniture</h3>
    <p>Drag any loose piece to move it. It snaps in 10 cm steps and will not go into a wall, another piece or fitted joinery. Scroll while dragging to turn it. Click a piece for Turn, Put back and Take out. The Furniture tab adds pieces: click one to drop it in view, or drag it into a room. Kitchen units, wardrobes and bathroom fittings are fixed.</p>
    <h3>Walk</h3>
    <p>The walking figure in the toolbar puts you inside the flat at eye height, in the room you were looking at. Drag to look around, tap the floor to walk there, or use WASD and the arrow keys. Doors stand open; Esc or Back to plan returns to the model.</p>
    <h3>Light</h3>
    <p>The sun follows its path over Delhi through the day. Move the slider or pick a time. After dark the flat gets a warm evening light, and any floor lamp you added switches on.</p>
    <h3>Mood</h3>
    <p>The meter reads the room as you change it: pale surfaces and high sun read bright, warm soft materials and low gold light read cozy, dark surfaces and night read moody. A rule of thumb, not a science.</p>
    <h3>Keys</h3>
    <p class="keys">1-4 presets · [ ] move the sun · N show the moodboard · , . turn the selected piece · Delete take it out · ⌘Z undo · / hide the interface · R reset the view · Esc deselect</p>
  </dialog>`;
document.body.appendChild(ui);

let tab = 'wood', libQuery = '';
let thumbsStarted = false;
function setTab(k) {
  tab = k;
  if (k === 'furniture' && !thumbsStarted) { thumbsStarted = true; setTimeout(makeThumbs, 50); }
  ui.querySelectorAll('.tabs [data-cat]').forEach(b => b.classList.toggle('on', b.dataset.cat === k));
  renderTray();
}
ui.querySelectorAll('.tabs [data-cat]').forEach(b => b.onclick = () => { if (!b.classList.contains('off')) setTab(b.dataset.cat); });
$('.target button', ui).onclick = () => deselect();

const swatchImg = new Map();
function swatchFor(s) {
  if (!swatchImg.has(s.id)) swatchImg.set(s.id, swatchURL(finishFor(s, FIRST_SLOT[s.cat]).map, 112));
  return swatchImg.get(s.id);
}
function renderTray() {
  const tray = $('.tray', ui);
  tray.innerHTML = '';
  if (tab === 'products') return renderProducts(tray);
  if (tab === 'furniture') {
    const q = document.createElement('input');
    q.type = 'text'; q.className = 'lib-search'; q.placeholder = 'Search the library'; q.setAttribute('aria-label', 'Search the library');
    q.value = libQuery; tray.appendChild(q);
    const items = CATALOGUE.map(c => {
      const b = document.createElement('button');
      b.className = 'item'; b.dataset.type = c.type;
      b.innerHTML = `<span class="pic">${c.thumb ? `<img src="${c.thumb}" alt="">` : ''}</span><small>${c.name}</small>`;
      wireCatalogue(b, c);
      tray.appendChild(b);
      return [b, `${c.name} ${c.tags || ''}`.toLowerCase()];
    });
    const none = document.createElement('p'); none.className = 'pnote'; none.textContent = 'Nothing by that name'; tray.appendChild(none);
    const filter = () => { libQuery = q.value; const t = libQuery.trim().toLowerCase(); let n = 0;
      for (const [b, text] of items) { b.hidden = !!t && !t.split(/\s+/).every(w => text.includes(w)); n += !b.hidden; } none.hidden = n > 0; };
    q.oninput = filter; filter();
    return;
  }
  const destination = sel?.slot || scoped(FIRST_SLOT[tab]);
  const list = SAMPLES.filter(s => s.cat === tab && allowedOn(destination, s.id));
  list.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'sw'; b.dataset.id = s.id;
    b.innerHTML = `<span class="pic"></span><small>${s.name}</small>`;
    wireSample(b, s);
    tray.appendChild(b);
    // generating a finish takes a moment; do them one after another so the page stays smooth
    setTimeout(() => { $('.pic', b).style.backgroundImage = `url(${swatchFor(s)})`; }, 30 * i);
  });
  refresh();
}

// samples: click to apply to the selected surface, or drag onto any surface
function applySample(id, slot) {
  const s = SAMPLE[id];
  if (!SLOTS[slot].cats.includes(s.cat)) return toast(`${SLOTS[slot].name} take ${SLOTS[slot].cats.join(' or ')}, not ${s.cat}`);
  if (!allowedOn(slot, id)) return toast(`${s.name} is not offered for ${SLOTS[slot].the}`);
  applyFinish(slot, id, sel?.slot === slot ? sel.point : null); commit();
  toast(`${s.name} on ${SLOTS[slot].the}`);
}
function wireSample(b, s) {
  let d = null;
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {}
    d = { x0: e.clientX, y0: e.clientY, moved: false, slot: null, prev: null, ghost: null };
  });
  b.addEventListener('pointermove', (e) => {
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
    if (!d.moved) {
      d.moved = true;
      d.ghost = document.createElement('div'); d.ghost.className = 'ghost';
      d.ghost.style.backgroundImage = `url(${swatchFor(s)})`; document.body.appendChild(d.ghost);
    }
    d.ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
    const ok = (slot) => slot && SLOTS[slot].cats.includes(s.cat) && allowedOn(slot, s.id);
    let slot = null, point = null;
    const card = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.mb-card');
    if (card && ok(card.dataset.slot)) { slot = card.dataset.slot; point = boardAnchor(slot); }
    else if (overCanvas(e)) { const h = pickSurface(e); if (ok(h?.slot)) { slot = h.slot; point = h.point; } }
    d.ghost.classList.toggle('ok', !!slot);
    if (slot === d.slot) { if (d.patch && point && !card) d.patch.u.uCenter.value.copy(point); api.wake(); return; }
    if (d.slot) { setSlot(d.slot, d.prev); stopSpread(d.slot); }        // take the previous preview off
    d.slot = slot; d.point = point; d.patch = null; highlight(slot);
    if (slot) {
      d.prev = state.f[slot];
      const oldMap = M[SLOTS[slot].mat].map;
      setSlot(slot, s.id);
      // over the room: a patch of the sample under the pointer; over a card: the whole surface
      if (!card) d.patch = startSpread(slot, oldMap, point, { r0: 0.55, hold: true });
    }
  });
  const end = () => {
    if (!d) return;
    const dd = d; d = null; dd.ghost?.remove(); highlight(sel?.slot || null);
    if (!dd.moved) return applySample(s.id, sel?.slot && SLOTS[sel.slot].cats.includes(s.cat) ? sel.slot : scoped(FIRST_SLOT[s.cat]));
    if (dd.slot) {
      if (dd.patch) releaseSpread(dd.patch);
      commit(); toast(`${s.name} on ${SLOTS[dd.slot].the}`);
    }
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', () => { if (d?.slot) { setSlot(d.slot, d.prev); stopSpread(d.slot); } end(); });
}

// catalogue: click to drop a piece into view, or drag it into a room
function freeSpotNear(p, cx, cy) {
  for (let r = 0; r <= 3.5; r += 0.1) {
    const n = Math.max(1, Math.round(2 * Math.PI * r / 0.1));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, q = { cx: cx + Math.cos(a) * r, cy: cy + Math.sin(a) * r, angle: 0 };
      if (fits(p, q)) return q;
    }
  }
  return null;
}
function wireCatalogue(b, c) {
  let d = null;
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {}
    d = { x0: e.clientX, y0: e.clientY, moved: false, g: null, ok: false };
  });
  b.addEventListener('pointermove', (e) => {
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
    d.moved = true;
    if (!overCanvas(e)) return;
    const f = floorAt(e);
    if (!f) return;
    const cx = f.x + CX, cy = CY - f.z;
    if (!d.g) { d.g = addPiece(c.type, { cx, cy, angle: 0 }); d.g.visible = true; d.drag = { g: d.g, p: d.g.userData.piece, start: { cx, cy, angle: 0 }, off: new V3(), turn: 0 }; }
    d.drag.free = e.altKey; d.drag.x = e.clientX; d.drag.y = e.clientY;
    moveTo(d.drag, f); d.ok = d.ok || d.drag.ok;
  });
  b.addEventListener('pointerup', () => {
    if (!d) return;
    const dd = d; d = null; showWhy(null);
    if (!dd.moved) return addInView(c);
    if (!dd.g) return;
    if (!dd.ok) { dropAdded(dd.g); outline.visible = false; if (c.type === 'floor_lamp') relight(); return toast('It needs free floor in an open room'); }
    const p = dd.g.userData.piece; p.home = dd.g.userData.home;
    refreshVisibility(); commit(); selectPiece(dd.g); toast(`${c.name} added`);
  });
}
function addInView(c) {
  const t = controls.target, probe = { obb: { w: c.w, d: c.d }, type: c.type, id: 'probe' };
  const q = freeSpotNear(probe, t.x + CX, CY - t.z);
  if (!q) return toast('No free floor near the middle of the view');
  const g = addPiece(c.type, q); refreshVisibility(); api.dirtyShadows(); commit(); selectPiece(g);
  toast(`${c.name} added`);
}

// the card for a selected piece
const card = $('.card', ui);
function showCard() {
  const g = sel?.pivot; if (!g) return hideCard();
  const p = g.userData.piece;
  $('.who b', card).textContent = p.name;
  $('.who small', card).textContent = `${size(p.obb.w)} × ${size(p.obb.d)}`;
  card.querySelector('[data-c="back"]').hidden = !p.moved;
  card.hidden = false;
}
function hideCard() { card.hidden = true; }
// sizes read both ways: metres, and feet and inches as they are quoted in India
function size(m) { const inch = Math.round(m / 0.0254), ft = Math.floor(inch / 12); return `${m.toFixed(2)} m (${ft}′${inch % 12}″)`; }
// the reason a dragged piece will not go where the pointer is
const whyEl = $('.why', ui);
function showWhy(text, x, y) {
  whyEl.hidden = !text;
  if (text) { whyEl.textContent = text; whyEl.style.transform = `translate(${x + 16}px, ${y + 18}px)`; }
}
// The turn dot: a handle off the selected piece's side; drag it round the piece to turn
// it, in 15 degree steps, or freely with Option (Alt) held.
const dot = $('.turn-dot', ui);
let rot = null;
function dotAt(p) {
  const q = pose(p), hd = p.obb.d / 2 + 0.35;
  return W(q.cx - Math.sin(q.angle) * hd, q.cy + Math.cos(q.angle) * hd).setY(0.05);
}
api.frameHooks.push(() => {
  const g = sel?.pivot, show = !!(g && g.userData.piece.movable && !drag?.moved && shown(g) && api.focused);
  dot.hidden = !show;
  if (show) { const [x, y] = toScreen(dotAt(g.userData.piece)); dot.style.transform = `translate(${x - 9}px, ${y - 9}px)`; }
});
dot.addEventListener('pointerdown', (e) => {
  if (!sel?.pivot) return;
  e.preventDefault(); e.stopPropagation(); try { dot.setPointerCapture(e.pointerId); } catch {}
  const g = sel.pivot; rot = { g, p: g.userData.piece };
  controls.enabled = false; hideCard();
});
dot.addEventListener('pointermove', (e) => {
  if (!rot) return;
  const f = floorAt(e); if (!f) return;
  const q0 = pose(rot.p), px = f.x + CX, py = CY - f.z;
  let a = Math.atan2(py - q0.cy, px - q0.cx) - Math.PI / 2;
  if (!e.altKey) { const st = Math.PI / 12; a = Math.round(a / st) * st; }
  const q = { ...q0, angle: a }, why = whyNot(rot.p, q);
  if (!why) { setPose(rot.g, q); api.dirtyShadows(); }
  drawOutline(rot.p, why ? q : pose(rot.p), !why); showWhy(why, e.clientX, e.clientY);
});
const endRot = () => { if (!rot) return; rot = null; controls.enabled = true; showWhy(null); commit(); if (sel?.pivot) { drawOutline(sel.pivot.userData.piece, pose(sel.pivot.userData.piece)); showCard(); } };
dot.addEventListener('pointerup', endRot); dot.addEventListener('pointercancel', endRot);
card.querySelector('[data-c="turn"]').onclick = () => sel?.pivot && turn(sel.pivot, 90);
card.querySelector('[data-c="back"]').onclick = () => sel?.pivot && putBack(sel.pivot);
card.querySelector('[data-c="out"]').onclick = () => sel?.pivot && takeOut(sel.pivot);

// presets, daylight, tools
ui.querySelectorAll('.preset').forEach(b => b.onclick = () => applyPreset(PRESETS.find(p => p.id === b.dataset.p)));
// the finish a preset gives a slot: 'Original' is her design, room by room
const presetFor = (p, k) => p.id === 'original' ? DEFAULTS[k] : p.f[baseOf(k)] ?? state.f[k];
function applyPreset(p) {
  const c = controls.target.clone().setY(0);
  for (const k of inScope()) {
    const id = presetFor(p, k);
    if (id && state.f[k] !== id && SLOTS[k].cats.includes(SAMPLE[id].cat) && allowedOn(k, id)) applyFinish(k, id, c);
  }
  refresh(); animateTime(p.t);
}
const range = $('.daylight input', ui);
range.oninput = () => { timeAnim = null; state.t = +range.value; relight(); refresh(); };
range.onchange = () => commit();
ui.querySelectorAll('[data-time]').forEach(b => b.onclick = () => animateTime(+b.dataset.time));
const curtainBtn = $('.curtain-toggle', ui);
function refreshCurtains() {
  const rid = api.focused?.id;
  const rooms = rid ? (api.hasCurtains(rid) ? [rid] : []) : api.curtainRooms();
  curtainBtn.hidden = !rooms.length;
  if (!rooms.length) return;
  const open = rooms.every(id => !!state.c[id]);
  curtainBtn.setAttribute('aria-pressed', String(open));
  // state.c[room] true = curtains drawn across (and Bedroom 2's blind fully down)
  $('b', curtainBtn).textContent = open ? (rid ? 'Open the curtains' : 'Open all curtains') : (rid ? 'Draw the curtains' : 'Draw all curtains');
  $('small', curtainBtn).textContent = open ? 'Back to the designed dressing' : 'Close them across the windows';
  curtainBtn.classList.toggle('on', open);
}
curtainBtn.onclick = () => {
  const rid = api.focused?.id;
  const rooms = rid ? (api.hasCurtains(rid) ? [rid] : []) : api.curtainRooms();
  if (!rooms.length) return;
  const open = !rooms.every(id => !!state.c[id]);
  for (const id of rooms) { state.c[id] = open; api.setCurtainsOpen(id, open); }
  refreshCurtains(); commit();
  toast(open ? (rid ? 'Curtains drawn' : 'Curtains drawn across the flat') : (rid ? 'Curtains open' : 'Curtains open across the flat'));
};
api.focusHooks.push(refreshCurtains);
addEventListener('b34-curtains-ready', refreshCurtains);
$('.layout-reset', ui).onclick = () => {
  for (const g of [...pieceGroups]) if (g.userData.piece.added) dropAdded(g);
  for (const g of pieceGroups) { const p = g.userData.piece; setPose(g, { cx: p.obb.cx, cy: p.obb.cy, angle: p.obb.angle }); g.userData.removed = false; }
  refreshVisibility(); deselect(); relight(); commit(); toast('Furniture reset');
};
// walk mode (walk.js): the title follows the room you are standing in
const walk = createWalk(api, { onChange: (r) => {
  document.getElementById('t-k').textContent = `${api.flat.title?.kicker || ''} · Walking`;
  const name = r.space === 'balcony-all' ? 'Balcony' : r.name;
  if (document.getElementById('t-h').textContent !== name) { document.getElementById('t-h').textContent = name; document.getElementById('t-a').textContent = ''; }
} });
$('.walkbar button', ui).onclick = () => walk.exit();
window.__walk = walk;
const help = $('dialog.help', ui);
$('.x', help).onclick = () => help.close();
const TOOL = {
  undo: () => stepHistory(undoStack, redoStack),
  redo: () => stepHistory(redoStack, undoStack),
  save: () => {
    outline.visible = false; highlight(null);
    api.composer.render();
    const a = document.createElement('a');
    a.download = `${api.flat.id || 'flat'}.png`; a.href = el.toDataURL('image/png'); a.click();
    if (sel?.pivot) drawOutline(sel.pivot.userData.piece, pose(sel.pivot.userData.piece));
    if (sel?.slot) highlight(sel.slot);
  },
  link: async () => { try { await navigator.clipboard.writeText(location.href); toast('Link copied. It opens this exact setup'); } catch { toast('Copy the address bar: it holds this setup'); } },
  hide: () => document.body.classList.toggle('clean'),
  board: () => { document.body.classList.toggle('no-board'); api.wake(); },
  reset: () => api.resetView(),
  walk: () => (walk.on ? walk.exit() : (deselect(), walk.enter())),
  help: () => help.showModal(),
};
ui.querySelectorAll('.tools [data-t]').forEach(b => b.onclick = () => TOOL[b.dataset.t === 'hide' ? 'board' : b.dataset.t]());

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input[type=text], textarea') || help.open || api.walking) return;
  const k = e.key;
  if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { e.preventDefault(); TOOL[e.shiftKey ? 'redo' : 'undo'](); return; }
  if (k === 'Escape' && sel) { e.stopImmediatePropagation(); deselect(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (k >= '1' && k <= '4') applyPreset(PRESETS[+k - 1]);
  else if (k === '[' || k === ']') animateTime(Math.min(30, Math.max(6, (timeAnim?.to ?? state.t) + (k === ']' ? 0.5 : -0.5))), 450);
  else if (k === 'n' || k === 'N') TOOL.board();
  else if ((k === ',' || k === '.') && sel?.pivot) turn(sel.pivot, k === '.' ? 15 : -15);
  else if ((k === 'Delete' || k === 'Backspace') && sel?.pivot) takeOut(sel.pivot);
  else if (k === '/') TOOL.hide();
  else if (k === 'r' || k === 'R') TOOL.reset();
  else if (k === '?') TOOL.help();
}, true);

let toastT = 0;
function toast(msg) {
  const t = $('.toast', ui);
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

function refresh() {
  refreshBoard();
  const pct = meter();
  ui.querySelectorAll('.meter .m').forEach((m, i) => { $('b', m).textContent = pct[i] + '%'; $('span i', m).style.width = pct[i] + '%'; });
  $('.read', ui).innerHTML = reading(pct);
  const used = new Set(Object.values(state.f));
  ui.querySelectorAll('.sw').forEach(b => {
    b.classList.toggle('used', used.has(b.dataset.id));
    b.title = Object.entries(state.f).filter(([, v]) => v === b.dataset.id).map(([k]) => SLOTS[k].name).join(', ');
  });
  for (const b of ui.querySelectorAll('.preset')) {
    const p = PRESETS.find(q => q.id === b.dataset.p);
    b.classList.toggle('on', inScope().every(k => { const id = presetFor(p, k); return state.f[k] === id || !SLOTS[k].cats.includes(SAMPLE[id]?.cat) || !allowedOn(k, id); }) && Math.abs(state.t - p.t) < 0.3);
  }
  $('.clock', ui).textContent = clock(state.t);
  range.value = state.t;
  ui.querySelectorAll('[data-time]').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.time - state.t) < 0.3));
  $('[data-t="undo"]', ui).disabled = !undoStack.length;
  $('[data-t="redo"]', ui).disabled = !redoStack.length;
  const changed = pieceGroups.filter(g => g.userData.piece.added || g.userData.piece.moved || g.userData.removed).length;
  const lr = $('.layout-reset', ui);
  lr.hidden = !changed; lr.textContent = `Reset furniture (${changed} changed)`;
  const cats = sel?.slot ? SLOTS[sel.slot].cats : null;
  ui.querySelectorAll('.tabs [data-cat]').forEach(b => b.classList.toggle('off', !!cats && !cats.includes(b.dataset.cat)));
  const tg = $('.target', ui);
  tg.hidden = !sel?.slot;
  if (sel?.slot) $('span', tg).textContent = `for ${SLOTS[sel.slot].the}`;
  if (sel?.pivot && !card.hidden) showCard();
  refreshCurtains();
}

// ------------------------------------------------------------------ motion: finishes spread
// A new finish spreads across its surface from where it landed, the way Ryan Sael's
// room does it: each swappable material keeps the previous map for a moment, and a
// front growing from the drop point reveals the new one behind a soft warm edge.
// While a sample is held over a surface, a patch of it shows under the pointer.
const spreads = [];
function spreadable(m) {
  if (m.userData.spread) return m.userData.spread;
  const u = { uOld: { value: null }, uOldT: { value: new THREE.Matrix3() }, uCenter: { value: new V3() },
              uR: { value: 0 }, uOn: { value: 0 } };
  m.userData.spread = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vSpreadW;\nvarying vec2 vSpreadUv;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpreadUv = uv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSpreadW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D uOld;\nuniform mat3 uOldT;\nuniform vec3 uCenter;\nuniform float uR;\nuniform float uOn;\nvarying vec3 vSpreadW;\nvarying vec2 vSpreadUv;\n'
      + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (uOn > 0.5) {
        float k = smoothstep(uR - 0.2, uR, distance(vSpreadW, uCenter));
        vec3 prev = texture2D(uOld, (uOldT * vec3(vSpreadUv, 1.0)).xy).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, prev, k) + vec3(1.0, 0.8, 0.45) * (1.0 - abs(k * 2.0 - 1.0)) * 0.3;
      }`);
  };
  m.customProgramCacheKey = () => 'spread';
  m.needsUpdate = true;
  return u;
}
function startSpread(slot, oldMap, center, { r0 = 0, hold = false } = {}) {
  const m = M[SLOTS[slot].mat], u = spreadable(m);
  stopSpread(slot);
  if (!oldMap || oldMap === m.map || !center) return null;
  oldMap.updateMatrix();
  u.uOld.value = oldMap; u.uOldT.value.copy(oldMap.matrix); u.uCenter.value.copy(center);
  u.uR.value = r0; u.uOn.value = 1;
  const sp = { slot, u, r0, t0: performance.now(), dur: api.focused ? 1150 : 1700, rMax: api.focused ? 10 : 26 };
  if (!hold) spreads.push(sp);
  api.wake();
  return sp;
}
function releaseSpread(sp) { sp.t0 = performance.now(); spreads.push(sp); api.wake(); }
function stopSpread(slot) {
  const u = M[SLOTS[slot].mat].userData.spread;
  if (!u) return;
  u.uOn.value = 0; u.uOld.value = null;
  for (let i = spreads.length - 1; i >= 0; i--) if (spreads[i].slot === slot) spreads.splice(i, 1);
  api.wake();
}
function applyFinish(slot, id, center) {
  const oldMap = M[SLOTS[slot].mat].map;
  setSlot(slot, id);
  startSpread(slot, oldMap, center || controls.target.clone().setY(0));
}
api.frameHooks.push(() => {
  if (!spreads.length) return;
  const now = performance.now();
  for (let i = spreads.length - 1; i >= 0; i--) {
    const sp = spreads[i], k = Math.min(1, (now - sp.t0) / sp.dur), e = 1 - Math.pow(1 - k, 3);
    sp.u.uR.value = sp.r0 + (sp.rMax - sp.r0) * e;
    if (k >= 1) { sp.u.uOn.value = 0; sp.u.uOld.value = null; spreads.splice(i, 1); }
  }
  return true;
});

// ------------------------------------------------------------------ motion: time travels
// Picking a time moves the sun along its arc to it, with the light's colour and
// strength following, instead of jumping there.
let timeAnim = null;
const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function animateTime(to, dur) {
  const from = state.t;
  if (Math.abs(to - from) < 0.01) { timeAnim = null; commit(); return; }
  timeAnim = { from, to, t0: performance.now(), dur: dur ?? Math.min(2400, 800 + Math.abs(to - from) * 150) };
  api.wake();
}
api.frameHooks.push(() => {
  if (!timeAnim) return;
  const k = Math.min(1, (performance.now() - timeAnim.t0) / timeAnim.dur);
  state.t = timeAnim.from + (timeAnim.to - timeAnim.from) * easeIO(k);
  relight(); refresh();
  if (k >= 1) { timeAnim = null; commit(); }
  return true;
});

// ------------------------------------------------------------------ the sun's arc
// A whole day read left to right, 6 am to 6 am: the sun's arch from sunrise to sunset
// on the left, the moon's (it rides the same path twelve hours behind at this season)
// from sunset to the next sunrise on the right. The orb sits on it and can be dragged.
// The light itself always comes from the true direction for Delhi.
const SVGNS = 'http://www.w3.org/2000/svg', RISE = NOON - 6, SET = NOON + 6, DAY_END = 30;
const sky = document.createElementNS(SVGNS, 'svg');
sky.setAttribute('class', 'sky');
sky.innerHTML = '<g class="links"></g><path class="arc"/><g class="ticks"></g>'
  + '<g class="orb"><circle class="halo" r="24"/><circle class="disc" r="9"/></g>';
ui.prepend(sky);
const orb = sky.querySelector('.orb');
// Seen from this camera the sun's true path runs nearly edge-on (it would draw as a
// line through the flat), so the day is drawn as two small arches above the model.
function toScreen(v) {
  const q = v.clone().project(camera), r = el.getBoundingClientRect();
  return [r.left + (q.x * 0.5 + 0.5) * r.width, r.top + (-q.y * 0.5 + 0.5) * r.height];
}
// The track lives in the strip along the top, between the title and the toolbar, so it
// never crosses the model.
function skyArc() {
  const title = document.querySelector('.title').getBoundingClientRect(), tools = $('.tools', ui).getBoundingClientRect();
  const x0 = title.right + 40, x1 = tools.left - 40, w = Math.max(160, Math.min(720, x1 - x0));
  // with the moodboard showing, its cards take that strip: the track drops below them
  const cy = document.body.classList.contains('no-board') ? 92 : 212;
  return { cx: (x0 + x1) / 2, cy, rx: w / 2, ry: 52 };
}
// a time on the day's track: before sunrise counts as the end of the night
const onTrack = (t) => (t < RISE ? t + 24 : t);
const isDay = (t) => { const tt = onTrack(t); return tt >= RISE && tt <= SET; };
function arcAt(t, A) {                       // screen point for any time, 6 am to 6 am
  const tt = Math.min(RISE + 24, Math.max(RISE, onTrack(t))), half = A.rx / 2, day = tt <= SET;
  const u = (tt - (day ? RISE : SET)) / 12, cx = A.cx + (day ? -half : half);
  return [cx - Math.cos(Math.PI * u) * half, A.cy - Math.sin(Math.PI * u) * A.ry * (day ? 1 : 0.72)];
}
let sunDrag = null;
orb.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  try { orb.setPointerCapture(e.pointerId); } catch {}
  sunDrag = {}; timeAnim = null;
  document.body.classList.add('sun-live');
});
// the arc is only drawn while the sun is in hand (or the pointer rests on it)
orb.addEventListener('pointerenter', () => document.body.classList.add('sun-live'));
orb.addEventListener('pointerleave', () => { if (!sunDrag) document.body.classList.remove('sun-live'); });
orb.addEventListener('pointermove', (e) => {
  if (!sunDrag) return;
  const A = skyArc();
  let best = RISE, bd = Infinity;
  for (let t = RISE; t <= RISE + 24; t += 0.05) {
    const [x, y] = arcAt(t, A), d = Math.hypot(x - e.clientX, y - e.clientY);
    if (d < bd) { bd = d; best = t; }
  }
  state.t = Math.min(DAY_END, best);
  relight(); refresh();
});
const endSunDrag = () => { if (sunDrag) { sunDrag = null; document.body.classList.remove('sun-live'); commit(); } };
orb.addEventListener('pointerup', endSunDrag);
orb.addEventListener('pointercancel', endSunDrag);

// ------------------------------------------------------------------ the moodboard
// A card per surface, floating over the model, each tied by a thread to where that
// finish is in the room: what the room is made of, at a glance. Click a card to pick
// the surface; drop a sample on a card to put it there.
const BOARD = ['walls', 'floor', 'upholstery', 'woodwork', 'joinery', 'worktop'];
const board = document.createElement('div');
board.className = 'board';
board.innerHTML = BOARD.map(k => `<button class="mb-card" data-slot="${k}"><span class="pic"></span><b></b><small>${SLOTS[k].name}</small></button>`).join('');
ui.prepend(board);
board.querySelectorAll('.mb-card').forEach(c => {
  const slot = c.dataset.slot;
  c.onclick = () => selectSlot(slot, boardAnchor(slot));
  c.onpointerenter = () => { if (!sel?.slot) highlight(slot); };
  c.onpointerleave = () => { if (!sel?.slot) highlight(null); };
});
let anchors = {}, anchorAz = null, anchorKey = '';
function computeAnchors() {
  const tgt = controls.target, toward = new V3().subVectors(tgt, camera.position).setY(0).normalize();
  const best = {}, box = new THREE.Box3(), c = new V3();
  const offer = (slot, pt, score) => { if (!best[slot] || score < best[slot].score) best[slot] = { pt, score }; };
  for (const root of [api.activeShell(), pieces]) root.traverse(o => {
    if (!o.isMesh || !shown(o)) return;
    const mats = [].concat(o.material);
    for (const slot of BOARD) {
      if (!mats.includes(M[SLOTS[slot].mat])) continue;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.getCenter(c);
      if (slot === 'floor') offer(slot, new V3(tgt.x, 0, tgt.z), 0);
      else if (slot === 'walls') {
        if (!o.userData.wall || o.scale.y < 0.99 || box.max.y < 2) continue;      // a full-height wall
        // the far side of the room faces the viewer
        offer(slot, new V3(c.x, 1.5, c.z), -c.clone().sub(tgt).setY(0).dot(toward) + 0.2 * c.distanceTo(tgt));
      } else offer(slot, new V3(c.x, box.max.y, c.z), c.distanceTo(tgt));
    }
  });
  anchors = Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.pt]));
}
function boardAnchor(slot) { return anchors[slot] || controls.target.clone().setY(0); }
function refreshBoard() {
  board.querySelectorAll('.mb-card').forEach(c => {
    const slot = c.dataset.slot, s = SAMPLE[state.f[slot]];
    if (c.dataset.id !== s.id) { c.dataset.id = s.id; $('.pic', c).style.backgroundImage = `url(${swatchFor(s)})`; $('b', c).textContent = s.name; }
    c.classList.toggle('on', sel?.slot === slot);
  });
  anchorKey = '';                    // re-lay on the next frame
}
api.focusHooks.push((f) => {
  anchorAz = null; anchorKey = '';
  // entering or leaving a bedroom changes which surfaces the tray, presets and meter mean
  if (sel?.slot) deselect(); else if (tab !== 'products' && tab !== 'furniture') renderTray(); else refresh();
});
function layoutOverlay() {
  const rect = el.getBoundingClientRect();
  const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  const key = [camera.position.x, camera.position.z, camera.position.y, camera.zoom, controls.target.x, controls.target.z,
               state.t, rect.width, rect.height, api.focused?.id, document.body.className].map(v => typeof v === 'number' ? v.toFixed(3) : v).join('|');
  if (key === anchorKey) return;
  sky.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  // the arc and its hour marks
  const A = skyArc(), pts = [];
  for (let t = RISE; t <= RISE + 24 + 1e-6; t += 0.1) pts.push(arcAt(t, A));
  sky.querySelector('.arc').setAttribute('d', 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join(' L'));
  // hour marks every three hours, and the three turning points labelled
  const marks = [9, 12, 15, 21, 24, 27].map(h => { const [x, y] = arcAt(h, A); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2"/>`; }).join('');
  const label = (t) => { const [x, y] = arcAt(t, A); return `<text x="${x.toFixed(1)}" y="${(y + 16).toFixed(1)}">${clock(t)}</text>`; };
  sky.querySelector('.ticks').innerHTML = marks + label(RISE) + label(SET) + label(RISE + 24);
  const [ox, oy] = arcAt(state.t, A);
  orb.classList.toggle('moon', !isDay(state.t));
  orb.setAttribute('transform', `translate(${ox.toFixed(1)} ${oy.toFixed(1)})`);
  // the board: recompute where each finish is when the view swings round
  if (anchorAz === null || Math.abs(Math.atan2(Math.sin(az - anchorAz), Math.cos(az - anchorAz))) > 0.4) { computeAnchors(); anchorAz = az; }
  const cards = [...board.children];
  const live = cards.filter(c => anchors[c.dataset.slot]).map(c => ({ c, p: toScreen(anchors[c.dataset.slot]) })).sort((a, b) => a.p[0] - b.p[0]);
  cards.forEach(c => { c.hidden = !anchors[c.dataset.slot]; });
  const title = document.querySelector('.title').getBoundingClientRect(), tools = $('.tools', ui).getBoundingClientRect();
  const x0 = Math.max(api.safe.left, title.right) + 18, x1 = Math.min(innerWidth - api.safe.right, tools.left) - 18;
  const CW = 84, step = Math.max(CW + 4, Math.min(104, (x1 - x0) / Math.max(1, live.length))), start = (x0 + x1) / 2 - (step * live.length) / 2;
  const lines = [];
  live.forEach(({ c, p }, i) => {
    const x = start + step * i + (step - CW) / 2, y = 16;
    c.style.transform = `translate(${x.toFixed(1)}px, ${y}px)`;
    lines.push(`<line x1="${(x + CW / 2).toFixed(1)}" y1="${y + 104}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5"/>`);
  });
  sky.querySelector('.links').innerHTML = lines.join('');
  anchorKey = key;                   // only once everything above has succeeded
}
api.frameHooks.push(() => { layoutOverlay(); });
addEventListener('resize', () => { anchorKey = ''; anchorAz = null; });

// ------------------------------------------------------------------ products tab
// The choices for what is on screen: the dining set in the living space, the basin,
// shower and finish in a washroom, tiles on the balcony and in the master washroom.
const METAL = { chrome: '#D9DCDF', bronze: '#7E5C3E', black: '#1E1E1E', gold: '#C9A35C' };
const productThumbs = new Map();
function productPic(key, id) {
  const k = key.split('.')[0];
  if (k === 'finish') return `background:${METAL[id]}`;
  if (k === 't3walls' || k === 'balconyFloor' || k === 'balconyWall') {
    if (k === 't3walls' && id === 'marble') return `background-image:url(${swatchURL(M.tlt3wall.map, 112)})`;
    if (k === 'balconyFloor' && id === 'plain') return `background-image:url(${swatchURL(M.floor.map, 112)})`;
    if (k === 'balconyWall' && id === 'paint') return `background-image:url(${swatchURL(M.walls.map, 112)})`;
    const name = { geode: 'geode', emerald: 'emerald', patterned: 'encaustic', plain: 'plainGrey' }[id];
    return `background-image:url(${swatchURL(PR.tile(name).map, 112)})`;
  }
  const t = productThumbs.get(k + ':' + id);
  return t ? `background-image:url(${t})` : '';
}
function visibleGroups() {
  const f = api.focused, members = f ? (f.members || [f.id]) : null;
  return PR.GROUPS.filter(g => members ? g.rooms.some(r => members.includes(r)) : ['table', 'chair', 'balconyFloor', 'balconyWall'].includes(g.key));
}
function renderProducts(tray) {
  const groups = visibleGroups();
  if (!groups.length) { tray.innerHTML = '<p class="pnote">Nothing to choose in this room yet. Open the living space, a washroom or the balcony.</p>'; return; }
  for (const g of groups) {
    const box = document.createElement('div'); box.className = 'pgroup';
    box.innerHTML = `<small>${g.label}</small><div class="opts"></div>`;
    for (const o of g.options) {
      const b = document.createElement('button');
      b.className = 'popt' + ((state.p[g.key] || PR.DEFAULTS[g.key]) === o.id ? ' on' : '');
      b.innerHTML = `<span class="pic" style="${productPic(g.key, o.id)}"></span><b>${o.name}</b>${o.note ? `<small>${o.note}</small>` : ''}`;
      b.onclick = () => chooseProduct(g, o);
      box.querySelector('.opts').appendChild(b);
    }
    tray.appendChild(box);
  }
  if (!api.focused) tray.insertAdjacentHTML('beforeend', '<p class="pnote">Open a washroom for its basin, shower and finish.</p>');
  makeProductThumbs(groups);
}
function chooseProduct(g, o) {
  state.p[g.key] = o.id;
  PR.apply(state.p);
  if (g.key === 'table') arrangeChairs(JSON.parse(current || '{}').m || {});
  commit(); renderTray();
  toast(`${g.label}: ${o.name}`);
}
let thumbBusy = false;
async function makeProductThumbs(groups) {
  if (thumbBusy) return;
  const todo = groups.flatMap(g => g.options.map(o => [g.key, o.id])).filter(([k, id]) => {
    const kk = k.split('.')[0]; return ['table', 'chair', 'basin', 'shower'].includes(kk) && !productThumbs.has(kk + ':' + id);
  });
  if (!todo.length) return;
  thumbBusy = true;
  const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  tr.setPixelRatio(2); tr.setSize(76, 60); tr.toneMapping = THREE.ACESFilmicToneMapping;
  const ts = new THREE.Scene();
  ts.add(new THREE.HemisphereLight(0xFFF4E6, 0x3A3028, 1.6));
  const dl = new THREE.DirectionalLight(0xFFFFFF, 2.4); dl.position.set(2, 4, 3); ts.add(dl);
  const cam = new THREE.PerspectiveCamera(26, 76 / 60, 0.05, 60);
  for (const [key, id] of todo) {
    const t = PR.thumbPiece(key, id); if (!t) continue;
    const g = t.build(t.p); ts.add(g);
    const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new V3()), R = box.getSize(new V3()).length() / 2;
    cam.position.copy(ctr).add(new V3(0.85, 0.9, 1.15).normalize().multiplyScalar(R / Math.sin(THREE.MathUtils.degToRad(13)) * 0.92));
    cam.lookAt(ctr); tr.render(ts, cam);
    productThumbs.set(key.split('.')[0] + ':' + id, tr.domElement.toDataURL());
    ts.remove(g);
    await new Promise(r => setTimeout(r, 0));
  }
  tr.dispose(); tr.forceContextLoss();
  thumbBusy = false;
  if (tab === 'products') renderTray();
}
api.focusHooks.push(() => { if (tab === 'products') renderTray(); });

// ------------------------------------------------------------------ furniture thumbnails
// Each catalogue piece is rendered once, on a small separate renderer, then thrown away.
async function makeThumbs() {
  const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  tr.setPixelRatio(2); tr.setSize(76, 60); tr.toneMapping = THREE.ACESFilmicToneMapping;
  const ts = new THREE.Scene();
  ts.add(new THREE.HemisphereLight(0xFFF4E6, 0x3A3028, 1.5));
  const dl = new THREE.DirectionalLight(0xFFFFFF, 2.4); dl.position.set(2, 4, 3); ts.add(dl);
  const cam = new THREE.PerspectiveCamera(26, 76 / 60, 0.05, 60);
  for (const c of CATALOGUE) {
    const o = { cx: CX, cy: CY, w: c.w, d: c.d, angle: 0 };
    const g = B[c.type]({ id: 'thumb-' + c.type, type: c.type, name: c.name, obb: o, footprint: rectRing(o), facing: null });
    ts.add(g);
    const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new V3()), R = box.getSize(new V3()).length() / 2;
    cam.position.copy(ctr).add(new V3(0.85, 0.8, 1.15).normalize().multiplyScalar(R / Math.sin(THREE.MathUtils.degToRad(13)) * 0.92));
    cam.lookAt(ctr);
    tr.render(ts, cam);
    c.thumb = tr.domElement.toDataURL();
    ts.remove(g);
    const img = ui.querySelector(`.item[data-type="${c.type}"] .pic`);
    if (img) img.innerHTML = `<img src="${c.thumb}" alt="">`;
    await new Promise(r => setTimeout(r, 0));
  }
  tr.dispose(); tr.forceContextLoss();
}

// the camera frames each space into the screen the panels leave free
function measureSafe() {
  const w = innerWidth, h = innerHeight, r = (q) => { const e = $(q, ui); return e && getComputedStyle(e).display !== 'none' ? e.getBoundingClientRect() : null; };
  const mood = r('.mood'), day = r('.daylight'), dock = r('.dock');
  if (w <= 700) {                    // a phone: the model fits between the top strip and the tray
    const chips = document.getElementById('chips').getBoundingClientRect();
    api.safe.left = api.safe.right = 6;
    api.safe.top = (chips.bottom || 160) + 6;
    api.safe.bottom = dock ? h - dock.top + 6 : 20;
    return;
  }
  api.safe.left = mood ? mood.right * 0.85 : 20;
  api.safe.right = day ? (w - day.left) * 0.85 : 20;
  api.safe.top = 70;
  api.safe.bottom = dock ? h - dock.top + 10 : 20;
}
addEventListener('resize', () => { measureSafe(); });

// ------------------------------------------------------------------ start
for (const k in SLOTS) setSlot(k, DEFAULTS[k]);
let initial = {};
if (location.hash.startsWith('#s=')) { try { initial = JSON.parse(b64.dec(location.hash.slice(3))); } catch { initial = {}; } }
applyState(initial);
current = JSON.stringify(serialize());
setTab('wood');
refresh();
document.body.classList.add('configurator');
// Calm by default, like Ryan Sael's room: the moodboard cards and their threads wait
// behind the eye button (or N).
document.body.classList.add('no-board');
for (const k in SLOTS) spreadable(M[SLOTS[k].mat]);
// compile the finishes' shaders in parallel before drawing with them, instead of
// stalling the page on the first frame
api.hold = true;
renderer.compileAsync(scene, camera).catch(() => {}).finally(() => { api.hold = false; measureSafe(); api.resetView(); });
window.__config = { state, SAMPLES, SLOTS, setSlot, applyState, serialize, fits, pose, sunAt, relight, addPiece };
