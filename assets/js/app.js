// the h1de desk: your wallet (Wallet Standard), ghost wallets (tweetnacl keys kept in this browser),
// private routes in and out (NEAR Intents 1Click: a one-time deposit address, a solver pays the other side) and ghost swaps (Jupiter)
import { b58enc, b58dec, isAddr, short, b64enc, b64dec, transferMessage, unsignedTx, signedTx, signWire, newGhost, ghostFromSecret, lamports, fmtSol, FEE_LAMPORTS } from './sol.js';
import { silhouette } from './dither.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SOL_MINT = 'So11111111111111111111111111111111111111112', USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const KEY = 'h1de.ghosts', MAINKEY = 'h1de.main';
const mobile = matchMedia('(max-width: 760px)').matches;

let API, SAY, ON_MAIN, ON_MOVE;
let main = null, mainBal = null;
let ghosts = [], sel = null, tab = 'in';
const bal = {}, toks = {}, tokMeta = { [SOL_MINT]: { symbol: 'SOL', decimals: 9 }, [USDC_MINT]: { symbol: 'USDC', decimals: 6 } };
let busy = false;

// ---------- storage: the keys never leave this browser ----------
function load() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(g => g && g.pk && g.sk) : []; } catch { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(ghosts)); } catch {} }
const gname = g => 'Ghost ' + String(g.n).padStart(2, '0');
const G = pk => ghosts.find(g => g.pk === pk);

// ---------- rpc + log ----------
async function rpc(method, params, kind) {
  const r = await API('rpc', { method: 'POST', body: JSON.stringify({ method, params, kind }) });
  if (!r.ok) { const e = new Error(r.error || 'Solana didn’t answer.'); e.rpc = r.rpc; throw e; }
  return r.result;
}
const dlog = () => $('#dlog');
function line(step, text = '', t = '', cls = '') {
  const li = document.createElement('li'); li.innerHTML = '<b></b><span></span><span class="t"></span>';
  setLine(li, step, text, t, cls); dlog().prepend(li);
  while (dlog().children.length > 14) dlog().lastChild.remove();
  return li;
}
function setLine(li, step, text = '', t = '', cls = '') {
  li.className = cls; li.children[0].textContent = step;
  if (text instanceof Node) { li.children[1].textContent = ''; li.children[1].append(text); } else li.children[1].textContent = text;
  li.children[2].textContent = t;
}
const txLink = (sig, label) => { const a = document.createElement('a'); a.href = 'https://solscan.io/tx/' + sig; a.target = '_blank'; a.rel = 'noopener'; a.textContent = label || short(sig); return a; };
const human = e => {
  const m = String(e?.message || e || '');
  if (/reject|denied|cancel/i.test(m)) return 'You cancelled it in the wallet.';
  if (/insufficient|0x1\b|lamports/i.test(m)) return 'Not enough SOL for that amount plus the fee.';
  if (/rent/i.test(m)) return 'The receiving wallet needs at least 0.00089 SOL to exist. Send a bit more.';
  return m.slice(0, 180) || 'Something went wrong.';
};

// ---------- your wallet: Wallet Standard ----------
const wallets = [];
function register(...ws) {
  for (const w of ws) {
    if (!w || wallets.includes(w)) continue;
    if (!(w.chains || []).some(c => String(c).startsWith('solana:'))) continue;
    if (!w.features?.['standard:connect']) continue;
    wallets.push(w);
    try { if (!main && localStorage.getItem(MAINKEY) === w.name) connect(w, true); } catch {}
  }
  paintMain();
}
function listen() {
  try {
    window.addEventListener('wallet-standard:register-wallet', e => { try { e.detail?.({ register }); } catch {} });
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } }));
  } catch {}
}
async function connect(w, silent) {
  try {
    const r = await w.features['standard:connect'].connect(silent ? { silent: true } : undefined);
    const acc = (r?.accounts || w.accounts || [])[0];
    if (!acc) { if (!silent) line('WALLET', 'The wallet shared no account.', '', 'err'); return; }
    main = { w, acc, address: acc.address };
    try { localStorage.setItem(MAINKEY, w.name); } catch {}
    w.features['standard:events']?.on?.('change', ({ accounts }) => {
      if (!accounts) return;
      if (!accounts[0]) { main = null; paintMain(); ON_MAIN?.(null); return; }
      main.acc = accounts[0]; main.address = accounts[0].address; refresh(); ON_MAIN?.(main.address);
    });
    if (!silent) line('WALLET', `${w.name} connected · ${short(main.address)}`);
    ON_MAIN?.(main.address);
    refresh();
  } catch (e) { if (!silent) line('WALLET', human(e), '', 'err'); }
}
async function disconnect() {
  try { await main?.w.features['standard:disconnect']?.disconnect(); } catch {}
  main = null; mainBal = null;
  try { localStorage.removeItem(MAINKEY); } catch {}
  ON_MAIN?.(null); paintMain(); paintPane();
}
function paintMain() {
  const box = $('#mainW'); if (!box) return;
  if (main) {
    box.innerHTML = `<div class="w-row"><span><b>${esc(main.w.name)}</b> · ${esc(short(main.address))}</span><span class="bal">${mainBal == null ? '—' : fmtSol(mainBal) + ' SOL'}</span></div>
      <p class="note-s">Your wallet only ever pays a route's one-time deposit address. It never touches a ghost directly.</p>
      <div class="g-tools" style="border:0;padding:0;margin-top:10px"><button class="lnk" type="button" data-a="disc">Disconnect</button></div>`;
    box.querySelector('[data-a="disc"]').onclick = disconnect;
    return;
  }
  if (!wallets.length) {
    const url = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
    box.innerHTML = mobile
      ? `<div class="w-pick"><a class="btn" href="https://phantom.app/ul/browse/${url}?ref=${ref}">Open in Phantom</a><a class="btn" href="https://solflare.com/ul/v1/browse/${url}?ref=${ref}">Open in Solflare</a></div><p class="note-s">Open this page inside your wallet's browser to connect.</p>`
      : `<p class="note-s" style="margin-top:0">No Solana wallet found in this browser.</p><div class="w-pick" style="margin-top:10px"><a class="btn" href="https://phantom.com/download" target="_blank" rel="noopener">Get Phantom</a><a class="btn" href="https://solflare.com/download" target="_blank" rel="noopener">Get Solflare</a></div>`;
    return;
  }
  box.innerHTML = `<div class="w-pick">${wallets.map((w, i) => `<button class="btn" type="button" data-i="${i}">${w.icon ? `<img src="${esc(w.icon)}" alt="">` : ''}${esc(w.name)}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => connect(wallets[+b.dataset.i]); });
}
async function payFromMain(to, lam) {
  const bh = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const tx = unsignedTx(transferMessage(main.address, to, lam, bh.value.blockhash));
  const sas = main.w.features['solana:signAndSendTransaction'];
  if (sas) {
    const [res] = await sas.signAndSendTransaction({ account: main.acc, chain: 'solana:mainnet', transaction: tx, options: { preflightCommitment: 'confirmed' } });
    return b58enc(res.signature);
  }
  const st = main.w.features['solana:signTransaction'];
  if (!st) throw new Error('This wallet can’t sign Solana transactions.');
  const [res] = await st.signTransaction({ account: main.acc, chain: 'solana:mainnet', transaction: tx });
  return await rpc('sendTransaction', [b64enc(res.signedTransaction), { encoding: 'base64' }]);
}

// ---------- ghosts ----------
async function ghostSend(g, to, lam, kind) {
  const bh = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const msg = transferMessage(g.pk, to, lam, bh.value.blockhash);
  const wire = signedTx(msg, self.nacl.sign.detached(msg, b58dec(g.sk)));
  const sig = await rpc('sendTransaction', [b64enc(wire)], kind);
  return { sig, wire };
}
async function confirmSig(sig, wire, kind) {
  const t0 = Date.now(); let last = Date.now();
  while (Date.now() - t0 < 75000) {
    await sleep(2200);
    const v = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]).catch(() => null);
    const s = v?.value?.[0];
    if (s?.err) throw new Error('The transaction failed on-chain.');
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return true;
    if (wire && Date.now() - last > 6000) { last = Date.now(); rpc('sendTransaction', [b64enc(wire)]).catch(() => {}); }
  }
  throw new Error('Not confirmed yet. It may still land: check Solscan.');
}
function newG() {
  const n = Math.max(0, ...ghosts.map(g => g.n)) + 1, k = newGhost();
  const g = { n, pk: k.pk, sk: k.sk, born: new Date().toISOString() };
  ghosts.push(g); save(); sel = g.pk;
  line('GHOST', `${gname(g)} was born in this browser · ${short(g.pk)}. Back up its key before you fund it.`);
  paintGhosts(); paintPane();
  return g;
}
function paintGhosts() {
  const ol = $('#ghosts'); if (!ol) return;
  if (!ghosts.length) { ol.innerHTML = `<li class="empty-g">No ghosts yet. Make one, then route SOL into it.</li>`; return; }
  ol.innerHTML = '';
  for (const g of ghosts) {
    const li = document.createElement('li'); li.className = g.pk === sel ? 'sel' : '';
    li.innerHTML = `<canvas class="gi" width="30" height="30"></canvas><div class="ga"><b>${gname(g)}</b><span>${esc(short(g.pk))}</span></div><div class="gb">${bal[g.pk] == null ? '—' : fmtSol(bal[g.pk])}</div>
      <div class="gx"><button class="lnk" type="button" data-a="copy">Copy address</button><button class="lnk" type="button" data-a="key">Copy key</button><button class="lnk warn" type="button" data-a="burn">Burn</button></div>`;
    silhouette(li.querySelector('canvas'), 30, 30);
    li.onclick = e => {
      const a = e.target.closest('[data-a]');
      if (!a) { sel = g.pk; paintGhosts(); paintPane(); return; }
      e.stopPropagation();
      if (a.dataset.a === 'copy') copy(g.pk, a);
      if (a.dataset.a === 'key') copy(g.sk, a, 'Key copied. Keep it secret.');
      if (a.dataset.a === 'burn') {
        if (a.dataset.sure !== '1') { a.dataset.sure = '1'; a.textContent = (bal[g.pk] || 0) > 0 ? `It holds ${fmtSol(bal[g.pk])} SOL. Burn anyway?` : 'Sure? The key is gone for good'; return; }
        ghosts = ghosts.filter(x => x !== g); save(); if (sel === g.pk) sel = ghosts[0]?.pk || null;
        line('BURNED', `${gname(g)} is forgotten. This browser no longer has its key.`); paintGhosts(); paintPane();
      }
    };
    ol.append(li);
  }
}
async function copy(text, btn, msg) {
  try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); }
  if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = o; }, 1200); }
  SAY?.(msg || 'Copied');
}
function backup() {
  if (!ghosts.length) { line('BACKUP', 'There are no ghosts to back up yet.'); return; }
  const data = ghosts.map(g => ({ name: gname(g), address: g.pk, secretKey: g.sk, born: g.born }));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `h1de-ghosts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  line('BACKUP', `${ghosts.length} key${ghosts.length > 1 ? 's' : ''} saved to a file. Anyone with that file controls the ghosts.`);
}
function importKey() {
  const v = $('#impIn').value;
  try {
    const k = ghostFromSecret(v);
    if (G(k.pk)) { line('IMPORT', 'That ghost is already here.'); return; }
    const n = Math.max(0, ...ghosts.map(g => g.n)) + 1;
    ghosts.push({ n, pk: k.pk, sk: k.sk, born: new Date().toISOString() }); save(); sel = k.pk;
    $('#impIn').value = ''; $('#impBox').hidden = true;
    line('IMPORT', `Ghost ${String(n).padStart(2, '0')} imported · ${short(k.pk)}`); paintGhosts(); paintPane(); refresh();
  } catch (e) { line('IMPORT', e.message || 'That isn’t a secret key.', '', 'err'); }
}

// ---------- balances ----------
async function refresh() {
  const jobs = ghosts.map(async g => { try { bal[g.pk] = (await rpc('getBalance', [g.pk, { commitment: 'confirmed' }])).value; } catch {} });
  if (main) jobs.push((async () => { try { mainBal = (await rpc('getBalance', [main.address, { commitment: 'confirmed' }])).value; } catch {} })());
  await Promise.all(jobs);
  paintMain(); paintGhosts();
  const g = G(sel); if (g) await loadTokens(g);
  if (tab === 'swap') fillFrom();
}
async function loadTokens(g) {
  const out = [];
  for (const prog of ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']) {
    try {
      const r = await rpc('getTokenAccountsByOwner', [g.pk, { programId: prog }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
      for (const a of r.value || []) { const i = a.account.data.parsed.info; if (+i.tokenAmount.amount > 0) out.push({ mint: i.mint, raw: i.tokenAmount.amount, dec: i.tokenAmount.decimals, ui: i.tokenAmount.uiAmountString }); }
    } catch {}
  }
  toks[g.pk] = out;
  await Promise.all(out.filter(t => !tokMeta[t.mint]).map(t => meta(t.mint)));
}
async function meta(mint) {
  if (tokMeta[mint]) return tokMeta[mint];
  const j = await API('swap', { method: 'POST', body: JSON.stringify({ op: 'token', mint }) });
  if (j.ok) tokMeta[mint] = j.token;
  return tokMeta[mint] || null;
}

// ---------- the panes ----------
const ghostOpts = () => ghosts.map(g => `<option value="${g.pk}"${g.pk === sel ? ' selected' : ''}>${gname(g)} · ${short(g.pk)} · ${bal[g.pk] == null ? '—' : fmtSol(bal[g.pk])} SOL</option>`).join('');
function needGhost(p) {
  if (ghosts.length) return false;
  p.innerHTML = `<p class="how">First make a ghost: a fresh wallet born in this browser, with no history and no link to you.</p><div class="acts"><button class="btn red" type="button" data-a="new">New ghost</button></div>`;
  p.querySelector('[data-a="new"]').onclick = () => newG();
  return true;
}
function paintPane() {
  const p = $('#pane'); if (!p) return;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  if (tab === 'in') return paneIn(p);
  if (tab === 'swap') return paneSwap(p);
  if (tab === 'send') return paneSend(p);
  if (tab === 'out') return paneOut(p);
}

// route in: your wallet -> one-time deposit address ... solver -> ghost
function paneIn(p) {
  if (!main) { p.innerHTML = `<p class="how">Connect your wallet to pay a route. It pays a one-time deposit address; a solver pays your ghost from its own wallet, so nothing on-chain links the two.</p>`; return; }
  if (needGhost(p)) return;
  p.innerHTML = `<p class="how">Your wallet pays a one-time deposit address. A solver pays your ghost from its own wallet, usually in under a minute.</p>
    <div class="fld"><label for="inAmt">Amount</label><div class="in2"><input id="inAmt" inputmode="decimal" placeholder="SOL" autocomplete="off"></div></div>
    <div class="fld"><label for="inG">To ghost</label><select id="inG">${ghostOpts()}<option value="new">+ a new ghost</option></select></div>
    <div class="acts"><button class="btn red" type="button" id="inQ">Get a route</button></div><div id="inQt"></div>`;
  $('#inQ').onclick = async () => {
    if (busy) return;
    const amt = parseFloat($('#inAmt').value);
    if (!(amt >= 0.01)) { line('ROUTE IN', 'Route at least 0.01 SOL.', '', 'err'); return; }
    let to = $('#inG').value; if (to === 'new') to = newG().pk;
    const lam = lamports($('#inAmt').value);
    if (mainBal != null && BigInt(mainBal) < lam + 10000n) { line('ROUTE IN', 'Your wallet doesn’t hold that much SOL plus the fee.', '', 'err'); return; }
    busy = true; const li = line('ROUTE IN', `Asking the solvers for ${amt} SOL → ${gname(G(to))}…`, '', 'wait');
    const j = await API('route', { method: 'POST', body: JSON.stringify({ op: 'quote', from: main.address, to, amount: String(lam) }) });
    busy = false;
    if (!j.ok || !j.quote?.deposit) { setLine(li, 'ROUTE IN', j.error || 'No route right now. Try a different amount.', '', 'err'); return; }
    setLine(li, 'ROUTE IN', `Quote ready · ${gname(G(to))} gets about ${fmtSol(j.quote.amountOut)} SOL`);
    showQuote($('#inQt'), j.quote, 'You pay', 'Ghost gets', async btn => {
      btn.disabled = true; btn.textContent = 'Check your wallet…';
      const pl = line('PAY', 'Approve the payment in your wallet…', '', 'wait');
      try {
        const sig = await payFromMain(j.quote.deposit, BigInt(j.quote.amountIn));
        setLine(pl, 'PAY', txLink(sig, `Paid · ${short(sig)}`));
        await API('route', { method: 'POST', body: JSON.stringify({ op: 'submit', tx: sig, deposit: j.quote.deposit }) });
        await follow(j.quote.deposit, to);
      } catch (e) { setLine(pl, 'PAY', human(e), '', 'err'); }
      btn.disabled = false; btn.textContent = 'Pay from my wallet';
    }, 'Pay from my wallet');
  };
}
function showQuote(box, q, inL, outL, onGo, goLabel) {
  box.innerHTML = `<div class="qt"><div>${inL}<b>${fmtSol(q.amountIn)} SOL</b></div><div>${outL}<b>≈ ${q.out === 'USDC' ? (+q.amountOut / 1e6).toFixed(2) + ' USDC' : fmtSol(q.amountOut) + ' SOL'}</b></div><div>Time<b>~${q.eta || '—'} s</b></div></div>
    <p class="note-s">Deposit address ${esc(short(q.deposit))} · used once · if the route fails the SOL goes back to the payer.</p>
    <div class="acts"><button class="btn red" type="button" data-a="go">${goLabel}</button></div>`;
  box.querySelector('[data-a="go"]').onclick = e => onGo(e.currentTarget);
}
async function follow(deposit, ghostPk) {
  const li = line('ROUTE', 'Waiting for the solver…', '', 'wait'); const t0 = Date.now();
  while (Date.now() - t0 < 12 * 60e3) {
    await sleep(4000);
    const s = await API('route', { method: 'POST', body: JSON.stringify({ op: 'status', deposit }) });
    if (!s.ok) continue;
    const st = s.status;
    if (st === 'SUCCESS') {
      setLine(li, 'H1DDEN', s.payout ? txLink(s.payout, `Done · paid by a solver · ${short(s.payout)}`) : 'Done · paid by a solver, not by you.', `${Math.round((Date.now() - t0) / 1000)} s`);
      await refresh(); ON_MOVE?.(); return true;
    }
    if (st === 'REFUNDED') { setLine(li, 'REFUNDED', 'The route didn’t fill. The SOL went back to the payer.', '', 'err'); await refresh(); return false; }
    if (st === 'FAILED') { setLine(li, 'FAILED', 'The route failed. Funds are refunded to the payer.', '', 'err'); return false; }
    setLine(li, 'ROUTE', { PENDING_DEPOSIT: 'Waiting for your deposit to land…', KNOWN_DEPOSIT_TX: 'Deposit seen. Finding a solver…', PROCESSING: 'A solver is paying out…', INCOMPLETE_DEPOSIT: 'The deposit was smaller than quoted.' }[st] || st, `${Math.round((Date.now() - t0) / 1000)} s`, 'wait');
  }
  setLine(li, 'ROUTE', 'Still running. It will finish on its own; check back in a few minutes.', '', 'err');
  return false;
}

// swap from a ghost: Jupiter builds it, the ghost signs it here
function fillFrom() {
  const s = $('#swFrom'); if (!s) return;
  const g = G(sel), cur = s.value;
  const list = [{ mint: SOL_MINT, label: `SOL · ${bal[sel] == null ? '—' : fmtSol(bal[sel])}` }, ...(toks[sel] || []).map(t => ({ mint: t.mint, label: `${tokMeta[t.mint]?.symbol || short(t.mint)} · ${t.ui}` }))];
  s.innerHTML = list.map(o => `<option value="${o.mint}">${esc(o.label)}</option>`).join('');
  if (list.some(o => o.mint === cur)) s.value = cur;
  if (!g) s.innerHTML = '';
}
function paneSwap(p) {
  if (needGhost(p)) return;
  p.innerHTML = `<p class="how">Buy, sell or swap any coin from a ghost. Jupiter finds the route, and the ghost signs it here.</p>
    <div class="fld"><label for="swG">Ghost</label><select id="swG">${ghostOpts()}</select></div>
    <div class="fld"><label for="swFrom">From</label><select id="swFrom"></select></div>
    <div class="fld"><label for="swTo">To</label><div class="in2"><input id="swTo" placeholder="token address (pump.fun works)" spellcheck="false" autocomplete="off"><button class="btn sm" type="button" id="swSol">SOL</button></div></div>
    <div class="fld"><label for="swAmt">Amount</label><div class="in2"><input id="swAmt" inputmode="decimal" autocomplete="off"><button class="btn sm" type="button" id="swMax">Max</button></div></div>
    <div class="acts"><button class="btn red" type="button" id="swQ">Quote</button></div><div id="swQt"></div>`;
  $('#swG').onchange = async e => { sel = e.target.value; paintGhosts(); await loadTokens(G(sel)); fillFrom(); };
  fillFrom();
  $('#swSol').onclick = () => { $('#swTo').value = SOL_MINT; };
  $('#swMax').onclick = () => {
    const m = $('#swFrom').value;
    if (m === SOL_MINT) $('#swAmt').value = Math.max(0, (bal[sel] || 0) - 3_000_000) / 1e9;
    else { const t = (toks[sel] || []).find(x => x.mint === m); if (t) $('#swAmt').value = t.ui; }
  };
  $('#swQ').onclick = async () => {
    if (busy) return;
    const g = G(sel), inM = $('#swFrom').value, outM = $('#swTo').value.trim();
    if (!isAddr(outM)) { line('SWAP', 'Paste the address of the token you want.', '', 'err'); return; }
    if (inM === outM) { line('SWAP', 'Pick two different tokens.', '', 'err'); return; }
    const inMeta = await meta(inM), outMeta = await meta(outM);
    if (!outMeta) { line('SWAP', 'Jupiter doesn’t know that token yet.', '', 'err'); return; }
    const dec = inMeta?.decimals ?? 9, amt = $('#swAmt').value.trim();
    if (!(parseFloat(amt) > 0)) { line('SWAP', 'Enter an amount.', '', 'err'); return; }
    const [i, f = ''] = amt.split('.'); const raw = (BigInt(i || 0) * 10n ** BigInt(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || 0)).toString();
    busy = true; const li = line('SWAP', `Quoting ${amt} ${inMeta?.symbol || ''} → ${outMeta.symbol}…`, '', 'wait');
    const q = await API('swap', { method: 'POST', body: JSON.stringify({ op: 'quote', inputMint: inM, outputMint: outM, amount: raw, slippageBps: 150 }) });
    busy = false;
    if (!q.ok) { setLine(li, 'SWAP', q.error || 'No route for that swap.', '', 'err'); return; }
    const out = (+q.quote.outAmount / 10 ** outMeta.decimals);
    setLine(li, 'SWAP', `≈ ${out.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${outMeta.symbol} · impact ${(+q.quote.priceImpactPct * 100).toFixed(2)}%`);
    $('#swQt').innerHTML = `<div class="qt"><div>From ${esc(gname(g))}<b>${esc(amt)} ${esc(inMeta?.symbol || '')}</b></div><div>You get<b>≈ ${out.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${esc(outMeta.symbol)}</b></div><div>Slippage<b>1.5%</b></div></div><div class="acts"><button class="btn red" type="button" id="swGo">Swap from ghost</button></div>`;
    $('#swGo').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      const sl = line('SWAP', 'Building and signing in this browser…', '', 'wait');
      try {
        const bt = await API('swap', { method: 'POST', body: JSON.stringify({ op: 'build', quote: q.quote, user: g.pk }) });
        if (!bt.ok) throw new Error(bt.error || 'Jupiter couldn’t build it.');
        const { wire, sig } = signWire(b64dec(bt.tx), b58dec(g.sk));
        await rpc('sendTransaction', [b64enc(wire)], 'swap');
        setLine(sl, 'SWAP', txLink(sig, `Sent · ${short(sig)}`), '', 'wait');
        await confirmSig(sig, wire);
        setLine(sl, 'H1DDEN', txLink(sig, `Swapped from ${gname(g)} · ${short(sig)}`));
        await refresh(); ON_MOVE?.();
      } catch (er) { setLine(sl, 'SWAP', human(er), '', 'err'); }
      b.disabled = false;
    };
  };
}

// send from a ghost (to a wallet that isn't yours)
function paneSend(p) {
  if (needGhost(p)) return;
  p.innerHTML = `<p class="how">Send SOL from a ghost. To move it back to your own wallet, use Route out instead: a straight send links them.</p>
    <div class="fld"><label for="sdG">Ghost</label><select id="sdG">${ghostOpts()}</select></div>
    <div class="fld"><label for="sdTo">To</label><input id="sdTo" placeholder="Solana address" spellcheck="false" autocomplete="off"></div>
    <div class="fld"><label for="sdAmt">Amount</label><div class="in2"><input id="sdAmt" inputmode="decimal" placeholder="SOL" autocomplete="off"><button class="btn sm" type="button" id="sdMax">Max</button></div></div>
    <p class="warnline" id="sdWarn" hidden></p>
    <div class="acts"><button class="btn red" type="button" id="sdGo">Send</button></div>`;
  $('#sdG').onchange = e => { sel = e.target.value; paintGhosts(); };
  $('#sdMax').onclick = () => { $('#sdAmt').value = Math.max(0, (bal[$('#sdG').value] || 0) - FEE_LAMPORTS) / 1e9; };
  let sure = false;
  $('#sdGo').onclick = async e => {
    const g = G($('#sdG').value), to = $('#sdTo').value.trim(), w = $('#sdWarn');
    if (!isAddr(to)) { line('SEND', 'That isn’t a Solana address.', '', 'err'); return; }
    if (to === g.pk) { line('SEND', 'That is the ghost itself.', '', 'err'); return; }
    if (main && to === main.address && !sure) { w.hidden = false; w.textContent = 'This sends straight to your own wallet and links it to the ghost. Press Send again to do it anyway, or use Route out.'; sure = true; return; }
    if (G(to) && !sure) { w.hidden = false; w.textContent = 'Ghost to ghost links both of them. Press Send again to do it anyway.'; sure = true; return; }
    const lam = lamports($('#sdAmt').value || '0');
    if (lam <= 0n) { line('SEND', 'Enter an amount.', '', 'err'); return; }
    if (BigInt(bal[g.pk] || 0) < lam + BigInt(FEE_LAMPORTS)) { line('SEND', 'The ghost doesn’t hold that much plus the fee.', '', 'err'); return; }
    const b = e.currentTarget; b.disabled = true; w.hidden = true; sure = false;
    const li = line('SEND', `Signing in this browser…`, '', 'wait');
    try {
      const { sig, wire } = await ghostSend(g, to, lam, 'send');
      setLine(li, 'SEND', txLink(sig, `Sent · ${short(sig)}`), '', 'wait');
      await confirmSig(sig, wire);
      setLine(li, 'H1DDEN', txLink(sig, `${fmtSol(lam)} SOL from ${gname(g)} to ${short(to)}`));
      await refresh(); ON_MOVE?.();
    } catch (er) { setLine(li, 'SEND', human(er), '', 'err'); }
    b.disabled = false;
  };
}

// route out: ghost -> one-time deposit address ... solver -> any wallet (your own included)
function paneOut(p) {
  if (needGhost(p)) return;
  p.innerHTML = `<p class="how">Move SOL out of a ghost to any wallet, your own included. The ghost pays a deposit address and a solver pays the other side.</p>
    <div class="fld"><label for="otG">Ghost</label><select id="otG">${ghostOpts()}</select></div>
    <div class="fld"><label for="otTo">To</label><div class="in2"><input id="otTo" placeholder="Solana address" spellcheck="false" autocomplete="off">${main ? '<button class="btn sm" type="button" id="otMine">Mine</button>' : ''}</div></div>
    <div class="fld"><label for="otAmt">Amount</label><div class="in2"><input id="otAmt" inputmode="decimal" placeholder="SOL" autocomplete="off"><button class="btn sm" type="button" id="otMax">Max</button></div></div>
    <div class="acts"><button class="btn red" type="button" id="otQ">Get a route</button></div><div id="otQt"></div>`;
  $('#otG').onchange = e => { sel = e.target.value; paintGhosts(); };
  if ($('#otMine')) $('#otMine').onclick = () => { $('#otTo').value = main.address; };
  $('#otMax').onclick = () => { $('#otAmt').value = Math.max(0, (bal[$('#otG').value] || 0) - FEE_LAMPORTS) / 1e9; };
  $('#otQ').onclick = async () => {
    if (busy) return;
    const g = G($('#otG').value), to = $('#otTo').value.trim();
    if (!isAddr(to)) { line('ROUTE OUT', 'That isn’t a Solana address.', '', 'err'); return; }
    const lam = lamports($('#otAmt').value || '0');
    if (lam < 10_000_000n) { line('ROUTE OUT', 'Route at least 0.01 SOL.', '', 'err'); return; }
    if (BigInt(bal[g.pk] || 0) < lam + BigInt(FEE_LAMPORTS)) { line('ROUTE OUT', 'The ghost doesn’t hold that much plus the fee.', '', 'err'); return; }
    busy = true; const li = line('ROUTE OUT', `Asking the solvers for ${fmtSol(lam)} SOL → ${short(to)}…`, '', 'wait');
    const j = await API('route', { method: 'POST', body: JSON.stringify({ op: 'quote', from: g.pk, to, amount: String(lam) }) });
    busy = false;
    if (!j.ok || !j.quote?.deposit) { setLine(li, 'ROUTE OUT', j.error || 'No route right now.', '', 'err'); return; }
    setLine(li, 'ROUTE OUT', `Quote ready · ${short(to)} gets about ${fmtSol(j.quote.amountOut)} SOL`);
    showQuote($('#otQt'), j.quote, 'Ghost pays', 'They get', async btn => {
      btn.disabled = true;
      const pl = line('PAY', `${gname(g)} signs the deposit here…`, '', 'wait');
      try {
        const { sig, wire } = await ghostSend(g, j.quote.deposit, BigInt(j.quote.amountIn), 'route');
        await confirmSig(sig, wire);
        setLine(pl, 'PAY', txLink(sig, `Paid from ${gname(g)} · ${short(sig)}`));
        await API('route', { method: 'POST', body: JSON.stringify({ op: 'submit', tx: sig, deposit: j.quote.deposit }) });
        await follow(j.quote.deposit, g.pk);
      } catch (e) { setLine(pl, 'PAY', human(e), '', 'err'); }
      btn.disabled = false;
    }, 'Pay from ghost');
  };
}

export function initDesk({ api, say, onMain, onMove }) {
  API = api; SAY = say; ON_MAIN = onMain; ON_MOVE = onMove;
  ghosts = load(); sel = ghosts[0]?.pk || null;
  $('#gNew').onclick = () => newG();
  $('#gBackup').onclick = backup;
  $('#gImport').onclick = () => { const b = $('#impBox'); b.hidden = !b.hidden; if (!b.hidden) $('#impIn').focus(); };
  $('#impGo').onclick = importKey;
  document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => { tab = b.dataset.t; paintPane(); }; });
  listen(); paintMain(); paintGhosts(); paintPane();
  if (ghosts.length) refresh();
  setInterval(() => { if (!document.hidden && (main || ghosts.length)) refresh(); }, 25000);
  return { get main() { return main?.address || null; }, connectFirst: () => wallets[0] && connect(wallets[0]) };
}
