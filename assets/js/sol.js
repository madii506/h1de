// the minimum of Solana's wire format H1DE needs: base58, hand-built SOL transfers, signing raw transactions with tweetnacl
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58enc(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b) break; s = '1' + s; }
  return s;
}
export function b58dec(str) {
  let n = 0n;
  for (const c of str) { const i = A.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of str) { if (c !== '1') break; out.unshift(0); }
  return new Uint8Array(out);
}
export const isAddr = s => { if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '')) return false; try { return b58dec(s).length === 32; } catch { return false; } };
export const short = a => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '—');
export const b64enc = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const b64dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const shortvec = n => { const o = []; let v = n; for (;;) { const b = v & 0x7f; v >>= 7; if (!v) { o.push(b); break; } o.push(b | 0x80); } return o; };
function readShortvec(buf, off) { let len = 0, size = 0; for (;;) { const b = buf[off + size]; len |= (b & 0x7f) << (size * 7); size++; if (!(b & 0x80)) break; } return [len, size]; }
const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return [...b]; };
const u64 = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return [...b]; };
const SYSTEM = new Uint8Array(32);
const BUDGET = b58dec('ComputeBudget111111111111111111111111111111');
export const FEE_LAMPORTS = 5000 + 450;           // one signature + 900 CU at 500,000 micro-lamports

// message of a legacy transaction: a compute budget, then one SOL transfer from -> to
export function transferMessage(from, to, lamports, blockhash, { cuLimit = 900, cuPrice = 500000 } = {}) {
  const F = b58dec(from), T = b58dec(to), BH = b58dec(blockhash);
  if (F.length !== 32 || T.length !== 32 || BH.length !== 32) throw new Error('bad key');
  const keys = [F, T, SYSTEM, BUDGET];
  const ixs = [
    { p: 3, a: [], d: [2, ...u32(cuLimit)] },
    { p: 3, a: [], d: [3, ...u64(cuPrice)] },
    { p: 2, a: [0, 1], d: [...u32(2), ...u64(lamports)] },
  ];
  return new Uint8Array([1, 0, 2, ...shortvec(keys.length), ...keys.flatMap(k => [...k]), ...BH,
    ...shortvec(ixs.length), ...ixs.flatMap(i => [i.p, ...shortvec(i.a.length), ...i.a, ...shortvec(i.d.length), ...i.d])]);
}
// an unsigned wire transaction (for a browser wallet to sign), or a signed one
export const unsignedTx = msg => new Uint8Array([...shortvec(1), ...new Uint8Array(64), ...msg]);
export const signedTx = (msg, sig) => new Uint8Array([...shortvec(1), ...sig, ...msg]);

// sign a serialized transaction (legacy or v0) as its fee payer, in place, with a tweetnacl secret key
export function signWire(wire, secretKey) {
  const [n, sz] = readShortvec(wire, 0);
  const msg = wire.subarray(sz + n * 64);
  const sig = self.nacl.sign.detached(msg, secretKey);
  const out = new Uint8Array(wire); out.set(sig, sz);
  return { wire: out, sig: b58enc(sig) };
}

// ghosts: tweetnacl keypairs kept in this browser only
export function newGhost() { const kp = self.nacl.sign.keyPair(); return { pk: b58enc(kp.publicKey), sk: b58enc(kp.secretKey) }; }
export function ghostFromSecret(input) {
  let bytes;
  const t = String(input || '').trim();
  if (t.startsWith('[')) bytes = Uint8Array.from(JSON.parse(t));
  else bytes = b58dec(t);
  if (bytes.length === 32) { const kp = self.nacl.sign.keyPair.fromSeed(bytes); return { pk: b58enc(kp.publicKey), sk: b58enc(kp.secretKey) }; }
  if (bytes.length !== 64) throw new Error('A secret key is 64 bytes.');
  const kp = self.nacl.sign.keyPair.fromSecretKey(bytes);
  return { pk: b58enc(kp.publicKey), sk: b58enc(kp.secretKey) };
}
export const lamports = sol => { const [i, f = ''] = String(sol).trim().split('.'); return BigInt(i || 0) * 1_000_000_000n + BigInt((f + '000000000').slice(0, 9)); };
export const sol = l => (Number(l) / 1e9);
export const fmtSol = l => { const v = Number(l) / 1e9; return v === 0 ? '0' : v < .001 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : v.toFixed(3); };
