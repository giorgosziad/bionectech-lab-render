// memory.js — automatic long-term memory for Karam and Nicolle.
// Two layers: shared facts (both personas) + per-persona working notes.
// Survives across sessions/projects/devices because it lives in Upstash, not the browser.
const { cors, json, userFrom, readJSON, writeJSON } = require('./lib/auth');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CHEAP_MODEL = 'claude-sonnet-4-6';  // sharper memory writer — better at keeping what matters
const MAX_SHARED = 40000;  // larger durable memory — retains more across sessions
const MAX_NOTES = 20000;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(event), body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });
  const desk = (user.desk || '').toLowerCase();
  if (!desk) return json(400, { error: 'No desk.' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { b = {}; }
  const persona = (b.persona === 'nicolle') ? 'nicolle' : 'karam';
  const personaName = persona === 'nicolle' ? 'Nicolle' : 'Karam';
  const sharedKey = 'mem:shared:' + desk;
  const notesKey = 'mem:notes:' + persona + ':' + desk;

  // LIVE: instantly record what this persona is working on right now (no model call - cheap + immediate)
  if (b.action === 'live') {
    const note = String(b.note || '').slice(0, 1200);
    try { await writeJSON(null, 'mem:live:' + persona + ':' + desk, { note: note, ts: Date.now() }); } catch (e) {}
    return json(200, { ok: true });
  }

  // VIEWALL: admin sees everything stored (shared facts, both personas' notes, both live notes)
  if (b.action === 'viewall') {
    if (user.role !== 'admin') return json(403, { error: 'Admin only.' });
    var out = { ok: true, shared: '', karamNotes: '', nicolleNotes: '', karamLive: '', nicolleLive: '' };
    try { out.shared = (await readJSON(null, 'mem:shared:' + desk, '')) || ''; } catch (e) {}
    try { out.karamNotes = (await readJSON(null, 'mem:notes:karam:' + desk, '')) || ''; } catch (e) {}
    try { out.nicolleNotes = (await readJSON(null, 'mem:notes:nicolle:' + desk, '')) || ''; } catch (e) {}
    try { var kl = await readJSON(null, 'mem:live:karam:' + desk, null); out.karamLive = (kl && kl.note) || ''; } catch (e) {}
    try { var nl = await readJSON(null, 'mem:live:nicolle:' + desk, null); out.nicolleLive = (nl && nl.note) || ''; } catch (e) {}
    return json(200, out);
  }

  // CLEARALL: admin wipes every memory store for this desk
  if (b.action === 'clearall') {
    if (user.role !== 'admin') return json(403, { error: 'Admin only.' });
    var keys = ['mem:shared:' + desk, 'mem:notes:karam:' + desk, 'mem:notes:nicolle:' + desk, 'mem:live:karam:' + desk, 'mem:live:nicolle:' + desk];
    for (var i = 0; i < keys.length; i++) { try { await writeJSON(null, keys[i], ''); } catch (e) {} }
    return json(200, { ok: true, cleared: true });
  }

  // GET: return current memory (for a viewer/clear UI)
  if (b.action === 'get') {
    let shared = '', notes = '';
    try { shared = (await readJSON(null, sharedKey, '')) || ''; } catch (e) {}
    try { notes = (await readJSON(null, notesKey, '')) || ''; } catch (e) {}
    return json(200, { ok: true, shared: shared, notes: notes });
  }

  // CLEAR: wipe memory (operator control)
  if (b.action === 'clear') {
    try { await writeJSON(null, sharedKey, ''); } catch (e) {}
    try { await writeJSON(null, notesKey, ''); } catch (e) {}
    return json(200, { ok: true, cleared: true });
  }

  // UPDATE: fold new conversation into durable memory using the cheap brain.
  if (b.action === 'update') {
    const convo = String(b.convo || '').slice(0, 24000);
    if (!convo.trim()) return json(200, { ok: true, skipped: 'empty' });

    const key = process.env.ANTHROPIC_API_KEY || '';
    if (!key) return json(500, { error: 'Server missing ANTHROPIC_API_KEY.' });

    let prevShared = '', prevNotes = '';
    try { prevShared = (await readJSON(null, sharedKey, '')) || ''; } catch (e) {}
    try { prevNotes = (await readJSON(null, notesKey, '')) || ''; } catch (e) {}

    const sys = 'You maintain long-term memory for an AI assistant working with an operator named Giorgos at Bionectech. '
      + 'From the NEW conversation, update two memory stores and return ONLY JSON: '
      + '{"shared":"...","notes":"..."}. '
      + 'SHARED = durable facts true across all work: decisions made, project names and their state, people, preferences, key numbers, standing rules. Both assistants rely on it. '
      + 'NOTES = this assistant\'s own working context (' + personaName + '): in-progress tasks, what to do next, persona-specific reminders. '
      + 'Rules: MERGE with the previous values, do not drop still-relevant facts; remove only what is clearly outdated or corrected; keep both tight and factual; no chit-chat; '
      + 'SHARED under ' + MAX_SHARED + ' chars, NOTES under ' + MAX_NOTES + ' chars. If nothing new is worth keeping, return the previous values unchanged.';

    const usr = 'Previous SHARED:\n' + (prevShared || '(empty)')
      + '\n\nPrevious NOTES (' + personaName + '):\n' + (prevNotes || '(empty)')
      + '\n\nNEW conversation to fold in:\n' + convo
      + '\n\nReturn ONLY the JSON object.';

    let text = '';
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: CHEAP_MODEL, max_tokens: 4000, system: sys, messages: [{ role: 'user', content: usr }] })
      });
      const j = await r.json();
      if (!r.ok) return json(200, { ok: false, error: (j && j.error && j.error.message) || ('HTTP ' + r.status) });
      text = ((j.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('')) || '';
    } catch (e) {
      return json(200, { ok: false, error: String((e && e.message) || e) });
    }

    let parsed = null;
    try {
      const m = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(m.slice(m.indexOf('{'), m.lastIndexOf('}') + 1));
    } catch (e) { parsed = null; }
    if (!parsed) return json(200, { ok: false, error: 'parse', raw: text.slice(0, 200) });

    const newShared = String(parsed.shared || prevShared || '').slice(0, MAX_SHARED);
    const newNotes = String(parsed.notes || prevNotes || '').slice(0, MAX_NOTES);
    try { await writeJSON(null, sharedKey, newShared); } catch (e) {}
    try { await writeJSON(null, notesKey, newNotes); } catch (e) {}
    return json(200, { ok: true, shared: newShared, notes: newNotes });
  }

  return json(400, { error: 'Unknown action.' });
};
