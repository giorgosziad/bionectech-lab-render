// unlock.js — verifies the owner code against the OWNER_CODE env var.
// Returns ok=true only on an exact match. The code itself is never sent to
// the browser; the browser only learns whether its attempt was correct.
const { cors, json, userFrom, rlHit, rlReset, clientIp } = require('./lib/auth');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON.' }); }
  const ip = clientIp(event);
  const rlKey = 'rl:unlock:' + ip + ':' + (user.desk||'').toLowerCase();
  const attempts = await rlHit(rlKey, 900);
  if (attempts > 8) return json(429, { error: 'Too many code attempts. Please wait a few minutes.' });
  const configured = !!process.env.OWNER_CODE;
  const code = (b.code || '').toString();
  const ok = configured && code.length > 0 && code === String(process.env.OWNER_CODE);
  if (ok) await rlReset(rlKey);
  return json(200, { ok: ok, configured: configured });
};
