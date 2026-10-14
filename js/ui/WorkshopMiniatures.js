/** Particle thumbnails from the supplied Fireworks design. */
function rng(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function circle(n, r, off, sec) { const a = []; for (let i = 0; i < n; i++) { const t = (off || 0) + i / n * Math.PI * 2; a.push({ x: Math.cos(t) * r, y: Math.sin(t) * r, sec: !!sec }); } return a; }
function heartPts(n) { const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; const x = 16 * Math.pow(Math.sin(t), 3); const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); a.push({ x: x / 17, y: (y + 2) / 17 }); } return a; }
function fib(n, scale) { const a = [], g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const r = Math.sqrt((i + 0.5) / n) * scale, t = i * g; a.push({ x: Math.cos(t) * r, y: Math.sin(t) * r }); } return a; }
const GEN = {
  spherical: () => [].concat(circle(24, 1), circle(18, 0.78, 0.17), circle(12, 0.52, 0.3), circle(6, 0.26, 0.5)),
  burst: () => { const r = rng(7), a = []; for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 2 + (r() - 0.5) * 0.25; [0.38, 0.66, 0.95].forEach((k) => { const m = k * (0.85 + r() * 0.3); a.push({ x: Math.cos(t) * m, y: Math.sin(t) * m }); }); } return a; },
  palm: () => { const a = []; for (let b = 0; b < 7; b++) { const t = (-90 + (b - 3) * 34) * Math.PI / 180; for (let i = 1; i <= 7; i++) { const m = i / 7; a.push({ x: Math.cos(t) * m * 1.05, y: Math.sin(t) * m + 0.55 * m * m }); } } return a; },
  star: () => { const a = [], P = []; for (let i = 0; i < 10; i++) { const t = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 0.45 : 1; P.push([Math.cos(t) * r, Math.sin(t) * r]); } for (let i = 0; i < 10; i++) { const p = P[i], q = P[(i + 1) % 10]; for (let k = 0; k < 4; k++) { const f = k / 4; a.push({ x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f }); } } return a; },
  willow: () => { const a = []; for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; for (let k = 1; k <= 6; k++) { const m = k / 6; a.push({ x: Math.cos(t) * m * 0.9, y: Math.sin(t) * m * 0.72 + 0.6 * m * m - 0.15 }); } } return a; },
  ring: () => circle(32, 1),
  solidsphere: () => fib(70, 1),
  brocade: () => { const a = []; for (let i = 0; i < 22; i++) { const t = i / 22 * Math.PI * 2; [0.55, 0.7, 0.85, 1].forEach((m) => a.push({ x: Math.cos(t) * m, y: Math.sin(t) * m + 0.12 * m * m })); } return a; },
  heart: () => heartPts(36),
  pistil: () => { const r = rng(3), a = []; for (let i = 0; i < 18; i++) { const t = r() * Math.PI * 2, m = Math.sqrt(r()) * 0.3; a.push({ x: Math.cos(t) * m, y: Math.sin(t) * m }); } return a.concat(circle(26, 1)); },
  saturn: () => { const a = fib(30, 0.55), tilt = -0.28; for (let i = 0; i < 32; i++) { const t = i / 32 * Math.PI * 2; const x = Math.cos(t), y = Math.sin(t) * 0.28; a.push({ x: x * Math.cos(tilt) - y * Math.sin(tilt), y: x * Math.sin(tilt) + y * Math.cos(tilt), sec: true }); } return a; },
  brokenHeart: () => heartPts(36).map((p) => { const s = p.x < 0 ? -1 : 1, ang = s * 0.16; const x = p.x * Math.cos(ang) - p.y * Math.sin(ang), y = p.x * Math.sin(ang) + p.y * Math.cos(ang); return { x: x + s * 0.16, y: y + 0.04 }; }),
  spinner: () => { const a = []; for (let arm = 0; arm < 3; arm++) { for (let i = 1; i <= 15; i++) { const m = i / 15, t = arm * 2 * Math.PI / 3 + m * Math.PI * 1.4; a.push({ x: Math.cos(t) * m, y: Math.sin(t) * m }); } } return a; },
  helix: () => { const a = []; for (let i = 0; i < 22; i++) { const f = i / 21, y = 0.95 - 1.9 * f; a.push({ x: Math.sin(f * Math.PI * 4) * 0.42, y: y }); a.push({ x: Math.sin(f * Math.PI * 4 + Math.PI) * 0.42, y: y, sec: true }); } return a; },
  christmasTree: () => { const a = []; const edge = (p, q, n) => { for (let i = 0; i < n; i++) { const f = i / n; a.push({ x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f }); } }; edge([0, -1], [-0.72, 0.62], 12); edge([-0.72, 0.62], [0.72, 0.62], 10); edge([0.72, 0.62], [0, -1], 12); edge([-0.4, 0.05], [0.28, -0.3], 5); edge([-0.55, 0.42], [0.5, 0], 7); const r = rng(11); for (let i = 0; i < 9; i++) { const y = -0.6 + r() * 1.1, w = (y + 1) / 1.62 * 0.62; a.push({ x: (r() * 2 - 1) * w * 0.8, y: y, sec: true }); } a.push({ x: 0, y: 0.74 }, { x: 0, y: 0.86 }); return a; },
  dragonsBreath: () => { const r = rng(5), a = []; for (let i = 0; i < 46; i++) { const f = r(), y = 0.85 - f * 1.85, w = 0.08 + f * 0.5; a.push({ x: (r() * 2 - 1) * w + Math.sin(f * 6) * 0.08, y: y }); } return a; },
  snowflake: () => { const a = []; for (let k = 0; k < 6; k++) { const t = -Math.PI / 2 + k * Math.PI / 3, c = Math.cos(t), s = Math.sin(t); for (let i = 1; i <= 6; i++) { const m = i / 6; a.push({ x: c * m, y: s * m }); } [0.5, 0.78].forEach((m) => { [-1, 1].forEach((side) => { const bt = t + side * 0.6; a.push({ x: c * m + Math.cos(bt) * 0.11, y: s * m + Math.sin(bt) * 0.11 }); a.push({ x: c * m + Math.cos(bt) * 0.22, y: s * m + Math.sin(bt) * 0.22, sec: true }); }); }); } return a; }
};
const PTS = {};
Object.keys(GEN).forEach((k) => { PTS[k] = GEN[k](); });

function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function colorAt(L, t) { if (!L.fade) return L.color; const f = clamp((t - L.fadeStart) / Math.max(L.fadeDur, 0.01), 0, 1); return mix(L.color, L.fadeColor, f); }
function dotStyle(x, y, d, col, op, glow) {
  return 'left:' + (x - d / 2).toFixed(1) + 'px; top:' + (y - d / 2).toFixed(1) + 'px; width:' + d.toFixed(1) + 'px; height:' + d.toFixed(1) + 'px; border-radius:50%; background:' + col + '; opacity:' + op + ';' + (glow ? ' box-shadow:0 0 ' + glow + 'px ' + col + ';' : '');
}
function headStyle(shape, x, y, d, col, ang) {
  let w = d, h = d, extra = '';
  if (shape === 'star') { w = h = d * 1.7; extra = 'background:' + col + '; clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);'; }
  else if (shape === 'ring') { w = h = d * 1.35; extra = 'border-radius:50%; box-sizing:border-box; border:' + Math.max(1.5, d * 0.24).toFixed(1) + 'px solid ' + col + ';'; }
  else if (shape === 'crystalDroplet') { w = h = d * 1.2; extra = 'border-radius:50% 50% 50% 0; background:' + col + '; transform:rotate(' + (ang + 45).toFixed(0) + 'deg); box-shadow:0 0 ' + Math.round(d * 0.6) + 'px ' + col + ';'; }
  else if (shape === 'sliceBurst') { w = d * 2.4; h = Math.max(2, d * 0.38); extra = 'border-radius:2px; background:' + col + '; transform:rotate(' + ang.toFixed(0) + 'deg); box-shadow:0 0 ' + Math.round(d * 0.5) + 'px ' + col + ';'; }
  else { extra = 'border-radius:50%; background:' + col + '; box-shadow:0 0 ' + Math.round(d * 0.9) + 'px ' + col + ';'; }
  return 'left:' + (x - w / 2).toFixed(1) + 'px; top:' + (y - h / 2).toFixed(1) + 'px; width:' + w.toFixed(1) + 'px; height:' + h.toFixed(1) + 'px; ' + extra;
}
function mini(L, w, h, R, d, max, colOverride) {
  const pts = PTS[L.pattern] || PTS.spherical, stride = Math.max(1, Math.ceil(pts.length / max)), out = [];
  for (let i = 0; i < pts.length; i += stride) { const p = pts[i]; const col = colOverride || (p.sec ? L.secondary : L.color); out.push({ s: dotStyle(w / 2 + p.x * R, h / 2 + p.y * R, d, col, 1, colOverride ? 0 : Math.round(d * 1.2)) }); }
  return out;
}

export function miniature(component, width = 50, height = 38, radius = 15, dotSize = 2.6, count = 40) {
    const layer = { ...component, secondary: component.secondaryColor || '#f4f1e6' };
    return mini(layer, width, height, radius, dotSize, count).map(({ s }) => `<span style="${s}"></span>`).join('');
}
export function sparkMiniature(shape, color = '#ddbb4a') {
    return [[14, 19, -30], [30, 12, 0], [46, 18, 30]].map(([x, y, angle]) => `<span style="${headStyle(shape, x, y, 7, color, angle)}"></span>`).join('');
}
