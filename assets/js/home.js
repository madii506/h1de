// H1DE home: the gate, the scroll story through the watched hall, the exposure scan, the desk, the archive and the agent console
import { createWorld, CAMS } from './world.js';
import { renderExposure, fmt } from './dossier.js';
import { initCards } from './cards.js';
import { initDesk } from './app.js';
import { BAYER } from './dither.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const say = m => { $('#live').textContent = m; };
const pad7 = n => String(Math.max(0, n | 0)).padStart(7, '0');
const ms = v => (v == null ? '' : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms');
const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');

// ---------- the world ----------
let world = null;
try { world = createWorld($('#world'), { mobile, reduced }); }
catch (e) { document.documentElement.classList.add('noworld'); console.warn('world off:', e.message); }
window.__h1de = { world, enter: to => enter(to) };

// ---------- api ----------
async function api(path, opt = {}) {
  try {
    const r = await fetch('/api/' + path, { cache: 'no-store', ...opt, headers: { 'content-type': 'application/json', ...(opt.headers || {}) } });
    return await r.json();
  } catch { return { ok: false, error: 'H1DE can’t be reached right now.' }; }
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch {}
  if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = o; }, 1300); }
  say('Copied');
}

// ---------- live counts ----------
let STATS = null;
const counted = new WeakSet();
function countUp(el, to, f = fmt) {
  if (to == null) { el.textContent = '—'; return; }
  const live = el.closest('.vis-count');
  if (reduced || counted.has(el) || !live) { el.textContent = f(to); if (live) counted.add(el); return; }
  counted.add(el);
  const t0 = performance.now(), D = 1100;
  const step = now => { const k = Math.min(1, (now - t0) / D); el.textContent = f(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
async function loadStats() {
  const j = await api('stats');
  STATS = j && j.ok && j.db ? j : null;
  const s = STATS;
  $('#gCount').textContent = s ? pad7(s.moves) : '—';
  countUp($('#mMoves'), s ? s.moves : null);
  countUp($('#mRouted'), s ? s.routed : null, v => (v >= 100 ? fmt(v) : (+v).toFixed(v >= 10 ? 1 : 2)));
  countUp($('#mSwaps'), s ? s.swaps : null);
  countUp($('#mScans'), s ? s.scans : null);
  if (world && s) world.setCovered(s.moves);
  const ca = j && j.config && j.config.ca, box = $('#ca');
  if (ca) {
    box.hidden = false;
    box.innerHTML = `<code>CA ${esc(ca)}</code><button class="btn sm" type="button" id="caCopy">Copy</button><a class="btn sm red" href="https://pump.fun/coin/${encodeURIComponent(ca)}" target="_blank" rel="noopener">Buy</a><a class="btn sm" href="https://dexscreener.com/solana/${encodeURIComponent(ca)}" target="_blank" rel="noopener">Chart</a>${j.config.x ? `<a class="btn sm" href="${esc(j.config.x)}" target="_blank" rel="noopener">X</a>` : ''}`;
    $('#caCopy').onclick = e => copy(ca, e.currentTarget);
  } else box.hidden = true;
  return STATS;
}

// ---------- gate ----------
let entered = false;
const SECTIONS = new Set($$('main > section').map(s => s.id));
function enter(to, instant) {
  if (!entered) {
    entered = true;
    document.body.classList.add('in'); document.body.classList.remove('gated');
    if (world) world.mode = 'site';
    layout(); onScroll();
  }
  if (to) setTimeout(() => jump(to, instant), instant ? 0 : 380);
}
function jump(id, instant) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: instant || reduced ? 'auto' : 'smooth', block: 'start' }); }
$('#gEnter').onclick = () => enter('notice');
$('#gGo').onclick = () => enter('desk');
addEventListener('wheel', e => { if (!entered && e.deltaY > 4) enter(); }, { passive: true });
let ty0 = null;
addEventListener('touchstart', e => { ty0 = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', e => { if (!entered && ty0 != null && ty0 - e.touches[0].clientY > 40) enter(); }, { passive: true });
addEventListener('keydown', e => { if (!entered && ['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); enter('notice'); } });
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const id = a.getAttribute('href').slice(1); if (!SECTIONS.has(id)) return;
  e.preventDefault(); enter(); jump(id); history.replaceState(null, '', '#' + id);
});

// ---------- scroll engine ----------
const secs = $$('main > section');
let vh = innerHeight, tl = [];
function layout() {
  vh = innerHeight;
  for (const s of secs) { s._top = s.getBoundingClientRect().top + scrollY; s._h = s.offsetHeight; }
  tl = [];
  for (const s of secs) {
    const a = CAMS[s.dataset.cam], b = s.dataset.cam2 ? CAMS[s.dataset.cam2] : a;
    if (!a) continue;
    if (s.classList.contains('pin')) { tl.push({ y: s._top, cam: a }); tl.push({ y: s._top + s._h - vh, cam: b }); }
    else { tl.push({ y: s._top - vh * .5, cam: a }); tl.push({ y: s._top + s._h - vh * .6, cam: b }); }
  }
  tl.sort((p, q) => p.y - q.y);
  procMeasure();
}
function camAt(y) {
  if (!tl.length) return CAMS.notice;
  if (y <= tl[0].y) return tl[0].cam;
  for (let i = 0; i < tl.length - 1; i++) {
    const A = tl[i], B = tl[i + 1];
    if (y <= B.y) { const k = clamp((y - A.y) / Math.max(1, B.y - A.y), 0, 1); return world.mix(A.cam, B.cam, k * k * (3 - 2 * k)); }
  }
  return tl[tl.length - 1].cam;
}
const prog = s => clamp((scrollY - s._top) / Math.max(1, s._h - vh), 0, 1);
const inView = (s, a = 0) => { const r = s.getBoundingClientRect(); return r.top < innerHeight * (1 - a) && r.bottom > 0; };
const navA = $$('#nav .links a'), railA = $$('#rail a');
let active = '';
function setActive(id) { if (id === active) return; active = id; for (const a of [...navA, ...railA]) a.classList.toggle('on', a.getAttribute('href') === '#' + id); }
let ticking = false;
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
addEventListener('resize', () => { layout(); onScroll(); });
function onScroll() {
  if (!entered) return;
  const y = scrollY;
  if (world) world.go(camAt(y));
  let act = secs[0];
  for (const s of secs) if (s._top <= y + vh * .45) act = s;
  setActive(act.id);
  noticeUpd(prog($('#notice')));
  traceUpd(prog($('#trace')), $('#trace'));
  procUpd(prog($('#procedure')));
  nextUpd($('#next'));
}

// 00 notice: redaction bars wipe off one word at a time
const red = $('#redact');
red.innerHTML = red.textContent.trim().split(/\s+/).map(w => `<span class="w${/^\*/.test(w) ? ' r' : ''}">${esc(w.replace(/\*/g, ''))}</span>`).join(' ');
const words = $$('.w', red);
function noticeUpd(p) { const k = Math.floor(clamp((p - .04) / .82, 0, 1) * (words.length + .999)); words.forEach((w, i) => w.classList.toggle('on', i < k)); }

// 01 trace: the links draw one by one, then the subject dissolves
const steps = $$('#steps li');
let lockTarget = null, lockLabel = ['', ''];
function traceUpd(p, s) {
  const seen = inView(s);
  const v = clamp((p - .08) / .6, 0, 1) * 4;
  const k = Math.floor(clamp((p - .04) / .7, 0, 1) * 4.999);
  steps.forEach((li, i) => li.classList.toggle('on', (i < 4 && i <= k && p > .04) || (i === 4 && p > .8)));
  if (world) { world.setTrace(p > .8 ? Math.max(0, 4 - (p - .8) / .08 * 4) : v); world.setVanish(clamp((p - .8) / .14, 0, 1)); }
  if (seen && world) { lockTarget = world.specimen; lockLabel = p > .86 ? ['—', 'not found'] : ['WATCHED', ['', 'funded by one account', 'same hours', 'same wallets', 'one person'][Math.min(4, Math.ceil(v))]]; }
  else if (lockTarget === world?.specimen) lockTarget = null;
}

// 02 procedure: the cards ride a horizontal track
const track = $('#track'), cards = $$('.card', track), hsbar = $('#hsbar'), hsNo = $('#hsNo');
let maxX = 0;
function procMeasure() {
  const st = track.parentElement, cs = getComputedStyle(st);
  maxX = Math.max(0, track.scrollWidth - (st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
}
function procUpd(p) {
  const e = clamp((p - .03) / .94, 0, 1);
  track.style.transform = `translate3d(${(-e * maxX).toFixed(1)}px,0,0)`;
  hsbar.style.width = (e * 100).toFixed(2) + '%';
  hsNo.textContent = String(Math.min(6, Math.round(e * 5) + 1)).padStart(2, '0');
  const cx = innerWidth / 2;
  for (const c of cards) { const r = c.getBoundingClientRect(), d = (r.left + r.width / 2 - cx) / innerWidth; c.style.transform = reduced ? '' : `rotate(${clamp(d * 5, -4, 4).toFixed(2)}deg) translateY(${(Math.abs(d) * 26).toFixed(1)}px)`; }
}
initCards(track);

// finale: the brackets close on the plinth and find nothing
function nextUpd(s) {
  if (inView(s, .4) && world) { lockTarget = 'end'; lockLabel = ['—', 'not found']; }
  else if (lockTarget === 'end') lockTarget = null;
}

// ---------- reticle: point at a head and see what it is ----------
const ret = $('#reticle'), lock = $('#lock');
let ptr = null, pickIdx = -1, frame = 0;
if (fine) addEventListener('pointermove', e => { ptr = { x: e.clientX, y: e.clientY }; if (world) world.pointer((e.clientX / innerWidth - .5) * 2, -(e.clientY / innerHeight - .5) * 2); }, { passive: true });
function place(el, pr, label) {
  if (!pr || pr.h < 8 || pr.x < -50 || pr.x > innerWidth + 50 || pr.y < -50 || pr.y > innerHeight + 50) { el.classList.remove('on'); return; }
  const w = Math.max(28, pr.w), h = Math.max(34, pr.h);
  el.style.width = w + 'px'; el.style.height = h + 'px';
  el.style.transform = `translate3d(${(pr.x - w / 2).toFixed(1)}px,${(pr.y - h / 2).toFixed(1)}px,0)`;
  const b = el.querySelector('b'), em = el.querySelector('em');
  if (b.textContent !== label[0]) b.textContent = label[0];
  if (em.textContent !== label[1]) em.textContent = label[1];
  el.classList.add('on');
}
const reticleOn = () => fine && ptr && (!entered || active === 'notice' || active === 'next');
const LABEL = { watched: ['WATCHED', 'every move on record'], h1dden: ['H1DDEN', 'a move someone h1d'], you: ['YOU', 'watched'] };
if (world) world.onFrame(w => {
  frame++;
  if (lockTarget != null) place(lock, w.project(lockTarget), lockLabel); else lock.classList.remove('on');
  if (reticleOn()) {
    if (frame % 3 === 0) pickIdx = w.pick(ptr.x, ptr.y);
    if (pickIdx >= 0 && pickIdx !== lockTarget) place(ret, w.project(pickIdx), LABEL[w.stateAt(pickIdx)] || ['', '']); else ret.classList.remove('on');
  } else { ret.classList.remove('on'); pickIdx = -1; }
});

// ---------- 03 scan: the exposure file ----------
const sForm = $('#sForm'), sIn = $('#sIn'), sGo = $('#sGo'), sMine = $('#sMine'), slog = $('#slog'), sout = $('#sout');
function line(log, step, text = '', t = '', cls = '') { const li = document.createElement('li'); li.innerHTML = '<b></b><span></span><span class="t"></span>'; setLine(li, step, text, t, cls); log.append(li); return li; }
function setLine(li, step, text = '', t = '', cls = '') { li.className = cls; li.children[0].textContent = step; li.children[1].textContent = text; li.children[2].textContent = t; }
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const hh = h => String(h % 24).padStart(2, '0') + ':00';
let scanning = false;
sForm.addEventListener('submit', e => { e.preventDefault(); runScan(sIn.value.trim()); });
sMine.addEventListener('click', () => { if (desk.main) { sIn.value = desk.main; runScan(desk.main); } });
async function runScan(w) {
  if (scanning) return;
  slog.innerHTML = ''; sout.innerHTML = '';
  if (!isAddr(w)) { line(slog, 'STOPPED', 'That isn’t a Solana address.', '', 'err'); return; }
  scanning = true; sGo.disabled = true;
  let cur = line(slog, 'READ', w.slice(0, 4) + '…' + w.slice(-4), '', 'wait'), done = false;
  const next = n => { cur = line(slog, n, '', '', 'wait'); };
  const on = ev => {
    if (ev.step === 'read') { setLine(cur, 'READ', `${ev.capped ? '3,000+' : fmt(ev.txs)} transactions${ev.first ? ' since ' + new Date(ev.first * 1000).toISOString().slice(0, 10) : ''} · ${ev.tokens ?? '—'} tokens`, ms(ev.ms)); next('FUNDING'); }
    else if (ev.step === 'funding') { setLine(cur, 'FUNDING', ev.funder ? `First SOL came from ${ev.funder.slice(0, 4)}…${ev.funder.slice(-4)}` : ev.capped ? 'The first deposit is further back than 3,000 moves.' : 'No clear funder in the first transaction.'); next('HABITS'); }
    else if (ev.step === 'habits') { setLine(cur, 'HABITS', `${Math.round(ev.peak.share * 100)}% of moves between ${hh(ev.peak.from)} and ${hh(ev.peak.from + 4)} UTC · busiest on ${DAYS[ev.busiest]}`); next('LINKS'); }
    else if (ev.step === 'links') { setLine(cur, 'LINKS', [ev.apps.map(a => a.name).slice(0, 3).join(', '), ev.cps.length ? `${ev.cps.length} wallet${ev.cps.length > 1 ? 's' : ''} it keeps paying` : ''].filter(Boolean).join(' · ') || 'Nothing repeats in the last 25 moves.'); next('SCORE'); }
    else if (ev.step === 'score') { setLine(cur, 'SCORE', `${ev.score} / 100 exposed`); next('WRITE'); }
    else if (ev.step === 'write') { setLine(cur, 'WRITE', ev.writer === 'clerk' ? 'clerk (rules)' : ev.writer, ms(ev.ms)); next('FILE'); }
    else if (ev.step === 'file') { setLine(cur, 'FILE', 'Written. Nothing about this wallet was stored.'); show(ev.file); done = true; }
    else if (ev.step === 'error') { setLine(cur, 'STOPPED', ev.error || 'Something went wrong.', '', 'err'); done = true; }
  };
  try {
    const r = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: w }) });
    if (!(r.headers.get('content-type') || '').includes('ndjson') || !r.body) { const j = await r.json().catch(() => ({})); on({ step: 'error', error: j.error || `The watcher answered ${r.status}.` }); }
    else {
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done: end } = await rd.read(); if (end) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) try { on(JSON.parse(l)); } catch {} } }
      if (buf.trim()) try { on(JSON.parse(buf)); } catch {}
    }
  } catch { on({ step: 'error', error: 'The watcher can’t be reached. Try again.' }); }
  if (!done) setLine(cur, 'STOPPED', 'The watcher stopped before it finished. Try again.', '', 'err');
  scanning = false; sGo.disabled = false; loadStats();
}
function show(f) {
  sout.innerHTML = '';
  const d = renderExposure(f);
  const side = document.createElement('div'); side.className = 'side';
  side.innerHTML = `<a class="btn red" href="#desk">H1de my next move</a>${f.empty ? '' : `<button class="btn" type="button" data-a="card">Download card</button><a class="btn" data-a="x" target="_blank" rel="noopener">Post my score</a>`}
    <p>This file was written from public data in a few seconds. Anyone can write it. H1DE kept none of it.</p>`;
  if (!f.empty) {
    const text = `My wallet is ${f.score}/100 exposed. Classified: ${String(f.text?.classification || '').toUpperCase()}.\n\nEvery move you make on-chain is watched. We h1de it.`;
    $('[data-a="x"]', side).href = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(location.origin);
    $('[data-a="card"]', side).onclick = async e => { const b = e.currentTarget; b.disabled = true; try { const c = await card(f); c.toBlob(bl => { const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = `h1de-exposure-${f.score}.png`; document.body.append(a); a.click(); a.remove(); }); b.textContent = 'Downloaded'; } catch { b.textContent = 'Try again'; } setTimeout(() => { b.disabled = false; b.textContent = 'Download card'; }, 1600); };
  }
  sout.append(d, side);
  const r = d.getBoundingClientRect(); if (r.top > innerHeight * .8) d.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
// the share card: score, class, what they know. No address on it.
async function card(f) {
  try { await Promise.all(['400 40px Anton', '700 20px JBM', '500 20px Grotesk'].map(x => document.fonts.load(x))); } catch {}
  const W = 1200, H = 675, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#09090a'; x.fillRect(0, 0, W, H);
  const g = x.createImageData(420, 420), p = g.data;
  for (let yy = 0; yy < 420; yy++) for (let xx = 0; xx < 420; xx++) { const d = Math.hypot(xx - 210, yy - 210) / 210, v = Math.max(0, .5 - d * .5) * (f.score / 100); const on = v > BAYER[((yy >> 1) & 7) * 8 + ((xx >> 1) & 7)]; const i = (yy * 420 + xx) * 4; p[i] = on ? 150 : 9; p[i + 1] = on ? 26 : 9; p[i + 2] = on ? 18 : 10; p[i + 3] = 255; }
  x.putImageData(g, 40, 140);
  x.fillStyle = '#e9e5db'; x.font = '700 22px JBM'; x.fillText('H1DE / EXPOSURE FILE', 60, 78);
  x.fillStyle = '#ff2b1e'; x.fillRect(60, 104, W - 120, 4);
  x.fillStyle = '#e9e5db'; x.font = '400 300px Anton'; x.textAlign = 'center'; x.fillText(String(f.score), 250, 470); x.textAlign = 'left';
  x.font = '700 20px JBM'; x.fillStyle = '#8a857b'; x.fillText('/100 EXPOSED', 170, 530);
  const tx = 500, tw = W - 60 - tx;
  x.fillStyle = '#8a857b'; x.font = '700 16px JBM'; x.fillText('CLASSIFICATION', tx, 190);
  x.fillStyle = '#e9e5db'; let fs = 64; const cls = String(f.text?.classification || '').toUpperCase(); x.font = `400 ${fs}px Anton`; while (x.measureText(cls).width > tw && fs > 32) { fs -= 2; x.font = `400 ${fs}px Anton`; } x.fillText(cls, tx, 190 + fs);
  let y = 190 + fs + 60; x.font = '500 24px Grotesk';
  for (const o of (f.text?.observations || []).slice(0, 3)) {
    const ws = String(o).split(' '); let l = ''; const ls = [];
    for (const w of ws) { const t = l ? l + ' ' + w : w; if (x.measureText(t).width > tw - 30) { ls.push(l); l = w; } else l = t; } if (l) ls.push(l);
    x.fillStyle = '#ff2b1e'; x.fillRect(tx, y - 9, 16, 3); x.fillStyle = '#d6d1c6';
    for (const s of ls.slice(0, 2)) { if (y < 580) x.fillText(s, tx + 30, y); y += 32; } y += 10;
  }
  x.fillStyle = '#e9e5db'; x.fillRect(60, 600, W - 120, 2);
  x.font = '500 18px JBM'; x.fillStyle = '#8a857b'; x.fillText('EVERY MOVE YOU MAKE ON-CHAIN IS WATCHED. WE H1DE IT.', 60, 640);
  x.fillStyle = '#e9e5db'; x.font = '400 40px Anton'; x.textAlign = 'right'; x.fillText('H1DE', W - 60, 644);
  return c;
}

// ---------- 04 the desk ----------
const desk = initDesk({ api, say, onMain: addr => { sMine.hidden = !addr; }, onMove: () => loadStats() });

// ---------- 06 agents: a real MCP call from the page ----------
const cOut = $('#cOut');
const hl = obj => esc(JSON.stringify(obj, null, 2)).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g,
  (m, str, colon, lit, num) => str ? (colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`) : `<span class="n">${lit || num}</span>`);
async function mcpCall(name, args) {
  cOut.innerHTML = `<span class="k">POST /api/mcp · tools/call ${esc(name)} …</span>`;
  const t0 = performance.now();
  try {
    const r = await fetch('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    const j = await r.json(); let out = j;
    try { out = JSON.parse(j.result.content[0].text); } catch {}
    cOut.innerHTML = `<span class="k">${r.status} · ${Math.round(performance.now() - t0)} ms · ${esc(name)}</span>\n` + hl(out);
  } catch { cOut.innerHTML = '<span class="n">The endpoint can’t be reached right now.</span>'; }
}
$('#cForm').addEventListener('submit', e => { e.preventDefault(); const w = $('#cIn').value.trim(); if (isAddr(w)) mcpCall('scan_wallet', { wallet: w }); else mcpCall('h1de_stats', {}); });
const cfg = JSON.stringify({ mcpServers: { h1de: { type: 'http', url: location.origin + '/api/mcp' } } }, null, 2);
$('#mcpCfg').textContent = cfg;
$('#mcpCopy').onclick = e => copy(cfg, e.currentTarget);
const agIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { agIO.disconnect(); mcpCall('h1de_stats', {}); } }, { threshold: .2 });
agIO.observe($('#agents .con'));

// ---------- reveal + count-up ----------
for (const b of $$('.band')) [...b.children].forEach((el, i) => { el.classList.add('rv'); el.style.transitionDelay = (i * 70) + 'ms'; });
const rvIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); rvIO.unobserve(e.target); } }), { threshold: .12 });
$$('.rv').forEach(el => rvIO.observe(el));
const cIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { cIO.disconnect(); $('#archive').classList.add('vis-count'); loadStats(); } }, { threshold: .25 });
cIO.observe($('#archive .meters'));

// ---------- start ----------
layout();
new ResizeObserver(() => { layout(); onScroll(); }).observe($('#site'));
loadStats();
setInterval(() => { if (!document.hidden) loadStats(); }, 30000);
const startHash = location.hash.slice(1), qp = new URLSearchParams(location.search);
if (qp.get('w') && isAddr(qp.get('w'))) sIn.value = qp.get('w');
if (startHash && SECTIONS.has(startHash)) { enter(); requestAnimationFrame(() => { layout(); jump(startHash, true); }); }
addEventListener('load', () => { layout(); onScroll(); });
