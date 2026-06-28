// me.js — who am I, my time budget, and a heartbeat that accrues active time.
// GET  -> { desk, role, limitMin, unlimited, usedMin, remainingMin }
// POST { action:'tick' } -> adds 1 active minute (call ~once a minute from the client)
const { cors, json, userFrom, store, readJSON, writeJSON, todayKey } = require('./lib/auth');

async function usageFor(st, name) {
  let u = await readJSON(st, 'usage:' + name.toLowerCase(), null);
  if (!u || u.date !== todayKey()) u = { date: todayKey(), usedMin: 0, lastActive: 0 };
  return u;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });

  const st = await store();
  const rec = await readJSON(st, 'desk:' + user.desk.toLowerCase(), null);
  const unlimited = !rec || rec.unlimited || user.role === 'admin';
  const limitMin = (rec && typeof rec.limitMin === 'number') ? rec.limitMin : 480;

  let u = await usageFor(st, user.desk);

  if (event.httpMethod === 'POST') {
    let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
    if (b.action === 'tick') {
      if (!unlimited) u.usedMin += 1;
      u.lastActive = Date.now();
      await writeJSON(st, 'usage:' + user.desk.toLowerCase(), u);
    }
  }

  const remainingMin = unlimited ? Infinity : Math.max(0, limitMin - u.usedMin);
  return json(200, {
    ok: true, desk: user.desk, role: user.role,
    unlimited, limitMin, usedMin: u.usedMin,
    remainingMin: (remainingMin === Infinity ? -1 : remainingMin)
  });
};
