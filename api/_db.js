// the archive lives in Postgres (Neon through Vercel Storage). Without a database URL the site says it is offline.
import crypto from 'node:crypto';
let ready = null;

async function connect() {
  const e = process.env;
  const url = e.DATABASE_URL || e.POSTGRES_URL || e.STORAGE_URL || e.DATABASE_URL_UNPOOLED || e.STORAGE_DATABASE_URL;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return async (text, params = []) => await sql(text, params);
  }
  if (e.H1DE_PGLITE) {                                   // local tests only
    const { PGlite } = await import(e.H1DE_PGLITE);
    const pg = new PGlite(e.H1DE_PGDATA || undefined);
    return async (text, params = []) => (await pg.query(text, params)).rows;
  }
  return null;
}

export async function db() {
  if (!ready) ready = (async () => {
    const Q = await connect();
    if (!Q) return null;
    await Q(`create table if not exists h1de_count (k text primary key, n double precision not null default 0)`);
    await Q(`create table if not exists h1de_seen (h text primary key, kind text not null, t timestamptz not null default now())`);
    await Q(`create table if not exists h1de_hits (k text not null, bucket bigint not null, n int not null, primary key (k, bucket))`);
    await Q(`create table if not exists h1de_meta (k text primary key, v text not null)`);
    await Q(`insert into h1de_meta (k, v) values ('born', $1) on conflict (k) do nothing`, [new Date().toISOString()]);
    return Q;
  })().catch(e => { ready = null; throw e; });
  return ready;
}

// at most `max` hits per key in a window of `sec` seconds
export async function allow(q, key, max, sec) {
  const now = Math.floor(Date.now() / 1000), bucket = now - (now % sec);
  const rows = await q(`insert into h1de_hits (k, bucket, n) values ($1, $2, 1) on conflict (k, bucket) do update set n = h1de_hits.n + 1 returning n`, [key, bucket]);
  if (Math.random() < .03) await q(`delete from h1de_hits where bucket < $1`, [now - 2 * 86400]);
  return Number(rows[0]?.n || 0) <= max;
}

// one secret for the hide codes and visitor hashes: from the env, or created once and kept in the database
let SECRET = null;
export async function secret(q) {
  if (SECRET) return SECRET;
  if (process.env.H1DE_SECRET) return (SECRET = process.env.H1DE_SECRET);
  let r = await q(`select v from h1de_meta where k = 'secret'`);
  if (!r[0]) {
    await q(`insert into h1de_meta (k, v) values ('secret', $1) on conflict (k) do nothing`, [crypto.randomBytes(32).toString('hex')]);
    r = await q(`select v from h1de_meta where k = 'secret'`);
  }
  return (SECRET = r[0].v);
}
// counters only: H1DE keeps how many, never who
export async function bump(q, k, by = 1) { await q(`insert into h1de_count (k, n) values ($1, $2) on conflict (k) do update set n = h1de_count.n + $2`, [k, by]); }
export async function counts(q) { const r = await q(`select k, n from h1de_count`); return Object.fromEntries(r.map(x => [x.k, Number(x.n)])); }
// remember a keyed hash of an event once (so a move is counted once), never the event itself
export async function once(q, kind, raw) {
  const h = crypto.createHmac('sha256', await secret(q)).update(kind + ':' + raw).digest('hex').slice(0, 40);
  const r = await q(`insert into h1de_seen (h, kind) values ($1, $2) on conflict (h) do nothing returning h`, [h, kind]);
  if (Math.random() < .02) await q(`delete from h1de_seen where t < now() - interval '30 days'`);
  return !!r[0];
}
export async function seen(q, kind, raw) {
  const h = crypto.createHmac('sha256', await secret(q)).update(kind + ':' + raw).digest('hex').slice(0, 40);
  return !!(await q(`select 1 from h1de_seen where h = $1`, [h]))[0];
}
export async function meta(q, k) { const r = await q(`select v from h1de_meta where k = $1`, [k]); return r[0]?.v ?? null; }
