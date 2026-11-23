// Solana reads for H1DE: RPC with fallbacks, and the exposure scan (what anyone can learn from a wallet's public trail)
export async function fetchT(url, opt = {}, ms = 8000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ac.signal }); } finally { clearTimeout(t); }
}
export const isAddr = s => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
export const short = a => (a ? a.slice(0, 4) + '…' + a.slice(-4) : null);
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', TOKEN22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

function own(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//.test(v)) return v;
  if (/^[0-9a-f-]{30,}$/i.test(v)) return 'https://mainnet.helius-rpc.com/?api-key=' + v;   // a bare Helius key
  return 'https://' + v;
}
export const RPCS = () => [own(process.env.RPC_URL), 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean);

async function call(url, method, params, ms = 9000) {
  const r = await fetchT(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, ms);
  if (!r.ok) throw new Error('rpc ' + r.status);
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message || 'rpc error'); e.rpc = j.error; throw e; }
  return j.result;
}
export async function rpc(method, params = []) {
  let last;
  for (const url of RPCS()) {
    try { return await call(url, method, params); }
    catch (e) { last = e; if (e.rpc) throw e; }            // a real RPC answer (bad params, failed simulation) is final
  }
  throw last || new Error('Solana did not answer');
}
// a signed transaction goes to every RPC at once; the first signature back wins
export async function broadcast(b64) {
  const tries = RPCS().map(u => call(u, 'sendTransaction', [b64, { encoding: 'base64', skipPreflight: true, maxRetries: 5 }], 8000));
  try { return await Promise.any(tries); }
  catch (agg) { const e = (agg.errors || []).find(x => x.rpc) || agg.errors?.[0] || agg; throw e; }
}

const APPS = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter', JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: 'Jupiter', jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu: 'Jupiter limit',
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun', pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: 'PumpSwap',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium', CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium', CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: 'Raydium', LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj: 'LaunchLab',
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: 'Meteora', cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: 'Meteora', dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN: 'Meteora DBC', Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: 'Meteora',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca', MagicEden2ZqNtZf1mM2Ah9Cy4x3n3TQBWiJ8KRDdCRiN: 'Magic Eden', M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K: 'Magic Eden', TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN: 'Tensor',
  PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY: 'Phoenix', dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH: 'Drift', MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD: 'Marinade',
  SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy: 'Stake pool', Stake11111111111111111111111111111111111111: 'Staking', namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX: 'SNS names',
  BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY: 'Compressed NFTs', metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: 'NFT metadata',
};
const QUIET = new Set(['11111111111111111111111111111111', 'ComputeBudget111111111111111111111111111111', TOKEN, TOKEN22, 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo']);

async function mapLimit(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } }));
  return out;
}
const keyOf = k => (typeof k === 'string' ? k : k?.pubkey);

// the wallet that put the first SOL in: the account whose balance fell the most in the wallet's oldest transaction
function funderOf(tx, addr) {
  if (!tx?.meta) return null;
  const keys = (tx.transaction?.message?.accountKeys || []).map(keyOf);
  const i = keys.indexOf(addr); if (i < 0) return null;
  const d = keys.map((k, j) => (tx.meta.postBalances[j] ?? 0) - (tx.meta.preBalances[j] ?? 0));
  if (d[i] <= 0) return null;
  let best = null, bd = 0;
  keys.forEach((k, j) => { if (k !== addr && d[j] < bd) { bd = d[j]; best = k; } });
  return best;
}

export async function scan(addr, emit) {
  const t0 = Date.now();
  // READ: every signature we can see, up to three pages
  const sigs = []; let before;
  for (let page = 0; page < 3; page++) {
    const r = await rpc('getSignaturesForAddress', [addr, { limit: 1000, ...(before ? { before } : {}) }]);
    sigs.push(...r); if (r.length < 1000) break; before = r[r.length - 1].signature;
  }
  const capped = sigs.length >= 3000;
  const [bal, t1, t2] = await Promise.all([
    rpc('getBalance', [addr]).catch(() => ({ value: null })),
    rpc('getTokenAccountsByOwner', [addr, { programId: TOKEN }, { encoding: 'jsonParsed' }]).catch(() => ({ value: [] })),
    rpc('getTokenAccountsByOwner', [addr, { programId: TOKEN22 }, { encoding: 'jsonParsed' }]).catch(() => ({ value: [] })),
  ]);
  const tokens = [...(t1.value || []), ...(t2.value || [])].filter(a => +a.account?.data?.parsed?.info?.tokenAmount?.uiAmount > 0).length;
  const times = sigs.map(s => s.blockTime).filter(Boolean);
  const first = times.length ? Math.min(...times) : null, last = times.length ? Math.max(...times) : null;
  const read = { txs: sigs.length, capped, first, last, sol: bal.value == null ? null : bal.value / 1e9, tokens, ms: Date.now() - t0 };
  emit({ step: 'read', ...read });
  if (!sigs.length) return { ...read, empty: true, score: 0 };

  // FUNDING: who sent the first SOL
  let funder = null, fundedAt = null;
  if (!capped) {
    const old = sigs[sigs.length - 1];
    const tx = await rpc('getTransaction', [old.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]).catch(() => null);
    funder = funderOf(tx, addr); fundedAt = old.blockTime || null;
  }
  emit({ step: 'funding', funder, at: fundedAt, capped });

  // HABITS: hours and days, in UTC
  const hours = Array(24).fill(0), days = Array(7).fill(0);
  for (const t of times) { const d = new Date(t * 1000); hours[d.getUTCHours()]++; days[d.getUTCDay()]++; }
  let peak = { from: 0, share: 0 };
  for (let h = 0; h < 24; h++) { let s = 0; for (let k = 0; k < 4; k++) s += hours[(h + k) % 24]; if (s > peak.share) peak = { from: h, share: s }; }
  peak.share = times.length ? +(peak.share / times.length).toFixed(2) : 0;
  const busiest = days.indexOf(Math.max(...days));
  emit({ step: 'habits', hours, peak, busiest });

  // LINKS: which apps it uses and who it keeps sending SOL to or getting SOL from (last 25 transactions)
  const recent = await mapLimit(sigs.slice(0, 25), 5, s => rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]));
  const apps = new Map(), cps = new Map();
  for (const tx of recent) {
    if (!tx) continue;
    const seenApps = new Set();
    const ixs = [...(tx.transaction?.message?.instructions || []), ...((tx.meta?.innerInstructions || []).flatMap(x => x.instructions || []))];
    for (const ix of ixs) {
      const pid = ix.programId;
      if (APPS[pid]) seenApps.add(APPS[pid]); else if (pid && !QUIET.has(pid)) seenApps.add('other');
      const info = ix.parsed?.info;
      if (ix.program === 'system' && ix.parsed?.type === 'transfer' && info) {
        const other = info.source === addr ? info.destination : info.destination === addr ? info.source : null;
        if (other && other !== addr) cps.set(other, (cps.get(other) || 0) + 1);
      }
    }
    for (const a of seenApps) apps.set(a, (apps.get(a) || 0) + 1);
  }
  const appList = [...apps].filter(([n]) => n !== 'other').sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n }));
  const cpList = [...cps].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => ({ a: short(a), n }));
  emit({ step: 'links', apps: appList, cps: cpList, sampled: recent.filter(Boolean).length });

  // SCORE: how easy this wallet is to follow
  const repeat = cpList.filter(c => c.n >= 2).length;
  let score = 0;
  score += funder ? 26 : capped ? 14 : 8;
  score += Math.min(24, Math.log10(sigs.length + 1) * 8);
  score += Math.min(22, peak.share * 30);
  score += Math.min(16, repeat * 6 + (cpList.length ? 4 : 0));
  score += Math.min(12, appList.length * 3);
  score = Math.round(Math.min(100, score));
  emit({ step: 'score', score });
  return { ...read, funder, fundedAt, hours, peak, busiest, apps: appList, cps: cpList, score };
}
