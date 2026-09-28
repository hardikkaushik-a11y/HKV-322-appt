// HKV-322, the whole flat as a diorama. The engine is B-34's; the flat is read out of
// Ar. Shivangi Kaushik's ALD-01 PDF (its CAD layers) by build/build_zone.py, and the
// furniture at the positions and sizes she drew by build/build_pieces.py. The
// "Original" look is the flat as it stands today, from site photos.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { marble, wood, fabric, shutter, tambour, paint, terrazzo, leather, limewash, normalFrom } from './textures.js';
import { buildFurnishing } from './furnish.js';

const zone = await (await fetch('../assets/diorama/zone.json')).json();
const [CX, CY] = zone.centre;
const CUT = zone.cut_height;
const CT = zone.counter.carcass, CTOP = zone.counter.carcass + zone.counter.top;

// plan (x, y) in metres -> three.js world (X, Z). Y is up.
const W = (x, y) => new THREE.Vector3(x - CX, 0, -(y - CY));

// ------------------------------------------------------------------ renderer
const host = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
// Phones get a lighter scene: less resolution, a smaller shadow map, no ambient occlusion.
const lite = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 500;
renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Shadows are recomputed only when something changes (a finish, the sun, a moved
// piece), not every frame. The same trick Ryan Sael's room uses.
renderer.shadowMap.autoUpdate = false;
// the section cut, like slicing a model: nothing above door-head height is drawn.
// A renderer-wide plane, so it also applies inside the AO pass's own render.
// It sits 1 cm above CUT: the shell's walls stop at exactly CUT, and a wall cap lying
// on the clip plane gets clipped pixel by pixel at random, which strobes as you orbit.
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT + 0.01)];
renderer.localClippingEnabled = true;
host.appendChild(renderer.domElement);
// Frames are drawn only when something changed (the camera, a finish, the sun, a
// moved piece); an idle page costs no GPU at all. wake(n) asks for n more frames.
let wakeFrames = 4;
const wake = (n = 3) => { wakeFrames = Math.max(wakeFrames, n); };
const dirtyShadows = () => { renderer.shadowMap.needsUpdate = true; wake(); };

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const studioEnvironment = scene.environment;
scene.environmentIntensity = 0.68;
const roomEnvironments = new Map();
async function roomEnvironment(rid) {
  const tour = window.ROOMTOUR?.[rid], point = tour?.points?.[0];
  if (!point) return null;
  if (!roomEnvironments.has(rid)) {
    roomEnvironments.set(rid, new THREE.TextureLoader().loadAsync(`../assets/tour/${point.file}`).then(tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const target = pmrem.fromEquirectangular(tex);
      tex.dispose();
      return { target, texture: target.texture, yaw: tour.yawOffset || 0 };
    }).catch(e => { console.warn(`Could not build ${rid} reflection environment`, e); return null; }));
  }
  return roomEnvironments.get(rid);
}
async function useRoomEnvironment(rid) {
  if (!rid) {
    scene.environment = studioEnvironment;
    scene.environmentRotation.set(0, 0, 0);
    wake();
    return;
  }
  const env = await roomEnvironment(rid);
  if (focused?.id !== rid || !env) return;
  scene.environment = env.texture;
  scene.environmentRotation.set(0, env.yaw, 0);
  wake();
}

// ------------------------------------------------------------------ camera
// depth range sized to the model (camera sits 40 m out, the flat is ~20 m across):
// a loose range starves depth precision and coincident surfaces shimmer
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 12, 70);
// seen from the balcony side: the north face is sliding glass, so nothing blocks the view in,
// and the curved kitchen bay becomes the backdrop instead of the obstruction
const ISO_AZ = THREE.MathUtils.degToRad(212), ISO_EL = THREE.MathUtils.degToRad(52);
camera.position.set(Math.sin(ISO_AZ) * Math.cos(ISO_EL), Math.sin(ISO_EL), Math.cos(ISO_AZ) * Math.cos(ISO_EL)).multiplyScalar(40);
camera.lookAt(0, 0.6, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minPolarAngle = THREE.MathUtils.degToRad(12);
controls.maxPolarAngle = THREE.MathUtils.degToRad(72);
controls.minZoom = 0.45; controls.maxZoom = 5;
controls.screenSpacePanning = true;

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight(0xfff1e0, 0x2a221b, 0.32);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe9cf, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(lite ? 2048 : 4096, lite ? 2048 : 4096);
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 80 });
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xfff3e6, 0); scene.add(fill, fill.target);
// the configurator's daylight takes over lighting when it loads (lightHooks.relight)
const lightHooks = { relight: null };
let studioOn = false;
function studio(on) {
  studioOn = on;
  if (lightHooks.relight) return lightHooks.relight();
  hemi.intensity = on ? 0.84 : 0.62;
  scene.environmentIntensity = on ? 0.88 : 0.68;
  fill.intensity = on ? 1.30 : 0.50;
  placeSun(150, on ? 58 : 38);
}
function placeSun(azDeg, elDeg) {
  const a = THREE.MathUtils.degToRad(azDeg), e = THREE.MathUtils.degToRad(elDeg);
  sun.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(30);
  sun.target.position.set(0, 0, 0);
  dirtyShadows();
}
placeSun(150, 38);

// ------------------------------------------------------------------ materials
// Default finishes: extensions of her own palette, not her specification.
// Slot keys are what the configurator will swap.
const M = {};
// physical, so a finish can take sheen (fabric) or a clearcoat (polished stone,
// lacquer) when the configurator swaps it; at zero they cost what standard costs
function std(key, opts) { M[key] = new THREE.MeshPhysicalMaterial(opts); return M[key]; }
std('floor',    { map: marble({ base: 0xDCCFBC, vein: 0xA88E6E, tile: 0.8, seed: 21 }), roughness: 0.2, metalness: 0 });
std('walls',    { map: paint({ base: 0xEDE6DA }), roughness: 0.92 });
std('section',  { color: 0x2A2521, roughness: 0.9 });
std('sill',     { map: marble({ base: 0xD8CFBF, vein: 0xA8957C, tile: 1.2, joint: false, seed: 4 }), roughness: 0.3 });
std('plinth',   { color: 0x17130F, roughness: 0.75 });
std('top',      { map: marble({ base: 0xEEE9E0, vein: 0xB8AD9A, tile: 1.4, joint: false, veins: 7, seed: 31 }), roughness: 0.18 });
std('shutters', { map: shutter({ base: 0x8A7F72 }), roughness: 0.38 });
std('toekick',  { color: 0x3B332C, roughness: 0.7 });
std('fabric',   { map: fabric({ base: 0xB7A993 }), roughness: 0.95 });
std('accent',   { map: fabric({ base: 0x8C5A3C, seed: 8 }), roughness: 0.95 });
std('walnut',   { map: wood({ base: 0x6A4731, dark: 0x2E1C10, plank: 0.3, length: 1.8 }), roughness: 0.5 });
std('lacquer',  { map: paint({ base: 0xCBBFAC, seed: 2 }), roughness: 0.4 });
std('door',     { map: wood({ base: 0xA88F72, dark: 0x6E5843, plank: 0.9, length: 2.1, seed: 12 }), roughness: 0.6 });
std('brass',    { color: 0xC19A48, metalness: 1, roughness: 0.32 });
std('steel',    { color: 0xC7C9CB, metalness: 1, roughness: 0.28 });
std('darkglass',{ color: 0x0E0F10, metalness: 0.2, roughness: 0.06 });
std('screen',   { color: 0x070707, metalness: 0.1, roughness: 0.12, emissive: 0x05070a });
std('ceramic',  { color: 0xF3F1ED, roughness: 0.18 });
std('tambour',  { map: tambour({ base: 0x8A7F72 }), roughness: 0.4 });
std('tlt3wall', { map: marble({ base: 0xD8C9B0, vein: 0x9C8465, tile: 1.2, veins: 7, seed: 44 }), roughness: 0.16 });
std('terrazzo', { map: terrazzo({ base: 0xD9CDBA }), roughness: 0.3 });
std('washer',   { color: 0xEDEDEA, roughness: 0.35 });
// LG's Platinum Silver, brushed, on the dishwasher
std('dishwasher', { color: 0xB8BABC, metalness: 0.75, roughness: 0.36 });
// LG's Matte Black PCM: a dark, faintly metallic, satin sheet
std('fridge',   { color: 0x2A2B2E, metalness: 0.45, roughness: 0.42, clearcoat: 0.08, clearcoatRoughness: 0.4 });
// her Toilet 3 vanity: walnut by her spec, kept apart from the swappable woodwork
std('t3walnut', { map: M.walnut.map, roughness: 0.5 });
M.glass = new THREE.MeshPhysicalMaterial({ color: 0xdcebf0, roughness: 0.04, metalness: 0, transparent: true,
                                          opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });

// ------------------------------------------------------------------ geometry helpers
function shapeFrom(outer, holes = []) {
  const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x - CX, y - CY)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x - CX, y - CY))));
  return s;
}
// extrude a plan outline from z0 to z1 (metres above floor). ExtrudeGeometry
// groups: 0 = caps (top/bottom), 1 = sides.
function prism(outer, holes, z0, z1, mat, capMat) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(outer, holes), { depth: Math.max(0.001, z1 - z0), bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, z0, 0);
  const m = new THREE.Mesh(g, capMat ? [capMat, mat] : mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}

// point-in-polygon on plan rings, for "which side of this unit is the wall"
function inRing(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const solidWalls = zone.walls.filter(w => w.kind === 'masonry' || w.kind === 'partition' || w.kind.startsWith('masonry'));
const inWall = (pt) => solidWalls.some(w => inRing(pt, w.outer));
// unit vector (plan) from a piece toward its back wall, perpendicular to its long axis
function backDir(o) {
  const n = [-Math.sin(o.angle), Math.cos(o.angle)];
  for (const s of [1, -1]) {
    for (const k of [0.12, 0.25, 0.4]) {
      const p = [o.cx + n[0] * s * (o.d / 2 + k), o.cy + n[1] * s * (o.d / 2 + k)];
      if (inWall(p)) return [n[0] * s, n[1] * s];
    }
  }
  return [-n[0], -n[1]];
}

// ------------------------------------------------------------------ her bedrooms
// The four bedrooms are Ar. Shivangi Kaushik's design, rebuilt in the flat's own
// procedural style (bedrooms.js). Her finishes are the defaults; each room has its own
// finish slots and movable furniture. Built before the shell, because each bedroom's
// floor is cut out of the flat's floor.
const BAY = null;
const bedrooms = buildFurnishing({ W, CUT, mesh, rbox, prism, M, zone, inWall, inRing });
// HKV-322's own pieces (furnish.js) take their shape from BUILD; the rest use B below
for (const p of zone.pieces) if (bedrooms.BUILD[p.type]) p.build = bedrooms.BUILD[p.type];
const bedroomFloors = Object.values(bedrooms.floors);
// the bedroom rings that sit wholly inside a floor polygon and clear of its own holes
const floorCuts = (f) => bedroomFloors.filter(ring => ring.every(p => inRing(p, f.outer))
  && !f.holes.some(h => h.some(p => inRing(p, ring)) || ring.some(p => inRing(p, h))));

// ------------------------------------------------------------------ the shell
// One builder for both views: the whole flat, and a single room on its own plinth.
function buildShell(group, { plinth, floor, walls, glass }) {
  // like a physical model on a base (a merged space stands on each member's base)
  for (const ring of Array.isArray(plinth[0][0]) ? plinth : [plinth]) group.add(prism(ring, [], -0.42, -0.021, M.plinth));
  // Floors cast no shadow: laid a few mm above the floor, a tile inlay caught the
  // floor's own shadow in patches that crawled with the sun.
  for (const f of floor) { const m = prism(f.outer, [...f.holes, ...floorCuts(f)], -0.024, -0.004, M.floor); m.castShadow = false; group.add(m); }
  for (const w of walls) {
    const k = w.kind;
    let mat = M.walls, cap = M.section;
    if (k.includes('sill')) { cap = M.sill; }
    else if (k.includes('door_leaf')) { mat = M.door; cap = M.door; }
    const cut = w.z1 >= CUT - 1e-6;          // cut by the section: a dark cap, as in a model
    const m = prism(w.outer, w.holes, w.z0, w.z1, mat, cut ? M.section : cap);
    const cx = w.outer.reduce((a, q) => a + q[0], 0) / w.outer.length, cy = w.outer.reduce((a, q) => a + q[1], 0) / w.outer.length;
    m.userData.wall = { z0: w.z0, z1: w.z1, cx, cy, kind: w.kind, outer: w.outer };
    group.add(m);
  }
  for (const g of glass) {
    const pos = [], idx = [];
    g.path.forEach(([x, y], i) => {
      const v = W(x, y);
      pos.push(v.x, g.z0, v.z, v.x, Math.min(g.z1, CUT), v.z);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.glass); m.renderOrder = 2;
    const mid = g.path[Math.floor(g.path.length / 2)];
    m.userData.glass = { cx: mid[0], cy: mid[1] };
    group.add(m);
  }
  return group;
}
const shell = buildShell(new THREE.Group(), { plinth: [zone.zone], floor: zone.floor, walls: zone.walls, glass: zone.glass });
scene.add(shell);
// each bedroom's own wall paint, dropped by the cutaway like the walls behind it
for (const g of Object.values(bedrooms.cladding)) scene.add(g);

// B-34's Bedroom 3 sliding door has no counterpart here; the group stays so hover
// and the door hook keep one code path.
const link = new THREE.Group(); link.userData.cladding = true; link.userData.rooms = [];
scene.add(link);
const slider = { position: { z: 0 } }, sliderZ = 0, pw = 1;
let doorOpen = 0, doorTarget = 0;

// ------------------------------------------------------------------ furniture
const pieces = new THREE.Group(); scene.add(pieces);

// a group positioned at a piece's oriented box, local +X along its long side,
// local +Z toward `front` (a plan unit vector) when one is given
function frame(o, front) {
  const g = new THREE.Group();
  const c = W(o.cx, o.cy); g.position.set(c.x, 0, c.z);
  if (front) g.rotation.y = Math.atan2(front[0], -front[1]);
  else g.rotation.y = o.angle;
  return g;
}

const B = {
  counter(p, opts = {}) {
    const g = new THREE.Group(), f = p.footprint;
    g.add(prism(f, [], 0, 0.1, M.toekick));
    g.add(prism(f, [], 0.1, CT, opts.front || M.shutters, M.section));
    g.add(prism(f, [], CT, CTOP, M.top));
    return g;
  },
  dishwasher(p) {
    // Her label: LG DFB532FP, 600 x 600 x 850 mm, freestanding, Platinum Silver
    // (lg.com/in), under the worktop: a kickplate, a plain brushed door, and a control
    // strip along its top with a pocket handle in the middle and a small display.
    const o = p.obb, back = backDir(o), g = new THREE.Group();
    g.add(prism(p.footprint, [], 0, CT, M.dishwasher, M.section));
    g.add(prism(p.footprint, [], CT, CTOP, M.top));
    const fr = frame(o, [-back[0], -back[1]]), w = Math.min(0.6, Math.max(o.w, o.d)), fz = Math.min(o.w, o.d) / 2;
    const line = (y) => fr.add(mesh(new THREE.BoxGeometry(w - 0.01, 0.005, 0.004), M.darkglass, 0, y, fz + 0.001));
    line(0.09); line(CT - 0.115);
    fr.add(mesh(new THREE.BoxGeometry(0.18, 0.035, 0.006), M.darkglass, 0, CT - 0.14, fz + 0.002));
    fr.add(mesh(new THREE.BoxGeometry(0.07, 0.022, 0.003), M.screen, 0.02, CT - 0.055, fz + 0.001));
    g.add(fr); return g;
  },
  unit(p) { return B.counter(p); },
  sink(p) {
    const o = p.obb, back = backDir(o), g = frame(o, [-back[0], -back[1]]);
    const w = Math.max(o.w, o.d), d = Math.min(o.w, o.d);
    g.add(mesh(new THREE.BoxGeometry(w, 0.004, d), M.steel, 0, CTOP + 0.002, 0));
    g.add(mesh(rbox(w * 0.48, 0.02, d * 0.78, 0.03), M.darkglass, -w * 0.2, CTOP + 0.001, 0.02));
    // tap at the back edge, over the bowl
    const tx = -w * 0.2, tz = -d / 2 + 0.05;
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.32, 16), M.steel, tx, CTOP + 0.16, tz));
    const arc = mesh(new THREE.TorusGeometry(0.09, 0.012, 10, 24, Math.PI), M.steel, tx, CTOP + 0.32, tz + 0.09);
    arc.rotation.y = Math.PI / 2; g.add(arc);
    return g;
  },
  hob(p) {
    const o = p.obb, back = backDir(o), g = frame(o, [-back[0], -back[1]]);
    const w = Math.max(o.w, o.d), d = Math.min(o.w, o.d);
    g.add(mesh(rbox(w * 0.96, 0.008, d * 0.94, 0.004), M.darkglass, 0, CTOP + 0.004, 0));
    // five burners, laid out as she drew them: four corners and a centre
    for (const [u, v] of [[-0.314, -0.225], [0.314, -0.225], [-0.314, 0.225], [0.314, 0.225], [0, 0]]) {
      const r = u || v ? 0.055 : 0.07;
      const ring = mesh(new THREE.TorusGeometry(r, 0.012, 8, 28), M.steel, u * w, CTOP + 0.018, v * d);
      ring.rotation.x = Math.PI / 2; g.add(ring);
      g.add(mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.012, 20), M.darkglass, u * w, CTOP + 0.016, v * d));
    }
    return g;
  },
  burners() { return new THREE.Group(); },          // drawn by hob()
  otg(p) {
    const g = B.counter(p), o = p.obb, back = backDir(o), fr = frame(o, [-back[0], -back[1]]);
    fr.add(mesh(rbox(0.5, 0.32, 0.4, 0.015), M.darkglass, 0, CTOP + 0.16, 0));
    fr.add(mesh(new THREE.BoxGeometry(0.34, 0.2, 0.004), M.screen, -0.05, CTOP + 0.16, 0.201));
    g.add(fr); return g;
  },
  appliance_garage(p) {
    const g = new THREE.Group();
    g.add(prism(p.footprint, [], CTOP, CTOP + 0.45, M.tambour, M.lacquer));
    return g;
  },
  fridge(p) {
    // Her label: LG GL-B257HMC3, 650 L side-by-side, 913 x 735 x 1790 mm, Matte Black PCM
    // (lg.com/in). Doors split about 43 / 57, a recessed pocket-handle band across both
    // at about 0.8 m with a thin steel lip under it, small feet.
    const o = p.obb, back = backDir(o), g = new THREE.Group(), H = p.height || 1.79;
    g.add(prism(p.footprint, [], 0.03, H, M.fridge));
    const fr = frame(o, [-back[0], -back[1]]);
    const w = Math.max(o.w, o.d), d = Math.min(o.w, o.d), fz = d / 2, split = -w / 2 + 0.43 * w;
    fr.add(mesh(new THREE.BoxGeometry(0.005, H - 0.05, 0.004), M.darkglass, split, 0.03 + (H - 0.03) / 2, fz + 0.001));
    fr.add(mesh(new THREE.BoxGeometry(w - 0.006, 0.045, 0.004), M.darkglass, 0, 0.83, fz + 0.001));
    for (const [x0, x1] of [[-w / 2 + 0.01, split - 0.006], [split + 0.006, w / 2 - 0.01]])
      fr.add(mesh(new THREE.BoxGeometry(x1 - x0, 0.007, 0.006), M.steel, (x0 + x1) / 2, 0.8, fz + 0.003));
    for (const sx of [-1, 1]) fr.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), M.darkglass, sx * (w / 2 - 0.06), 0.015, fz - 0.08));
    g.add(fr); return g;
  },
  sofa(p, seats = 4) {
    const o = p.obb;
    /* The DXF block's facing vectors carry a roughly 10 degree skew even though the
       four-seaters are drawn square to the two living-room walls. Preserve which way
       each sofa faces, but snap that direction to its dominant plan axis. */
    const front = seats === 4 && p.facing
      ? (Math.abs(p.facing[0]) >= Math.abs(p.facing[1])
          ? [Math.sign(p.facing[0]) || 1, 0]
          : [0, Math.sign(p.facing[1]) || 1])
      : p.facing;
    const g = frame(o, front), w = o.w, d = o.d;
    const arm = 0.14, back = 0.2, legH = 0.08;
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.014, legH, 10), M.brass, sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06)));
    g.add(mesh(rbox(w, 0.2, d, 0.03), M.fabric, 0, legH + 0.1, 0));
    const cw = (w - 2 * arm) / seats;
    for (let i = 0; i < seats; i++)
      g.add(mesh(rbox(cw - 0.012, 0.13, d - back - 0.02, 0.045), M.fabric, -w / 2 + arm + cw * (i + 0.5), legH + 0.265, back / 2));
    g.add(mesh(rbox(w - 2 * arm, 0.44, back, 0.05), M.fabric, 0, legH + 0.2 + 0.22, -d / 2 + back / 2));
    for (let i = 0; i < seats; i++)
      g.add(mesh(rbox(cw - 0.02, 0.3, 0.12, 0.05), M.accent, -w / 2 + arm + cw * (i + 0.5), legH + 0.47, -d / 2 + back + 0.05));
    for (const s of [-1, 1]) g.add(mesh(rbox(arm, 0.36, d, 0.05), M.fabric, s * (w / 2 - arm / 2), legH + 0.18 + 0.1, 0));
    return g;
  },
  armchair(p) { return B.sofa(p, 1); },
  dining_chair(p) {
    const o = p.obb, g = frame(o, p.facing), w = Math.min(o.w, o.d) * 0.92, d = w;
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(mesh(new THREE.BoxGeometry(0.032, 0.45, 0.032), M.walnut, sx * (w / 2 - 0.03), 0.225, sz * (d / 2 - 0.03)));
    g.add(mesh(rbox(w, 0.05, d, 0.015), M.fabric, 0, 0.47, 0));
    g.add(mesh(rbox(w * 0.9, 0.4, 0.035, 0.015), M.walnut, 0, 0.47 + 0.23, -d / 2 + 0.03));
    return g;
  },
  stool(p) {
    const o = p.obb, c = W(o.cx, o.cy), g = new THREE.Group(); g.position.set(c.x, 0, c.z);
    g.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 32), M.fabric, 0, 0.66, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.64, 12), M.brass, 0, 0.32, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.015, 32), M.brass, 0, 0.008, 0));
    const ring = mesh(new THREE.TorusGeometry(0.14, 0.008, 8, 32), M.brass, 0, 0.3, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
    return g;
  },
  dining_table(p) {
    const o = p.obb, g = new THREE.Group();
    g.add(prism(p.footprint, [], 0.73, 0.76, M.walnut));
    const fr = frame(o);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      fr.add(mesh(new THREE.BoxGeometry(0.06, 0.73, 0.06), M.walnut, sx * (o.w / 2 - 0.14), 0.365, sz * (o.d / 2 - 0.12)));
    g.add(fr); return g;
  },
  coffee_table(p) {
    // her nesting set: three tops at stepped heights so the smaller ones slide under
    const a = p.obb.w * p.obb.d, h = a > 0.8 ? 0.42 : a > 0.3 ? 0.36 : 0.3;
    const g = new THREE.Group();
    g.add(prism(p.footprint, [], h - 0.025, h, a > 0.8 ? M.top : M.walnut));
    const c = W(p.obb.cx, p.obb.cy);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, h - 0.025, 16), M.brass, c.x, (h - 0.025) / 2, c.z));
    return g;
  },
  bench(p) {
    const g = new THREE.Group();
    g.add(prism(p.footprint, [], 0.05, 0.38, M.walnut));
    g.add(prism(p.footprint, [], 0.38, 0.45, M.accent));
    return g;
  },
  tv_unit(p) {
    const o = p.obb, back = backDir(o), g = new THREE.Group();
    g.add(prism(p.footprint, [], 0.22, 0.52, M.walnut));
    const fr = frame(o, [-back[0], -back[1]]);
    // screen: implied by her electrical drawing (TV points, TV-wall lights), not by the plan
    fr.add(mesh(rbox(1.24, 0.71, 0.03, 0.006), M.screen, 0, 1.38, -o.d / 2 + 0.03));
    g.add(fr); return g;
  },
  shoe_rack(p) {
    const g = new THREE.Group();
    g.add(prism(p.footprint, [], 0.1, 1.0, M.lacquer, M.walnut));
    g.add(prism(p.footprint, [], 0, 0.1, M.toekick));
    return g;
  },
  wc(p) {
    const o = p.obb, back = backDir(o), g = frame(o, [-back[0], -back[1]]);
    g.add(mesh(rbox(0.36, 0.34, 0.5, 0.12), M.ceramic, 0, 0.4, 0.02));
    return g;
  },
  basin(p) {
    const o = p.obb, c = W(o.cx, o.cy), g = new THREE.Group();
    g.add(mesh(rbox(Math.max(o.w, 0.35), 0.14, Math.max(o.d, 0.3), 0.06), M.ceramic, c.x, 0.82, c.z));
    return g;
  },
  vanity(p) {
    const g = new THREE.Group(), t3 = p.room === 'tlt3';
    // Toilet 3 follows her written spec: walnut floating vanity, terrazzo counter
    g.add(prism(p.footprint, [], 0.45, 0.8, t3 ? M.t3walnut : M.walnut));
    g.add(prism(p.footprint, [], 0.8, 0.83, t3 ? M.terrazzo : M.top));
    return g;
  },
  side_table(p) {
    const o = p.obb, c = W(o.cx, o.cy), g = new THREE.Group(), r = Math.min(o.w, o.d) / 2;
    g.add(mesh(new THREE.CylinderGeometry(r, r, 0.03, 40), M.top, c.x, 0.5, c.z));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 16), M.brass, c.x, 0.25, c.z));
    return g;
  },
  cupboard(p) {
    const g = new THREE.Group();
    g.add(prism(p.footprint, [], 0, 0.1, M.toekick));
    g.add(prism(p.footprint, [], 0.1, 0.9, M.shutters));
    g.add(prism(p.footprint, [], 0.9, 0.93, M.top));
    return g;
  },
  washer(p) {
    // her label: two IFB front loaders, 60 x 60 x 90 cm, side by side
    const o = p.obb, back = backDir(o), g = frame(o, [-back[0], -back[1]]);
    const n = Math.max(1, Math.round(o.w / 0.6)), w = o.w / n;
    for (let i = 0; i < n; i++) {
      const x = -o.w / 2 + w * (i + 0.5);
      g.add(mesh(rbox(w - 0.02, 0.88, 0.58, 0.02), M.washer, x, 0.44, 0));
      const door = mesh(new THREE.TorusGeometry(0.17, 0.025, 12, 40), M.steel, x, 0.48, 0.3);
      g.add(door);
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 40), M.darkglass, x, 0.48, 0.295).rotateX(Math.PI / 2));
    }
    return g;
  },
};

// Every piece sits in a pivot at its own centre, so it can be picked up and turned
// about itself. Builders place geometry in plan coordinates; the inner group undoes
// the pivot's offset so nothing moves until the pivot does.
// Loose furniture can be moved; fitted joinery, appliances and sanitaryware cannot.
const MOVABLE = new Set(['sofa', 'armchair', 'dining_chair', 'dining_table', 'coffee_table', 'bench', 'stool', 'side_table']);
const pieceGroups = [];
function placePiece(p) {
  const g = p.build ? p.build(p) : (B[p.type] || B.unit)(p);
  g.traverse(o => { o.userData.piece = p; });
  const c = W(p.obb.cx, p.obb.cy), pivot = new THREE.Group(), inner = new THREE.Group();
  pivot.position.set(c.x, 0, c.z); inner.position.set(-c.x, 0, -c.z);
  inner.add(g); pivot.add(inner);
  pivot.userData.home = p.home; pivot.userData.piece = p;
  p.movable = p.movable ?? MOVABLE.has(p.type);
  pieces.add(pivot); pieceGroups.push(pivot);
  return pivot;
}
// the bedrooms' loose furniture joins her other rooms' pieces
zone.pieces.push(...bedrooms.pieces);
for (const p of zone.pieces) placePiece(p);

// ------------------------------------------------------------------ bedroom fixtures
// What stays put in each bedroom (floors, feature walls, wardrobes, desks, TVs,
// curtains) is one root in `models`, so hover, the cutaway and the curtain button
// treat it as one designed room.
const models = new THREE.Group(); scene.add(models);
const modelRoots = {};
const { roots: bedroomRoots, curtainMode: CURTAIN_MODE } = bedrooms;
const curtainMeshes = {}, curtainsOpen = new Set();
function rememberCurtainBase(o) {
  if (o.userData.curtainBase) return;
  const h = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
  o.userData.curtainBase = { position: o.position.clone(), scale: o.scale.clone(), height: h };
}
function registerCurtains(root, rid) {
  const found = [];
  root.traverse(o => {
    if (o.userData.curtain !== rid) return;
    if (o.isMesh && (o.userData.curtainRole || 'original') === 'original') rememberCurtainBase(o);
    if (o.isMesh || o.isGroup) found.push(o);
  });
  curtainMeshes[rid] = found;
  setCurtainsOnRoot(root, rid, curtainsOpen.has(rid));
  queueMicrotask(() => window.dispatchEvent(new Event('b34-curtains-ready')));
}
// At rest a room shows her dressing: drapes gathered at the sides over a sheer, the
// Bedroom 2 roman blind half down. Drawn (the curtain button), the drapes close
// across the glass and the blind rolls fully down, and they shade the sun.
function setCurtainsOnRoot(root, rid, drawn) {
  if (!root) return;
  const mode = CURTAIN_MODE[rid];
  root.traverse(o => {
    if (o.userData.curtain !== rid) return;
    const role = o.userData.curtainRole || 'original';
    if (role === 'proxy') {                   // her dressing: gathered drapes and a sheer
      if (o.isGroup) o.visible = !drawn;
      return;
    }
    const base = o.userData.curtainBase;
    if (!base) return;
    o.position.copy(base.position); o.scale.copy(base.scale);
    if (mode === 'side') { o.visible = drawn; return; }
    o.visible = true;
    if (mode === 'roman' && drawn && o.userData.fullDrop) {
      const full = o.userData.fullDrop;       // top stays put, the hem drops to the sill
      o.scale.y = base.scale.y * full / base.height;
      o.position.y = base.position.y + base.height / 2 - full / 2;
    }
  });
}
function setCurtainsOpen(rid, drawn) {
  if (!CURTAIN_MODE[rid]) return;
  if (drawn) curtainsOpen.add(rid); else curtainsOpen.delete(rid);
  for (const root of [modelRoots[rid], lowCopies[rid]]) setCurtainsOnRoot(root, rid, drawn);
  dirtyShadows();
}
const hasCurtains = rid => !!curtainMeshes[rid]?.length;
const curtainRooms = () => Object.keys(curtainMeshes).filter(hasCurtains);
function clipTo(root, [x0, y0, x1, y1]) {
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(x0 - CX)),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1 - CX),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), CY - y0),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), y1 - CY),
  ];
  root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { m.clippingPlanes = planes; m.clipShadows = true; } });
}
const status = document.getElementById('status');
const modelRooms = zone.rooms.filter(r => r.model);
for (const r of modelRooms) {
  const root = bedroomRoots[r.id];
  if (!root) continue;
  root.traverse(o => { o.userData.model = r; });
  registerCurtains(root, r.id);
  root.userData.home = r.id;
  models.add(root); modelRoots[r.id] = root;
}
const modelsReady = Promise.resolve();

// ------------------------------------------------------------------ cutaway
// Like a physical model: walls on the side facing you drop to knee height so the
// room reads, walls on the far side stay at full section height. A wall counts as
// "facing you" if stepping 0.7 m from it toward the camera leaves the zone (or, when
// one room is isolated, leaves that room). Only re-done when the set changes.
const LOW = 0.42;
let focused = null, focusGroup = null, lastKey = '';
const focusHooks = [];
function activeShell() { return focusGroup || shell; }
// Dead zone: walls only re-flip once the view has turned a clear 8 degrees since the
// last flip. Without it, the orbit's easing hovers on a threshold and the walls, and
// the shadows they cast, flutter up and down.
let lastAz = null;
function cutaway(force) {
  if (walking) return;                    // walking, every wall stands full height
  const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  if (!force && lastAz !== null) {
    let dAz = Math.abs(az - lastAz); if (dAz > Math.PI) dAz = 2 * Math.PI - dAz;
    if (dAz < THREE.MathUtils.degToRad(8)) return;
  }
  lastAz = az;
  const ring = focused ? focused.outline : zone.zone;
  const reach = focused ? 0.45 : 0.7;
  const d = new THREE.Vector3().subVectors(camera.position, controls.target); d.y = 0; d.normalize();
  const px = d.x, py = -d.z;
  // the active shell's walls and glass, plus Toilet 3's marble cladding
  const cands = [...activeShell().children, ...scene.children.filter(o => o.userData.cladding && o.visible).flatMap(o => o.children)];
  const low = [];
  cands.forEach((m, i) => {
    const info = m.userData.wall || m.userData.glass;
    const q = [info?.cx + px * reach, info?.cy + py * reach];
    if (info && !(focused?.rings ? focused.rings.some(rr => inRing(q, rr)) : inRing(q, ring))) low.push(i);
  });
  const side = focused ? `${Math.sign(Math.round(px * 2.5))}${Math.sign(Math.round(py * 2.5))}` : '';
  const key = (focused ? focused.id : '*') + side + low.join(',');
  if (key === lastKey && !force) return;
  lastKey = key;
  if (focused?.model) modelCut(focused.id);
  const set = new Set(low);
  cands.forEach((m, i) => {
    if (m.userData.wall) {
      const w = m.userData.wall, h = set.has(i) ? Math.min(LOW, w.z1) : w.z1;
      m.scale.y = w.z0 > 0 ? (set.has(i) ? 0 : 1) : h / w.z1;
      m.visible = m.scale.y > 0.001;
    } else if (m.userData.glass) m.visible = !set.has(i);
  });
  // Tall joinery against a wall on your side drops to knee height with that wall, like
  // B-34's fitted bedrooms, so a show case or wardrobe never stands between you and the room.
  for (const g of pieceGroups) {
    const p = g.userData.piece;
    if (!TALL.has(p.type)) continue;
    const k = p.obb.d / 2 + reach, q = [p.obb.cx + px * k, p.obb.cy + py * k];
    const near = !(focused?.rings ? focused.rings.some(rr => inRing(q, rr)) : inRing(q, ring));
    trimPiece(g, near);
  }
  dirtyShadows();
}
const TALL = new Set(['wardrobe', 'showcase', 'almirah', 'bookshelf']);
// cut a tall piece at knee height like a sectioned model: parts above go, parts that
// cross the cut are shortened to it, and everything comes back when it is not in front
function trimPiece(g, cut) {
  if (!g.userData.trim) {
    g.userData.trim = [];
    g.traverse(m => {
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox, y0 = m.position.y + bb.min.y * m.scale.y, y1 = m.position.y + bb.max.y * m.scale.y;
      g.userData.trim.push({ m, y: m.position.y, sy: m.scale.y, y0, y1, vis: m.visible });
    });
  }
  for (const t of g.userData.trim) {
    if (!cut || t.y1 <= LOW) { t.m.visible = t.vis; t.m.position.y = t.y; t.m.scale.y = t.sy; continue; }
    if (t.y0 >= LOW) { t.m.visible = false; continue; }
    const k = (LOW - t.y0) / (t.y1 - t.y0);
    t.m.visible = t.vis; t.m.scale.y = t.sy * k; t.m.position.y = t.y0 + (t.y - t.y0) * k;
  }
}
controls.addEventListener('change', () => cutaway());

// In single-room view a bedroom is drawn twice: a copy kept below knee height across
// the whole room, and the original with its camera-facing edge trimmed off above
// that. Joinery on the walls on your side drops with those walls, the rest (her
// headboard walls, wardrobes) stays at full height, and the trim follows the camera.
// clipShadows keeps the dropped pieces from still casting shadow.
const lowCopies = {};
function modelCut(rid) {
  const root = modelRoots[rid], r = zone.rooms.find(q => q.id === rid);
  if (!root || !r) return;
  const [x0, y0, x1, y1] = r.model.clip_xy;
  const d = new THREE.Vector3().subVectors(camera.position, controls.target); d.y = 0; d.normalize();
  // deep enough to take a full 60 cm wardrobe on the near wall down with its wall
  const px = d.x, py = -d.z, IN = 0.7;
  const X0 = x0 + (px < -0.2 ? IN : 0), X1 = x1 - (px > 0.2 ? IN : 0);
  const Y0 = y0 + (py < -0.2 ? IN : 0), Y1 = y1 - (py > 0.2 ? IN : 0);
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(X0 - CX)), new THREE.Plane(new THREE.Vector3(-1, 0, 0), X1 - CX),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), CY - Y0), new THREE.Plane(new THREE.Vector3(0, 0, 1), Y1 - CY)];
  root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { m.clippingPlanes = planes; m.clipShadows = true; } });
  if (!lowCopies[rid]) {
    const low = root.clone(true);
    const lp = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -(x0 - CX)), new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1 - CX),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), CY - y0), new THREE.Plane(new THREE.Vector3(0, 0, 1), y1 - CY),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), LOW)];
    const cloneMat = (m) => { const c = m.clone(); c.clippingPlanes = lp; c.clipShadows = true; return c; };
    low.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(cloneMat) : cloneMat(o.material); });
    models.add(low); lowCopies[rid] = low;
  }
  for (const [id, low] of Object.entries(lowCopies)) low.visible = id === rid;
  dirtyShadows();
}
function modelUncut() {
  for (const low of Object.values(lowCopies)) low.visible = false;
  for (const r of zone.rooms.filter(q => q.model)) if (modelRoots[r.id]) clipTo(modelRoots[r.id], r.model.clip_xy);
  dirtyShadows();
}

// ------------------------------------------------------------------ focus: one room alone
const focusCache = {};
const ringCentre = (r) => { const n = r.length - 1; let x = 0, y = 0; for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };
const ringRadius = (r, c) => Math.max(...r.map(([x, y]) => Math.hypot(x - c[0], y - c[1])));
let tween = null;
// the whole-flat view direction, in plan terms, undoing the 32 degree offset flyTo adds
const HOME_FROM = (() => { const a = ISO_AZ - THREE.MathUtils.degToRad(32); return [Math.sin(a), -Math.cos(a)]; })();
// Screen margins the interface panels cover, in px; the configurator keeps them current.
const safe = { left: 0, right: 0, top: 0, bottom: 0 };
// Frame a plan ring (floor to section cut) into the part of the screen the panels
// leave free, as seen from camera offset `off`: returns the orbit target and zoom.
function fitView(ring, off) {
  const f = off.clone().normalize().negate();
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, f).normalize();
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, y] of ring) for (const h of [0, CUT]) {
    const p = W(x, y).setY(h), u = p.dot(right), v = p.dot(up);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const w = host.clientWidth, h = host.clientHeight, fw = camera.right - camera.left, fh = camera.top - camera.bottom;
  // a canvas with no size yet (mid-resize, a hidden tab) cannot be framed: stay put
  if (!(w > 0 && h > 0) || !(u1 > u0) || !(v1 > v0)) return { t: controls.target.clone(), zoom: camera.zoom };
  const freeW = Math.max(200, w - safe.left - safe.right), freeH = Math.max(200, h - safe.top - safe.bottom);
  const zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom,
    0.94 * Math.min((freeW / w) * fw / (u1 - u0), (freeH / h) * fh / (v1 - v0))));
  const tu = (u0 + u1) / 2 - ((safe.left - safe.right) / 2) * fw / (w * zoom);
  const tv = (v0 + v1) / 2 - ((safe.bottom - safe.top) / 2) * fh / (h * zoom);
  const s = (0.6 - up.y * tv) / f.y;             // slide along the view line to target height 0.6 m
  const t = right.clone().multiplyScalar(tu).add(up.clone().multiplyScalar(tv)).add(f.clone().multiplyScalar(s));
  return { t, zoom };
}
function flyTo(ring, fromPlan) {
  const off0 = camera.position.clone().sub(controls.target), len = off0.length();
  let off1 = off0.clone();
  if (fromPlan) {
    // a three-quarter view from that side: rotate 32 degrees off the axis, 52 up
    const a = Math.atan2(fromPlan[0], -fromPlan[1]) + THREE.MathUtils.degToRad(32), el = ISO_EL;
    off1 = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)).multiplyScalar(len);
  }
  const { t, zoom } = fitView(ring, off1);
  tween = { t0: performance.now(), from: controls.target.clone(), to: t, z0: camera.zoom, z1: zoom, off0, off1, len };
}
const titleK = document.getElementById('t-k'), titleH = document.getElementById('t-h'), credit = document.getElementById('credit');
const titleA = document.getElementById('t-a');
// Floor areas from the room outlines (inside faces of her walls), in square metres and
// square feet. Outlines are the drawing's, so the figures are close, not surveyed.
function polyArea(ring) { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(a / 2); }
const roomArea = (r) => (r.members ? r.members.map(id => zone.rooms.find(q => q.id === id)) : [r]).reduce((a, q) => a + polyArea(q.outline), 0);
const areaText = (m2) => `${m2.toFixed(1)} m² · ${Math.round(m2 * 10.7639).toLocaleString('en-IN')} sq ft`;
const flatArea = () => zone.rooms.reduce((a, r) => a + polyArea(r.outline), 0);
const back = document.getElementById('back');
// rooms that open into each other (foyer, living, dining) focus as one space
// The washing machines stand in the balcony's utility end, which the drawing splits
// off as its own room: it opens and reads as part of the balcony.
{
  const bal = zone.rooms.find(r => r.id === 'balcony'), ut = zone.rooms.find(r => r.id === 'wiw');
  if (bal && ut) {
    const seen = new Set(), uniq = (list) => list.filter(w => { const k = JSON.stringify(w.outer || w.path); if (seen.has(k)) return false; seen.add(k); return true; });
    ut.name = 'Balcony';
    zone.spaces = [...(zone.spaces || []), {
      id: 'balcony-all', name: 'Balcony', members: ['balcony', 'wiw'], rings: [bal.outline, ut.outline],
      outline: bal.outline, plinths: [bal.island, ut.island], island: [...bal.island, ...ut.island],
      floor: [...bal.floor, ...ut.floor], walls: uniq([...bal.walls, ...ut.walls]), glass: uniq([...bal.glass, ...ut.glass]),
      view_from: bal.view_from,
    }];
    bal.space = ut.space = 'balcony-all';
  }
}
const spaces = Object.fromEntries((zone.spaces || []).map(s => [s.id, s]));
async function focusRoom(r) {
  if (!r) return;
  if (r.space) r = spaces[r.space];
  focused = r;
  const members = r.members || [r.id];
  if (!focusCache[r.id]) focusCache[r.id] = buildShell(new THREE.Group(), { plinth: r.plinths || r.island, floor: r.floor, walls: r.walls, glass: r.glass });
  focusGroup = focusCache[r.id];
  if (!focusGroup.parent) scene.add(focusGroup);
  for (const g of Object.values(focusCache)) g.visible = g === focusGroup;
  shell.visible = false;
  for (const g of pieceGroups) g.visible = members.includes(g.userData.home) && !g.userData.removed;
  for (const [id, root] of Object.entries(modelRoots)) root.visible = members.includes(id);
  // a knee-height copy left from the last bedroom must not follow you into the next room
  for (const low of Object.values(lowCopies)) low.visible = false;
  for (const g of scene.children) if (g.userData.cladding) g.visible = (g.userData.rooms || [g.userData.room]).some(id => members.includes(id)) && !g.userData.off;
  labels.forEach(l => l.el.hidden = true);
  titleK.textContent = 'HKV-322 · Hauz Khas · The flat'; titleH.textContent = r.name; titleA.textContent = areaText(roomArea(r));
  back.hidden = false;
  flyTo(r.island, r.view_from);
  studio(true);
  if (r.model && !modelRoots[r.id]) { status.textContent = `Loading ${r.name}…`; await modelsReady; }
  useRoomEnvironment(r.id);
  lastKey = ''; cutaway(true);
  hovered = null; tip.hidden = true;   // the tooltip re-reads what is under the pointer
  for (const hook of focusHooks) hook(focused);
}
function showFlat() {
  focused = null; focusGroup = null;
  for (const g of Object.values(focusCache)) g.visible = false;
  shell.visible = true;
  for (const g of pieceGroups) g.visible = !g.userData.removed;
  for (const root of Object.values(modelRoots)) root.visible = true;
  for (const g of scene.children) if (g.userData.cladding) g.visible = !g.userData.off;
  labels.forEach(l => l.el.hidden = false);
  titleK.textContent = 'HKV-322 · Hauz Khas'; titleH.textContent = 'The flat'; titleA.textContent = `about ${areaText(flatArea())} of floor`;
  back.hidden = true;
  flyTo(zone.zone, HOME_FROM);
  useRoomEnvironment(null);
  studio(false); modelUncut();
  lastKey = ''; cutaway(true);
  for (const hook of focusHooks) hook(null);
}
back.onclick = showFlat;
addEventListener('keydown', e => { if (e.key === 'Escape' && focused && !walking) showFlat(); });

// room labels over the flat; click one to isolate that room
const labelHost = document.getElementById('labels');
// Fewer names at once: the small rooms show theirs only while the pointer is over them.
const MINOR = new Set(['tlt1', 'tlt2', 'tlt3', 'stlt', 'foyer', 'varandah2']);
const labels = zone.rooms.filter(r => r.id !== 'wiw').map(r => {
  const el = document.createElement('button');
  el.className = 'room' + (r.model ? ' designed' : '') + (MINOR.has(r.id) ? ' minor' : '');
  el.innerHTML = `${r.name}<i>${areaText(roomArea(r.space === 'balcony-all' ? spaces[r.space] : r))}</i>`;
  el.onclick = () => focusRoom(r);
  labelHost.appendChild(el);
  return { r, el, p: W(...r.label_xy).setY(1.0) };
});
// On a phone the labels would pile up over a small model: a strip of room chips
// stands in for them (index.html shows it only on narrow screens).
const chipHost = document.getElementById('chips');
const CHIP_ORDER = ['living', 'dining', 'foyer', 'kitchen', 'master', 'study', 'bed1', 'bed2', 'varandah', 'tlt1', 'tlt2', 'tlt3', 'stlt'];
const chips = [['flat', 'Whole flat', null], ...CHIP_ORDER.map(id => zone.rooms.find(r => r.id === id)).filter(Boolean).map(r => [r.id, r.name, r])].map(([id, name, r]) => {
  const b = document.createElement('button');
  b.textContent = name; b.dataset.room = id;
  b.onclick = () => (r ? focusRoom(r) : showFlat());
  chipHost.appendChild(b);
  return b;
});
function markChips(f) {
  for (const b of chips) {
    const id = b.dataset.room;
    b.classList.toggle('on', f ? (f.members ? f.members.includes(id) : f.id === id) : id === 'flat');
  }
  const on = chips.find(b => b.classList.contains('on'));
  on?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}
focusHooks.push(markChips); markChips(null);
const tmp = new THREE.Vector3();
function placeLabels() {
  if (walking) return;
  if (focused) return;
  const w = host.clientWidth, h = host.clientHeight;
  for (const l of labels) {
    tmp.copy(l.p).project(camera);
    l.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
  }
}

// click on the floor of a room (a click, not an orbit drag) to isolate it
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || focused || walking) return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.ray.intersectPlane(floorPlane, new THREE.Vector3());
  const room = hit && roomAt(hit.x + CX, CY - hit.z);
  if (room) focusRoom(room);
});
// the smallest room whose outline holds a plan point
const ringArea = (ring) => Math.abs(ring.reduce((a, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return a + x * y2 - x2 * y; }, 0) / 2);
function roomAt(px, py) {
  return zone.rooms.filter(q => inRing([px, py], q.outline)).sort((a, b) => ringArea(a.outline) - ringArea(b.outline))[0] || null;
}

// Clicking the door slides it open and takes you through: from Bedroom 3 to the balcony,
// from anywhere else into Bedroom 3.
renderer.domElement.addEventListener('pointerup', e => {
  if (walking || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const vis = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  if (!ray.intersectObject(link, true).some(h => h.object.userData.door && vis(h.object))) return;
  doorTarget = 1; wake();
  const to = focused?.id === 'bed3' ? 'balcony' : 'bed3';
  setTimeout(() => focusRoom(zone.rooms.find(q => q.id === to)), 450);
});
let t3clad = scene.children.find(o => o.userData.cladding) || null;

// ------------------------------------------------------------------ post
let walking = false;
const resizeHooks = [];
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 0.85;
if (!lite) composer.addPass(gtao);
composer.addPass(new SMAAPass());
composer.addPass(new OutputPass());
// what the loop draws: the model view, or walk mode's own camera and passes
let view = { camera, composer };

// ------------------------------------------------------------------ sizing
const zoneR = Math.max(...zone.zone.map(([x, y]) => Math.hypot(x - CX, y - CY)));
function resize() {
  const w = host.clientWidth, h = host.clientHeight, a = w / h;
  // fit the flat whatever the window shape: landscape fits height, portrait fits width
  if (a >= 1) { const hh = zoneR * 0.74; camera.top = hh; camera.bottom = -hh; camera.left = -hh * a; camera.right = hh * a; }
  else { const hw = zoneR * 0.92; camera.left = -hw; camera.right = hw; camera.top = hw / a; camera.bottom = -hw / a; }
  camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
  for (const f of resizeHooks) f(w, h);
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ hover
const tip = document.getElementById('tip');
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hovered = null;
const floorHit = new THREE.Vector3();
renderer.domElement.addEventListener('pointermove', (e) => {
  if (walking) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!focused) {                   // a small room's name appears while the pointer is over it
    const f = ray.ray.intersectPlane(floorPlane, floorHit), under = f && roomAt(f.x + CX, CY - f.z);
    for (const l of labels) l.el.classList.toggle('near', l.r === under);
  }
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  // curtains and sheers never block the pointer: the door behind a sheer still answers
  const hit = ray.intersectObjects([pieces, models, link], true).find(h => shown(h.object) && !h.object.userData.curtain && (h.object.userData.piece || h.object.userData.model || h.object.userData.door));
  const u = hit?.object.userData || {};
  const key = u.door ? 'door' : u.piece || u.model || null;
  if (key !== hovered) {
    hovered = key;
    if (u.door) {
      tip.innerHTML = `<b>Sliding door</b><i>Click to go through to ${focused?.id === 'bed3' ? 'the balcony' : 'Bedroom 3'}</i>`;
      tip.hidden = false;
    } else if (u.piece) {
      const p = u.piece;
      tip.innerHTML = `<b>${p.name}</b>` + (p.movable && focused ? '<i>Drag to move · click for options</i>' : '');
      tip.hidden = false;
    } else if (u.model) {
      tip.innerHTML = `<b>${u.model.name}</b>${focused ? '' : '<i>Click to open this room</i>'}`;
      tip.hidden = false;
    } else tip.hidden = true;
  }
  if (key) { tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; }
});
renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; hovered = null; for (const l of labels) l.el.classList.remove('near'); });

// ------------------------------------------------------------------ loop
cutaway(true);
dirtyShadows();
controls.addEventListener('change', () => wake());
addEventListener('resize', () => wake());
renderer.setAnimationLoop(() => {
  let moving = !!tween;
  if (tween) {
    const k = Math.min(1, (performance.now() - tween.t0) / 800), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    controls.target.lerpVectors(tween.from, tween.to, e);
    const off = tween.off0.clone().lerp(tween.off1, e).setLength(tween.len);
    camera.position.copy(controls.target).add(off);
    camera.zoom = tween.z0 + (tween.z1 - tween.z0) * e; camera.updateProjectionMatrix();
    if (k >= 1) tween = null;
  }
  if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z + camera.zoom + controls.target.x)) {
    // never leave the model lost: a bad frame resets to the home view
    tween = null; camera.zoom = 1; controls.target.set(0, 0.6, 0);
    camera.position.set(Math.sin(ISO_AZ) * Math.cos(ISO_EL), Math.sin(ISO_EL), Math.cos(ISO_AZ) * Math.cos(ISO_EL)).multiplyScalar(40);
    camera.updateProjectionMatrix(); wake(3);
  }
  if (!walking && controls.update()) moving = true;
  // a hook that throws must never stop the model from drawing
  for (const f of frameHooks) { try { if (f()) wake(1); } catch (e) { if (!f.failed) console.error(e); f.failed = true; } }
  if (moving) wake(1);
  if (wakeFrames <= 0 || api.hold) return;
  wakeFrames--;
  if (fill.intensity) { fill.position.copy(view.camera.position); if (!walking) fill.target.position.copy(controls.target); }
  placeLabels();
  view.composer.render();
});
titleA.textContent = `about ${areaText(flatArea())} of floor`;
document.body.classList.add('ready');

// what the configurator (configurator.js) builds on
const frameHooks = [];
// the Bedroom 3 door sliding open
frameHooks.push(() => {
  if (doorOpen === doorTarget) return false;
  doorOpen += Math.sign(doorTarget - doorOpen) * Math.min(Math.abs(doorTarget - doorOpen), 0.06);
  slider.position.z = sliderZ - doorOpen * (pw - 0.06);          // world -z is plan north
  dirtyShadows();
  return true;
});
export const api = {
  lite,
  THREE, scene, camera, renderer, composer, controls, host, M, B, zone, W, CX, CY, CUT,
  inRing, inWall, prism, mesh, rbox, pieces, pieceGroups, placePiece, models, modelRoots,
  sun, hemi, fill, placeSun, dirtyShadows, wake, lightHooks, frameHooks, tip, spaces, safe,
  focusHooks, setCurtainsOpen, hasCurtains, curtainRooms, curtainMode: CURTAIN_MODE,
  bedroomSlots: bedrooms.slots, obstacles: bedrooms.obstacles,
  // walk mode (walk.js): what it draws with, and the flat's walkable floor
  get walking() { return walking; }, set walking(v) { walking = v; },
  useView: (v) => { view = v || { camera, composer }; wake(3); }, resizeHooks, shell, labels, roomAt, setDoor: (t) => { doorTarget = t; wake(); },
  walkFloors: [...zone.floor],
  fitView, focusRoom, showFlat, activeShell, recut: () => { lastKey = ''; cutaway(true); }, resetView: () => (focused ? focusRoom(focused) : showFlat()),
  get focused() { return focused; }, get studioOn() { return studioOn; },
};
window.__diorama = api;
