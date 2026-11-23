// the exposure file: what anyone watching the chain already knows about a wallet, on a bone record sheet
export const fmt = n => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString('en-US');
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = t => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '—');
const short = a => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '—');

export function renderExposure(f) {
  const el = document.createElement('article');
  el.className = 'dossier full';
  el.setAttribute('aria-label', 'Exposure file');
  if (f.empty) {
    el.innerHTML = `<div class="d-top"><span class="k">H1DE / EXPOSURE FILE</span><span class="d-tab">${esc(short(f.wallet))}</span></div>
      <div class="x-score"><b>0</b><span>/100<br>EXPOSED</span><span class="risk">BLANK</span></div>
      <div class="d-sec"><p class="d-sum">This wallet has never moved. There is nothing to read yet. The first move is the one that starts the file, so make it from a ghost.</p></div>
      <div class="d-foot"><span>READ ${new Date().toISOString().slice(0, 10)}</span><span>NOTHING STORED</span></div><div class="stamp">BLANK</div>`;
    requestAnimationFrame(() => el.querySelector('.stamp').classList.add('on'));
    return el;
  }
  const r = f.read || {}, t = f.text || {}, h = f.hours || [], pk = f.peak || { from: 0 };
  const max = Math.max(1, ...h);
  const inPeak = i => ((i - pk.from + 24) % 24) < 4;
  el.innerHTML = `
    <div class="d-top"><span class="k">H1DE / EXPOSURE FILE</span><span class="d-tab">${esc(short(f.wallet))}</span></div>
    <div class="x-score"><b data-n="${f.score}">0</b><span>/100<br>EXPOSED</span><span class="risk">${esc(t.risk || '')}</span></div>
    <div class="x-meter"><i class="${f.score >= 55 ? 'hot' : ''}" data-w="${f.score}"></i></div>
    <dl class="d-rows">
      <dt>FIRST SEEN</dt><dd>${r.capped ? 'before ' + day(r.first) : day(r.first)}</dd>
      <dt>TRANSACTIONS</dt><dd>${r.capped ? '3,000+' : fmt(r.txs)}</dd>
      <dt>BALANCE</dt><dd>${r.sol == null ? '—' : (+r.sol).toFixed(r.sol < 1 ? 4 : 2) + ' SOL'}</dd>
      <dt>TOKENS HELD</dt><dd>${fmt(r.tokens)}</dd>
      <dt>FUNDED BY</dt><dd>${f.funder ? esc(f.funder) + ' · ' + day(f.fundedAt) : r.capped ? 'too far back to read' : '—'}</dd>
    </dl>
    <div class="d-sec"><h4>ACTIVE HOURS · UTC</h4><div class="hrs">${h.map((v, i) => `<i class="${inPeak(i) ? 'pk' : ''}" style="height:${Math.max(2, Math.round(v / max * 100))}%"></i>`).join('')}</div><div class="hrs-l"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div>
    ${(f.apps || []).length ? `<div class="d-sec"><h4>APPS IN THE LAST 25 MOVES</h4><div class="chips">${f.apps.map(a => `<span>${esc(a.name)}<b>${a.n}</b></span>`).join('')}</div></div>` : ''}
    ${(f.cps || []).length ? `<div class="d-sec"><h4>KEEPS MOVING SOL WITH</h4><div class="chips">${f.cps.map(c => `<span>${esc(c.a)}<b>×${c.n}</b></span>`).join('')}</div></div>` : ''}
    <div class="d-sec"><h4>CLASSIFICATION</h4><div class="d-cls">${esc(t.classification)}</div><p class="d-sum">${esc(t.summary)}</p></div>
    <div class="d-sec"><h4>WHAT THEY KNOW</h4><ul class="d-obs">${(t.observations || []).map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>
    <div class="d-sec"><h4>NEXT</h4><p class="d-pred">${esc(t.prediction)}</p>${t.note ? `<p class="d-note">${esc(t.note)}</p>` : ''}</div>
    <div class="d-foot"><span>READ ${esc((f.at || '').slice(0, 10))}</span><span>WRITER ${esc(f.writer === 'clerk' ? 'clerk (rules)' : f.writer || '—')}</span><span>NOTHING STORED</span></div>
    <div class="stamp">WATCHED</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const m = el.querySelector('.x-meter i'); if (m) m.style.width = m.dataset.w + '%';
    el.querySelector('.stamp')?.classList.add('on');
    const b = el.querySelector('.x-score b[data-n]'), to = +b.dataset.n, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 900); b.textContent = Math.round(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }));
  return el;
}
