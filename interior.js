// Living + Dining, built to match the two on-site photos of the flat as it stands
// today (the round glass dining table and slat-back chairs, the low console under
// the window, the built-in wall-unit display cabinet, the beige sofa and armchairs,
// the rust chaise and cane rocking chair, the maroon rug). Boxes and cylinders, not
// a scan: proportioned from ordinary furniture dimensions and the photos' layout,
// not measured off them. Every other room in the flat stays the neutral shell,
// because there is no photo or design reference for them yet.
import * as THREE from 'three';
import { marble, wood, fabric, velvet, paint, normalFrom } from './textures.js';

export function buildInterior({ mesh, rbox, prism, M, W, rooms }) {
  const group = new THREE.Group();

  // ---------------------------------------------------------------- palette
  // Read off the photos: cream walls, beige floor tile, honey wood, beige upholstery,
  // a rust/brick chaise, a maroon patterned rug, brass accents.
  const woodTex = wood({ base: 0x9C7A50, dark: 0x5C4326, plank: 0.12, length: 1.6, seed: 41 });
  const woodDarkTex = wood({ base: 0x6E4E30, dark: 0x3A2617, plank: 0.12, length: 1.6, seed: 42 });
  const caneTex = wood({ base: 0xB99260, dark: 0x7A5A34, plank: 0.03, length: 0.6, seed: 43 });
  const beigeFabricTex = fabric({ base: 0xDCD2BE, seed: 51 });
  const rustTex = velvet({ base: 0x9C3B2C, seed: 53 });
  const oliveTex = fabric({ base: 0x76773F, seed: 55 });
  const P = {
    wood:      new THREE.MeshPhysicalMaterial({ map: woodTex, normalMap: normalFrom(woodTex, 2), roughness: 0.42, clearcoat: 0.12, clearcoatRoughness: 0.35 }),
    woodDark:  new THREE.MeshPhysicalMaterial({ map: woodDarkTex, normalMap: normalFrom(woodDarkTex, 2), roughness: 0.4, clearcoat: 0.1 }),
    cane:      new THREE.MeshPhysicalMaterial({ map: caneTex, roughness: 0.65 }),
    beige:     new THREE.MeshPhysicalMaterial({ map: beigeFabricTex, roughness: 0.92, sheen: 0.3, sheenRoughness: 0.7, sheenColor: 0xF4EEDF }),
    rust:      new THREE.MeshPhysicalMaterial({ map: rustTex, roughness: 0.88 }),
    olive:     new THREE.MeshPhysicalMaterial({ map: oliveTex, roughness: 0.9 }),
    charcoal:  new THREE.MeshPhysicalMaterial({ color: 0x232220, roughness: 0.85 }),
    black:     new THREE.MeshPhysicalMaterial({ color: 0x18140F, roughness: 0.5 }),
    brass:     new THREE.MeshPhysicalMaterial({ color: 0xB9924E, metalness: 1, roughness: 0.32 }),
    glassTop:  new THREE.MeshPhysicalMaterial({ color: 0xEAF3F2, roughness: 0.05, transmission: 0.85, thickness: 0.02, ior: 1.45 }),
    cabGlass:  new THREE.MeshPhysicalMaterial({ color: 0xdcebf0, roughness: 0.06, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    frame:     new THREE.MeshPhysicalMaterial({ color: 0x2b1c10, roughness: 0.5 }),
    plate:     new THREE.MeshStandardMaterial({ color: 0xF4EEE4, roughness: 0.25 }),
    rug:       (() => {
      const t = marble({ base: 0x7A2A26, vein: 0x3E1613, tile: 2.6, veins: 10, seed: 61 });
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.95 });
    })(),
    paintings: [0x8a2e28, 0x6b6438, 0x2e3b4e, 0x7a5a2e].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })),
  };

  const add = (geo, mat, x, y, z) => { const m = mesh(geo, mat, x, y, z); group.add(m); return m; };
  const box = (w, h, d, x, y, z, mat, r = 0.01) => add(rbox(w, h, d, r), mat, x, y, z);

  // a group standing at plan (x, y), rotated to face plan-angle `rot` (radians, 0 = +y/north)
  function stand(x, y, rot = 0) {
    const g = new THREE.Group(), c = W(x, y);
    g.position.set(c.x, 0, c.z); g.rotation.y = rot; group.add(g);
    return g;
  }
  const gmesh = (g, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const gbox = (g, w, h, d, x, y, z, mat, r = 0.01) => gmesh(g, rbox(w, h, d, r), mat, x, y, z);

  // ================================================================== pieces
  function diningTable(x, y, dia = 1.4) {
    const g = stand(x, y);
    gmesh(g, new THREE.CylinderGeometry(0.06, 0.1, 0.72, 16), P.wood, 0, 0.36, 0);
    gmesh(g, new THREE.CylinderGeometry(dia * 0.46, dia * 0.46, 0.03, 40), P.wood, 0, 0.715, 0);
    gmesh(g, new THREE.CylinderGeometry(dia / 2, dia / 2, 0.012, 48), P.glassTop, 0, 0.735, 0);
  }
  function diningChair(x, y, facing) {
    const g = stand(x, y, facing);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      gbox(g, 0.03, 0.45, 0.03, sx * 0.19, 0.225, sz * 0.19, P.wood);
    gbox(g, 0.42, 0.05, 0.42, 0, 0.47, 0, P.woodDark, 0.02);
    for (let i = -1; i <= 1; i++) gbox(g, 0.03, 0.38, 0.03, i * 0.15, 0.66, -0.2, P.wood);
    gbox(g, 0.42, 0.03, 0.03, 0, 0.86, -0.2, P.woodDark);
  }
  function consoleUnit(x, y, w, rot, withMirror = true) {
    const g = stand(x, y, rot);
    gbox(g, w, 0.75, 0.4, 0, 0.375, 0, P.wood);
    gbox(g, w - 0.04, 0.02, 0.4, 0, 0.76, 0, P.woodDark, 0.005);
    for (const sx of [-1, 1]) gmesh(g, new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), P.brass, sx * w * 0.22, 0.5, 0.19);
    if (withMirror) {
      gbox(g, w * 0.6, 0.7, 0.03, 0, 1.35, -0.17, P.frame, 0.02);
      gbox(g, w * 0.6 - 0.08, 0.7 - 0.08, 0.01, 0, 1.35, -0.15, new THREE.MeshPhysicalMaterial({ color: 0xdde7e6, metalness: 0.4, roughness: 0.05 }));
    }
  }
  function wallUnit(x, y, w, h, rot) {
    const g = stand(x, y, rot);
    gbox(g, w, 0.9, 0.45, 0, 0.45, 0, P.wood);                     // lower closed cabinets
    gbox(g, w, 0.02, 0.45, 0, 0.91, 0, P.woodDark, 0.005);
    gbox(g, w, h - 1.05, 0.35, 0, 0.95 + (h - 1.05) / 2, -0.03, P.woodDark, 0.01);   // carcass
    // glazed display doors on the upper section
    const doors = Math.max(2, Math.round(w / 0.7));
    for (let i = 0; i < doors; i++) {
      const dx = -w / 2 + (w / doors) * (i + 0.5);
      gbox(g, w / doors - 0.03, h - 1.15, 0.02, dx, 0.95 + (h - 1.05) / 2, 0.15, P.cabGlass, 0.01);
      gbox(g, w / doors - 0.02, h - 1.13, 0.015, dx, 0.95 + (h - 1.05) / 2, 0.155, P.woodDark, 0.005);
    }
  }
  function sofa(x, y, w, rot, seats = 2) {
    const g = stand(x, y, rot), d = 0.85, legH = 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      gmesh(g, new THREE.CylinderGeometry(0.02, 0.016, legH, 10), P.woodDark, sx * (w / 2 - 0.06), legH / 2, sz * (d / 2 - 0.06));
    gbox(g, w, 0.2, d, 0, legH + 0.1, 0, P.beige, 0.03);
    const cw = (w - 0.28) / seats;
    for (let i = 0; i < seats; i++) gbox(g, cw - 0.02, 0.16, d - 0.24, -w / 2 + 0.14 + cw * (i + 0.5), legH + 0.28, 0.06, P.beige, 0.05);
    gbox(g, w - 0.16, 0.46, 0.18, 0, legH + 0.2 + 0.23, -d / 2 + 0.13, P.beige, 0.06);
    for (let i = 0; i < seats; i++)
      gbox(g, cw - 0.06, 0.28, 0.1, -w / 2 + 0.14 + cw * (i + 0.5), legH + 0.47, -d / 2 + 0.28, P.rust, 0.05);
    for (const s of [-1, 1]) gbox(g, 0.16, 0.34, d, s * (w / 2 - 0.08), legH + 0.18 + 0.1, 0, P.beige, 0.06);
  }
  function armchair(x, y, rot) { sofa(x, y, 0.85, rot, 1); }
  function coffeeTable(x, y, rot = 0) {
    const g = stand(x, y, rot);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      gbox(g, 0.05, 0.4, 0.05, sx * 0.45, 0.2, sz * 0.24, P.wood);
    gbox(g, 1.05, 0.045, 0.58, 0, 0.42, 0, P.wood, 0.015);
  }
  function chaise(x, y, w, rot) {
    const g = stand(x, y, rot), d = 0.75, legH = 0.12;
    gbox(g, w, 0.18, d, 0, legH + 0.09, 0, P.rust, 0.05);
    gbox(g, 0.16, 0.4, d, -w / 2 + 0.08, legH + 0.18 + 0.11, 0, P.rust, 0.07);   // raised end, chaise-style
    gbox(g, w * 0.34, 0.14, 0.26, -w * 0.2, legH + 0.2, -d / 2 + 0.2, new THREE.MeshPhysicalMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x2 = c.getContext('2d'); x2.fillStyle = '#111'; x2.fillRect(0, 0, 64, 64); x2.fillStyle = '#eee'; for (let j = 0; j < 8; j++) for (let i = (j % 2); i < 8; i += 2) x2.fillRect(i * 8, j * 8, 8, 8); return new THREE.CanvasTexture(c); })(), roughness: 0.9 }), 0.05);
    gbox(g, w * 0.22, 0.13, 0.24, w * 0.15, legH + 0.2, -d / 2 + 0.2, P.olive, 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gmesh(g, new THREE.CylinderGeometry(0.02, 0.02, legH, 8), P.black, sx * (w / 2 - 0.08), legH / 2, sz * (d / 2 - 0.08));
  }
  function rockingChair(x, y, rot) {
    const g = stand(x, y, rot), w = 0.55, d = 0.75;
    const rock = new THREE.TorusGeometry(0.36, 0.018, 6, 20, Math.PI * 0.62);
    for (const sx of [-1, 1]) { const m = gmesh(g, rock, P.black, sx * (w / 2 - 0.06), 0.1, 0); m.rotation.z = Math.PI / 2; m.rotation.y = Math.PI / 2; }
    for (const sx of [-1, 1]) gbox(g, 0.03, 0.35, 0.03, sx * (w / 2 - 0.06), 0.3, 0, P.black);
    gbox(g, w, 0.06, d, 0, 0.42, 0, P.cane, 0.02);
    gbox(g, w, 0.55, 0.06, 0, 0.72, -d / 2 + 0.06, P.cane, 0.02);
    for (const sx of [-1, 1]) gbox(g, 0.03, 0.35, 0.03, sx * (w / 2 - 0.05), 0.62, -d / 2 + 0.1, P.black);
  }
  function rug(x, y, w, d, rot = 0) {
    const g = stand(x, y, rot);
    gbox(g, w, 0.012, d, 0, 0.006, 0, P.rug, 0.005).castShadow = false;
    gbox(g, w - 0.34, 0.001, d - 0.34, 0, 0.014, 0, new THREE.MeshPhysicalMaterial({ map: marble({ base: 0x8C3128, vein: 0xC9A24A, tile: d - 0.34, veins: 4, seed: 63 }), roughness: 0.92 }), 0.002).castShadow = false;
  }
  function wallArt(x, y, rot, w = 0.5, h = 0.6, tone = 0) {
    const g = stand(x, y, rot);
    gbox(g, w, h, 0.03, 0, 1.55, 0, P.frame, 0.01);
    gbox(g, w - 0.06, h - 0.06, 0.015, 0, 1.55, 0.02, P.paintings[tone % P.paintings.length]);
  }
  function photoGrid(x, y, rot, cols = 3, rows = 3) {
    const g = stand(x, y, rot), s = 0.13, gap = 0.03, w = cols * s + (cols - 1) * gap, h = rows * s + (rows - 1) * gap;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      gbox(g, s, s, 0.02, -w / 2 + s / 2 + c * (s + gap), 1.75 - (-h / 2 + s / 2 + r * (s + gap)), 0, P.frame, 0.005);
  }
  function wallClock(x, y, rot) {
    const g = stand(x, y, rot);
    gmesh(g, new THREE.CylinderGeometry(0.11, 0.11, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0xEDE7D8, roughness: 0.4 }), 0, 1.9, 0).rotation.x = Math.PI / 2;
  }
  function pendant(x, y, dropTo = 2.3) {
    const g = stand(x, y);
    gmesh(g, new THREE.CylinderGeometry(0.003, 0.003, 3, 6), P.black, 0, dropTo + 1.5, 0);
    gmesh(g, new THREE.SphereGeometry(0.18, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0xF3D9A0, emissive: 0xF3B24E, emissiveIntensity: 0.6, roughness: 0.4, transparent: true, opacity: 0.9 }), 0, dropTo, 0);
    const l = new THREE.PointLight(0xffd9a0, 6, 4, 2); l.position.set(g.position.x, dropTo, g.position.z); l.castShadow = false; group.add(l);
  }

  // ================================================================== layout
  const dining = rooms.find(r => r.id === 'dining'), living = rooms.find(r => r.id === 'living');
  if (dining) {
    const [dx0, dy0] = [dining.boundary_xy[3][0], dining.boundary_xy[0][1]];
    const [dx1, dy1] = [dining.boundary_xy[0][0], dining.boundary_xy[1][1]];
    const [cx, cy] = dining.centroid_xy;
    diningTable(cx, cy);
    const n = 6, r = 0.95;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      diningChair(cx + Math.sin(a) * r, cy + Math.cos(a) * r, a + Math.PI);
    }
    consoleUnit(dx0 + 0.22, (dy0 + dy1) / 2, 1.5, Math.PI / 2);
    pendant(cx, cy, 1.35);
  }
  if (living) {
    // west = lx0, open to the dining room (no wall); east = lx1, exterior wall;
    // south = ly0, toward the kitchen; north = ly1, toward the varandah.
    const [lx0, ly0] = [living.boundary_xy[3][0], living.boundary_xy[0][1]];
    const [lx1, ly1] = [living.boundary_xy[0][0], living.boundary_xy[1][1]];
    const [cx, cy] = living.centroid_xy;
    // the built-in wall unit on the east (far) wall, facing west into the room
    wallUnit(lx1 - 0.24, cy, Math.min(ly1 - ly0 - 0.6, 3.0), 2.3, -Math.PI / 2);
    // seating faces the wall unit: sofa on the open/west side facing east, two
    // armchairs flanking the coffee table north and south of it
    sofa(cx - 1.0, cy, 1.55, Math.PI / 2, 2);
    armchair(cx + 0.35, cy + 1.05, 0);
    armchair(cx + 0.35, cy - 1.05, Math.PI);
    coffeeTable(cx + 0.3, cy, Math.PI / 2);
    rug(cx, cy, 2.6, 3.2);
    pendant(cx, cy, 1.9);
    // the chaise and rocking chair on the north (varandah-side) wall
    chaise(lx0 + 1.0, ly1 - 0.5, 1.85, 0);
    rockingChair(lx0 + 2.15, ly1 - 0.55, Math.PI * 0.1);
    photoGrid(lx0 + 1.0, ly1 - 0.02, 0);
    wallClock(lx0 + 2.35, ly1 - 0.02, 0);
  }

  return group;
}
