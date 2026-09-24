// brief.js - BNT_KANON_BRIEF: "Kanon, write the brief".
// The operator gives what they want, the record (chat exports, notes, desk outputs - any size, sent in parts)
// and the target files. Kanon reads the record in parts, reconciles decisions (latest operator ruling wins),
// the server counts the target files, Kanon writes a plain-language brief, and the server test-plans it with
// the same proof missions use. Result: the brief, a decision record with line numbers, and flags.
// Admin only, behind the Missions code. Also stores Kanon's standing knowledge.
(function () {
  'use strict';
  const crypto = require('crypto');
  const { cors, json, userFrom, readJSON, writeJSON, expire, clientIp } = require('./lib/auth');
  const accessGate = require('./lib/gate');
  const kanon = require('./lib/kanon');
  const DEFAULT_KNOWLEDGE = require('./lib/kanon-knowledge');
  const KNOW_KEY = 'kanon:knowledge', INDEX_KEY = 'kbriefs:index', TTL = 30 * 24 * 3600;
  const MAX_RECORD = 8000000, MAX_PART = 900000, MAX_FILES_TOTAL = 4000000;
  const buffers = {};   // id -> { record: [string], files: {name: text}, want } kept in memory until the run starts

  function newId() { return 'B' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }
  async function loadB(id) { if (!/^B[a-z0-9]+$/.test(String(id || ''))) return null; return await readJSON(null, 'kbrief:' + id, null); }
  async function saveB(b) { b.updatedAt = Date.now(); await writeJSON(null, 'kbrief:' + b.id, b); try { await expire('kbrief:' + b.id, TTL); } catch (e) {} }
  async function knowledge() { const k = await readJSON(null, KNOW_KEY, null); return (k && typeof k.text === 'string' && k.text.trim()) ? { text: k.text, isDefault: false, updatedAt: k.updatedAt || 0 } : { text: DEFAULT_KNOWLEDGE, isDefault: true, updatedAt: 0 }; }
  function view(b) { return { id: b.id, status: b.status, stage: b.stage || '', want: b.want || '', fileNames: b.fileNames || [], recordChars: b.recordChars || 0, createdAt: b.createdAt, updatedAt: b.updatedAt, reason: b.reason || '', result: b.result || null }; }

  async function run(id) {
    const buf = buffers[id]; const b = await loadB(id);
    if (!buf || !b) return;
    delete buffers[id];
    let lastSave = 0;
    const progress = function (p) { b.stage = p.stage; const now = Date.now(); if (now - lastSave > 1500) { lastSave = now; saveB(b).catch(function () {}); } };
    try {
      const mission = require('./mission');
      const validate = function (plan) { return mission._test.validatePlan(plan, buf.files, b.want, []); };
      const k = await knowledge();
      const res = await kanon.writeBrief({ want: buf.want, record: buf.record.join(''), files: buf.files, knowledge: k.text, validate: validate }, progress);
      if (res.ok) { b.status = 'done'; b.stage = 'Brief written and test-planned (' + res.plannedSteps + ' steps)'; b.result = res; }
      else { b.status = 'failed'; b.stage = 'Kanon could not finish'; b.reason = res.reason; b.result = { partsRead: res.partsRead, itemsFound: res.itemsFound }; }
    } catch (e) { b.status = 'failed'; b.stage = 'Kanon could not finish'; b.reason = String((e && e.message) || e).slice(0, 600); }
    await saveB(b);
  }

  function makeHandler() { return async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
    const user = userFrom(event);
    if (!user) return json(401, { error: 'Sign in first.' });
    if (user.role !== 'admin') return json(403, { error: 'Kanon briefs are admin-only.' });
    const q = event.queryStringParameters || {};
    let b = {};
    if (event.body) { try { b = JSON.parse(event.body); } catch (e) { return json(400, { error: 'Bad request.' }); } }
    const action = String(q.action || b.action || '');
    if (!(await accessGate.isUnlocked('missions', user))) return json(423, { error: accessGate.lockedMessage('missions'), locked: true });
    try {
      if (action === 'knowledge-get') return json(200, Object.assign({ ok: true }, await knowledge()));
      if (action === 'knowledge-set') {
        const text = String(b.text || '');
        if (text.length > 40000) return json(413, { error: 'Standing knowledge is over 40,000 characters.' });
        if (!text.trim()) { await writeJSON(null, KNOW_KEY, { text: '', updatedAt: Date.now() }); return json(200, { ok: true, isDefault: true }); }
        await writeJSON(null, KNOW_KEY, { text: text, updatedAt: Date.now(), by: String(user.name || user.email || '') });
        return json(200, { ok: true, isDefault: false });
      }
      if (action === 'create') {
        const want = String(b.want || '').trim();
        if (!want) return json(400, { error: 'Say in a few words what you want delivered.' });
        const files = {}; let total = 0;
        (Array.isArray(b.files) ? b.files : []).slice(0, 8).forEach(function (f) { if (f && f.name && typeof f.text === 'string') { files[String(f.name).slice(0, 120)] = f.text; total += f.text.length; } });
        if (total > MAX_FILES_TOTAL) return json(413, { error: 'Target files are over 4 MB in total.' });
        const id = newId();
        buffers[id] = { record: [], files: files, want: want.slice(0, 20000) };
        const rec = { id: id, status: 'receiving', stage: 'Receiving the record', want: want.slice(0, 20000), fileNames: Object.keys(files), recordChars: 0, createdAt: Date.now() };
        await saveB(rec);
        let ids = await readJSON(null, INDEX_KEY, []); if (!Array.isArray(ids)) ids = [];
        ids.unshift(id); await writeJSON(null, INDEX_KEY, ids.slice(0, 30));
        return json(200, { ok: true, id: id });
      }
      if (action === 'append') {
        const id = String(b.id || ''); const buf = buffers[id];
        if (!buf) return json(404, { error: 'That brief is not receiving any more. Start again.' });
        const part = String(b.part || '');
        if (part.length > MAX_PART) return json(413, { error: 'Record part too large.' });
        const size = buf.record.reduce(function (n, x) { return n + x.length; }, 0) + part.length;
        if (size > MAX_RECORD) return json(413, { error: 'The record is over 8 MB after removing repeats. Send the most relevant part.' });
        buf.record.push(part);
        return json(200, { ok: true, recordChars: size });
      }
      if (action === 'start') {
        const id = String(b.id || ''); const rec = await loadB(id);
        if (!rec || !buffers[id]) return json(404, { error: 'That brief is not ready to start. Start again.' });
        rec.status = 'running'; rec.stage = 'Kanon is starting'; rec.recordChars = buffers[id].record.reduce(function (n, x) { return n + x.length; }, 0);
        await saveB(rec);
        setImmediate(function () { run(id).catch(function () {}); });
        return json(200, { ok: true, id: id });
      }
      if (action === 'get') { const rec = await loadB(String(q.id || b.id || '')); return rec ? json(200, { ok: true, brief: view(rec) }) : json(404, { error: 'No such brief.' }); }
      if (action === 'list') {
        let ids = await readJSON(null, INDEX_KEY, []); if (!Array.isArray(ids)) ids = [];
        const out = []; for (let i = 0; i < Math.min(ids.length, 10); i++) { const rec = await loadB(ids[i]); if (rec) { const v = view(rec); delete v.result; out.push(v); } }
        return json(200, { ok: true, briefs: out });
      }
      return json(400, { error: 'Unknown action. Use knowledge-get, knowledge-set, create, append, start, get or list.' });
    } catch (e) { return json(500, { error: String((e && e.message) || e) }); }
  }; }

  module.exports = { handler: makeHandler() };
})();
