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
  // OVERSIZE_WRITE_GUARD: a current client sends a partial write (a few KB). Only a
  // STALE client running pre-partial-write code sends the whole ~9.8MB archive, and
  // that write saturates the shared 6-second store budget, starving job delivery and
  // hanging every persona. Reject anything implausibly large BEFORE it touches the
  // store. The threshold is far above any legitimate single-project or partial write
  // and far below a full-archive dump.
  try {
    var _bodyLen = (event.body || '').length;
    if (_bodyLen > 500000) {
      return json(413, { error: 'Write too large (' + _bodyLen + ' bytes). Reload the page - this client is running an outdated version.', stale: true });
    }
  } catch (e) {}
    const incoming = b.data || {};
    // PARTIAL WRITE: {data:{project:{...}}} saves ONE project into the stored archive
    // WITHOUT shipping the whole thing. The stored copy is read, this one project is
    // replaced or appended, and the result is written back. NOTHING is ever deleted here.
    // The two-window merge that used to live in the browser now lives on the server, where
    // it belongs - a stale window can no longer clobber a fresher one.
    if (incoming && incoming.project && incoming.project.id) {
      const pkey = 'data:' + user.desk.toLowerCase();
      const cur = await readJSON(st, pkey, { projects: [], notes: [] });
      const list = Array.isArray(cur.projects) ? cur.projects : [];
      const p = incoming.project;
      let hit = -1;
      for (let i = 0; i < list.length; i++) { if (list[i] && list[i].id === p.id) { hit = i; break; } }
      if (hit < 0) { list.push(p); }
      else {
        const oldT = (list[hit].turns || []).length;
        const newT = (p.turns || []).length;
        // more turns wins; equal turns, fresher stamp wins; otherwise KEEP what is stored
        if (newT > oldT || (newT === oldT && (p.updated || 0) >= (list[hit].updated || 0))) { list[hit] = p; }
      }
      const out = {
        projects: list.slice(0, 500),
        notes: Array.isArray(incoming.notes) ? incoming.notes.slice(0, 1000) : (cur.notes || []),
        updated: Date.now()
      };
      await writeJSON(st, pkey, out);
      return json(200, { ok: true, partial: true, projects: out.projects.length });
    }
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
