// Walk mode: stand in the flat at eye height and look around.
//
// The idea comes from Aswin Nair's Construct (construct.aswinnair.com): drag to look
// around, tap the floor to walk there, WASD on a keyboard. Rebuilt here for B-34, in
// our own code. The model view cuts the flat at door-head height like a physical
// model; walking, the walls rise to the ceiling, lintels close over the doors and
// windows, a ceiling goes on, and the door leaves stand open so you can walk through.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CEIL = 2.85, EYE = 1.55, RADIUS = 0.2, SPEED = 1.4;

export function createWalk(api, { onChange } = {}) {
  const { scene, renderer, zone, W, CX, CY, CUT, M, prism, inWall, inRing } = api;

  // ---------------------------------------------------------------- camera and passes
  const cam = new THREE.PerspectiveCamera(64, 1, 0.05, 80);
  cam.rotation.order = 'YXZ';
  // made the first time you walk, so the page does not carry a second set of buffers
  let composer = null;
  function passes() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    if (!api.lite) {                             // phones skip ambient occlusion
      const gtao = new GTAOPass(scene, cam, 1, 1);
      gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.3, thickness: 1.0, scale: 1.0, samples: 12 });
      gtao.blendIntensity = 0.7;
      composer.addPass(gtao);
    }
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
    size(api.host.clientWidth, api.host.clientHeight);
  }
  const size = (w, h) => { cam.aspect = w / h; cam.updateProjectionMatrix(); composer?.setSize(w, h); };
  api.resizeHooks.push(size);

  // ---------------------------------------------------------------- the rooms made whole
  // Lintels over every opening the model view leaves open above door height, and a
  // ceiling over the flat. Built once, shown only while walking.
  const extras = new THREE.Group(); extras.visible = false; scene.add(extras);
  M.ceiling = new THREE.MeshPhysicalMaterial({ color: 0xF4F1EB, roughness: 0.95 });
  for (const ring of [zone.zone, ...api.walkFloors.slice(-1).map(f => f.outer)]) {
    const c = prism(ring, [], CEIL, CEIL + 0.06, M.ceiling); c.receiveShadow = true; extras.add(c);
  }
  const lintel = (outer) => { const m = prism(outer, [], CUT, CEIL, M.walls, M.section); extras.add(m); };
  for (const w of zone.walls) {
    if (w.z0 > 0 || w.z1 >= CUT - 1e-6 && !w.kind.includes('door')) continue;
    if (w.kind.includes('door')) {
      // a door leaf is drawn as a thin slab: its lintel takes the wall's depth
      const xs = w.outer.map(p => p[0]), ys = w.outer.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), T = 0.2;
      const ring = x1 - x0 > y1 - y0
        ? [[x0, (y0 + y1) / 2 - T / 2], [x1, (y0 + y1) / 2 - T / 2], [x1, (y0 + y1) / 2 + T / 2], [x0, (y0 + y1) / 2 + T / 2]]
        : [[(x0 + x1) / 2 - T / 2, y0], [(x0 + x1) / 2 + T / 2, y0], [(x0 + x1) / 2 + T / 2, y1], [(x0 + x1) / 2 - T / 2, y1]];
      lintel([...ring, ring[0]]);
    } else lintel(w.outer);                       // over a window: the sill's own footprint
  }
  // glass with no wall above it (a bay, say) is closed by bands the flat lists in flat.json
  const band = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l * 0.06, ny = dx / l * 0.06;
    lintel([[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny]]); };
  for (const [a, b] of api.flat.walk?.bands ?? []) band(a, b);
  const glow = new THREE.AmbientLight(0xFFF3E6, 0); scene.add(glow);

  // what walk mode changes on the rest of the scene, remembered so it can be put back
  let saved = null;
  function raise() {
    saved = { clip: renderer.clippingPlanes, walls: [], exposure: renderer.toneMappingExposure };
    renderer.clippingPlanes = [];
    const tall = (m) => m.userData.wall && m.userData.wall.z0 === 0 && m.userData.wall.z1 >= CUT - 1e-6;
    const walls = [...api.shell.children, ...scene.children.filter(o => o.userData.cladding && !o.userData.rooms).flatMap(o => o.children)];
    for (const m of walls) {
      if (!m.userData.wall && !m.userData.glass) continue;
      saved.walls.push([m, m.scale.y, m.visible]);
      m.visible = true; m.scale.y = 1;
      if (m.userData.wall?.kind?.includes('door')) m.visible = false;        // doors stand open
      else if (tall(m)) m.scale.y = CEIL / m.userData.wall.z1;
    }
    for (const g of scene.children) if (g.userData.cladding) g.visible = !g.userData.off;
    extras.visible = true; glow.intensity = 0.55;
    api.dirtyShadows();
  }
  function lower() {
    if (!saved) return;
    renderer.clippingPlanes = saved.clip;
    for (const [m, sy, v] of saved.walls) { m.scale.y = sy; m.visible = v; }
    renderer.toneMappingExposure = saved.exposure;
    extras.visible = false; glow.intensity = 0; saved = null;
    api.dirtyShadows();
  }

  // ---------------------------------------------------------------- where you can stand
  // Holes under 40 cm across are door thresholds in the drawing (the lobby doors to
  // the master and bedroom 2, the bedroom 3 door); you walk over those.
  const thin = (h) => { const xs = h.map(p => p[0]), ys = h.map(p => p[1]); return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) <= 0.4; };
  const floors = api.walkFloors.map(f => ({ outer: f.outer, holes: f.holes.filter(h => !thin(h)) }));
  const walkable = (x, y) => floors.some(f => inRing([x, y], f.outer) && !f.holes.some(h => inRing([x, y], h)));
  // A 10 cm grid of where a person can stand: on a floor, at least RADIUS from any
  // wall. Built the first time you walk; movement and routes both read it.
  const G = 0.1;
  let grid = null;
  function buildGrid() {
    const pts = [...zone.zone, ...api.walkFloors.flatMap(f => f.outer)];
    const x0 = Math.min(...pts.map(p => p[0])) - 0.5, y0 = Math.min(...pts.map(p => p[1])) - 0.5;
    const nx = Math.ceil((Math.max(...pts.map(p => p[0])) + 0.5 - x0) / G), ny = Math.ceil((Math.max(...pts.map(p => p[1])) + 0.5 - y0) / G);
    const solid = zone.walls.filter(w => w.kind === 'masonry' || w.kind === 'partition' || w.kind.startsWith('masonry')).map(w => {
      const xs = w.outer.map(p => p[0]), ys = w.outer.map(p => p[1]);
      return { ring: w.outer, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    });
    const inSolid = (x, y) => solid.some(q => x >= q.bb[0] && x <= q.bb[2] && y >= q.bb[1] && y <= q.bb[3] && inRing([x, y], q.ring));
    const wall = new Uint8Array(nx * ny), floorOk = new Uint8Array(nx * ny), stand = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * G, y = y0 + (j + 0.5) * G, k = j * nx + i;
      wall[k] = inSolid(x, y) ? 1 : 0;
      floorOk[k] = !wall[k] && walkable(x, y) ? 1 : 0;
    }
    const r = Math.ceil(RADIUS / G), disc = [];
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.hypot(di, dj) * G <= RADIUS + 1e-6) disc.push([di, dj]);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!floorOk[k]) continue;
      stand[k] = disc.every(([di, dj]) => { const a = i + di, b = j + dj; return a < 0 || b < 0 || a >= nx || b >= ny || !wall[b * nx + a]; }) ? 1 : 0;
    }
    grid = { x0, y0, nx, ny, stand };
  }
  const cell = (x, y) => [Math.floor((x - grid.x0) / G), Math.floor((y - grid.y0) / G)];
  const standAt = (i, j) => i >= 0 && j >= 0 && i < grid.nx && j < grid.ny && grid.stand[j * grid.nx + i] === 1;
  const clear = (x, y) => { const [i, j] = cell(x, y); return standAt(i, j); };
  const centre = (i, j) => [grid.x0 + (i + 0.5) * G, grid.y0 + (j + 0.5) * G];
  // the nearest cell to stand in, within about a metre
  function nearest(i, j) {
    if (standAt(i, j)) return [i, j];
    for (let r = 1; r <= 10; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !standAt(i + di, j + dj)) continue;
        const d = Math.hypot(di, dj); if (d < bd) { bd = d; best = [i + di, j + dj]; }
      }
      if (best) return best;
    }
    return null;
  }
  const sight = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / 0.05));
    for (let k = 1; k <= n; k++) if (!clear(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return false; return true; };
  // A route through the doorways to a tapped point: A* over the grid (8 neighbours,
  // no cutting corners), then pulled straight wherever there is a clear line.
  function route(tx, ty) {
    const s = nearest(...cell(pos.x, pos.y)), t = nearest(...cell(tx, ty));
    if (!s || !t) return null;
    const { nx, ny } = grid, N = nx * ny, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
    const key = (i, j) => j * nx + i, goal = key(...t), h = (i, j) => Math.hypot(i - t[0], j - t[1]);
    const heap = [];                                       // [f, k], a binary min-heap
    const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    g[key(...s)] = 0; push(h(...s), key(...s));
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (shut[k]) continue; shut[k] = 1;
      if (k === goal) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = i + di, b = j + dj;
        if (!standAt(a, b) || (di && dj && (!standAt(i + di, j) || !standAt(i, j + dj)))) continue;
        const nk = key(a, b), ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(ng + h(a, b), nk); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = goal; k !== -1; k = from[k]) cells.push(centre(k % nx, (k / nx) | 0));
    cells.reverse();
    if (clear(tx, ty)) cells[cells.length - 1] = [tx, ty];
    const path = []; let a = [pos.x, pos.y], i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !sight(a, cells[j])) j--;
      path.push(cells[j]); a = cells[j]; i = j + 1;
    }
    return path;
  }
  const pos = { x: 0, y: 0 };
  let yaw = 0, pitch = -0.05;
  function place() {
    const c = W(pos.x, pos.y);
    cam.position.set(c.x, EYE, c.z);
    cam.rotation.set(pitch, yaw, 0);
    const r = api.roomAt(pos.x, pos.y);
    if (r) onChange?.(r);
  }
  // One step. Against a wall or a door frame it slides: first along the axes, then
  // turned up to 70 degrees either way, so walking at a doorway slips you into it.
  function step(dx, dy) {
    if (clear(pos.x + dx, pos.y + dy)) { pos.x += dx; pos.y += dy; return true; }
    const l = Math.hypot(dx, dy);
    for (const a of [0.35, -0.35, 0.7, -0.7, 1.2, -1.2]) {
      const c = Math.cos(a), sn = Math.sin(a), k = Math.max(0.3, c);
      const ex = (dx * c - dy * sn) * k, ey = (dx * sn + dy * c) * k;
      if (l > 1e-5 && clear(pos.x + ex, pos.y + ey)) { pos.x += ex; pos.y += ey; return true; }
    }
    return false;
  }
  // camera yaw 0 looks down world -z, which is plan +y
  const forward = () => [-Math.sin(yaw), Math.cos(yaw)];

  // ---------------------------------------------------------------- input
  const el = renderer.domElement, keys = new Set();
  let down = null, glide = null, on = false;
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.7, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.renderOrder = 5; scene.add(marker);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aim = (e) => { const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); };
  // the floor point a tap asks for: where the ray meets the floor, or just short of
  // whatever it meets first
  function target(e) {
    aim(e);
    const vis = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const hit = ray.intersectObjects(scene.children, true).find(h => h.object.isMesh && vis(h.object) && h.object !== marker && !h.object.userData.curtain && h.object.material !== M.glass);
    let p = hit ? hit.point.clone() : ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (!p) return null;
    if (p.y > 0.3) {                            // a wall or a piece: stop 40 cm short, on the floor
      const back = ray.ray.direction.clone().setY(0).normalize().multiplyScalar(-0.4);
      p.add(back).setY(0);
    }
    return { x: p.x + CX, y: CY - p.z };
  }
  const onDown = (e) => { if (!on || e.button !== 0) return; e.stopImmediatePropagation(); down = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false, slop: e.pointerType === 'touch' ? 12 : 4 }; try { el.setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e) => {
    if (!on) return;
    e.stopImmediatePropagation();
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) < down.slop) return;   // a finger wobbles; that is still a tap
      down.moved = true; marker.visible = false;
      // the view turns the way you drag: right looks right, up looks up
      yaw = down.yaw - dx * 0.0045; pitch = Math.max(-1.2, Math.min(1.2, down.pitch - dy * 0.0045));
      place(); api.wake(2);
      return;
    }
    const t = grid && target(e);
    marker.visible = !!t && !!nearest(...cell(t.x, t.y));
    if (marker.visible) { const c = W(t.x, t.y); marker.position.set(c.x, 0.02, c.z); }
    api.wake(2);
  };
  const onUp = (e) => {
    if (!on) return;
    e.stopImmediatePropagation();
    const d = down; down = null;
    if (!d || d.moved) return;
    const t = target(e);
    const path = t && route(t.x, t.y);
    if (path?.length) glide = path;
  };
  for (const [n, f] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp]]) el.addEventListener(n, f, true);
  const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  addEventListener('keydown', (e) => {
    if (!on || e.target.closest?.('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.stopImmediatePropagation(); exit(); return; }
    if (MOVE.has(k)) { keys.add(k); glide = null; e.preventDefault(); e.stopImmediatePropagation(); api.wake(2); }
  }, true);
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), true);
  addEventListener('blur', () => keys.clear());

  // ---------------------------------------------------------------- each frame
  let last = performance.now();
  api.frameHooks.push(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!on) return false;
    let moved = false;
    if (keys.has('arrowleft')) { yaw += 1.6 * dt; moved = true; }
    if (keys.has('arrowright')) { yaw -= 1.6 * dt; moved = true; }
    const [fx, fy] = forward(), rx = fy, ry = -fx;       // right is forward turned clockwise
    let mx = 0, my = 0;
    if (keys.has('w') || keys.has('arrowup')) { mx += fx; my += fy; }
    if (keys.has('s') || keys.has('arrowdown')) { mx -= fx; my -= fy; }
    if (keys.has('d')) { mx += rx; my += ry; }
    if (keys.has('a')) { mx -= rx; my -= ry; }
    if (mx || my) { const l = Math.hypot(mx, my); step(mx / l * SPEED * dt, my / l * SPEED * dt); moved = true; }
    if (glide) {                               // follow the route, waypoint by waypoint
      const [wx, wy] = glide[0], gx = wx - pos.x, gy = wy - pos.y, l = Math.hypot(gx, gy), s = Math.min(l, 1.8 * dt);
      if (l < 0.02) { glide.shift(); if (!glide.length) glide = null; }
      else {
        pos.x += gx / l * s; pos.y += gy / l * s;
        const want = Math.atan2(-gx, gy);          // turn gently toward where you are going
        let dyaw = want - yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        if (l > 0.4 || glide.length > 1) yaw += dyaw * Math.min(1, 3 * dt);
      }
      moved = true;
    }
    // a sliding door the flat names in flat.json opens as you come up to it
    const door = api.flat.walk?.door;
    if (door && Math.hypot(pos.x - door.at[0], pos.y - door.at[1]) < (door.r ?? 1.4)) api.setDoor(1);
    if (moved) place();
    return moved;
  });

  // ---------------------------------------------------------------- in and out
  let before = null;
  // start inside the room on screen (or flat.json's walk start), facing its longest open view
  function start(room) {
    const r = room?.members ? api.zone.rooms.find(q => q.id === room.members[0]) : room || zone.rooms.find(q => q.id === api.flat.walk?.start) || zone.rooms[0];
    let [x, y] = r.label_xy;
    if (!clear(x, y)) {
      outer: for (let rad = 0.1; rad < 2; rad += 0.1) for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (clear(px, py)) { x = px; y = py; break outer; }
      }
    }
    pos.x = x; pos.y = y;
    let best = 0;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, dx = -Math.sin(a), dy = Math.cos(a);
      let d = 0; while (d < 8 && walkable(x + dx * d, y + dy * d) && !inWall([x + dx * d, y + dy * d])) d += 0.1;
      if (d > best) { best = d; yaw = a; }
    }
    // then step back from that view, so you arrive looking into the room, not at a wall
    const [fx, fy] = forward();
    for (let k = 0; k < 18 && clear(pos.x - fx * 0.1, pos.y - fy * 0.1) && clear(pos.x - fx * 0.4, pos.y - fy * 0.4); k++) { pos.x -= fx * 0.1; pos.y -= fy * 0.1; }
    pitch = -0.08;
  }
  function enter() {
    if (on) return;
    before = api.focused;
    const room = api.focused;
    if (!grid) buildGrid();
    if (api.focused) api.showFlat();           // every room visible, nothing cut away
    api.walking = on = true;
    raise();
    start(room);
    place();
    if (!composer) passes();
    api.useView({ camera: cam, composer });
    document.body.classList.add('walking');
    api.dirtyShadows();
  }
  function exit() {
    if (!on) return;
    on = false; api.walking = false; keys.clear(); glide = null; marker.visible = false;
    lower();
    api.useView(null);
    document.body.classList.remove('walking');
    const back = before; before = null;
    if (back) api.focusRoom(back); else { api.showFlat(); }
  }
  // walk to a plan point along a route (what a tap does), and where you stand now
  const routeTo = (x, y) => { const path = route(x, y); if (path?.length) { glide = path; api.wake(2); } return path?.length || 0; };
  return { enter, exit, routeTo, get on() { return on; }, get at() { return { ...pos }; } };
}
