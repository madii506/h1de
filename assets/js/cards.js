// the six procedure cards each run a small 1-bit animation on a 160x100 canvas, at 12 frames a second
import { BAYER } from './dither.js';
const INK = '#e9e5db', BG = '#0b0b0c', DIM = '#3d3a35', RED = '#ff2b1e', PAPER = '#d9d4c8';

function kit(c) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  const r = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), Math.round(w), Math.round(h)); };
  const dith = (a, b, w, h, fn, col = INK) => {
    x.fillStyle = col;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const X = a + xx, Y = b + y;
      if (fn(xx / w, y / h) > BAYER[(Y & 7) * 8 + (X & 7)]) x.fillRect(X, Y, 1, 1);
    }
  };
  return { x, W, H, r, dith, clear: () => r(0, 0, W, H, BG) };
}
const bust = k => (u, v) => {                                   // a little dithered bust, brightness k
  const head = ((u - .5) / .2) ** 2 + ((v - .33) / .27) ** 2 < 1;
  const body = v > .66 && Math.abs(u - .5) < .16 + (v - .66) * 1.1;
  const neck = v > .55 && v <= .7 && Math.abs(u - .5) < .07;
  return head || body || neck ? k * (.95 - u * .55 - v * .15) : 0;
};
const dot = (k, x, y, col) => k.r(x - 1, y - 1, 3, 3, col);

const ANIM = {
  ghost(k, t) {                                                 // a fresh wallet resolves out of noise
    const { r, dith, clear } = k; clear();
    const ph = (t % 3.2) / 3.2, a = ph < .7 ? ph / .7 : 1;
    dith(48, 8, 64, 84, bust(a), INK);
    for (let i = 0; i < 40 * (1 - a); i++) r((i * 37 + t * 90) % 160, (i * 53 + t * 40) % 100, 1, 1, DIM);
    if (a >= 1) { r(40, 6, 10, 2, RED); r(40, 6, 2, 10, RED); r(110, 6, 10, 2, RED); r(118, 6, 2, 10, RED); }
  },
  route(k, t) {                                                 // you -> deposit -> solver -> ghost, and no line from you to the ghost
    const { r, clear, x } = k; clear();
    const A = [20, 50], D = [62, 50], S = [104, 50], G = [142, 50];
    for (const [px, py] of [A, D, S, G]) r(px - 6, py - 6, 12, 12, DIM);
    r(A[0] - 4, A[1] - 4, 8, 8, INK); r(G[0] - 4, G[1] - 4, 8, 8, INK); r(S[0] - 3, S[1] - 3, 6, 6, RED);
    for (let i = 0; i < 4; i++) {
      const p = ((t * .55 + i / 4) % 1);
      const seg = p < .33 ? [A, D, p / .33] : p < .66 ? [D, S, (p - .33) / .33] : [S, G, (p - .66) / .34];
      dot(k, seg[0][0] + (seg[1][0] - seg[0][0]) * seg[2], 50, i % 2 ? INK : RED);
    }
    x.strokeStyle = RED; x.lineWidth = 1; x.setLineDash([3, 3]);
    x.beginPath(); x.moveTo(20, 30); x.quadraticCurveTo(81, 6, 142, 30); x.stroke(); x.setLineDash([]);
    r(76, 13, 10, 2, RED); r(80, 9, 2, 10, BG);
    x.fillStyle = RED; x.font = '700 9px JBM, monospace'; x.fillText('×', 78, 16);
  },
  move(k, t) {                                                  // a chart, and a buy from the ghost
    const { r, clear } = k; clear();
    let y = 60;
    for (let i = 0; i < 18; i++) {
      const v = Math.sin(i * .9 + Math.floor(t * 2) * .7) * 9 + Math.sin(i * .37) * 6;
      const up = v > 0, h = Math.abs(v) + 4;
      r(10 + i * 8, up ? y - h : y, 5, h, up ? INK : DIM); r(12 + i * 8, (up ? y - h : y) - 4, 1, h + 8, DIM);
      y += up ? -1.2 : 1.2; y = Math.max(30, Math.min(78, y));
    }
    const p = (t % 2) / 2; if (p < .5) { r(118, 84, 34, 11, RED); k.x.fillStyle = BG; k.x.font = '700 8px JBM, monospace'; k.x.fillText('BUY', 127, 92); }
  },
  wait(k, t) {                                                  // a slow pixel clock, and amounts that never match
    const { r, clear, x } = k; clear();
    const cx = 50, cy = 50;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; r(cx + Math.cos(a) * 30 - 1, cy + Math.sin(a) * 30 - 1, 2, 2, DIM); }
    const a = t * .8 - Math.PI / 2;
    for (let s = 0; s < 22; s++) r(cx + Math.cos(a) * s, cy + Math.sin(a) * s, 2, 2, RED);
    for (let s = 0; s < 14; s++) r(cx + Math.cos(a / 12) * s, cy + Math.sin(a / 12) * s, 2, 2, INK);
    const amts = ['0.31', '0.47', '0.22', '0.58'];
    x.font = '700 10px JBM, monospace';
    amts.forEach((m, i) => { x.fillStyle = (Math.floor(t) + i) % 4 === 0 ? RED : INK; x.fillText(m, 100, 26 + i * 17); });
  },
  exit(k, t) {                                                  // out of the ghost, through the solver, to any wallet
    const { r, dith, clear } = k; clear();
    dith(10, 22, 40, 54, bust(.7), INK);
    r(74, 44, 12, 12, RED);
    r(120, 30, 30, 40, DIM); r(124, 34, 22, 32, BG); r(128, 46, 14, 8, INK);
    for (let i = 0; i < 5; i++) { const p = (t * .6 + i / 5) % 1; dot(k, 50 + p * 74, 50 + Math.sin(p * Math.PI * 2 + i) * 3, p < .45 ? INK : RED); }
  },
  burn(k, t) {                                                  // the ghost comes apart and falls away
    const { r, dith, clear } = k; clear();
    const ph = (t % 3.6) / 3.6, a = ph < .2 ? 1 : ph < .75 ? 1 - (ph - .2) / .55 : 0;
    dith(48, 8, 64, 84, bust(a), INK);
    if (ph > .2 && ph < .95) for (let i = 0; i < 60; i++) { const fx = 52 + (i * 29) % 56, fall = ((ph - .2) * 120 + (i * 13) % 40); if (fall < 95) r(fx, 20 + fall, 1, 1, i % 7 ? DIM : RED); }
    if (ph > .78) { k.x.fillStyle = DIM; k.x.font = '700 9px JBM, monospace'; k.x.fillText('NOTHING KEPT', 46, 54); }
  },
};

export function initCards(root) {
  const items = [...root.querySelectorAll('canvas[data-anim]')].map(c => ({ c, k: kit(c), f: ANIM[c.dataset.anim], on: false }));
  const io = new IntersectionObserver(es => es.forEach(e => { const it = items.find(i => i.c === e.target); if (it) it.on = e.isIntersecting; }), { rootMargin: '0px 200px' });
  items.forEach(i => io.observe(i.c));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = 0;
  const tick = now => {
    if (now - last > 83) { last = now; const t = now / 1000; for (const i of items) if (i.on && i.f) i.f(i.k, reduced ? 1.4 : t); }
    if (!reduced) requestAnimationFrame(tick);
  };
  items.forEach(i => i.f && i.f(i.k, 1.4));
  if (!reduced) requestAnimationFrame(tick);
}
