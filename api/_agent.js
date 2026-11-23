// the writer: one language model call through the Vercel AI Gateway (authenticated with the deployment's OIDC token, so no key).
// It writes the exposure file: what anyone watching the chain already knows about a wallet. The clerk is the rule-based fallback.
import { fetchT, short } from './_chain.js';
export const MODEL = process.env.H1DE_MODEL || 'openai/gpt-4.1-mini';
const GATEWAY = process.env.H1DE_GATEWAY || 'https://ai-gateway.vercel.sh/v1/chat/completions';
export function gatewayToken(req) { return req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY || ''; }

const SYSTEM = `You are the watcher inside H1DE. You read one Solana wallet's public on-chain trail and write the file that any chain analyst could already write about it, so its owner can see how exposed they are.
Voice: clinical, deadpan, quietly unsettling and dryly funny, like a surveillance report written by a machine that never sleeps. Plain English. No emojis, no hashtags, no exclamation marks, no financial advice.
Rules:
- Use only the data you are given. Every number you mention must appear in it.
- Never guess who owns the wallet, their name, country, timezone, age, gender, job, health, beliefs or wealth bracket. Hours are UTC facts, not a location.
- Short addresses stay short (e.g. 7xKp…3fQ). Never invent addresses, coins, profits or losses.
- Call it "the wallet" or "this wallet".
Return a JSON object with exactly these keys:
"classification": 2 to 4 words naming this kind of wallet, uppercase, for example "NOCTURNAL APE" or "PATIENT ACCUMULATOR";
"summary": one sentence, at most 140 characters, on how easy this wallet is to follow;
"observations": an array of exactly 4 sentences, each at most 100 characters, each grounded in a specific field;
"prediction": one sentence, at most 110 characters, about the trail the wallet will leave next;
"risk": one of "LOW", "GUARDED", "ELEVATED", "SEVERE" (how exposed it is);
"note": one short closing line from the watcher, at most 70 characters.`;

const RISKS = new Set(['LOW', 'GUARDED', 'ELEVATED', 'SEVERE']);
const BAD = /\b(rape|suicid|nazi|kill|murder|terror|porn|sex(ual|y)?\b|nude|naked|slur|racis|jewish|muslim|christian|islam|gay|lesbian|trans(gender)?\b|immigra|cancer|disab|autis|depress|diagnos|lives in|located in|based in|timezone|time zone|american|european|asian|african|indian|chinese|russian)/i;
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/[\s,.;:]+\S*$/, '') + '…' : s; };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hh = h => String(h % 24).padStart(2, '0') + ':00';
const day = t => (t ? new Date(t * 1000).toISOString().slice(0, 10) : null);

export function facts(addr, r) {
  return {
    wallet: short(addr), transactions_seen: r.txs, history_capped_at_3000: r.capped,
    first_seen_utc: day(r.first), last_seen_utc: day(r.last), sol_balance: r.sol == null ? null : +r.sol.toFixed(3), tokens_held: r.tokens,
    funded_by: r.funder ? short(r.funder) : null, funded_on: day(r.fundedAt),
    busiest_4h_window_utc: r.peak ? `${hh(r.peak.from)}-${hh(r.peak.from + 4)}` : null, share_of_activity_in_that_window: r.peak?.share ?? null,
    busiest_day_utc: r.busiest != null ? DAYS[r.busiest] : null,
    apps_in_last_25_transactions: (r.apps || []).map(a => `${a.name} (${a.n})`), repeat_sol_counterparties: (r.cps || []).map(c => `${c.a} (${c.n})`),
    exposure_score_0_100: r.score,
  };
}

export async function writeLLM(f, token) {
  const body = { model: MODEL, temperature: .9, max_tokens: 520, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Wallet data:\n' + JSON.stringify(f) }] };
  const r = await fetchT(GATEWAY, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) }, 28000);
  if (!r.ok) throw new Error('gateway ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 160));
  const j = await r.json();
  const o = JSON.parse(String(j.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const text = {
    classification: cut(o.classification, 40).toUpperCase(), summary: cut(o.summary, 150),
    observations: (Array.isArray(o.observations) ? o.observations : []).slice(0, 4).map(s => cut(s, 112)).filter(Boolean),
    prediction: cut(o.prediction, 120), risk: RISKS.has(String(o.risk).toUpperCase()) ? String(o.risk).toUpperCase() : 'GUARDED', note: cut(o.note, 80),
  };
  if (!text.classification || !text.summary || text.observations.length < 3) throw new Error('incomplete file');
  if (BAD.test(JSON.stringify(text))) throw new Error('screened');
  return { text, tokens: +j.usage?.total_tokens || 0 };
}

export function clerk(f) {
  const s = f.exposure_score_0_100 || 0;
  const night = f.busiest_4h_window_utc && /^(0[0-5]|2[2-3])/.test(f.busiest_4h_window_utc);
  const apps = f.apps_in_last_25_transactions || [];
  const cls = s >= 75 ? (night ? 'NOCTURNAL OPEN BOOK' : 'OPEN BOOK') : s >= 55 ? (apps.length ? 'CREATURE OF HABIT' : 'FOLLOWABLE') : s >= 35 ? 'PARTIAL SHADOW' : 'FAINT TRAIL';
  const obs = [];
  if (f.funded_by) obs.push(`First SOL came from ${f.funded_by} on ${f.funded_on}. Anyone can walk that back.`);
  else if (f.history_capped_at_3000) obs.push(`More than ${f.transactions_seen} transactions. The trail is longer than anyone needs.`);
  if (f.busiest_4h_window_utc) obs.push(`${Math.round((f.share_of_activity_in_that_window || 0) * 100)}% of its moves land between ${f.busiest_4h_window_utc} UTC.`);
  if (apps.length) obs.push(`Recent moves go through ${apps.slice(0, 3).map(a => a.replace(/ \(\d+\)$/, '')).join(', ')}.`);
  if ((f.repeat_sol_counterparties || []).length) obs.push(`Keeps moving SOL with ${f.repeat_sol_counterparties[0].replace(/ \(\d+\)$/, '')}. Two wallets, one story.`);
  obs.push(`${f.transactions_seen} transactions on record, first seen ${f.first_seen_utc || 'too long ago to read'}.`);
  return {
    classification: cls,
    summary: s >= 55 ? 'This wallet is easy to follow. Its first deposit, its hours and its habits are all on the record.' : 'This wallet leaves a thinner trail than most, but every move it makes is still public.',
    observations: obs.slice(0, 4),
    prediction: night ? 'Its next move will most likely land in the same hours as the last ones.' : 'Its next move will be linked to this one within seconds of landing.',
    risk: s >= 75 ? 'SEVERE' : s >= 55 ? 'ELEVATED' : s >= 35 ? 'GUARDED' : 'LOW',
    note: s >= 55 ? 'Watched. Every move.' : 'Faint, not invisible.',
  };
}
