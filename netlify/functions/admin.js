// admin.js — ADMIN ONLY. Manage desks: create, change password (admin only),
// set time limits, reset/add time, list everyone with their activity, and view
// any desk's work. Requires an admin session token.
const { cors, json, userFrom, newSalt, hashPw, store, readJSON, writeJSON, del, todayKey } = require('./lib/auth');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });
  if (user.role !== 'admin') return json(403, { error: 'Admins only.' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Body must be JSON.' }); }
  const st = await store();
  const action = (b.action || '').toString();
  const idxKey = 'desks';

  async function loadIndex() { return await readJSON(st, idxKey, []); }
  async function addToIndex(name) { const idx = await loadIndex(); if (idx.indexOf(name) < 0) { idx.push(name); await writeJSON(st, idxKey, idx); } }

  if (action === 'list') {
    const idx = await loadIndex();
    const rows = [];
    for (const name of idx) {
      const rec = await readJSON(st, 'desk:' + name.toLowerCase(), null);
      const u = await readJSON(st, 'usage:' + name.toLowerCase(), { usedMin: 0, lastActive: 0, date: todayKey() });
      const today = (u.date === todayKey()) ? u : { usedMin: 0, lastActive: u.lastActive || 0 };
      rows.push({
        name, admin: !!(rec && rec.admin), unlimited: !!(rec && rec.unlimited),
        limitMin: (rec && typeof rec.limitMin === 'number') ? rec.limitMin : 480,
        usedMin: today.usedMin || 0, lastActive: today.lastActive || 0
      });
    }
    return json(200, { ok: true, desks: rows });
  }

  if (action === 'create') {
    const name = (b.name || '').toString().trim();
    if (!name) return json(400, { error: 'Desk name required.' });
    const key = 'desk:' + name.toLowerCase();
    const exists = await readJSON(st, key, null);
    if (exists) return json(409, { error: 'A desk with that name already exists.' });
    const salt = newSalt();
    const rec = {
      name, salt, hash: hashPw(b.password || '', salt),
      limitMin: (typeof b.limitMin === 'number') ? b.limitMin : 480,
      unlimited: !!b.unlimited, admin: !!b.admin, created: Date.now()
    };
    await writeJSON(st, key, rec);
    await addToIndex(name);
    return json(200, { ok: true });
  }

  // ADMIN-ONLY password change for any desk.
  if (action === 'setpw') {
    const name = (b.name || '').toString().trim();
    const rec = await readJSON(st, 'desk:' + name.toLowerCase(), null);
    if (!rec) return json(404, { error: 'No such desk.' });
    rec.salt = newSalt(); rec.hash = hashPw(b.password || '', rec.salt);
    await writeJSON(st, 'desk:' + name.toLowerCase(), rec);
    return json(200, { ok: true });
  }

  if (action === 'setlimit') {
    const name = (b.name || '').toString().trim();
    const rec = await readJSON(st, 'desk:' + name.toLowerCase(), null);
    if (!rec) return json(404, { error: 'No such desk.' });
    if (b.unlimited === true) { rec.unlimited = true; }
    else { rec.unlimited = false; rec.limitMin = Math.max(1, Math.round(Number(b.limitMin) || 480)); }
    await writeJSON(st, 'desk:' + name.toLowerCase(), rec);
    return json(200, { ok: true });
  }

  if (action === 'resettime' || action === 'addtime') {
    const name = (b.name || '').toString().trim();
    let u = await readJSON(st, 'usage:' + name.toLowerCase(), { date: todayKey(), usedMin: 0, lastActive: 0 });
    if (u.date !== todayKey()) u = { date: todayKey(), usedMin: 0, lastActive: 0 };
    if (action === 'resettime') u.usedMin = 0;
    else u.usedMin = Math.max(0, (u.usedMin || 0) - (Math.round(Number(b.minutes) || 60)));
    await writeJSON(st, 'usage:' + name.toLowerCase(), u);
    return json(200, { ok: true });
  }

  if (action === 'delete') {
    const name = (b.name || '').toString().trim();
    await del('desk:' + name.toLowerCase());
    await del('usage:' + name.toLowerCase());
    await del('data:' + name.toLowerCase());
    const idx = await loadIndex();
    await writeJSON(st, idxKey, idx.filter(function (n) { return n.toLowerCase() !== name.toLowerCase(); }));
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unknown action.' });
};
