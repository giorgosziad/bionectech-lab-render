// mission.js - Bionectech AI Lab missions (BNT_MISSIONS v1): the Gilead/Biomni layer.
//
// Biomni pattern (agent + tool environment, plan -> execute -> observe -> iterate):
//   1. Hanna turns the operator brief into a JSON plan of steps over a fixed tool registry.
//   2. The server validates the plan, then executes each step itself - no browser needed.
//   3. Every step is observed: checks on the output, retries with the exact failure reason,
//      and one replan by Hanna if a step still fails.
// Gilead pattern (governed enterprise AI):
//   4. Regulated work (FDA / device / clinical-claim / posture wording) always gets a required
//      Solon review; the server inserts it if the plan omits it.
//   5. Every event is written to an audit log; one email reports the whole mission, with the
//      delivered files attached. A mission ends DELIVERED or ESCALATED - never silently.
//
// Tools: desk, edit_file (uses job.js: anchored edits + code gate), review, fetch_url.
// Keys: hmis:<id> record, hmisf:<id> attached files, hmis:index newest ids.
(function () {
  'use strict';
  const crypto = require('crypto');
  const { cors, json, userFrom, readJSON, writeJSON, expire, clientIp } = require('./lib/auth');
  const accessGate = require('./lib/gate');

  const DESKS = ['hanna', 'karam', 'karim', 'galen', 'elias', 'kostas', 'elena', 'solon', 'nour', 'jabir', 'lukas', 'hanno', 'fotis', 'yusuf', 'sinan', 'platon', 'kyros', 'giorgos'];
  // Only roles confirmed in the Lab are described; the rest are listed by name, never invented.
  const ROLES = {
    hanna: 'supervisor and planner',
    karam: 'builder - files, code, documents',
    karim: 'quality gate - technical review of deliverables',
    solon: 'legal and regulatory - required reviewer for regulated wording',
    hanno: 'copy gate - public wording and banned-term rulings',
    giorgos: 'founder standards review'
  };
  const TOOLS = ['desk', 'edit_file', 'review', 'fetch_url'];
  const MAX_STEPS = 10, DESK_TRIES = 3, MAX_REVISIONS = 2, PLAN_TRIES = 3;
  const JOB_WAIT_MS = 25 * 60 * 1000, STALE_MS = 5 * 60 * 1000, KEEP_SECONDS = 60 * 60 * 24 * 30;
  const REGULATED = /\b(FDA|regulator\w*|520\(o\)|HIPAA|CDS|clinical claims?|posture|labell?ing|medical device|clearance|510\(k\)|premarket)\b/i;
  const INDEX_KEY = 'hmis:index';
  const RUNNING = {};

  function now() { return Date.now(); }
  function sha256(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }
  function newId() { return 'M' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }
  function countOf(hay, needle) { if (!needle) return 0; let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; }
  function countCI(hay, needle) { return countOf(String(hay).toLowerCase(), String(needle).toLowerCase()); }
  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().slice(0, 120); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ------------------------------------------------------------ desk call ------------------
  async function callDesk(persona, prompt, user, ctx, model) {
    const chat = require('./chat');
    const body = { prompt: prompt, history: [], files: [], model: model || '', mode: 'answer', temperature: 0.2, engine: false, ownerCode: ctx.ownerCode || '', web: false, fast: false, smart: false, persona: persona };
    const ev = { httpMethod: 'POST', headers: ctx.headers || {}, body: JSON.stringify(body), queryStringParameters: {}, path: '/.netlify/functions/chat' };
    const out = await chat.handleChat(ev, user, null, null);
    let p = null;
    try { p = JSON.parse((out && out.body) || '{}'); } catch (e) {}
    if (!out || out.statusCode < 200 || out.statusCode >= 300) throw new Error((p && p.error) || ('desk returned HTTP ' + (out && out.statusCode)));
    return String((p && (p.text || p.reply || p.answer)) || '');
  }
  function parseJsonBlock(text) {
    const t = String(text || ''), cands = [];
    const re = /```(?:json)?[^\n]*\n([\s\S]*?)```/g; let m;
    while ((m = re.exec(t)) !== null) cands.push(m[1]);
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a !== -1 && b > a) cands.push(t.slice(a, b + 1));
    for (let i = 0; i < cands.length; i++) { try { const v = JSON.parse(cands[i].trim()); if (v && typeof v === 'object') return v; } catch (e) {} }
    return null;
  }

  // ------------------------------------------------------------ planning -------------------
  function deskRoster() {
    return DESKS.map(function (d) { return d + (ROLES[d] ? (' (' + ROLES[d] + ')') : ''); }).join(', ');
  }
  function planPrompt(m, files, feedback, context) {
    const names = Object.keys(files);
    const L = [
      'HANNA MISSION PLANNING ' + m.id + ': ' + m.title,
      'You are Hanna, the Lab supervisor. Turn the operator brief into a plan the Lab SERVER will execute step by step. Return ONE ```json block: {"goal": "...", "steps": [ ... ]}. Anything outside the block is ignored.',
      'TOOLS:',
      '- desk: one desk produces a text deliverable. {"id","tool":"desk","desk","task","checks":{"required":[],"banned":[]}}',
      '- edit_file: change an attached file. The server has Karam write anchored edits, applies them and runs a code gate. {"id","tool":"edit_file","file":"<exact attached file name>","task","checks":{"required":[{"text","min","max"}],"banned":[]}}',
      '- review: a desk reviews an earlier step and must end with VERDICT: APPROVE or VERDICT: REVISE; on REVISE the server reruns that step with the required changes. {"id","tool":"review","desk","target":"<earlier step id>","criteria"}',
      '- fetch_url: fetch a public web page as text. {"id","tool":"fetch_url","url"}',
      'RULES: ids are short and unique (s1, s2, ...); a task or criteria may contain {{s1}} to insert the output of an EARLIER step; at most ' + MAX_STEPS + ' steps; never plan a step that asks the operator for anything; every edit_file names one of the attached files exactly; regulated wording (FDA, device, clinical claims, posture) must be reviewed by solon - the server adds that review if you omit it.',
      'DESKS: ' + deskRoster(),
      'ATTACHED FILES: ' + (names.length ? names.map(function (n) { return n + ' (' + files[n].length + ' chars)'; }).join(', ') : 'none')
    ];
    names.forEach(function (n) { L.push('--- preview of ' + n + ' (first 1500 chars) ---', files[n].slice(0, 1500)); });
    L.push('', 'OPERATOR BRIEF:', m.brief);
    if (context) L.push('', context);
    if (feedback) L.push('', 'YOUR PREVIOUS PLAN WAS REJECTED BY THE SERVER. Fix exactly this and return the whole plan again:', feedback);
    return L.join('\n');
  }
  function normChecks(c) {
    c = c || {};
    const banned = (Array.isArray(c.banned) ? c.banned : []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 50);
    const required = (Array.isArray(c.required) ? c.required : []).map(function (r) {
      if (typeof r === 'string') return r ? { text: r, min: 1, max: null } : null;
      if (!r || typeof r.text !== 'string' || !r.text) return null;
      const min = (r.min != null && isFinite(r.min)) ? Math.max(0, parseInt(r.min, 10)) : 1;
      const max = (r.max != null && isFinite(r.max)) ? Math.max(min, parseInt(r.max, 10)) : null;
      return { text: r.text, min: min, max: max };
    }).filter(Boolean).slice(0, 100);
    return { banned: banned, required: required };
  }
  // Returns { ok, steps, errors, governance } - steps validated, governance reviews inserted.
  function validatePlan(plan, files, brief, doneIds) {
    const errors = [], steps = [], seen = {};
    (doneIds || []).forEach(function (id) { seen[id] = true; });
    const names = Object.keys(files || {});
    if (!plan || !Array.isArray(plan.steps)) return { ok: false, errors: ['The plan needs a "steps" array.'] };
    if (!plan.steps.length) return { ok: false, errors: ['The plan has no steps.'] };
    if (plan.steps.length > MAX_STEPS) errors.push('The plan has ' + plan.steps.length + ' steps; the maximum is ' + MAX_STEPS + '.');
    plan.steps.forEach(function (s, i) {
      const n = i + 1;
      if (!s || typeof s !== 'object') { errors.push('Step ' + n + ' is not an object.'); return; }
      const id = String(s.id || '').trim();
      if (!/^[A-Za-z][\w-]{0,15}$/.test(id)) { errors.push('Step ' + n + ' needs a short id like s' + n + '.'); return; }
      if (seen[id]) { errors.push('Step id ' + id + ' is used twice.'); return; }
      const tool = String(s.tool || '').trim();
      if (TOOLS.indexOf(tool) < 0) { errors.push('Step ' + id + ': unknown tool "' + tool + '". Use ' + TOOLS.join(', ') + '.'); return; }
      const st = { id: id, tool: tool };
      const refText = [];
      if (tool === 'desk' || tool === 'review') {
        const desk = String(s.desk || '').trim().toLowerCase();
        if (DESKS.indexOf(desk) < 0) { errors.push('Step ' + id + ': unknown desk "' + s.desk + '".'); return; }
        st.desk = desk;
      }
      if (tool === 'desk') { st.task = String(s.task || '').trim(); if (!st.task) errors.push('Step ' + id + ' has no task.'); st.checks = normChecks(s.checks); refText.push(st.task); }
      if (tool === 'edit_file') {
        st.file = String(s.file || '').trim();
        if (names.indexOf(st.file) < 0) errors.push('Step ' + id + ': file "' + st.file + '" is not attached. Attached: ' + (names.join(', ') || 'none') + '.');
        st.task = String(s.task || '').trim(); if (!st.task) errors.push('Step ' + id + ' has no task.');
        st.checks = normChecks(s.checks); refText.push(st.task);
      }
      if (tool === 'review') {
        st.target = String(s.target || '').trim();
        if (!seen[st.target]) errors.push('Step ' + id + ': review target "' + st.target + '" must be an earlier step.');
        st.criteria = String(s.criteria || 'Correctness, completeness and exactness against the mission goal.').trim();
        refText.push(st.criteria);
      }
      if (tool === 'fetch_url') {
        st.url = String(s.url || '').trim();
        if (!/^https?:\/\/[^\s]+$/i.test(st.url)) errors.push('Step ' + id + ': url must start with http:// or https://.');
      }
      refText.forEach(function (t) {
        const re = /\{\{\s*([A-Za-z][\w-]{0,15})\s*\}\}/g; let m;
        while ((m = re.exec(t)) !== null) { if (!seen[m[1]]) errors.push('Step ' + id + ' refers to {{' + m[1] + '}}, which is not an earlier step.'); }
      });
      seen[id] = true;
      steps.push(st);
    });
    if (errors.length) return { ok: false, errors: errors };
    // Governance: every regulated desk/edit step must be followed by a solon review of it.
    const governance = [];
    const out = [];
    let g = 0;
    steps.forEach(function (st, i) {
      out.push(st);
      if (st.tool !== 'desk' && st.tool !== 'edit_file') return;
      if (st.tool === 'desk' && st.desk === 'solon') return;
      const regulated = REGULATED.test(st.task || '') || (st.tool === 'edit_file' && REGULATED.test(brief || ''));
      if (!regulated) return;
      const hasReview = steps.slice(i + 1).some(function (x) { return x.tool === 'review' && x.target === st.id && x.desk === 'solon'; });
      if (hasReview) return;
      g++;
      const gid = 'gov' + g;
      out.push({ id: gid, tool: 'review', desk: 'solon', target: st.id, auto: true,
        criteria: 'Required regulatory review. Check that the output makes no approval, clearance or authorization claim for the software, that regulatory and posture wording is exact, and that nothing overstates clinical capability. APPROVE only if it is legally exact.' });
      governance.push('Solon review ' + gid + ' added after ' + st.id + ' (regulated content).');
    });
    return { ok: true, steps: out, governance: governance };
  }

  // ------------------------------------------------------------ tools ----------------------
  function subst(text, outputs) {
    return String(text || '').replace(/\{\{\s*([A-Za-z][\w-]{0,15})\s*\}\}/g, function (all, id) {
      const o = outputs[id];
      if (!o) return all;
      const t = String(o.text || '');
      return t.length > 120000 ? (t.slice(0, 120000) + '\n[...truncated]') : t;
    });
  }
  function checkText(text, checks) {
    const fails = [];
    (checks.banned || []).forEach(function (b) { const c = countCI(text, b); if (c) fails.push('banned term "' + b + '" appears ' + c + ' times'); });
    (checks.required || []).forEach(function (r) {
      const c = countOf(text, r.text);
      const max = (r.max == null) ? Infinity : r.max;
      if (c < r.min || c > max) fails.push('required text "' + r.text.slice(0, 80) + '" appears ' + c + ' times (want ' + (max === Infinity ? (r.min + ' or more') : (r.min === max ? r.min : (r.min + ' to ' + max))) + ')');
    });
    return fails;
  }
  async function toolDesk(st, m, outputs, user, ctx, extra) {
    let fb = extra || '';
    for (let t = 1; t <= DESK_TRIES; t++) {
      const prompt = [
        'LAB MISSION ' + m.id + ' - STEP ' + st.id,
        'You are the ' + st.desk + ' desk. Do this task fully and return the deliverable itself, not a plan or a description of it. Everything you need is in this message; do not ask for inputs. Only if something truly required is absent, reply with one line starting MISSING: and nothing else.',
        '', 'MISSION GOAL: ' + (m.goal || m.title), '', 'TASK:', subst(st.task, outputs),
        fb ? ('\nYOUR PREVIOUS ANSWER WAS REJECTED. Fix exactly this:\n' + fb) : ''
      ].join('\n');
      const text = await callDesk(st.desk, prompt, user, ctx, m.model);
      const miss = text.match(/^\s*MISSING:\s*(.+)$/m);
      if (miss && text.trim().length < 600) {
        if (t < DESK_TRIES) { fb = 'You replied MISSING: ' + miss[1].slice(0, 300) + '. Re-read the task and the inserted outputs; everything provided is in this message. Deliver now. Use MISSING: only if the item is truly absent.'; continue; }
        return { ok: false, reason: 'The ' + st.desk + ' desk needs something only you can provide: ' + miss[1].slice(0, 400) };
      }
      const fails = checkText(text, st.checks || {});
      if (fails.length) { if (t < DESK_TRIES) { fb = fails.join('; '); continue; } return { ok: false, reason: 'Output failed its checks: ' + fails.join('; ') }; }
      return { ok: true, out: { text: text, sha: sha256(text) }, tries: t };
    }
    return { ok: false, reason: 'no acceptable answer' };
  }
  async function toolEdit(st, m, outputs, heads, user, ctx, extra) {
    const job = require('./job');
    const base = heads[st.file];
    const instructions = subst(st.task, outputs) + (extra ? ('\n\nREVIEWER REQUIRED CHANGES (apply all of them):\n' + extra) : '');
    const ev = { httpMethod: 'POST', headers: ctx.headers || {}, queryStringParameters: {}, body: JSON.stringify({
      action: 'create', title: m.title + ' / ' + st.id, instructions: instructions, sourceName: st.file, sourceText: base,
      banned: (st.checks && st.checks.banned) || [], required: (st.checks && st.checks.required) || [],
      model: m.model || '', ownerCode: ctx.ownerCode || '', notify: false
    }) };
    const res = await job.internalHandler(ev);   /* BNT_GATE: in-process call - the mission is already unlocked */
    let p = null; try { p = JSON.parse(res.body || '{}'); } catch (e) {}
    if (!p || !p.ok) return { ok: false, reason: 'Could not start the edit job: ' + ((p && p.error) || ('HTTP ' + res.statusCode)) };
    const jid = p.id, t0 = now();
    st.jobId = jid;
    while (now() - t0 < JOB_WAIT_MS) {
      await sleep(parseInt(process.env.MISSION_POLL_MS || '3000', 10));
      const j = await readJSON(null, 'hjob:' + jid, null);
      if (j && j.status === 'delivered') {
        const f = await readJSON(null, 'hjobfile:' + jid, null);
        if (!f || typeof f.text !== 'string') return { ok: false, reason: 'Edit job ' + jid + ' delivered but its file is missing from the store.' };
        return { ok: true, out: { text: f.text, sha: f.sha256, file: st.file, jobId: jid, edits: j.result && j.result.edits } };
      }
      if (j && j.status === 'escalated') return { ok: false, reason: 'Edit job ' + jid + ' escalated: ' + (j.reason || 'no reason recorded') };
    }
    return { ok: false, reason: 'Edit job ' + jid + ' did not finish within ' + Math.round(JOB_WAIT_MS / 60000) + ' minutes.' };
  }
  async function reviewOnce(st, m, outputs, user, ctx) {
    const target = outputs[st.target] || {};
    const shown = String(target.text || '');
    const prompt = [
      'LAB MISSION ' + m.id + ' - REVIEW STEP ' + st.id + ' of step ' + st.target,
      'You are the ' + st.desk + ' desk. Review the output below against the criteria. Everything you need is in this message.',
      'End your reply with one final line, exactly: VERDICT: APPROVE   or   VERDICT: REVISE',
      'If REVISE, list above that line the exact changes required, precise enough to apply without asking.',
      '', 'MISSION GOAL: ' + (m.goal || m.title), '', 'CRITERIA:', subst(st.criteria, outputs),
      '', '<<<OUTPUT OF ' + st.target + (target.file ? (' (file ' + target.file + ', SHA-256 ' + target.sha + ')') : ''),
      shown.length > 150000 ? (shown.slice(0, 150000) + '\n[...truncated]') : shown, 'OUTPUT>>>'
    ].join('\n');
    let text = await callDesk(st.desk, prompt, user, ctx, m.model);
    let v = (text.match(/VERDICT:\s*(APPROVE|REVISE)/ig) || []).pop();
    if (!v) {
      text = await callDesk(st.desk, prompt + '\n\nYour previous reply had no VERDICT line. Reply again and end with VERDICT: APPROVE or VERDICT: REVISE.', user, ctx, m.model);
      v = (text.match(/VERDICT:\s*(APPROVE|REVISE)/ig) || []).pop();
    }
    return { verdict: v ? v.toUpperCase().replace(/\s+/g, ' ').replace('VERDICT: ', '').replace('VERDICT:', '').trim() : '', text: text };
  }
  function blockedHost(u) {
    let h = '';
    try { h = new URL(u).hostname.toLowerCase(); } catch (e) { return true; }
    return h === 'localhost' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '0.0.0.0' || h.endsWith('.internal');
  }
  async function toolFetch(st) {
    if (blockedHost(st.url)) return { ok: false, reason: 'Private or local addresses are not fetched.' };
    const ctl = new AbortController(); const tm = setTimeout(function () { ctl.abort(); }, 15000);
    try {
      const r = await fetch(st.url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'BionectechLab/1.0' } });
      clearTimeout(tm);
      if (!r.ok) return { ok: false, reason: 'Fetch returned HTTP ' + r.status };
      let t = await r.text();
      if (/html/i.test(r.headers.get('content-type') || '')) t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      t = t.slice(0, 200000);
      return { ok: true, out: { text: t, sha: sha256(t) } };
    } catch (e) { clearTimeout(tm); return { ok: false, reason: 'Fetch failed: ' + String((e && e.message) || e) }; }
  }

  // ------------------------------------------------------------ runner ---------------------
  async function saveM(m) { m.updatedAt = now(); await writeJSON(null, 'hmis:' + m.id, m); }
  function audit(m, step, event, detail) { m.audit.push({ at: now(), step: step || '', event: event, detail: String(detail || '').slice(0, 1500) }); }
  async function indexAdd(id) {
    let ids = await readJSON(null, INDEX_KEY, []); if (!Array.isArray(ids)) ids = [];
    ids = [id].concat(ids.filter(function (x) { return x !== id; })).slice(0, 60);
    await writeJSON(null, INDEX_KEY, ids);
  }
  async function makePlan(m, files, user, ctx, context, doneIds) {
    let fb = '';
    for (let t = 1; t <= PLAN_TRIES; t++) {
      let text = '';
      try { text = await callDesk('hanna', planPrompt(m, files, fb, context), user, ctx, m.model); }
      catch (e) { audit(m, '', 'plan desk error', e.message); fb = ''; continue; }
      const plan = parseJsonBlock(text);
      const v = validatePlan(plan, files, m.brief, doneIds);
      if (v.ok) { if (plan.goal && !m.goal) m.goal = String(plan.goal).slice(0, 600); return v; }
      fb = (v.errors || []).join('\n');
      audit(m, '', 'plan rejected', fb);
    }
    return { ok: false, errors: ['Hanna could not produce a valid plan after ' + PLAN_TRIES + ' tries.'] };
  }
  async function execStep(st, m, outputs, heads, user, ctx, extra) {
    if (st.tool === 'desk') return toolDesk(st, m, outputs, user, ctx, extra);
    if (st.tool === 'edit_file') return toolEdit(st, m, outputs, heads, user, ctx, extra);
    if (st.tool === 'fetch_url') return toolFetch(st);
    return { ok: false, reason: 'execStep does not run reviews' };
  }
  async function runMission(id, user, ctx) {
    if (RUNNING[id]) return;
    RUNNING[id] = { at: now() };
    let m = null;
    try {
      m = await readJSON(null, 'hmis:' + id, null);
      const fr = await readJSON(null, 'hmisf:' + id, null);
      if (!m) throw new Error('mission record missing');
      const files = (fr && fr.files) || {};
      m.status = 'planning'; m.stage = 'Hanna is planning'; m.startedAt = now(); m.audit = m.audit || [];
      audit(m, '', 'mission started', 'files: ' + (Object.keys(files).join(', ') || 'none'));
      await saveM(m);
      const v = await makePlan(m, files, user, ctx, '', []);
      if (!v.ok) return await finish(m, 'escalated', v.errors.join(' '), {});
      m.steps = v.steps.map(function (s) { return Object.assign({}, s, { status: 'pending', tries: 0, revisions: 0 }); });
      audit(m, '', 'plan accepted', m.steps.map(function (s) { return s.id + ':' + s.tool + (s.desk ? ('/' + s.desk) : '') + (s.file ? ('/' + s.file) : ''); }).join(' -> '));
      (v.governance || []).forEach(function (g) { audit(m, '', 'governance', g); });
      m.status = 'running'; await saveM(m);

      const outputs = {}, heads = {};
      Object.keys(files).forEach(function (n) { heads[n] = files[n]; });
      const baseOf = {};           // step id -> file text before that edit step (for revisions)
      let replanned = false;
      for (let i = 0; i < m.steps.length; i++) {
        const st = m.steps[i];
        st.status = 'running'; st.startedAt = now();
        m.stage = 'Step ' + st.id + ' (' + st.tool + (st.desk ? (', ' + st.desk) : '') + (st.file ? (', ' + st.file) : '') + ')';
        await saveM(m);
        let r;
        if (st.tool === 'review') {
          r = { ok: false, reason: '' };
          for (let rev = 0; rev <= MAX_REVISIONS; rev++) {
            let rv;
            try { rv = await reviewOnce(st, m, outputs, user, ctx); }
            catch (e) { r = { ok: false, reason: 'Reviewer error: ' + e.message }; break; }
            audit(m, st.id, 'verdict ' + (rv.verdict || 'NONE'), rv.text.slice(-800));
            st.lastVerdict = rv.verdict || 'NONE';
            if (rv.verdict === 'APPROVE') { r = { ok: true, out: { text: rv.text, sha: sha256(rv.text) } }; break; }
            if (!rv.verdict) { r = { ok: false, reason: 'The ' + st.desk + ' desk gave no verdict.' }; break; }
            if (rev === MAX_REVISIONS) { r = { ok: false, reason: 'Still REVISE after ' + MAX_REVISIONS + ' revisions. Last review: ' + rv.text.slice(-600) }; break; }
            const tgt = m.steps.find(function (x) { return x.id === st.target; });
            if (!tgt || tgt.tool === 'review' || tgt.tool === 'fetch_url') { r = { ok: false, reason: 'Review asked for changes to ' + st.target + ', which cannot be revised.' }; break; }
            tgt.revisions = (tgt.revisions || 0) + 1;
            m.stage = 'Revising ' + tgt.id + ' per ' + st.desk + ' (revision ' + tgt.revisions + ')'; await saveM(m);
            if (tgt.tool === 'edit_file') heads[tgt.file] = baseOf[tgt.id];
            let rr;
            try { rr = await execStep(tgt, m, outputs, heads, user, ctx, rv.text); } catch (e) { rr = { ok: false, reason: e.message }; }
            if (!rr.ok) { r = { ok: false, reason: 'Revision of ' + tgt.id + ' failed: ' + rr.reason }; break; }
            outputs[tgt.id] = rr.out;
            if (tgt.tool === 'edit_file') { heads[tgt.file] = rr.out.text; tgt.outSha = rr.out.sha; }
            audit(m, tgt.id, 'revised', 'sha ' + rr.out.sha);
          }
        } else {
          if (st.tool === 'edit_file') baseOf[st.id] = heads[st.file];
          try { r = await execStep(st, m, outputs, heads, user, ctx, ''); } catch (e) { r = { ok: false, reason: String((e && e.message) || e) }; }
        }
        st.finishedAt = now(); st.ms = st.finishedAt - st.startedAt;
        if (r.ok) {
          st.status = 'done'; st.outSha = r.out.sha; outputs[st.id] = r.out;
          if (st.tool === 'edit_file') heads[st.file] = r.out.text;
          audit(m, st.id, 'done', (st.tool === 'edit_file' ? ('file ' + st.file + ' ') : '') + 'sha ' + r.out.sha);
          await saveM(m);
          continue;
        }
        st.status = 'failed'; st.reason = r.reason;
        audit(m, st.id, 'failed', r.reason);
        await saveM(m);
        if (!replanned) {
          replanned = true;
          m.stage = 'Hanna is replanning after ' + st.id + ' failed'; await saveM(m);
          const doneIds = m.steps.slice(0, i).map(function (s) { return s.id; });
          const ctxText = 'COMPLETED STEPS: ' + (doneIds.join(', ') || 'none') + '. STEP ' + st.id + ' FAILED: ' + r.reason + '\nPlan ONLY the remaining work. New ids must not reuse: ' + doneIds.join(', ') + '. You may refer to completed steps with {{id}}.';
          const nv = await makePlan(m, files, user, ctx, ctxText, doneIds);
          if (nv.ok) {
            const rest = nv.steps.map(function (s) { return Object.assign({}, s, { status: 'pending', tries: 0, revisions: 0 }); });
            audit(m, '', 'replanned', rest.map(function (s) { return s.id + ':' + s.tool; }).join(' -> '));
            (nv.governance || []).forEach(function (g) { audit(m, '', 'governance', g); });
            m.steps = m.steps.slice(0, i + 1).concat(rest);
            await saveM(m);
            continue;              // the failed step stays recorded; execution moves to the new steps
          }
          audit(m, '', 'replan failed', (nv.errors || []).join(' '));
        }
        return await finish(m, 'escalated', 'Step ' + st.id + ' failed: ' + r.reason, heads, files);
      }
      return await finish(m, 'delivered', '', heads, files);
    } catch (e) {
      console.log('[mission] ' + id + ' crashed: ' + ((e && e.stack) || e));
      if (m) { try { await finish(m, 'escalated', 'The mission engine hit an error: ' + String((e && e.message) || e), {}, {}); } catch (e2) {} }
    } finally {
      delete RUNNING[id];
    }
  }

  // ------------------------------------------------------------ report ---------------------
  async function finish(m, status, reason, heads, files) {
    m.status = status; m.stage = status === 'delivered' ? 'Delivered' : 'Escalated'; m.finishedAt = now(); m.reason = reason || '';
    const deliverables = [];
    Object.keys(heads || {}).forEach(function (n) {
      if (files && files[n] !== undefined && heads[n] !== files[n]) deliverables.push({ name: n, sha: sha256(heads[n]), bytes: Buffer.byteLength(heads[n], 'utf8') });
    });
    m.deliverables = deliverables;
    const lastEdit = {};
    (m.steps || []).forEach(function (s) { if (s.tool === 'edit_file' && s.status === 'done' && s.jobId) lastEdit[s.file] = s.jobId; });
    m.deliverables.forEach(function (d) { d.jobId = lastEdit[d.name] || null; });
    audit(m, '', 'mission ' + status, reason);
    await saveM(m);
    try { await expire('hmis:' + m.id, KEEP_SECONDS); await expire('hmisf:' + m.id, KEEP_SECONDS); } catch (e) {}
    const atts = (status === 'delivered') ? deliverables.map(function (d) { return { name: d.name, text: heads[d.name] }; }) : [];
    try { m.email = 'sent to ' + (await sendReport(m, atts)) + ' at ' + new Date().toISOString(); }
    catch (e) { m.email = 'not sent: ' + String((e && e.message) || e); }
    await saveM(m);
    return m;
  }
  function reportText(m) {
    const L = ['Hanna - Bionectech AI Lab', '', 'Mission: ' + m.title + ' (' + m.id + ')', 'Status: ' + String(m.status).toUpperCase()];
    if (m.goal) L.push('Goal: ' + m.goal);
    L.push('Time: ' + Math.round(((m.finishedAt || now()) - (m.startedAt || m.createdAt)) / 1000) + 's');
    if (m.reason) L.push('', 'Why it stopped: ' + m.reason);
    L.push('', 'Steps:');
    (m.steps || []).forEach(function (s) {
      L.push('  ' + s.id + '  ' + s.tool + (s.desk ? (' / ' + s.desk) : '') + (s.file ? (' / ' + s.file) : '') + (s.auto ? ' [governance]' : '') + '  ->  ' + s.status +
        (s.lastVerdict ? (' (verdict ' + s.lastVerdict + ')') : '') + (s.revisions ? (', ' + s.revisions + ' revision(s)') : '') + (s.outSha ? (', sha ' + s.outSha.slice(0, 16)) : '') + (s.reason ? (' - ' + s.reason.slice(0, 300)) : ''));
    });
    if (m.deliverables && m.deliverables.length) {
      L.push('', 'Delivered files (attached):');
      m.deliverables.forEach(function (d) { L.push('  ' + d.name + ' - ' + d.bytes + ' bytes - SHA-256 ' + d.sha); });
    }
    L.push('', 'Audit log:');
    (m.audit || []).forEach(function (a) { L.push('  ' + new Date(a.at).toISOString() + '  ' + (a.step ? (a.step + '  ') : '') + a.event + (a.detail ? (': ' + a.detail.replace(/\s+/g, ' ').slice(0, 300)) : '')); });
    L.push('', m.status === 'delivered' ? 'Nothing is waiting on you.' : 'What I need from you: the reason above. Adjust the brief or files and start a new mission.');
    return L.join('\n');
  }
  function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }
  function wrap76(s) { return s.replace(/(.{76})/g, '$1\r\n'); }
  function buildMimeMulti(from, to, subject, text, atts) {
    const bnd = 'bnt_' + crypto.randomBytes(8).toString('hex');
    const L = ['From: Hanna - Bionectech AI Lab <' + from + '>', 'To: ' + to.join(', '), 'Subject: =?UTF-8?B?' + b64(subject) + '?=',
      'Date: ' + new Date().toUTCString(), 'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@bionectech-lab>', 'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + bnd + '"', '', '--' + bnd, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(text))];
    (atts || []).forEach(function (a) {
      const n = safeName(a.name) || 'deliverable.txt';
      L.push('--' + bnd, 'Content-Type: application/octet-stream; name="' + n + '"', 'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="' + n + '"', '', wrap76(b64(a.text)));
    });
    L.push('--' + bnd + '--', '');
    return L.join('\r\n');
  }
  async function sendReport(m, atts) {
    const user = (process.env.SMTP_USER || '').trim(), pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    const to = (process.env.REPORT_TO || user).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!user || !pass || !to.length) throw new Error('email not configured: set SMTP_USER, SMTP_PASS and REPORT_TO on the Render service');
    const subject = (m.status === 'delivered' ? 'MISSION DELIVERED: ' : 'MISSION ESCALATED: ') + m.title;
    const smtpSend = require('./job')._test.smtpSend;
    await smtpSend({ user: user, pass: pass, to: to, message: buildMimeMulti(user, to, subject, reportText(m), atts) });
    return to.join(', ');
  }

  // ------------------------------------------------------------ http -----------------------
  function summary(m) {
    return { id: m.id, title: m.title, status: m.status, stage: m.stage, goal: m.goal || '', reason: m.reason || '', email: m.email || '',
      createdAt: m.createdAt, updatedAt: m.updatedAt, finishedAt: m.finishedAt || null, running: !!RUNNING[m.id],
      steps: (m.steps || []).map(function (s) { return { id: s.id, tool: s.tool, desk: s.desk || '', file: s.file || '', target: s.target || '', auto: !!s.auto, status: s.status, verdict: s.lastVerdict || '', revisions: s.revisions || 0, reason: s.reason || '', jobId: s.jobId || '', ms: s.ms || 0 }; }),
      deliverables: m.deliverables || [], audit: (m.audit || []).slice(-60) };
  }
  async function loadM(id) {
    const m = await readJSON(null, 'hmis:' + id, null);
    if (!m) return null;
    if ((m.status === 'queued' || m.status === 'planning' || m.status === 'running') && !RUNNING[id] && now() - (m.updatedAt || 0) > STALE_MS) {
      m.audit = m.audit || [];
      await finish(m, 'escalated', 'The server restarted while this mission was running. Start it again.', {}, {});
    }
    return m;
  }
  function makeHandler(skipGate) { return async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
    const user = userFrom(event);
    if (!user) return json(401, { error: 'Sign in first.' });
    if (user.role !== 'admin') return json(403, { error: 'Missions are admin-only.' });
    const q = event.queryStringParameters || {};
    let b = {};
    if (event.httpMethod === 'POST') { try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Body must be JSON.' }); } }
    const action = String(b.action || q.action || '');
    const ctx = { headers: Object.assign({}, event.headers || {}), ownerCode: String(b.ownerCode || '') };
    /* BNT_GATE: server-enforced panel code */
    if (action === 'unlock') { const g = await accessGate.unlock('missions', user, b.code, clientIp(event)); return json(g.status || (g.ok ? 200 : 401), g); }
    if (action === 'lock') { return json(200, await accessGate.lock('missions', user)); }
    if (!skipGate && !(await accessGate.isUnlocked('missions', user))) return json(423, { error: accessGate.lockedMessage('missions'), locked: true });
    try {
      if (action === 'create') {
        const brief = String(b.brief || '').trim();
        if (!brief) return json(400, { error: 'Write the brief for Hanna.' });
        const files = {};
        let total = 0;
        (Array.isArray(b.files) ? b.files : []).slice(0, 8).forEach(function (f) {
          const n = safeName(f && f.name), t = (f && typeof f.text === 'string') ? f.text : '';
          if (n && t) { files[n] = t; total += t.length; }
        });
        if (total > 4000000) return json(413, { error: 'Attached files are over 4 MB in total.' });
        const id = newId();
        const m = { id: id, title: String(b.title || '').trim().slice(0, 200) || brief.slice(0, 80), brief: brief.slice(0, 60000), model: String(b.model || ''),
          createdAt: now(), status: 'queued', stage: 'Queued', steps: [], audit: [], createdBy: String(user.name || user.u || user.user || '') };
        await writeJSON(null, 'hmisf:' + id, { files: files });
        await saveM(m);
        await indexAdd(id);
        setImmediate(function () { runMission(id, user, ctx).catch(function (e) { console.log('[mission] ' + id + ' ' + e.message); }); });
        return json(200, { ok: true, id: id });
      }
      if (action === 'get') {
        const m = await loadM(String(q.id || b.id || ''));
        if (!m) return json(404, { error: 'No such mission.' });
        return json(200, { ok: true, mission: summary(m) });
      }
      if (action === 'file') {   /* BNT_GATE: deliverable download scoped to this mission */
        const m = await loadM(String(q.id || b.id || ''));
        const jid = String(q.job || b.job || '');
        if (!m || !jid || !((m.deliverables || []).some(function (d) { return d.jobId === jid; }))) return json(404, { error: 'No such deliverable in this mission.' });
        const f = await readJSON(null, 'hjobfile:' + jid, null);
        if (!f) return json(404, { error: 'The delivered file has expired from the store.' });
        return json(200, { ok: true, name: f.name, sha256: f.sha256, text: f.text });
      }
      if (action === 'list') {
        let ids = await readJSON(null, INDEX_KEY, []); if (!Array.isArray(ids)) ids = [];
        const out = [];
        for (let i = 0; i < Math.min(ids.length, 20); i++) { const m = await loadM(ids[i]); if (m) out.push(summary(m)); }
        return json(200, { ok: true, missions: out });
      }
      return json(400, { error: 'Unknown action. Use create, get, list, file, unlock or lock.' });
    } catch (e) {
      return json(500, { error: String((e && e.message) || e) });
    }
  }; };
  const handler = makeHandler(false);
  const internalHandler = makeHandler(true);   // in-process only (missions); never mounted on a URL

  module.exports = { handler: handler, internalHandler: internalHandler, _test: { validatePlan: validatePlan, parseJsonBlock: parseJsonBlock, checkText: checkText, subst: subst, blockedHost: blockedHost } };
})();
