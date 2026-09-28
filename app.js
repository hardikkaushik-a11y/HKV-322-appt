// HKV-322 - neutral spatial shell, read off the architect's ALD-01 plan drawing.
//
// There is no DXF for this project yet, so unlike a CAD-derived shell this one is a
// plan-metres box per room: sizes from ALD-01's printed dimensions where the sheet
// gives them (room.labeled === true in assets/layout/rooms.json), an eyeballed
// estimate where it doesn't. No furniture, no finishes: nothing has been designed
// for this flat, so nothing here should be read as approved.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const zone = await (await fetch('./assets/layout/rooms.json')).json();
const rooms = Object.entries(zone.rooms).map(([id, r]) => ({ id, ...r }));

// -------------------------------------------------------------- bounds & frame
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const r of rooms) for (const [x, y] of r.boundary_xy) {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const CX = (minX + maxX) / 2, CY = (minY + maxY) / 2;
const SPAN = Math.max(maxX - minX, maxY - minY);
// plan (x, y) metres -> three.js world (X, Z); Y is up
const W = (x, y) => new THREE.Vector3(x - CX, 0, -(y - CY));

const WALL_T = 0.12;      // metres, not from the drawing: a reasonable brick+plaster guess
const DEFAULT_CH = 2.9;   // metres, used only where ALD-01 gives no ceiling height
const CUT = 3.4;          // the section cut: nothing above this height is drawn

// -------------------------------------------------------------- renderer & scene
const host = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new THREE.Scene(), 0.05).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 200);
const ISO_AZ = THREE.MathUtils.degToRad(214), ISO_EL = THREE.MathUtils.degToRad(42);
const orbitDist = SPAN * 1.5;
camera.position.set(Math.sin(ISO_AZ) * Math.cos(ISO_EL), Math.sin(ISO_EL), Math.cos(ISO_AZ) * Math.cos(ISO_EL)).multiplyScalar(orbitDist);
camera.lookAt(0, 0.8, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = SPAN * 0.18; controls.maxDistance = SPAN * 2.4;
controls.minPolarAngle = THREE.MathUtils.degToRad(8);
controls.maxPolarAngle = THREE.MathUtils.degToRad(85);

const hemi = new THREE.HemisphereLight(0xfff1e0, 0x2a221b, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe9cf, 2.6);
sun.position.set(-14, 22, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
Object.assign(sun.shadow.camera, { left: -SPAN, right: SPAN, top: SPAN, bottom: -SPAN, near: 1, far: 60 });
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdce6ff, 0.5);
fill.position.set(12, 14, -10);
scene.add(fill);

// -------------------------------------------------------------- materials
const M = {
  plinth: new THREE.MeshStandardMaterial({ color: 0x1c1815, roughness: 0.9 }),
  floor:  new THREE.MeshStandardMaterial({ color: 0xE4DCCD, roughness: 0.55 }),
  wall:   new THREE.MeshStandardMaterial({ color: 0xEFE9DD, roughness: 0.85 }),
  wallEst:new THREE.MeshStandardMaterial({ color: 0xEFE9DD, roughness: 0.85, opacity: 0.72, transparent: true }),
  section:new THREE.MeshStandardMaterial({ color: 0x2A2521, roughness: 0.9 }),
};

// -------------------------------------------------------------- geometry helpers
function shapeFrom(outer) {
  return new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x - CX, y - CY)));
}
function prism(outer, z0, z1, mat, capMat) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(outer), { depth: Math.max(0.001, z1 - z0), bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, z0, 0);
  const m = new THREE.Mesh(g, capMat ? [capMat, mat] : mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
// point-in-polygon on plan rings (ray casting)
function inRing(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// a ring inset inward by t metres, for the walkable interior (naive per-edge offset)
function insetRing(ring, t) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n], p1 = ring[i], p2 = ring[(i + 1) % n];
    const e1 = norm([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    const n1 = [e1[1], -e1[0]], n2 = [e2[1], -e2[0]];
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]) || n1;
    const cos = bis[0] * n1[0] + bis[1] * n1[1];
    const len = t / Math.max(0.4, cos);
    out.push([p1[0] + bis[0] * len, p1[1] + bis[1] * len]);
  }
  return out;
}
function norm([x, y]) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

// -------------------------------------------------------------- plinth
const pad = 0.6;
const plinthRing = [[minX - pad, minY - pad], [maxX + pad, minY - pad], [maxX + pad, maxY + pad], [minX - pad, maxY + pad]];
scene.add(prism(plinthRing, -0.45, -0.02, M.plinth));

// -------------------------------------------------------------- rooms: floor + walls
const walkRings = [];
for (const r of rooms) {
  const ch = r.ceiling_h_m || DEFAULT_CH;
  const floorM = M.floor;
  const wallM = r.labeled ? M.wall : M.wallEst;
  const floor = prism(r.boundary_xy, -0.02, 0, floorM); floor.castShadow = false; scene.add(floor);
  const ring = r.boundary_xy;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const g = new THREE.BoxGeometry(len + WALL_T, ch, WALL_T);
    g.translate(0, ch / 2, 0);
    const A = W(...a), B = W(...b);
    const m = mesh(g, [wallM, wallM, M.section, wallM, wallM, wallM], (A.x + B.x) / 2, 0, (A.z + B.z) / 2);
    m.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
    scene.add(m);
  }
  walkRings.push(insetRing(ring, WALL_T / 2 + 0.22));
}

// -------------------------------------------------------------- labels
const labelHost = document.getElementById('labels');
const labelEls = rooms.map(r => {
  const el = document.createElement('div');
  el.className = 'room' + (r.labeled ? '' : ' est minor');
  const sqft = (r.area_m2 * 10.7639).toFixed(0);
  el.innerHTML = `${r.name}<i>${r.area_m2.toFixed(1)} m&sup2; &middot; ${sqft} sq ft</i>` +
                 (r.labeled ? '' : '<i class="tag">estimated</i>');
  el.addEventListener('click', () => flyTo(r));
  labelHost.appendChild(el);
  const ch = r.ceiling_h_m || DEFAULT_CH;
  const anchor = W(r.centroid_xy[0], r.centroid_xy[1]); anchor.y = ch + 0.35;
  return { el, anchor, room: r };
});

const flyState = { active: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), targetFrom: new THREE.Vector3(), targetTo: new THREE.Vector3() };
function flyTo(r) {
  if (mode !== 'orbit') return;
  const c = W(r.centroid_xy[0], r.centroid_xy[1]);
  const ch = r.ceiling_h_m || DEFAULT_CH;
  const dist = Math.max(r.width_m, r.depth_m) * 1.6 + 1.5;
  flyState.from.copy(camera.position);
  flyState.targetFrom.copy(controls.target);
  flyState.targetTo.set(c.x, Math.min(ch, 1.4) * 0.5, c.z);
  flyState.to.set(c.x + Math.sin(ISO_AZ) * Math.cos(ISO_EL) * dist, Math.sin(ISO_EL) * dist, c.z + Math.cos(ISO_AZ) * Math.cos(ISO_EL) * dist);
  flyState.t = 0; flyState.active = true;
}

function updateLabels() {
  const w = innerWidth, h = innerHeight;
  for (const L of labelEls) {
    const p = L.anchor.clone().project(camera);
    const behind = p.z > 1;
    if (behind) { L.el.hidden = true; continue; }
    L.el.hidden = false;
    const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
    L.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

// -------------------------------------------------------------- walk mode
let mode = 'orbit';
const startRoom = rooms.find(r => r.id === 'living') ?? rooms.find(r => r.id === 'dining') ?? rooms[0];
const walk = { x: startRoom.centroid_xy[0], y: startRoom.centroid_xy[1],
               yaw: 0, pitch: 0, eye: 1.6, keys: new Set(), dragging: false };
const walkBtn = document.getElementById('walk-btn');
const walkBar = document.getElementById('walkbar');

function enterWalk() {
  mode = 'walk'; document.body.classList.add('walking'); walkBtn.classList.add('on');
  controls.enabled = false;
  camera.fov = 62; camera.updateProjectionMatrix();
  walk.x = startRoom.centroid_xy[0]; walk.y = startRoom.centroid_xy[1];
  walk.yaw = 0; walk.pitch = 0;   // facing plan +y: toward the varandah / windows
}
function exitWalk() {
  mode = 'orbit'; document.body.classList.remove('walking'); walkBtn.classList.remove('on');
  controls.enabled = true;
  camera.fov = 38; camera.updateProjectionMatrix();
}
walkBtn.addEventListener('click', () => (mode === 'walk' ? exitWalk() : enterWalk()));
document.getElementById('walk-exit').addEventListener('click', exitWalk);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode === 'walk') return exitWalk();
  if (mode === 'walk') walk.keys.add(e.key.toLowerCase());
});
addEventListener('keyup', (e) => walk.keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener('pointerdown', (e) => { if (mode === 'walk') { walk.dragging = true; walk.lastX = e.clientX; walk.lastY = e.clientY; } });
addEventListener('pointerup', () => walk.dragging = false);
addEventListener('pointermove', (e) => {
  if (mode !== 'walk' || !walk.dragging) return;
  walk.yaw -= (e.clientX - walk.lastX) * 0.0032;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - walk.lastY) * 0.0032, -1.2, 1.2);
  walk.lastX = e.clientX; walk.lastY = e.clientY;
});

function insideAny(x, y) { return walkRings.some(ring => inRing([x, y], ring)); }
function stepWalk(dt) {
  const speed = (walk.keys.has('shift') ? 3.2 : 1.7) * dt;
  const fwd = [Math.sin(walk.yaw), Math.cos(walk.yaw)], right = [Math.cos(walk.yaw), -Math.sin(walk.yaw)];
  let dx = 0, dy = 0;
  if (walk.keys.has('w') || walk.keys.has('arrowup')) { dx += fwd[0]; dy += fwd[1]; }
  if (walk.keys.has('s') || walk.keys.has('arrowdown')) { dx -= fwd[0]; dy -= fwd[1]; }
  if (walk.keys.has('d') || walk.keys.has('arrowright')) { dx += right[0]; dy += right[1]; }
  if (walk.keys.has('a') || walk.keys.has('arrowleft')) { dx -= right[0]; dy -= right[1]; }
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx = dx / len * speed; dy = dy / len * speed;
    if (insideAny(walk.x + dx, walk.y)) walk.x += dx;
    if (insideAny(walk.x, walk.y + dy)) walk.y += dy;
  }
  const p = W(walk.x, walk.y);
  camera.position.set(p.x, walk.eye, p.z);
  const look = new THREE.Vector3(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
  camera.lookAt(camera.position.clone().add(look));
}

// -------------------------------------------------------------- resize & loop
function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener('resize', resize);
resize();

const totalArea = rooms.reduce((a, r) => a + r.area_m2, 0);
document.getElementById('t-a').textContent = `${totalArea.toFixed(0)} m² · ${(totalArea * 10.7639).toFixed(0)} sq ft, read off ALD-01`;

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'walk') stepWalk(dt);
  else {
    controls.update();
    if (flyState.active) {
      flyState.t = Math.min(1, flyState.t + dt / 0.9);
      const e = 1 - Math.pow(1 - flyState.t, 3);
      camera.position.lerpVectors(flyState.from, flyState.to, e);
      controls.target.lerpVectors(flyState.targetFrom, flyState.targetTo, e);
      if (flyState.t >= 1) flyState.active = false;
    }
  }
  updateLabels();
  renderer.render(scene, camera);
}
document.body.classList.add('ready');
animate();
