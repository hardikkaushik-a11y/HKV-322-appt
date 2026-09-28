// Furniture, built in the diorama's own procedural style (first made for HKV-322).
//
// Positions, sizes and which way each piece faces come from the flat's zone.json
// `pieces`, read out of the architect's drawing by build/make_flat.py. This file only
// gives each type a shape. Surfaces use the flat's shared materials (M.fabric,
// M.accent, M.walnut, M.shutters, M.top, M.rug) so the swatch tray, the presets and
// the mood meter act on them; "Original" dresses them as the flat is today.
import * as THREE from 'three';
import { wood, fabric } from './textures.js';

export function buildFurnishing({ W, CUT, mesh, rbox, prism, M }) {
  const phys = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.7, ...o });
  const cane = wood({ base: 0xB28A58, dark: 0x6E5234, plank: 0.02, length: 0.4, seed: 91 });
  const zig = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#EDE7DC'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#1C1A18'; x.lineWidth = 5;
    for (let r = -8; r < 72; r += 16) { x.beginPath(); for (let i = 0; i <= 64; i += 8) x.lineTo(i, r + ((i / 8) % 2 ? 6 : -6)); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
  })();
  const tanjore = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x = c.getContext('2d');
    x.fillStyle = '#6E1F1A'; x.fillRect(0, 0, 128, 160); x.fillStyle = '#1F4A2E'; x.fillRect(10, 10, 108, 140);
    x.fillStyle = '#D4A437'; x.beginPath(); x.ellipse(64, 60, 20, 24, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(34, 150); x.quadraticCurveTo(64, 70, 94, 150); x.fill();
    x.fillStyle = '#E8C766'; x.beginPath(); x.arc(64, 40, 30, Math.PI, 0); x.lineWidth = 4; x.strokeStyle = '#E8C766'; x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const floral = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#EFE8DD'; x.fillRect(0, 0, 128, 128);
    let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const px = r() * 128, py = r() * 128, col = ['#7B4A5C', '#5E6E8C', '#9A5A55', '#6F7A5A'][i % 4];
      x.fillStyle = col; x.globalAlpha = 0.75;
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; x.beginPath(); x.ellipse(px + Math.cos(a) * 4, py + Math.sin(a) * 4, 4, 2.4, a, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#6F7A5A'; x.beginPath(); x.ellipse(px + 7, py + 6, 5, 2, 0.8, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 4); return t;
  })();
  const K = {
    linen: phys({ color: 0xF2EEE6, roughness: 0.95, sheen: 0.4, sheenRoughness: 0.8, sheenColor: 0xffffff }),
    cloth: phys({ map: fabric({ base: 0xEDE3D1, seed: 83 }), roughness: 0.9 }),
    lace: phys({ color: 0xF4EFE6, roughness: 0.95, transparent: true, opacity: 0.85 }),
    steel: phys({ color: 0xBDB6A8, metalness: 0.45, roughness: 0.38, clearcoat: 0.3 }),
    black: phys({ color: 0x1C1916, roughness: 0.45, clearcoat: 0.2 }),
    cane: phys({ map: cane, roughness: 0.75 }),
    glass: phys({ color: 0xE3EEEC, roughness: 0.04, transmission: 0.9, thickness: 0.01, transparent: true, opacity: 0.35, depthWrite: false }),
    zig: phys({ map: zig, roughness: 0.9 }),
    olive: phys({ color: 0x7C7A3A, roughness: 0.92, sheen: 0.4 }),
    plate: phys({ color: 0xF6F3EE, roughness: 0.2, clearcoat: 0.6 }),
    rim: phys({ color: 0x9E2B25, roughness: 0.3 }),
    shade: phys({ color: 0xEFE0C4, emissive: 0xFFCC88, emissiveIntensity: 0.25, roughness: 0.9, side: THREE.DoubleSide }),
    leaf: phys({ color: 0x4E6B35, roughness: 0.8 }),
    pot: phys({ color: 0xB87A52, roughness: 0.85 }),
    fruit: phys({ color: 0xE39A2B, roughness: 0.5 }),
    tanjore: phys({ map: tanjore, roughness: 0.6, metalness: 0.15 }),
    floral: phys({ map: floral, roughness: 0.95, side: THREE.DoubleSide, sheen: 0.3 }),
    gilt: phys({ color: 0xC9A04A, metalness: 1, roughness: 0.35 }),
    photo: phys({ color: 0x3A3F44, roughness: 0.4 }),
    mat: phys({ color: 0xF1EDE6, roughness: 0.9 }),
    books: [0x7A2E28, 0x2F4A5C, 0xC8B28A, 0x3E5B3A, 0x5C4A6E, 0xD9D2C3].map(c => phys({ color: c, roughness: 0.8 })),
    section: M.section,
  };

  // a group at the piece: local X across its width, +Z its front
  function frame(p) {
    const g = new THREE.Group(), o = p.obb, c = W(o.cx, o.cy);
    g.position.set(c.x, 0, c.z);
    g.rotation.y = p.facing ? Math.atan2(p.facing[0], -p.facing[1]) : o.angle;
    return g;
  }
  const add = (g, geo, mat, x = 0, y = 0, z = 0) => { const m = mesh(geo, mat, x, y, z); g.add(m); return m; };
  const box = (g, w, h, d, x, y, z, mat, r = 0.008) => add(g, rbox(w, h, d, r), mat, x, y, z);
  const cyl = (g, r0, r1, h, x, y, z, mat, n = 24) => add(g, new THREE.CylinderGeometry(r0, r1, h, n), mat, x, y, z);
  const top = (h) => Math.min(h, CUT - 0.006);
  const cap = (g, w, d, z = 0) => { const m = box(g, w, 0.006, d, 0, CUT - 0.003, z, K.section, 0.001); m.castShadow = false; };
  const dims = (p) => ({ w: p.obb.w, d: p.obb.d });

  function sofaShape(g, w, d, seats) {
    const legH = 0.1, arm = Math.min(0.2, w * 0.18);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.022, 0.018, legH, sx * (w / 2 - 0.08), legH / 2, sz * (d / 2 - 0.08), M.walnut, 10);
    box(g, w, 0.2, d, 0, legH + 0.1, 0, M.fabric, 0.03);
    const cw = (w - 2 * arm) / seats;
    for (let i = 0; i < seats; i++) box(g, cw - 0.015, 0.14, d - 0.26, -w / 2 + arm + cw * (i + 0.5), legH + 0.27, 0.08, M.fabric, 0.05);
    box(g, w - 2 * arm, 0.42, 0.2, 0, legH + 0.41, -d / 2 + 0.11, M.fabric, 0.06);
    for (const s of [-1, 1]) {
      box(g, arm, 0.3, d, s * (w / 2 - arm / 2), legH + 0.3, 0, M.fabric, 0.05);
      const roll = add(g, new THREE.CylinderGeometry(arm / 2 + 0.01, arm / 2 + 0.01, d, 16), M.fabric, s * (w / 2 - arm / 2), legH + 0.47, 0);
      roll.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < seats; i++) {
      const c = box(g, Math.min(0.42, cw - 0.08), 0.34, 0.12, -w / 2 + arm + cw * (i + 0.5), legH + 0.5, -d / 2 + 0.28, M.accent, 0.06);
      c.rotation.x = -0.18;
    }
  }

  const BUILD = {
    sofa(p) { const g = frame(p), { w, d } = dims(p); sofaShape(g, w, d, p.seats || Math.max(1, Math.round(w / 0.62))); return g; },
    armchair(p) { const g = frame(p), { w, d } = dims(p); sofaShape(g, Math.max(w, 0.72), Math.max(d, 0.7), 1); return g; },
    bed(p) {
      const g = frame(p), w = p.obb.w, d = p.obb.d;
      box(g, w, 0.28, d, 0, 0.18, 0, M.walnut, 0.02);
      box(g, w - 0.08, 0.22, d - 0.06, 0, 0.43, 0.02, K.linen, 0.05);
      box(g, w - 0.04, 0.05, d * 0.62, 0, 0.56, d * 0.18, K.linen, 0.03);
      box(g, w, 0.02, 0.42, 0, 0.59, d / 2 - 0.3, M.accent, 0.01);
      for (const s of [-1, 1]) box(g, 0.62, 0.13, 0.4, s * 0.42, 0.6, -d / 2 + 0.33, K.linen, 0.06);
      box(g, w + 0.06, 1.05, 0.08, 0, 0.53, -d / 2 - 0.02, M.walnut, 0.02);
      box(g, w - 0.2, 0.55, 0.03, 0, 0.78, -d / 2 + 0.035, M.fabric, 0.02);
      return g;
    },
    nightstand(p) {
      const g = frame(p), { w, d } = dims(p);
      box(g, w, 0.5, d, 0, 0.25, 0, M.walnut, 0.01);
      box(g, w - 0.06, 0.004, 0.004, 0, 0.36, d / 2 + 0.001, M.section, 0.001);
      cyl(g, 0.06, 0.07, 0.2, 0, 0.6, -0.02, K.pot, 16); cyl(g, 0.11, 0.14, 0.16, 0, 0.78, -0.02, K.shade, 20);
      return g;
    },
    wardrobe(p) {
      const g = frame(p), { w, d } = dims(p), h = top(2.4);
      box(g, w, h, d, 0, h / 2, 0, M.shutters, 0.004);
      const n = Math.max(2, Math.round(w / 0.55));
      for (let i = 1; i < n; i++) box(g, 0.004, h - 0.1, 0.004, -w / 2 + (w / n) * i, h / 2, d / 2 + 0.001, M.section, 0.001);
      for (let i = 0; i < n; i++) box(g, 0.012, 0.3, 0.02, -w / 2 + (w / n) * (i + (i % 2 ? 0.12 : 0.88)), 1.05, d / 2 + 0.012, M.brass, 0.004);
      cap(g, w, d); return g;
    },
    almirah(p) {
      const g = frame(p), { w, d } = dims(p), h = 1.98;
      box(g, w, h, d, 0, h / 2, 0, K.steel, 0.01);
      box(g, 0.004, h - 0.08, 0.004, 0, h / 2, d / 2 + 0.001, M.section, 0.001);
      box(g, 0.015, 0.22, 0.03, 0.05, 1.05, d / 2 + 0.015, K.steel, 0.005);
      return g;
    },
    showcase(p) {
      const g = frame(p), { w, d } = dims(p), h = top(2.4), low = 0.86;
      box(g, w, low, d, 0, low / 2, 0, M.shutters, 0.004);
      const n = Math.max(2, Math.round(w / 0.55));
      for (let i = 1; i < n; i++) box(g, 0.004, low - 0.08, 0.004, -w / 2 + (w / n) * i, low / 2, d / 2 + 0.001, M.section, 0.001);
      box(g, w, h - low, 0.04, 0, low + (h - low) / 2, -d / 2 + 0.02, M.shutters, 0.004);
      for (const s of [-1, 1]) box(g, 0.04, h - low, d, s * (w / 2 - 0.02), low + (h - low) / 2, 0, M.shutters, 0.004);
      for (const y of [low + 0.02, low + 0.42, low + 0.82]) box(g, w - 0.08, 0.025, d - 0.06, 0, y, 0.01, M.walnut, 0.004);
      // what the photo shows on its shelves: brass, plates, small figures
      const things = [[-1.2, 0, 'brass'], [-0.7, 0, 'plate'], [-0.2, 0, 'brass'], [0.35, 0, 'plate'], [0.9, 0, 'brass'], [1.3, 0, 'plate'],
                      [-1.0, 1, 'plate'], [-0.3, 1, 'brass'], [0.5, 1, 'plate'], [1.1, 1, 'brass']];
      for (const [x, k, kind] of things) {
        if (Math.abs(x) > w / 2 - 0.12) continue;
        const y = low + 0.035 + k * 0.4;
        if (kind === 'brass') cyl(g, 0.04, 0.05, 0.16, x, y + 0.08, -0.02, M.brass, 14);
        else { const m = cyl(g, 0.11, 0.11, 0.012, x, y + 0.12, -d / 2 + 0.08, K.plate, 24); m.rotation.x = Math.PI / 2 - 0.2; }
      }
      box(g, w - 0.08, h - low - 0.04, 0.006, 0, low + (h - low) / 2, d / 2 - 0.01, K.glass, 0.002).castShadow = false;
      cap(g, w, d); return g;
    },
    pooja(p) {
      const g = frame(p), { w, d } = dims(p);
      box(g, w, 0.72, d, 0, 1.17, 0, M.walnut, 0.01);
      box(g, w - 0.12, 0.46, 0.02, 0, 1.2, d / 2 - 0.005, M.section, 0.004);
      cyl(g, 0.035, 0.05, 0.1, 0, 1.03, 0, M.brass, 14);
      box(g, w + 0.04, 0.04, d + 0.03, 0, 1.55, 0, K.gilt, 0.006);
      return g;
    },
    bookshelf(p) {
      const g = frame(p), { w, d } = dims(p), h = top(1.9);
      box(g, w, 0.03, d, 0, 0.015, 0, M.walnut); box(g, w, 0.03, d, 0, h - 0.015, 0, M.walnut);
      for (const s of [-1, 1]) box(g, 0.03, h, d, s * (w / 2 - 0.015), h / 2, 0, M.walnut);
      box(g, w, h, 0.015, 0, h / 2, -d / 2 + 0.008, M.walnut);
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let y = 0.03; y < h - 0.3; y += 0.36) {
        box(g, w - 0.06, 0.02, d - 0.02, 0, y, 0.005, M.walnut);
        let x = -w / 2 + 0.05;
        while (x < w / 2 - 0.12) { const bw = 0.025 + rnd() * 0.035, bh = 0.2 + rnd() * 0.08; box(g, bw, bh, d * 0.7, x + bw / 2, y + 0.01 + bh / 2, 0, K.books[Math.floor(rnd() * K.books.length)], 0.003); x += bw + 0.004; if (rnd() < 0.08) x += 0.1; }
      }
      cap(g, w, d); return g;
    },
    window_seat(p) {
      const g = new THREE.Group();
      g.add(prism(p.footprint, [], 0, 0.4, M.walnut));
      g.add(prism(p.footprint, [], 0.4, 0.48, M.fabric));
      const f = frame(p), { w, d } = dims(p);
      for (const s of [-0.3, 0.3]) { const c = box(f, 0.36, 0.3, 0.1, s * w, 0.62, -d / 2 + 0.1, M.accent, 0.05); c.rotation.x = -0.2; }
      g.add(f); return g;
    },
    desk(p) {
      const g = frame(p), { w, d } = dims(p);
      box(g, w, 0.035, d, 0, 0.745, 0, M.walnut, 0.006);
      box(g, 0.45, 0.72, d - 0.04, w / 2 - 0.25, 0.36, 0, M.shutters, 0.006);
      for (let i = 1; i < 3; i++) box(g, 0.4, 0.004, 0.004, w / 2 - 0.25, 0.72 * i / 3, d / 2 - 0.018, M.section, 0.001);
      for (const s of [-1, 1]) box(g, 0.04, 0.72, 0.04, -w / 2 + 0.04, 0.36, s * (d / 2 - 0.04), M.walnut, 0.006);
      box(g, 0.34, 0.012, 0.24, -0.1, 0.77, 0.04, K.black, 0.003);
      const scr = box(g, 0.34, 0.22, 0.008, -0.1, 0.88, -0.08, K.black, 0.003); scr.rotation.x = -0.25;
      return g;
    },
    desk_chair(p) {
      const g = frame(p);
      box(g, 0.46, 0.07, 0.46, 0, 0.47, 0, M.fabric, 0.03);
      box(g, 0.44, 0.44, 0.06, 0, 0.76, -0.21, M.fabric, 0.04);
      cyl(g, 0.02, 0.02, 0.38, 0, 0.24, 0, K.black, 10);
      for (let i = 0; i < 5; i++) { const b = box(g, 0.3, 0.025, 0.04, 0, 0.05, 0, K.black, 0.005); b.rotation.y = i * Math.PI * 2 / 5; b.position.set(Math.cos(i * Math.PI * 2 / 5) * 0.13, 0.05, -Math.sin(i * Math.PI * 2 / 5) * 0.13); }
      return g;
    },
    round_table(p) {
      const g = frame(p), r = p.obb.w / 2;
      cyl(g, 0.3, 0.34, 0.04, 0, 0.02, 0, M.walnut, 32);
      cyl(g, 0.07, 0.09, 0.68, 0, 0.36, 0, M.walnut, 20);
      cyl(g, r - 0.02, r - 0.02, 0.03, 0, 0.72, 0, M.walnut, 48);
      cyl(g, r, r, 0.01, 0, 0.74, 0, K.cloth, 48);
      cyl(g, r, r, 0.012, 0, 0.751, 0, K.glass, 48).castShadow = false;
      cyl(g, r * 0.42, r * 0.42, 0.01, 0, 0.765, 0, K.glass, 40).castShadow = false;
      for (let i = 0; i < 6; i++) {
        const a = (105 + 60 * i) * Math.PI / 180, x = Math.cos(a) * r * 0.72, z = -Math.sin(a) * r * 0.72;
        cyl(g, 0.125, 0.12, 0.012, x, 0.764, z, K.rim, 28); cyl(g, 0.1, 0.1, 0.014, x, 0.765, z, K.plate, 28);
      }
      return g;
    },
    centre_table(p) {
      const g = frame(p), { w, d } = dims(p);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.42, 0.05, sx * (w / 2 - 0.05), 0.21, sz * (d / 2 - 0.05), M.walnut, 0.006);
      box(g, w, 0.05, d, 0, 0.42, 0, M.walnut, 0.008);
      box(g, w - 0.08, 0.012, d - 0.08, 0, 0.452, 0, K.glass, 0.004).castShadow = false;
      box(g, w - 0.1, 0.02, d - 0.1, 0, 0.12, 0, M.walnut, 0.006);
      box(g, w * 0.8, 0.003, d * 0.45, 0, 0.46, 0, K.lace, 0.001);
      cyl(g, 0.12, 0.08, 0.1, 0, 0.51, 0, M.brass, 18);
      return g;
    },
    daybed(p) {
      const g = frame(p), { w, d } = dims(p);
      box(g, w, 0.14, d, 0, 0.09, 0, M.walnut, 0.01);
      box(g, w - 0.02, 0.22, d - 0.02, 0, 0.27, 0, M.accent, 0.04);
      box(g, w - 0.06, 0.3, 0.16, 0, 0.53, -d / 2 + 0.09, M.accent, 0.06);
      for (const [x, m, rot] of [[-0.55, K.cloth, 0.1], [0.05, K.zig, -0.12], [0.3, K.zig, 0.15]]) { const c = box(g, 0.4, 0.34, 0.12, x * w / 1.7, 0.56, -d / 2 + 0.22, m, 0.06); c.rotation.x = -0.25; c.rotation.z = rot; }
      box(g, 0.34, 0.3, 0.12, w / 2 - 0.3, 0.55, -d / 2 + 0.22, K.olive, 0.06).rotation.x = -0.2;
      return g;
    },
    rocking_chair(p) {
      const g = frame(p), w = 0.55;
      for (const s of [-1, 1]) {
        const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, 0.42), new THREE.Vector3(0, 0.02, 0.1), new THREE.Vector3(0, 0.02, -0.2), new THREE.Vector3(0, 0.12, -0.46)]);
        const m = add(g, new THREE.TubeGeometry(c, 24, 0.016, 6, false), K.black, s * (w / 2 - 0.03), 0, 0); m.castShadow = true;
        for (const z of [0.2, -0.22]) box(g, 0.03, 0.4, 0.03, s * (w / 2 - 0.03), 0.23, z, K.black, 0.006);
        box(g, 0.03, 0.6, 0.03, s * (w / 2 - 0.03), 0.72, -0.27, K.black, 0.006);
        box(g, 0.04, 0.03, 0.44, s * (w / 2 - 0.03), 0.62, -0.02, K.black, 0.006);
      }
      box(g, w, 0.035, 0.46, 0, 0.44, -0.02, K.cane, 0.006);
      const b = box(g, w - 0.06, 0.42, 0.02, 0, 0.78, -0.28, K.cane, 0.004); b.rotation.x = -0.12;
      box(g, w, 0.07, 0.035, 0, 1.03, -0.3, K.black, 0.006);
      box(g, 0.34, 0.3, 0.1, 0, 0.64, -0.2, K.olive, 0.05).rotation.x = -0.15;
      return g;
    },
    sideboard(p) {
      const g = frame(p), { w, d } = dims(p);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 0.12, 0.04, sx * (w / 2 - 0.05), 0.06, sz * (d / 2 - 0.05), M.walnut, 0.005);
      box(g, w, 0.68, d, 0, 0.46, 0, M.shutters, 0.006);
      for (let i = 0; i < 3; i++) { const x = -w / 2 + w * (i + 0.5) / 3; box(g, w / 3 - 0.02, 0.004, 0.004, x, 0.66, d / 2 + 0.001, M.section, 0.001); box(g, 0.08, 0.012, 0.015, x, 0.73, d / 2 + 0.008, M.brass, 0.003); }
      box(g, w * 0.9, 0.004, d * 0.8, 0, 0.802, 0, K.lace, 0.001);
      cyl(g, 0.13, 0.08, 0.08, 0.1, 0.84, 0.02, K.glass, 20); for (const [x, z] of [[0.06, 0], [0.13, 0.04], [0.14, -0.03]]) add(g, new THREE.SphereGeometry(0.04, 12, 10), K.fruit, x, 0.89, z);
      cyl(g, 0.06, 0.05, 0.12, -w / 2 + 0.15, 0.86, 0, K.pot, 14);
      for (let i = 0; i < 7; i++) { const l = box(g, 0.02, 0.2, 0.06, -w / 2 + 0.15, 1.0, 0, K.leaf, 0.01); l.rotation.set(Math.sin(i) * 0.5, i, Math.cos(i * 1.7) * 0.5); }
      cyl(g, 0.06, 0.05, 0.16, w / 2 - 0.15, 0.88, 0, M.brass, 16);
      return g;
    },
    shoe_cabinet(p) {
      const g = frame(p), { w, d } = dims(p);
      box(g, w, 0.78, d, 0, 0.44, 0, M.shutters, 0.006);
      box(g, w + 0.02, 0.03, d + 0.02, 0, 0.845, 0, M.walnut, 0.005);
      box(g, 0.004, 0.62, 0.004, 0, 0.42, d / 2 + 0.001, M.section, 0.001);
      cyl(g, 0.14, 0.09, 0.06, w / 4, 0.89, 0, M.brass, 20);
      return g;
    },
    painting(p) {
      const g = frame(p), { w, d } = dims(p), h = p.h || 0.6, y = (p.z || 1.3) + h / 2;
      if (p.art === 'grid') {
        const s = w / 3.3;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const x = (c - 1) * s * 1.15, yy = y + (1 - r) * s * 1.15;
          box(g, s, s, 0.02, x, yy, 0, K.black, 0.003); box(g, s - 0.03, s - 0.03, 0.004, x, yy, 0.011, K.mat, 0.001);
          box(g, s * 0.5, s * 0.38, 0.004, x, yy, 0.014, K.photo, 0.001);
        }
      } else {
        box(g, w, h, 0.04, 0, y, 0, K.gilt, 0.01);
        box(g, w - 0.08, h - 0.08, 0.006, 0, y, 0.021, K.tanjore, 0.002);
      }
      return g;
    },
    curtain(p) {
      // two panels drawn to the sides of the doorway, as in the photo, on a brass rod
      const g = frame(p), w = p.obb.w, h = top(2.05);
      const rod = cyl(g, 0.012, 0.012, w + 0.3, 0, h, 0.04, M.brass, 10); rod.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) {
        const pw = w * 0.42, geo = new THREE.PlaneGeometry(pw, h - 0.02, 12, 1), pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / pw + 0.5) * Math.PI * 6) * 0.025);
        geo.computeVertexNormals();
        const m = add(g, geo, K.floral, s * (w / 2 - pw / 2 + 0.08), h / 2 - 0.01, 0.05); m.castShadow = true;
      }
      return g;
    },
    rug(p) {
      const g = frame(p), { w, d } = dims(p);
      const m = box(g, w, 0.012, d, 0, 0.006, 0, M.rug, 0.004); m.castShadow = false;
      return g;
    },
    floor_vase(p) {
      const g = frame(p), pts = [[0.001, 0], [0.09, 0.02], [0.13, 0.25], [0.1, 0.5], [0.06, 0.62], [0.08, 0.72], [0.001, 0.72]].map(([r, y]) => new THREE.Vector2(r, y));
      add(g, new THREE.LatheGeometry(pts, 28), M.brass);
      return g;
    },
    floor_lamp(p) {
      const g = frame(p);
      cyl(g, 0.16, 0.18, 0.03, 0, 0.015, 0, M.walnut, 24);
      cyl(g, 0.045, 0.06, 1.25, 0, 0.65, 0, M.walnut, 16);
      cyl(g, 0.17, 0.2, 0.34, 0, 1.45, 0, K.shade, 28);
      return g;
    },
  };
  if (!M.rug) M.rug = new THREE.MeshPhysicalMaterial({ roughness: 0.95 });
  return { roots: {}, floors: {}, pieces: [], obstacles: [], slots: [], cladding: {}, curtainMode: {}, BUILD };
}
