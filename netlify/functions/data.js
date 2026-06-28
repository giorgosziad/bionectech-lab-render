// data.js — each desk's own projects + notes, private and server-enforced.
// GET            -> my desk's data
// GET ?desk=NAME -> that desk's data (ADMIN ONLY: "the admin sees all")
// POST {data}    -> save my desk's data
const { cors, json, userFrom, store, readJSON, writeJSON } = require('./lib/auth');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });

  const st = await store();

  if (event.httpMethod === 'GET') {
    const asked = (event.queryStringParameters && event.queryStringParameters.desk) || '';
    let target = user.desk;
    if (asked && asked.toLowerCase() !== user.desk.toLowerCase()) {
      if (user.role !== 'admin') return json(403, { error: 'You can only see your own desk.' });
      target = asked; // admin viewing someone else
    }
    const data = await readJSON(st, 'data:' + target.toLowerCase(), { projects: [], notes: [] });
    return json(200, { ok: true, desk: target, data });
  }

  if (event.httpMethod === 'POST') {
    let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Body must be JSON.' }); }
    const incoming = b.data || {};
    const safe = {
      projects: Array.isArray(incoming.projects) ? incoming.projects.slice(0, 500) : [],
      notes: Array.isArray(incoming.notes) ? incoming.notes.slice(0, 1000) : [],
      updated: Date.now()
    };
    // A user can only ever write to their OWN desk.
    await writeJSON(st, 'data:' + user.desk.toLowerCase(), safe);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Use GET or POST.' });
};
