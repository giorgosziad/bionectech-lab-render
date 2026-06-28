// login.js — exchange a desk name + password (or the owner admin password)
// for a signed session token. Passwords are checked against hashes in storage.
const { cors, json, sign, newSalt, hashPw, store, readJSON, writeJSON, rlHit, rlReset, clientIp } = require('./lib/auth');

const SESSION_HOURS = 12;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Body must be JSON.' }); }

  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const st = await store();

  // Brute-force guard: max 10 attempts / 15 min per IP+identity.
  const ip = clientIp(event);
  const ident = (b.admin === true) ? 'admin' : ((b.desk || '').toString().trim().toLowerCase() || 'unknown');
  const rlKey = 'rl:login:' + ip + ':' + ident;
  const attempts = await rlHit(rlKey, 900);
  if (attempts > 10) return json(429, { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' });

  // Owner/admin login via the ADMIN_PASSWORD env var (always available to you).
  if (b.admin === true) {
    const adminPw = process.env.ADMIN_PASSWORD || '';
    if (!adminPw) return json(500, { error: 'ADMIN_PASSWORD is not set on this site yet.' });
    if ((b.password || '') !== adminPw) return json(401, { error: 'Wrong admin password.' });
    // Ensure the owner has a desk record to store their own work.
    const ownerName = (process.env.ADMIN_DESK || 'Giorgos');
    try {
      let rec = await readJSON(st, 'desk:' + ownerName.toLowerCase(), null);
      if (!rec) {
        rec = { name: ownerName, salt: newSalt(), hash: '', limitMin: 0, unlimited: true, admin: true, created: Date.now() };
        await writeJSON(st, 'desk:' + ownerName.toLowerCase(), rec);
        const idx = await readJSON(st, 'desks', []);
        if (idx.indexOf(ownerName) < 0) { idx.push(ownerName); await writeJSON(st, 'desks', idx); }
      }
    } catch (e) {
      return json(500, { error: (e && e.message) || 'Storage is not configured yet.' });
    }
    await rlReset(rlKey);
    return json(200, { ok: true, token: sign({ desk: ownerName, role: 'admin', exp }), desk: ownerName, role: 'admin' });
  }

  // Desk login: name + password.
  const name = (b.desk || '').toString().trim();
  if (!name) return json(400, { error: 'Enter your desk name.' });
  const rec = await readJSON(st, 'desk:' + name.toLowerCase(), null);
  if (!rec) return json(401, { error: 'No desk by that name. Ask the admin to create it.' });
  if (rec.hash !== hashPw(b.password || '', rec.salt)) return json(401, { error: 'Wrong password for this desk.' });
  const role = rec.admin ? 'admin' : 'member';
  await rlReset(rlKey);
  return json(200, { ok: true, token: sign({ desk: rec.name, role, exp }), desk: rec.name, role });
};
