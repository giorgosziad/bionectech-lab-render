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

  /* SIZE_PROBE: writes test values of increasing size with the server's own credentials, so the storage limit is measured rather than guessed. */
  if (event.httpMethod === 'GET' && (event.queryStringParameters || {}).sizeprobe) {
    if (user.role !== 'admin') return json(403, { error: 'admin only' });
    const out = [];
    for (const kb of [1, 500, 2000, 11000]) {
      try { await writeJSON(st, 'probe:' + kb, { pad: 'x'.repeat(kb * 1024) }); out.push(kb + 'KB: OK'); }
      catch (e) { out.push(kb + 'KB: FAIL - ' + (e && e.message ? e.message : String(e))); }
    }
    return json(200, { probe: out });
  }
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
    // PARTIAL WRITE: {data:{project:{...}}} saves ONE project into the stored archive
    // WITHOUT shipping the whole thing. The stored copy is read, this one project is
    // replaced or appended, and the result is written back. NOTHING is ever deleted here.
    // The two-window merge that used to live in the browser now lives on the server, where
    // it belongs - a stale window can no longer clobber a fresher one.
    // APPEND_TURN: the smallest possible durable write. A full-project save for a large
    // project is megabytes and takes seconds - long enough that a reload kills it and the
    // last turns are lost. This appends ONE turn, a few KB, so the write completes in
    // milliseconds and survives page teardown via keepalive. Idempotent on turn ts+role
    // so a retry can never double-post.
    if (incoming && incoming.appendTo && incoming.turn) {
      /* APPEND_TRACE: the append was returning 500 with no diagnostic. Log the real error. */
      try {
      const akey = 'data:' + user.desk.toLowerCase();
      const cur = await readJSON(st, akey, { projects: [], notes: [] });
      const list = Array.isArray(cur.projects) ? cur.projects : [];
      let hit = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === incoming.appendTo) { hit = i; break; }
      }
      if (hit < 0) return json(404, { error: 'Project not found for append.' });
      const proj = list[hit];
      proj.turns = Array.isArray(proj.turns) ? proj.turns : [];
      const t = incoming.turn;
      const dup = proj.turns.some(function (x) {
        return x && x.ts === t.ts && x.role === t.role;
      });
      if (!dup) { proj.turns.push(t); }
      proj.updated = Date.now();
      await writeJSON(st, akey, { projects: list.slice(0, 500), notes: cur.notes || [], updated: Date.now() });
      return json(200, { ok: true, appended: !dup, turns: proj.turns.length });
      } catch (e) { console.log('[append] FAILED: ' + (e && e.message ? e.message : String(e)) + ' | ' + (e && e.stack ? e.stack : '')); return json(500, { error: String(e && e.message ? e.message : e) }); }
    }
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
        /* NEVER_SHRINK: a client copy with FEWER turns than the stored one is stale - it was read before the newest appends landed. Accepting it would erase them. Only ever grow. */
        /* NEVER_SHRINK guard REMOVED - it was rejecting legitimate saves and froze the archive. */
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
