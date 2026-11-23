// 1-bit Bayer dithering for profile photos, and the 1200x675 share card of a file.
export const BAYER = (() => {
  const m = new Float32Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const xy = x ^ y;
    const v = ((xy & 1) << 5) | ((y & 1) << 4) | ((xy & 2) << 2) | ((y & 2) << 1) | ((xy & 4) >> 1) | ((y & 4) >> 2);
    m[y * 8 + x] = (v + .5) / 64;
  }
  return m;
})();
export const INK = [233, 229, 219], BG = [9, 9, 10], RED = [255, 43, 30];
export const pad7 = n => String(Math.max(0, n | 0)).padStart(7, '0');
export const avatarSrc = h => '/api/avatar?h=' + encodeURIComponent(h);

const imgCache = new Map();
export function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => {
    const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => { imgCache.delete(src); rej(new Error('image')); }; i.src = src;
  }));
  return imgCache.get(src);
}

// draw an image into canvas c on a gw x gh grid, auto-levelled, then thresholded against the Bayer matrix
export function ditherInto(c, img, { gw = 96, gh = 96, gamma = .92, contrast = 1.18, ink = INK, bg = BG } = {}) {
  c.width = gw; c.height = gh;
  const x = c.getContext('2d', { willReadFrequently: true });
  const s = Math.max(gw / img.width, gh / img.height), w = img.width * s, h = img.height * s;
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.fillStyle = '#777'; x.fillRect(0, 0, gw, gh);
  x.drawImage(img, (gw - w) / 2, (gh - h) / 2, w, h);
  const d = x.getImageData(0, 0, gw, gh), p = d.data, n = gw * gh, L = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const l = .2126 * p[i * 4] + .7152 * p[i * 4 + 1] + .0722 * p[i * 4 + 2]; L[i] = l; hist[l | 0]++; }
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * .02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * .02) { hi = v; break; } }
  const span = Math.max(30, hi - lo);
  for (let y = 0; y < gh; y++) for (let xx = 0; xx < gw; xx++) {
    const i = y * gw + xx;
    let v = (L[i] - lo) / span; v = Math.min(1, Math.max(0, (v - .5) * contrast + .5)); v = Math.pow(v, gamma);
    const col = v > BAYER[(y & 7) * 8 + (xx & 7)] ? ink : bg;
    p[i * 4] = col[0]; p[i * 4 + 1] = col[1]; p[i * 4 + 2] = col[2]; p[i * 4 + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}

// an empty subject: a dithered silhouette, used while a photo loads or when there is none
export function silhouette(c, gw = 96, gh = 96) {
  c.width = gw; c.height = gh;
  const x = c.getContext('2d'), d = x.createImageData(gw, gh), p = d.data;
  for (let y = 0; y < gh; y++) for (let xx = 0; xx < gw; xx++) {
    const u = (xx + .5) / gw - .5, v = (y + .5) / gh;
    const head = ((u / .2) ** 2 + ((v - .4) / .25) ** 2) < 1, body = v > .72 && Math.abs(u) < .42 - (v - .72) * -.4;
    const lum = head ? .55 - (v - .4) * .5 + u * -.4 : body ? .4 - u * .3 : 0;
    const col = lum > BAYER[(y & 7) * 8 + (xx & 7)] ? INK : BG;
    const i = (y * gw + xx) * 4; p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; p[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}

export async function fontsReady() {
  try { await Promise.all(['400 40px Anton', '700 20px JBM', '500 20px JBM', '500 20px Grotesk', '600 20px Grotesk'].map(f => document.fonts.load(f))); } catch {}
}

function wrap(x, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width <= maxW) line = t;
    else { if (line) lines.push(line); line = w; if (lines.length === maxLines) break; }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let l = lines[maxLines - 1];
    while (l && x.measureText(l + '…').width > maxW) l = l.slice(0, -1);
    lines[maxLines - 1] = l.replace(/[\s,.;:]+$/, '') + '…';
  }
  return lines;
}
function fit(x, text, maxW, font, size, min) {
  let s = size; x.font = font.replace('$', s);
  while (s > min && x.measureText(text).width > maxW) { s -= 2; x.font = font.replace('$', s); }
  return s;
}

// the share card: a bone record sheet, 1200x675
export async function drawCard(f, img) {
  await fontsReady();
  const W = 1200, H = 675, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const paper = '#e9e5db', ink = '#0e0e0f', grey = '#5b5850', red = '#ff2b1e';
  x.fillStyle = paper; x.fillRect(0, 0, W, H);
  // header
  x.fillStyle = ink; x.font = '700 22px JBM'; x.textBaseline = 'alphabetic';
  x.fillText('H1DE / FILE', 60, 78);
  const no = pad7(f.no);
  x.font = '700 26px JBM'; const tw = x.measureText(no).width;
  x.fillStyle = red; x.fillRect(W - 60 - tw - 24, 48, tw + 24, 40);
  x.fillStyle = ink; x.fillText(no, W - 60 - tw - 12, 77);
  x.fillRect(60, 104, W - 120, 4);
  // photo window, dithered, with red brackets
  const px = 60, py = 136, pw = 330, ph = 400;
  x.fillStyle = '#09090a'; x.fillRect(px, py, pw, ph);
  if (img && !f.hidden) {
    const tmp = document.createElement('canvas');
    ditherInto(tmp, img, { gw: 110, gh: 134 });
    x.imageSmoothingEnabled = false; x.drawImage(tmp, px, py, pw, 402);
  } else {
    x.fillStyle = '#58544d'; x.font = '400 54px Anton'; x.textAlign = 'center'; x.fillText('HIDDEN', px + pw / 2, py + ph / 2 + 18); x.textAlign = 'left';
  }
  x.fillStyle = red;
  const br = (bx, by, sx, sy) => { x.fillRect(bx, by, 34 * sx, 5 * sy); x.fillRect(bx, by, 5 * sx, 34 * sy); };
  br(px + 16, py + 16, 1, 1); br(px + pw - 16, py + 16, -1, 1); br(px + 16, py + ph - 16, 1, -1); br(px + pw - 16, py + ph - 16, -1, -1);
  // text column
  const tx = 430, tW = W - 60 - tx;
  x.fillStyle = ink;
  if (f.hidden) {
    x.font = '400 72px Anton'; x.fillText('HIDDEN', tx, 210);
    x.font = '500 26px Grotesk'; x.fillStyle = grey; wrap(x, 'This subject hid their file. Every agent that asks gets one word: hidden.', tW, 3).forEach((l, i) => x.fillText(l, tx, 262 + i * 36));
  } else {
    const name = String(f.name || f.handle).toUpperCase();
    const s = fit(x, name, tW, '400 $px Anton', 70, 36); x.fillText(name, tx, 136 + s * .92);
    let y = 136 + s * .92 + 40;
    x.font = '500 24px JBM'; x.fillStyle = grey; x.fillText('@' + f.handle, tx, y); y += 62;
    x.fillStyle = ink; x.font = '700 15px JBM'; x.fillText('CLASSIFICATION', tx, y - 26);
    const cls = String(f.text?.classification || f.cls?.name || '').toUpperCase();
    const cs = fit(x, cls, tW - 110, '400 $px Anton', 50, 30); x.fillText(cls, tx, y + cs * .62);
    const cw = x.measureText(cls).width; x.font = '700 18px JBM';
    const code = f.cls?.code || ''; const kw = x.measureText(code).width;
    x.fillRect(tx + cw + 16, y + cs * .62 - 26, kw + 16, 30); x.fillStyle = paper; x.fillText(code, tx + cw + 24, y + cs * .62 - 5);
    y += cs * .62 + 46;
    x.fillStyle = ink; x.font = '500 25px Grotesk';
    wrap(x, f.text?.summary, tW, 2).forEach(l => { x.fillText(l, tx, y); y += 34; });
    y += 12; x.font = '500 21px Grotesk';
    for (const o of (f.text?.observations || []).slice(0, 2)) {
      const ls = wrap(x, o, tW - 32, 2);
      x.fillStyle = red; x.fillRect(tx, y - 8, 16, 3); x.fillStyle = ink;
      ls.forEach(l => { if (y < 590) x.fillText(l, tx + 32, y); y += 29; }); y += 6;
    }
  }
  // footer
  x.fillStyle = ink; x.fillRect(60, 600, W - 120, 3);
  x.font = '500 17px JBM'; x.fillStyle = grey;
  const day = (f.filed || '').slice(0, 10);
  x.fillText(f.hidden ? 'HIDDEN BY ITS SUBJECT' : `FILED ${day}   RISK ${f.text?.risk || '—'}   SHA-256 ${String(f.hash || '').slice(0, 12)}`, 60, 638);
  x.fillStyle = ink; x.font = '400 38px Anton'; x.textAlign = 'right'; x.fillText('H1DE', W - 60, 642); x.textAlign = 'left';
  // the stamp
  x.save(); x.translate(px + pw - 70, py + 70); x.rotate(-.16);
  x.strokeStyle = red; x.lineWidth = 6; x.font = '400 46px Anton';
  const word = f.hidden ? 'HIDDEN' : 'FILED', sw = x.measureText(word).width;
  x.globalAlpha = .9; x.strokeRect(-sw / 2 - 14, -34, sw + 28, 58); x.fillStyle = red; x.textAlign = 'center'; x.fillText(word, 0, 10);
  x.restore();
  return c;
}
