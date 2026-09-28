// Procedural material textures, drawn on small canvases at load time.
// No image files: marble, walnut, fabric and lacquer are generated in code, the
// way Ryan Sael's moodboard builds its swatches. Every texture is seeded, so the
// same finish looks the same on every load and in every shared link.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// value noise on a small lattice, bilinear, for soft blotches and grain drift
function noise2(seed, cells) {
  const r = rng(seed), g = [];
  for (let i = 0; i < (cells + 1) * (cells + 1); i++) g.push(r());
  const at = (i, j) => g[(j % (cells + 1)) * (cells + 1) + (i % (cells + 1))];
  return (u, v) => {
    const x = u * cells, y = v * cells, i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

const hex = (c) => '#' + new THREE.Color(c).getHexString();
function shade(c, k) {
  const col = new THREE.Color(c);
  return col.multiplyScalar(k).getStyle();
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })];   // kept in memory: relief maps read it back
}

function finish(c, repeatMetres, { color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(1 / repeatMetres, 1 / repeatMetres);   // geometry UVs are in metres
  return t;
}

// Stone: soft cloud + a few long veins. `tile` is the slab size in metres; a joint
// line is drawn at the edge so large-format tiles read as tiles.
export function marble({ base, vein, tile = 0.8, joint = true, seed = 7, veins = 5 }) {
  const N = 512, [c, x] = canvas(N), n = noise2(seed, 6), n2 = noise2(seed + 3, 18);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, k = 0.94 + 0.08 * n(u, v) + 0.03 * n2(u, v);
    const o = (j * N + i) * 4;
    img.data[o] = Math.min(255, B.r * 255 * k); img.data[o + 1] = Math.min(255, B.g * 255 * k);
    img.data[o + 2] = Math.min(255, B.b * 255 * k); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const r = rng(seed + 11);
  x.lineCap = 'round';
  for (let k = 0; k < veins; k++) {
    let px = r() * N, py = -20, ang = Math.PI / 2 + (r() - 0.5) * 1.2;
    x.strokeStyle = hex(vein); x.globalAlpha = 0.18 + r() * 0.25;
    for (let pass = 0; pass < 2; pass++) {
      x.lineWidth = pass ? 0.8 : 2.2 + r() * 2.5;
      x.beginPath(); x.moveTo(px, py);
      let qx = px, qy = py, a = ang;
      for (let s = 0; s < 60; s++) {
        a += (r() - 0.5) * 0.35; qx += Math.cos(a) * 11; qy += Math.sin(a) * 11;
        x.lineTo(qx, qy);
      }
      x.stroke();
    }
  }
  x.globalAlpha = 1;
  if (joint) { x.strokeStyle = shade(base, 0.72); x.lineWidth = 1.5; x.strokeRect(0.75, 0.75, N - 1.5, N - 1.5); }
  return finish(c, tile);
}

// Timber: long grain along u, with slow drift; `plank` metres wide, joints on v.
// `ends` adds staggered butt joints, for a laid plank floor.
export function wood({ base, dark, plank = 0.18, length = 1.2, seed = 3, ends = false }) {
  const N = 512, [c, x] = canvas(N), n = noise2(seed, 4), r = rng(seed);
  x.fillStyle = hex(base); x.fillRect(0, 0, N, N);
  const rows = Math.max(1, Math.round(length / plank));
  for (let p = 0; p < rows; p++) {
    const y0 = (p / rows) * N, h = N / rows, tone = 0.9 + r() * 0.2;
    x.fillStyle = shade(base, tone); x.fillRect(0, y0, N, h);
    for (let g = 0; g < 26; g++) {
      const gy = y0 + r() * h, w = 0.4 + r() * 1.6;
      x.strokeStyle = hex(dark); x.globalAlpha = 0.08 + r() * 0.18; x.lineWidth = w;
      x.beginPath();
      for (let i = 0; i <= N; i += 16) x.lineTo(i, gy + (n(i / N, gy / N) - 0.5) * 10);
      x.stroke();
    }
    x.globalAlpha = 0.5; x.strokeStyle = shade(base, 0.55); x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, y0 + 0.5); x.lineTo(N, y0 + 0.5); x.stroke();
    if (ends) {
      const ex = (p % 2 ? 0.25 : 0.75) * N + (r() - 0.5) * N * 0.3;
      x.beginPath(); x.moveTo(ex, y0); x.lineTo(ex, y0 + h); x.stroke();
    }
    x.globalAlpha = 1;
  }
  return finish(c, length);
}

// ---- relief: a normal map read off a texture's own tones. Grain, weave, joints and
// pores are darker than the surface around them, so they become grooves and the
// finish catches light like a material instead of looking printed on.
export function normalFrom(tex, strength = 1) {
  const src = tex.image, N = src.width, d = src.getContext('2d').getImageData(0, 0, N, N).data;
  const h = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) h[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  const at = (i, j) => h[((j + N) % N) * N + ((i + N) % N)];
  const [c, x] = canvas(N), out = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    // canvas rows run down the texture's v, hence the sign on y
    const nx = -(at(i + 1, j) - at(i - 1, j)) * strength, ny = (at(i, j + 1) - at(i, j - 1)) * strength;
    const l = Math.hypot(nx, ny, 1), o = (j * N + i) * 4;
    out.data[o] = (nx / l * 0.5 + 0.5) * 255; out.data[o + 1] = (ny / l * 0.5 + 0.5) * 255;
    out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[o + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.copy(tex.repeat);
  return t;
}

// Bouclé: a field of small tight loops, the nubbly curly-yarn upholstery.
export function boucle({ base, seed = 19 }) {
  const N = 256, [c, x] = canvas(N), r = rng(seed);
  x.fillStyle = shade(base, 0.9); x.fillRect(0, 0, N, N);
  for (let k = 0; k < 2600; k++) {
    const cx = r() * N, cy = r() * N, s = 1.6 + r() * 2.4;
    x.strokeStyle = shade(base, 0.82 + r() * 0.3); x.lineWidth = 1 + r();
    x.beginPath(); x.arc(cx, cy, s, 0, Math.PI * 2); x.stroke();
  }
  return finish(c, 0.18);
}

// Velvet: nearly flat colour with soft crushed patches of pile.
export function velvet({ base, seed = 23 }) {
  const N = 256, [c, x] = canvas(N), n = noise2(seed, 5), n2 = noise2(seed + 1, 22);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = 0.9 + 0.16 * n(i / N, j / N) + 0.03 * n2(i / N, j / N), o = (j * N + i) * 4;
    img.data[o] = Math.min(255, B.r * 255 * k); img.data[o + 1] = Math.min(255, B.g * 255 * k);
    img.data[o + 2] = Math.min(255, B.b * 255 * k); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return finish(c, 0.6);
}

// Leather: mottled hide with a network of fine creases.
export function leather({ base, seed = 29 }) {
  const N = 256, [c, x] = canvas(N), n = noise2(seed, 7), r = rng(seed);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = 0.9 + 0.18 * n(i / N, j / N), o = (j * N + i) * 4;
    img.data[o] = Math.min(255, B.r * 255 * k); img.data[o + 1] = Math.min(255, B.g * 255 * k);
    img.data[o + 2] = Math.min(255, B.b * 255 * k); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = shade(base, 0.62); x.lineWidth = 0.7;
  for (let k = 0; k < 900; k++) {
    let px = r() * N, py = r() * N, a = r() * Math.PI * 2;
    x.globalAlpha = 0.25 + r() * 0.35; x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 3; s++) { a += (r() - 0.5) * 1.4; px += Math.cos(a) * 4; py += Math.sin(a) * 4; x.lineTo(px, py); }
    x.stroke();
  }
  x.globalAlpha = 1;
  return finish(c, 0.3);
}

// Limewash: paint with big soft clouds and brush arcs, the chalky hand-applied wall.
export function limewash({ base, seed = 31 }) {
  const N = 512, [c, x] = canvas(N), n = noise2(seed, 4), n2 = noise2(seed + 2, 12);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = 0.95 + 0.07 * n(i / N, j / N) + 0.025 * n2(i / N, j / N), o = (j * N + i) * 4;
    img.data[o] = Math.min(255, B.r * 255 * k); img.data[o + 1] = Math.min(255, B.g * 255 * k);
    img.data[o + 2] = Math.min(255, B.b * 255 * k); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const r = rng(seed);
  for (let k = 0; k < 60; k++) {
    x.strokeStyle = shade(base, 0.95 + r() * 0.08); x.globalAlpha = 0.12; x.lineWidth = 14 + r() * 20;
    const cx = r() * N, cy = r() * N, rad = 40 + r() * 70, a = r() * Math.PI * 2;
    x.beginPath(); x.arc(cx, cy, rad, a, a + 0.8 + r()); x.stroke();
  }
  x.globalAlpha = 1;
  return finish(c, 2.4);
}

// Travertine: warm banded stone with small elongated pores, laid in tiles.
export function travertine({ base, tile = 0.6, seed = 37, joint = true }) {
  const N = 512, [c, x] = canvas(N), n = noise2(seed, 3), r = rng(seed);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const band = Math.sin(j / N * 38 + n(i / N * 0.4, j / N) * 9) * 0.035;
    const k = 0.95 + band + 0.05 * n(i / N, j / N), o = (j * N + i) * 4;
    img.data[o] = Math.min(255, B.r * 255 * k); img.data[o + 1] = Math.min(255, B.g * 255 * k);
    img.data[o + 2] = Math.min(255, B.b * 255 * k); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.fillStyle = shade(base, 0.62);
  for (let k = 0; k < 320; k++) {
    x.globalAlpha = 0.35 + r() * 0.4;
    x.beginPath(); x.ellipse(r() * N, r() * N, 2 + r() * 7, 0.8 + r() * 1.4, (r() - 0.5) * 0.2, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  if (joint) { x.strokeStyle = shade(base, 0.72); x.lineWidth = 1.5; x.strokeRect(0.75, 0.75, N - 1.5, N - 1.5); }
  return finish(c, tile);
}

// Upholstery: a fine two-direction weave with slub noise. Repeats every 0.25 m.
export function fabric({ base, seed = 5 }) {
  const N = 256, [c, x] = canvas(N), n = noise2(seed, 10), r = rng(seed);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const w = ((i >> 1) + (j >> 1)) & 1 ? 1.03 : 0.97;
    const k = w * (0.95 + 0.08 * n(i / N, j / N)) * (0.97 + r() * 0.06);
    const o = (j * N + i) * 4;
    img.data[o] = Math.min(255, B.r * 255 * k); img.data[o + 1] = Math.min(255, B.g * 255 * k);
    img.data[o + 2] = Math.min(255, B.b * 255 * k); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return finish(c, 0.25);
}

// Lacquer / laminate shutters: near-flat colour, a hairline joint every `module`
// metres along u, and a profile-handle groove near the top edge.
export function shutter({ base, module = 0.6, groove = true, seed = 9 }) {
  const N = 256, [c, x] = canvas(N), n = noise2(seed, 3);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = 0.985 + 0.03 * n(i / N, j / N), o = (j * N + i) * 4;
    img.data[o] = B.r * 255 * k; img.data[o + 1] = B.g * 255 * k; img.data[o + 2] = B.b * 255 * k; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.fillStyle = shade(base, 0.55); x.fillRect(0, 0, 2, N);          // vertical joint
  if (groove) { x.fillStyle = shade(base, 0.5); x.fillRect(0, 10, N, 5); }
  const t = finish(c, module);
  t.repeat.set(1 / module, 1 / 0.9);   // v spans the carcass height
  return t;
}

// Tambour (rolling shutter): horizontal slats.
export function tambour({ base }) {
  const N = 128, [c, x] = canvas(N);
  x.fillStyle = hex(base); x.fillRect(0, 0, N, N);
  for (let j = 0; j < N; j += 8) { x.fillStyle = shade(base, 0.72); x.fillRect(0, j, N, 1.5); }
  const t = finish(c, 0.12); t.repeat.set(1, 1 / 0.12); return t;
}

// Plaster / paint: almost flat, a whisper of trowel noise so walls are not plastic.
export function paint({ base, seed = 13 }) {
  const N = 256, [c, x] = canvas(N), n = noise2(seed, 8);
  const img = x.createImageData(N, N), B = new THREE.Color(base);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = 0.975 + 0.04 * n(i / N, j / N), o = (j * N + i) * 4;
    img.data[o] = B.r * 255 * k; img.data[o + 1] = B.g * 255 * k; img.data[o + 2] = B.b * 255 * k; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return finish(c, 1.5);
}

// a flat swatch preview for the UI (a data URL), from any of the above
export function swatchURL(tex, px = 96) {
  const [c, x] = canvas(px);
  x.drawImage(tex.image, 0, 0, px, px);
  return c.toDataURL();
}

// Terrazzo: warm matrix with scattered stone chips (her Toilet 3 counter and sill).
export function terrazzo({ base, chips = [0x9C8466, 0xE8E1D4, 0x6E6255, 0xB9A07E], tile = 0.6, seed = 17 }) {
  const N = 512, [c, x] = canvas(N), r = rng(seed);
  x.fillStyle = hex(base); x.fillRect(0, 0, N, N);
  for (let k = 0; k < 900; k++) {
    const cx = r() * N, cy = r() * N, s = 1.5 + r() * r() * 9, sides = 4 + Math.floor(r() * 4);
    x.fillStyle = hex(chips[Math.floor(r() * chips.length)]); x.globalAlpha = 0.75 + r() * 0.25;
    x.beginPath();
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2 + r() * 0.6, d = s * (0.6 + r() * 0.5); x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
    x.closePath(); x.fill();
  }
  x.globalAlpha = 1;
  return finish(c, tile);
}

// Persian rug: a red field of small motifs, a central medallion and corner spandrels,
// inside navy and ivory borders. Drawn once across the rug (repeat 1 on 0-1 UVs).
export function persian({ base = 0x8E2E24, ink = 0x1F2A44, gold = 0xC49A5C, ivory = 0xE8DCC4, seed = 43 }) {
  const N = 512, [c, x] = canvas(N), r = rng(seed), n = noise2(seed, 9);
  const B = new THREE.Color(base), img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = 0.9 + 0.14 * n(i / N, j / N), o = (j * N + i) * 4;
    img.data[o] = B.r * 255 * k; img.data[o + 1] = B.g * 255 * k; img.data[o + 2] = B.b * 255 * k; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const band = (inset, w, col) => { x.strokeStyle = hex(col); x.lineWidth = w; x.strokeRect(inset + w / 2, inset + w / 2, N - 2 * inset - w, N - 2 * inset - w); };
  // field motifs: a lattice of small flowers
  for (let j = 70; j < N - 70; j += 26) for (let i = 70 + (j / 26 % 2) * 13; i < N - 70; i += 26) {
    x.fillStyle = hex(r() < 0.5 ? gold : ivory); x.globalAlpha = 0.55;
    x.beginPath(); for (let p = 0; p < 4; p++) { const a = p * Math.PI / 2; x.ellipse(i + Math.cos(a) * 3.2, j + Math.sin(a) * 3.2, 2.6, 1.5, a, 0, Math.PI * 2); } x.fill();
    x.fillStyle = hex(ink); x.beginPath(); x.arc(i, j, 1.4, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  // medallion
  const M = N / 2;
  const lozenge = (s, col) => { x.fillStyle = hex(col); x.beginPath(); x.moveTo(M, M - s); x.lineTo(M + s * 0.78, M); x.lineTo(M, M + s); x.lineTo(M - s * 0.78, M); x.closePath(); x.fill(); };
  lozenge(96, ink); lozenge(84, gold); lozenge(72, base); lozenge(52, ivory); lozenge(36, ink); lozenge(16, gold);
  for (let p = 0; p < 16; p++) {
    const a = p * Math.PI / 8; x.fillStyle = hex(p % 2 ? gold : ivory);
    x.beginPath(); x.arc(M + Math.cos(a) * 74, M + Math.sin(a) * 74 * 1.2, 4, 0, Math.PI * 2); x.fill();
  }
  // spandrels
  for (const [cx, cy] of [[62, 62], [N - 62, 62], [62, N - 62], [N - 62, N - 62]]) {
    x.fillStyle = hex(ink); x.beginPath(); x.arc(cx + (cx < M ? -14 : 14), cy + (cy < M ? -14 : 14), 38, 0, Math.PI * 2); x.globalAlpha = 0.8; x.fill();
  }
  x.globalAlpha = 1;
  band(4, 20, ink); band(26, 3, gold); band(30, 8, ivory); band(40, 3, gold);
  for (let i = 16; i < N - 16; i += 16) for (const [px, py] of [[i, 14], [i, N - 14], [14, i], [N - 14, i]]) {
    x.fillStyle = hex(r() < 0.5 ? gold : base); x.beginPath(); x.arc(px, py, 3.2, 0, Math.PI * 2); x.fill();
  }
  return finish(c, 1);
}
