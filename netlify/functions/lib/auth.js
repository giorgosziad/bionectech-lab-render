// Shared server-side auth + storage. Lives in lib/ so Netlify does not publish
// it as its own endpoint. Real security: passwords are hashed, sessions are
// HMAC-signed with a server secret the browser never sees.
const crypto = require('crypto');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(statusCode, obj) {
  return { statusCode, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

function secret() { return process.env.SESSION_SECRET || 'set-SESSION_SECRET-in-env'; }
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function fromB64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); return Buffer.from(s, 'base64').toString('utf8'); }

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
  return body + '.' + mac;
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  const expected = b64u(crypto.createHmac('sha256', secret()).update(parts[0]).digest());
  // constant-time compare
  const a = Buffer.from(parts[1]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(fromB64u(parts[0])); if (p.exp && Date.now() > p.exp) return null; return p; }
  catch (e) { return null; }
}
function bearer(event) {
  const h = event.headers || {};
  const a = h.authorization || h.Authorization || '';
  return a.indexOf('Bearer ') === 0 ? a.slice(7) : '';
}
function userFrom(event) { return verify(bearer(event)); }

function newSalt() { return crypto.randomBytes(8).toString('hex'); }
function hashPw(password, salt) { return crypto.createHash('sha256').update(salt + ':' + (password || '')).digest('hex'); }

// Storage via Upstash Redis REST API. Uses built-in fetch only (no npm
// packages), so this deploys by drag-and-drop. Set these two env vars on Netlify:
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
async function redis(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) throw new Error('Storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN on Netlify.');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j && j.error) throw new Error(j.error);
  return j ? j.result : null;
}
async function store() { return {}; } // kept so existing call sites work unchanged
async function readJSON(_st, key, fallback) {
  try { const v = await redis(['GET', key]); return (v === null || v === undefined) ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}
async function writeJSON(_st, key, value) { await redis(['SET', key, JSON.stringify(value)]); }
async function del(key) { try { await redis(['DEL', key]); } catch (e) {} }

function todayKey() { const d = new Date(); return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate(); }

// Brute-force guard: counts attempts in a rolling window. Returns the new count.
async function rlHit(key, windowSec) {
  try { const n = await redis(['INCR', key]); if (n === 1) { await redis(['EXPIRE', key, windowSec]); } return n; }
  catch (e) { return 0; }
}
async function rlReset(key) { try { await redis(['DEL', key]); } catch (e) {} }
function clientIp(event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] || h['client-ip'] || h['x-forwarded-for'] || 'ip').toString().split(',')[0].trim();
}

module.exports = { cors, json, sign, verify, bearer, userFrom, newSalt, hashPw, store, readJSON, writeJSON, del, todayKey, rlHit, rlReset, clientIp };
