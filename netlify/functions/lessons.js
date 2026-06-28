// lessons.js — Karam's operating lessons, gated by Bionectech values, with an
// append-only audit log of every decision.
//   - Anyone signed in can SUGGEST a lesson. It is vetted against the values;
//     aligned -> PENDING queue for admin approval; conflicting -> blocked.
//   - Admins ADD directly (still vetted), APPROVE/REJECT pending, manage links.
//   - Only APPROVED lessons (engine:lessons) are injected into Karam's chat.
//   - Every add/approve/reject/block/remove is recorded in engine:lessons:audit.
const { cors, json, userFrom, readJSON, writeJSON } = require('./lib/auth');
const { valuesText } = require('./lib/values');

const LESSONS_KEY = 'engine:lessons';
const PENDING_KEY = 'engine:lessons:pending';
const LINKS_KEY = 'engine:links';
const AUDIT_KEY = 'engine:lessons:audit';

function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function clip(s, n) { return (s == null ? '' : String(s)).slice(0, n); }

async function vet(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, reason: 'Values check is unavailable (API key not set).' };
  const sys = 'You are the values gatekeeper for Bionectech\'s AI assistant. Decide whether a proposed operating lesson ALIGNS with Bionectech\'s values or CONFLICTS with them. Be strict about the FLOOR values: patient safety; honesty with no false or overstated medical claims; confidentiality and HIPAA / protecting patient or proprietary data. A lesson CONFLICTS if it would weaken any floor value, encourage unsafe medical guidance, encourage dishonesty or hype, or push the assistant to expose confidential or proprietary data. Reply with ONLY compact JSON and nothing else: {"aligned":true|false,"reason":"one short sentence"}.\n\nBionectech values:\n' + valuesText();
  const body = { model: 'claude-haiku-4-5-20251001', max_tokens: 200, system: sys, messages: [{ role: 'user', content: 'Proposed lesson:\n"' + clip(text, 1000) + '"' }] };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (j && j.error) return { ok: false, reason: 'Values check error: ' + ((j.error && j.error.message) || 'unknown') };
    const txt = (j.content || []).map(function (c) { return c.type === 'text' ? c.text : ''; }).join('').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed || typeof parsed.aligned !== 'boolean') return { ok: false, reason: 'Values check returned no clear verdict; try again.' };
    return { ok: true, aligned: parsed.aligned, reason: clip(parsed.reason, 200) };
  } catch (e) { return { ok: false, reason: 'Values check could not run right now; try again.' }; }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });

  let lessons = await readJSON(null, LESSONS_KEY, []);
  let pending = await readJSON(null, PENDING_KEY, []);
  let links = await readJSON(null, LINKS_KEY, []);
  let audit = await readJSON(null, AUDIT_KEY, []);
  if (!Array.isArray(lessons)) lessons = [];
  if (!Array.isArray(pending)) pending = [];
  if (!Array.isArray(links)) links = [];
  if (!Array.isArray(audit)) audit = [];

  async function addAudit(ev) {
    audit.push({ ts: Date.now(), action: ev.action, by: ev.by || '', text: clip(ev.text, 240), suggestedBy: ev.suggestedBy || '', reason: clip(ev.reason, 200) });
    audit = audit.slice(-200);
    await writeJSON(null, AUDIT_KEY, audit);
  }
  function out() { return { lessons: lessons, pending: pending, links: links, audit: audit }; }

  if (event.httpMethod === 'GET') {
    if (user.role !== 'admin') return json(403, { error: 'Admins only.' });
    return json(200, out());
  }

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON.' }); }
  const action = b.action;

  // SUGGEST — any signed-in user. Vetted, then queued for approval.
  if (action === 'suggest') {
    const text = clip(b.text, 1000).trim();
    if (!text) return json(400, { error: 'Empty suggestion.' });
    const v = await vet(text);
    if (!v.ok) return json(503, { error: v.reason });
    if (!v.aligned) { await addAudit({ action: 'blocked', by: user.desk, text: text, reason: v.reason }); return json(409, { aligned: false, error: 'Does not align with Bionectech values: ' + v.reason }); }
    pending.push({ id: id(), text: text, by: user.desk, ts: Date.now(), reason: v.reason });
    pending = pending.slice(-100);
    await writeJSON(null, PENDING_KEY, pending);
    await addAudit({ action: 'suggested', by: user.desk, text: text, reason: v.reason });
    return json(200, { ok: true, queued: true, message: 'Aligned — sent to the admin for approval.', reason: v.reason });
  }

  // Admin-only below.
  if (user.role !== 'admin') return json(403, { error: 'Admins only.' });

  if (action === 'addLesson') {
    const text = clip(b.text, 1000).trim();
    if (!text) return json(400, { error: 'Empty lesson.' });
    const v = await vet(text);
    if (!v.ok) return json(503, { error: v.reason });
    if (!v.aligned) { await addAudit({ action: 'blocked', by: user.desk, text: text, reason: v.reason }); return json(409, { aligned: false, error: 'Blocked — conflicts with Bionectech values: ' + v.reason }); }
    lessons.push({ id: id(), text: text, ts: Date.now(), by: user.desk, reason: v.reason });
    lessons = lessons.slice(-100);
    await writeJSON(null, LESSONS_KEY, lessons);
    await addAudit({ action: 'added', by: user.desk, text: text, reason: v.reason });
    return json(200, out());
  }
  if (action === 'approve') {
    const item = pending.find(function (p) { return p && p.id === b.id; });
    if (!item) return json(404, { error: 'Suggestion not found.' });
    lessons.push({ id: id(), text: item.text, ts: Date.now(), by: item.by, reason: item.reason || '', approvedBy: user.desk });
    lessons = lessons.slice(-100);
    pending = pending.filter(function (p) { return p && p.id !== b.id; });
    await writeJSON(null, LESSONS_KEY, lessons);
    await writeJSON(null, PENDING_KEY, pending);
    await addAudit({ action: 'approved', by: user.desk, text: item.text, suggestedBy: item.by, reason: item.reason });
    return json(200, out());
  }
  if (action === 'reject') {
    const ritem = pending.find(function (p) { return p && p.id === b.id; });
    pending = pending.filter(function (p) { return p && p.id !== b.id; });
    await writeJSON(null, PENDING_KEY, pending);
    if (ritem) await addAudit({ action: 'rejected', by: user.desk, text: ritem.text, suggestedBy: ritem.by, reason: ritem.reason });
    return json(200, out());
  }
  if (action === 'delLesson') {
    const ditem = lessons.find(function (l) { return l && l.id === b.id; });
    lessons = lessons.filter(function (l) { return l && l.id !== b.id; });
    await writeJSON(null, LESSONS_KEY, lessons);
    if (ditem) await addAudit({ action: 'removed', by: user.desk, text: ditem.text });
    return json(200, out());
  }
  if (action === 'clearAudit') {
    audit = [];
    await writeJSON(null, AUDIT_KEY, audit);
    return json(200, out());
  }
  if (action === 'addLink') {
    const label = clip(b.label, 80).trim();
    let url = clip(b.url, 400).trim();
    if (!label || !url) return json(400, { error: 'Need label and url.' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    links.push({ id: id(), label: label, url: url });
    links = links.slice(-50);
    await writeJSON(null, LINKS_KEY, links);
    return json(200, out());
  }
  if (action === 'delLink') {
    links = links.filter(function (l) { return l && l.id !== b.id; });
    await writeJSON(null, LINKS_KEY, links);
    return json(200, out());
  }
  return json(400, { error: 'Unknown action.' });
};
