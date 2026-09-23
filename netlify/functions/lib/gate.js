// lib/gate.js - BNT_GATE: server-enforced access codes for the Jobs and Missions panels.
// Only a salted PBKDF2-SHA256 hash of each code lives on the server (Render env vars
// JOBS_CODE_HASH / MISSIONS_CODE_HASH, format pbkdf2$<iterations>$<salt b64>$<hash b64>).
// A correct code unlocks that panel for the signed-in user for 8 hours (recorded in Redis -
// scope comes from this store lookup, never from new token claims; session tokens are untouched).
// Wrong codes: max 5 per 15 minutes per user and per IP. Timing-safe compare. Fails closed.
(function () {
  'use strict';
  const crypto = require('crypto');
  const { readJSON, writeJSON, del, expire, rlHit, rlReset } = require('./auth');
  const PANELS = { jobs: 'JOBS_CODE_HASH', missions: 'MISSIONS_CODE_HASH' };
  const PLAIN = { jobs: 'JOBS_CODE', missions: 'MISSIONS_CODE' };   // BNT_GATE_PLAIN: a password you type on Render (min 12 chars); preferred when set
  const MIN_PLAIN = 12;
  const UNLOCK_SECONDS = 8 * 3600, MAX_TRIES = 5, WINDOW_SECONDS = 15 * 60, ITERATIONS = 210000;

  function who(user) { return String((user && (user.u || user.user || user.name || user.email)) || 'unknown').toLowerCase().replace(/[^a-z0-9@._-]/g, '_').slice(0, 80); }
  function ipKey(ip) { return String(ip || 'ip').replace(/[^0-9a-fA-F:.]/g, '_').slice(0, 64); }
  function parse(h) {
    const p = String(h || '').trim().split('$');
    if (p.length !== 4 || p[0] !== 'pbkdf2') return null;
    const it = parseInt(p[1], 10);
    if (!(it >= 100000)) return null;
    const salt = Buffer.from(p[2], 'base64'), hash = Buffer.from(p[3], 'base64');
    if (salt.length < 16 || hash.length < 32) return null;
    return { it: it, salt: salt, hash: hash };
  }
  function derive(code, salt, it, len) {
    return new Promise(function (res, rej) { crypto.pbkdf2(String(code), salt, it, len, 'sha256', function (e, k) { if (e) rej(e); else res(k); }); });
  }
  async function makeHash(code) {
    const salt = crypto.randomBytes(16);
    const k = await derive(code, salt, ITERATIONS, 32);
    return 'pbkdf2$' + ITERATIONS + '$' + salt.toString('base64') + '$' + k.toString('base64');
  }
  function plainOf(panel) { const v = String(process.env[PLAIN[panel]] || '').trim(); return v.length >= MIN_PLAIN ? v : ''; }
  function configured(panel) { return !!(PANELS[panel] && (plainOf(panel) || parse(process.env[PANELS[panel]]))); }
  async function isUnlocked(panel, user) {
    if (!configured(panel)) return false;
    const r = await readJSON(null, 'gateok:' + panel + ':' + who(user), null);
    return !!(r && r.exp && r.exp > Date.now());
  }
  async function unlock(panel, user, code, ip) {
    if (!PANELS[panel]) return { ok: false, status: 400, error: 'Unknown panel.' };
    const plain = plainOf(panel);
    const spec = plain ? null : parse(process.env[PANELS[panel]]);
    if (!plain && !spec) return { ok: false, status: 503, error: 'This panel is locked: set ' + PLAIN[panel] + ' (at least ' + MIN_PLAIN + ' characters) on Render.' };
    code = String(code || '');
    if (!code || code.length > 200) return { ok: false, status: 400, error: 'Enter the code.' };
    const ku = 'gatefail:' + panel + ':u:' + who(user), ki = 'gatefail:' + panel + ':ip:' + ipKey(ip);
    const nu = await rlHit(ku, WINDOW_SECONDS), ni = await rlHit(ki, WINDOW_SECONDS);
    if (nu > MAX_TRIES || ni > MAX_TRIES) return { ok: false, status: 429, error: 'Too many attempts. Wait 15 minutes, then try again.' };
    let good;
    if (plain) {
      const a = crypto.createHash('sha256').update(code, 'utf8').digest(), b = crypto.createHash('sha256').update(plain, 'utf8').digest();
      good = crypto.timingSafeEqual(a, b);   // equal-length digests: constant-time compare
    } else {
      const k = await derive(code, spec.salt, spec.it, spec.hash.length);
      good = k.length === spec.hash.length && crypto.timingSafeEqual(k, spec.hash);
    }
    if (!good) return { ok: false, status: 401, error: 'Wrong code.', attemptsLeft: Math.max(0, MAX_TRIES - Math.max(nu, ni)) };
    await rlReset(ku); await rlReset(ki);
    const exp = Date.now() + UNLOCK_SECONDS * 1000;
    const key = 'gateok:' + panel + ':' + who(user);
    await writeJSON(null, key, { exp: exp, at: Date.now() });
    try { await expire(key, UNLOCK_SECONDS); } catch (e) {}
    return { ok: true, status: 200, expiresAt: exp };
  }
  async function lock(panel, user) { try { await del('gateok:' + panel + ':' + who(user)); } catch (e) {} return { ok: true }; }
  function lockedMessage(panel) {
    return configured(panel) ? ('The ' + panel + ' panel is locked. Enter its code.') : ('The ' + panel + ' panel is locked: set ' + PLAIN[panel] + ' (at least ' + MIN_PLAIN + ' characters) on Render.');
  }

  module.exports = { isUnlocked: isUnlocked, unlock: unlock, lock: lock, configured: configured, makeHash: makeHash, lockedMessage: lockedMessage, _test: { parse: parse, who: who } };
})();
