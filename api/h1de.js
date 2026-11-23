// H1DE API: one function, many ops (/api/<op> is rewritten to /api/h1de?op=<op>)
//   stats · scan (streamed) · rpc (allowlisted) · route (NEAR Intents 1Click) · swap (Jupiter) · mcp · agent (agent.txt)
// H1DE keeps counters, never addresses: a move is counted once through a keyed hash and nothing else is stored.
import crypto from 'node:crypto';
import { db, allow, secret, meta, bump, counts, once, seen } from './_db.js';
import { rpc, broadcast, scan, fetchT, isAddr } from './_chain.js';
import { writeLLM, clerk, facts, gatewayToken, MODEL } from './_agent.js';

const ONECLICK = 'https://1click.chaindefuser.com/v0';
const JUP = 'https://lite-api.jup.ag';
const SOL_ASSET = 'nep141:sol.omft.near', USDC_ASSET = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DAILY_SCANS = +process.env.H1DE_DAILY || 3000;

function send(res, code, obj, cache = 'no-store') {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cache);
  res.setHeader('access-control-allow-origin', '*');
  res.end(JSON.stringify(obj));
}
const ok = (res, obj, cache) => send(res, 200, { ok: true, ...obj }, cache);
const fail = (res, code, error, extra) => send(res, code, { ok: false, error, ...extra });
async function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; let n = 0;
  for await (const c of req) { chunks.push(c); n += c.length; if (n > 256e3) break; }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
const ipOf = req => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
async function visitor(req, q) { return crypto.createHash('sha256').update((q ? await secret(q) : 'h1de') + ':' + ipOf(req)).digest('hex').slice(0, 20); }
async function limited(req, q, key, max, sec) { if (!q) return false; return !(await allow(q, key + ':' + (await visitor(req, q)), max, sec)); }

// ---------------- stats: counts only
async function stats(req, res) {
  const q = await db(), e = process.env;
  const config = { ca: isAddr(e.H1DE_CA || '') ? e.H1DE_CA : '', x: /^https:\/\/(x|twitter)\.com\/\w{1,15}\/?$/.test(e.H1DE_X || '') ? e.H1DE_X : '' };
  const model = gatewayToken(req) && e.H1DE_LLM !== 'off' ? MODEL : null;
  if (!q) return ok(res, { db: false, moves: null, routed: null, scans: null, born: null, model, config });
  const c = await counts(q);
  ok(res, { db: true, moves: c.moves || 0, routes: c.routes || 0, swaps: c.swaps || 0, sends: c.sends || 0, routed: +(c.routed || 0).toFixed(3), scans: c.scans || 0, born: await meta(q, 'born'), model, config },
    'public, max-age=0, s-maxage=10, stale-while-revalidate=60');
}

// ---------------- scan: the exposure file of one wallet, streamed step by step. Nothing about the wallet is stored.
async function scanOp(req, res) {
  const b = await body(req), w = String(b.wallet || '').trim();
  if (!isAddr(w)) return fail(res, 400, 'That isn’t a Solana address.');
  const q = await db();
  if (await limited(req, q, 's', 6, 600)) return fail(res, 429, 'Slow down. Six scans per visitor every ten minutes.');
  if (q && !(await allow(q, 'sg', DAILY_SCANS, 86400))) return fail(res, 429, 'The watcher has read its quota for today. It starts again at midnight UTC.');
  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-accel-buffering', 'no');
  const emit = o => res.write(JSON.stringify(o) + '\n');
  let r;
  try { r = await scan(w, emit); }
  catch (e) { emit({ step: 'error', error: e.rpc ? 'Solana refused that address.' : 'Solana didn’t answer the watcher. Try again in a minute.' }); return res.end(); }
  if (r.empty) { emit({ step: 'file', file: { empty: true, score: 0, wallet: w } }); if (q) await bump(q, 'scans'); return res.end(); }
  const f = facts(w, r);
  const t1 = Date.now(); let text = null, writer = 'clerk', tokens = 0;
  const tok = gatewayToken(req);
  if (tok && process.env.H1DE_LLM !== 'off') {
    try { const o = await writeLLM(f, tok); text = o.text; tokens = o.tokens; writer = MODEL; }
    catch (e) { console.warn('writer fell back to the clerk:', e.message); }
  }
  if (!text) text = clerk(f);
  emit({ step: 'write', writer, tokens, ms: Date.now() - t1 });
  if (q) { await bump(q, 'scans'); if (tokens) await bump(q, 'tokens', tokens); }
  emit({ step: 'file', file: { wallet: w, facts: f, read: { txs: r.txs, capped: r.capped, first: r.first, last: r.last, sol: r.sol, tokens: r.tokens }, funder: r.funder ? r.funder.slice(0, 4) + '…' + r.funder.slice(-4) : null, fundedAt: r.fundedAt, hours: r.hours, peak: r.peak, apps: r.apps, cps: r.cps, score: r.score, text, writer, at: new Date().toISOString() } });
  res.end();
}

// ---------------- rpc: the few calls the browser needs, through our own endpoint (the page talks to nobody else)
const ALLOWED = new Set(['getLatestBlockhash', 'getBalance', 'getTokenAccountsByOwner', 'getSignatureStatuses', 'getAccountInfo', 'simulateTransaction', 'sendTransaction', 'getFeeForMessage']);
async function rpcOp(req, res) {
  const b = await body(req), method = String(b.method || ''), params = Array.isArray(b.params) ? b.params : [];
  if (!ALLOWED.has(method)) return fail(res, 400, 'Not allowed.');
  const q = await db();
  if (await limited(req, q, 'r', 240, 60)) return fail(res, 429, 'Too many requests. Wait a moment.');
  try {
    if (method === 'sendTransaction') {
      const wire = Buffer.from(String(params[0] || ''), 'base64');
      if (wire.length < 100 || wire.length > 1232) return fail(res, 400, 'That isn’t a transaction.');
      const sig = await broadcast(wire.toString('base64'));
      if (q && ['send', 'swap', 'route'].includes(b.kind)) await once(q, 'sent:' + b.kind, sig);
      return ok(res, { result: sig });
    }
    const result = await rpc(method, params);
    if (method === 'getSignatureStatuses' && q) {
      const sigs = params[0] || [];
      for (let i = 0; i < sigs.length; i++) {
        const s = result?.value?.[i];
        if (!s || s.err || !(s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) continue;
        let kind = null;
        for (const k of ['send', 'swap']) if (await seen(q, 'sent:' + k, sigs[i])) { kind = k; break; }
        if (kind && await once(q, 'counted', sigs[i])) { await bump(q, 'moves'); await bump(q, kind + 's'); }
      }
    }
    return ok(res, { result });
  } catch (e) { return fail(res, 502, e.rpc ? (e.rpc.message || 'Solana refused it.') : 'Solana didn’t answer. Try again.', { rpc: e.rpc || null }); }
}

// ---------------- route: NEAR Intents 1Click. A one-time deposit address; a solver pays the other side from its own wallet.
async function oneclick(path, opt = {}) {
  const r = await fetchT(ONECLICK + path, { ...opt, headers: { 'content-type': 'application/json', accept: 'application/json', ...(process.env.ONECLICK_JWT ? { authorization: 'Bearer ' + process.env.ONECLICK_JWT } : {}), ...(opt.headers || {}) } }, 15000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || j.error || ('route ' + r.status)); e.status = r.status; throw e; }
  return j;
}
async function routeOp(req, res) {
  const b = await body(req), op = String(b.op || '');
  const q = await db();
  if (await limited(req, q, 'q', 40, 600)) return fail(res, 429, 'Too many route requests. Wait a few minutes.');
  try {
    if (op === 'quote') {
      const from = String(b.from || ''), to = String(b.to || ''), amount = String(b.amount || '');
      if (!isAddr(from) || !isAddr(to)) return fail(res, 400, 'Both ends need a Solana address.');
      if (from === to) return fail(res, 400, 'A route to the same wallet hides nothing.');
      if (!/^\d{5,15}$/.test(amount)) return fail(res, 400, 'Amount in lamports.');
      const out = b.out === 'usdc' ? USDC_ASSET : SOL_ASSET;
      const j = await oneclick('/quote', { method: 'POST', body: JSON.stringify({
        dry: !!b.dry, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: SOL_ASSET, depositType: 'ORIGIN_CHAIN',
        destinationAsset: out, amount, refundTo: from, refundType: 'ORIGIN_CHAIN', recipient: to, recipientType: 'DESTINATION_CHAIN',
        deadline: new Date(Date.now() + 30 * 60e3).toISOString(), referral: 'h1de', quoteWaitingTimeMs: 3000,
      }) });
      const qt = j.quote || {};
      return ok(res, { quote: { deposit: qt.depositAddress || null, amountIn: qt.amountIn, amountOut: qt.amountOut, minOut: qt.minAmountOut, outUsd: qt.amountOutUsd, inUsd: qt.amountInUsd, eta: qt.timeEstimate, deadline: qt.deadline, out: b.out === 'usdc' ? 'USDC' : 'SOL' } });
    }
    if (op === 'submit') {
      if (!isAddr(String(b.deposit || ''))) return fail(res, 400, 'Missing deposit address.');
      const j = await oneclick('/deposit/submit', { method: 'POST', body: JSON.stringify({ txHash: String(b.tx || ''), depositAddress: b.deposit }) });
      return ok(res, { status: j.status || null });
    }
    if (op === 'status') {
      if (!isAddr(String(b.deposit || ''))) return fail(res, 400, 'Missing deposit address.');
      const j = await oneclick('/status?depositAddress=' + encodeURIComponent(b.deposit));
      const st = j.status || 'UNKNOWN';
      if (st === 'SUCCESS' && q && await once(q, 'route', b.deposit)) {
        await bump(q, 'moves'); await bump(q, 'routes');
        const inLamports = +(j.quoteResponse?.quote?.amountIn || j.swapDetails?.amountIn || 0);
        if (inLamports > 0) await bump(q, 'routed', inLamports / 1e9);
      }
      const d = j.swapDetails || {};
      return ok(res, { status: st, out: d.amountOutFormatted || null, payout: (d.destinationChainTxHashes || [])[0]?.hash || null });
    }
    return fail(res, 400, 'Unknown route step.');
  } catch (e) { return fail(res, e.status === 400 ? 400 : 502, e.message || 'The route network didn’t answer.'); }
}

// ---------------- swap: Jupiter builds it for the ghost; the ghost signs it in the browser
async function swapOp(req, res) {
  const b = await body(req), op = String(b.op || '');
  const q = await db();
  if (await limited(req, q, 'w', 60, 600)) return fail(res, 429, 'Too many swap requests. Wait a few minutes.');
  try {
    if (op === 'quote') {
      const inM = String(b.inputMint || ''), outM = String(b.outputMint || ''), amount = String(b.amount || '');
      if (!isAddr(inM) || !isAddr(outM) || inM === outM || !/^\d{1,20}$/.test(amount)) return fail(res, 400, 'Bad swap.');
      const slip = Math.min(1500, Math.max(10, parseInt(b.slippageBps) || 150));
      const r = await fetchT(`${JUP}/swap/v1/quote?inputMint=${inM}&outputMint=${outM}&amount=${amount}&slippageBps=${slip}&restrictIntermediateTokens=true`, {}, 10000);
      const j = await r.json();
      if (!r.ok || j.error) return fail(res, 400, j.error || 'No route for that swap.');
      return ok(res, { quote: j });
    }
    if (op === 'build') {
      const user = String(b.user || '');
      if (!isAddr(user) || !b.quote) return fail(res, 400, 'Bad swap.');
      const r = await fetchT(`${JUP}/swap/v1/swap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        quoteResponse: b.quote, userPublicKey: user, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: 'high' } },
      }) }, 12000);
      const j = await r.json();
      if (!r.ok || !j.swapTransaction) return fail(res, 400, j.error || 'Jupiter couldn’t build that swap.');
      return ok(res, { tx: j.swapTransaction, lastValidBlockHeight: j.lastValidBlockHeight });
    }
    if (op === 'token') {
      const m = String(b.mint || '');
      if (!isAddr(m)) return fail(res, 400, 'That isn’t a token address.');
      if (m === SOL_MINT) return ok(res, { token: { mint: m, symbol: 'SOL', name: 'Solana', decimals: 9 } });
      const r = await fetchT(`${JUP}/tokens/v2/search?query=${m}`, {}, 8000);
      const j = await r.json().catch(() => []);
      const t = (Array.isArray(j) ? j : []).find(x => x.id === m);
      if (!t) return fail(res, 404, 'Jupiter doesn’t know that token yet.');
      return ok(res, { token: { mint: m, symbol: String(t.symbol || '').slice(0, 14), name: String(t.name || '').slice(0, 40), decimals: t.decimals, usd: t.usdPrice ?? null } }, 'public, max-age=0, s-maxage=60');
    }
    return fail(res, 400, 'Unknown swap step.');
  } catch { return fail(res, 502, 'Jupiter didn’t answer. Try again.'); }
}

// ---------------- MCP over HTTP (JSON-RPC 2.0, JSON responses)
const TOOLS = [
  { name: 'scan_wallet', description: 'Read the exposure of a Solana wallet: how its public trail links it (first funder, active hours, apps, repeat counterparties) and a 0 to 100 exposure score.', inputSchema: { type: 'object', properties: { wallet: { type: 'string', description: 'Solana address' } }, required: ['wallet'] } },
  { name: 'route_quote', description: 'Quote a private route: SOL from one wallet to a different wallet through NEAR Intents, so no direct on-chain link joins them. Dry quote, nothing moves.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, sol: { type: 'number' } }, required: ['from', 'to', 'sol'] } },
  { name: 'h1de_stats', description: 'How many moves H1DE has hidden and how much SOL it routed. Counts only, never addresses.', inputSchema: { type: 'object', properties: {} } },
];
async function tool(name, a, req) {
  if (name === 'scan_wallet') {
    const w = String(a.wallet || '').trim(); if (!isAddr(w)) return { error: 'Not a Solana address.' };
    const q = await db(); if (await limited(req, q, 's', 6, 600)) return { error: 'Rate limited.' };
    const r = await scan(w, () => {}); if (r.empty) return { wallet: w, transactions: 0, exposure: 0 };
    if (q) await bump(q, 'scans');
    return { ...facts(w, r), note: 'Public data only. H1DE stores nothing about the wallet.' };
  }
  if (name === 'route_quote') {
    const from = String(a.from || ''), to = String(a.to || ''), s = Number(a.sol);
    if (!isAddr(from) || !isAddr(to) || !(s > 0)) return { error: 'Need from, to and sol.' };
    const j = await oneclick('/quote', { method: 'POST', body: JSON.stringify({ dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: SOL_ASSET, depositType: 'ORIGIN_CHAIN', destinationAsset: SOL_ASSET, amount: String(Math.round(s * 1e9)), refundTo: from, refundType: 'ORIGIN_CHAIN', recipient: to, recipientType: 'DESTINATION_CHAIN', deadline: new Date(Date.now() + 30 * 60e3).toISOString(), referral: 'h1de' }) }).catch(e => ({ error: e.message }));
    if (j.error) return { error: j.error };
    return { sol_in: s, sol_out: +(j.quote?.amountOut || 0) / 1e9, seconds: j.quote?.timeEstimate ?? null, note: 'Dry quote. Use the site to run a route.' };
  }
  if (name === 'h1de_stats') { const q = await db(); if (!q) return { error: 'offline' }; const c = await counts(q); return { moves_hidden: c.moves || 0, sol_routed: +(c.routed || 0).toFixed(3), scans: c.scans || 0 }; }
  return { error: 'Unknown tool.' };
}
async function mcp(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS'); res.setHeader('access-control-allow-headers', 'content-type, mcp-protocol-version, mcp-session-id, authorization'); return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('allow', 'POST'); return res.end(); }
  const msg = await body(req);
  const one = async m => {
    if (!m || m.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
    if (m.id === undefined || m.id === null) return null;
    if (m.method === 'initialize') {
      const want = m.params?.protocolVersion, known = ['2025-06-18', '2025-03-26', '2024-11-05'];
      return { jsonrpc: '2.0', id: m.id, result: { protocolVersion: known.includes(want) ? want : known[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'h1de', version: '1.0.0' }, instructions: 'H1DE shows how exposed a Solana wallet is and quotes private routes between wallets. It stores no addresses.' } };
    }
    if (m.method === 'ping') return { jsonrpc: '2.0', id: m.id, result: {} };
    if (m.method === 'tools/list') return { jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } };
    if (m.method === 'tools/call') { const out = await tool(m.params?.name, m.params?.arguments || {}, req).catch(e => ({ error: e.message })); return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: !!out.error } }; }
    return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } };
  };
  const outs = Array.isArray(msg) ? (await Promise.all(msg.map(one))).filter(Boolean) : await one(msg);
  if (!outs || (Array.isArray(outs) && !outs.length)) { res.statusCode = 202; return res.end(); }
  send(res, 200, outs);
}

function agentTxt(req, res) {
  const o = (String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]) + '://' + (req.headers['x-forwarded-host'] || req.headers.host || 'this-site');
  res.statusCode = 200; res.setHeader('content-type', 'text/plain; charset=utf-8'); res.setHeader('cache-control', 'public, max-age=3600');
  res.end(`# H1DE
> Every move on-chain is watched. H1DE shows a Solana wallet how exposed it is, and moves SOL between wallets through NEAR Intents so no direct on-chain link joins them. It stores counts, never addresses. Independent experimental software.

## JSON (no key)
POST ${o}/api/scan   {"wallet":"<address>"}   exposure file, streamed as newline-delimited JSON
POST ${o}/api/route  {"op":"quote","from":"<address>","to":"<address>","amount":"<lamports>","dry":true}
GET  ${o}/api/stats  moves hidden, SOL routed, scans (counts only)

## MCP (streamable HTTP, JSON responses)
POST ${o}/api/mcp   tools: scan_wallet {wallet}, route_quote {from,to,sol}, h1de_stats {}
config: {"mcpServers":{"h1de":{"type":"http","url":"${o}/api/mcp"}}}

## Limits
The route network sees both ends of a route. Equal amounts at close times can still be matched. Keys made on the site live only in the visitor's browser.
`);
}

export default async function handler(req, res) {
  const op = String(req.query?.op || '');
  try {
    if (op === 'stats') return await stats(req, res);
    if (op === 'scan') return req.method === 'POST' ? await scanOp(req, res) : fail(res, 405, 'POST {wallet}');
    if (op === 'rpc') return await rpcOp(req, res);
    if (op === 'route') return await routeOp(req, res);
    if (op === 'swap') return await swapOp(req, res);
    if (op === 'mcp') return await mcp(req, res);
    if (op === 'agent') return agentTxt(req, res);
    return fail(res, 404, 'Unknown endpoint.');
  } catch (e) {
    console.error(op, e);
    if (res.headersSent) { try { res.write(JSON.stringify({ step: 'error', error: 'H1DE had a problem. Try again.' }) + '\n'); res.end(); } catch {} return; }
    return fail(res, 500, 'H1DE had a problem. Try again.');
  }
}
