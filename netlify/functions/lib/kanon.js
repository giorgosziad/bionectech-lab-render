// lib/kanon.js - KANON: the Lab's measuring rod (Greek: the rule every piece is checked against).
// Kanon turns a plain brief and Hanna's draft plan into a command-grade plan the server can prove,
// and writes the rules for a job when the operator leaves them empty. Kanon is an engine component,
// not a chat persona: it never goes through chat.js and cannot be confused with another desk.
//
// Four passes, and the two that decide are done by SERVER CODE, not by the model:
//   1. PROBE    - Kanon lists the exact phrases it needs counted.
//   2. COUNT    - the server counts them in the real attached files.        (deterministic)
//   3. COMPILE  - Kanon writes the plan / rules using those real counts.
//   4. PROVE    - the server rejects contradictions, empty checks, and any    (deterministic)
//                 step whose checks already pass on the unmodified file. Errors go back to
//                 Kanon verbatim, up to 3 tries.
(function () {
  'use strict';
  const latest = require('./latest');

  const MAX_TRIES = 3, MAX_PROBES = 80, FILE_BUDGET = 350000, CALL_MS = 8 * 60 * 1000;
  let askImpl = null;                                   // test hook

  const METHOD = [
    'You are KANON, the measuring rod of the Bionectech AI Lab. You do not build and you do not review. You turn an operator brief into instructions and checks so exact that the server can PROVE whether the work was done.',
    'YOUR METHOD - every time:',
    '1. Read the real attached files, never a description of them. When the brief and a file disagree about a fact (for example how many places carry a phrase), the file wins; say so in notes.',
    '2. Count exact facts. Every check you write rests on a count the server measured for you (PROBE COUNTS). Never guess a count.',
    '3. Turn every requirement into a check the server can prove: text that must appear (with an exact count when the brief says every / all / each place), text that must never appear, and things that must survive unchanged (function names, endpoints, ids, tokens) with their current counts.',
    '4. Make every task self-contained. The editor (Karam) sees ONLY the target file and the task text: no brief, no other files. Copy into the task every sentence, string, name and design detail the editor needs, verbatim.',
    '5. Pin the reviewers. When the brief contains a ruled or final sentence, every review of a step that touches it must quote that sentence verbatim and say it is final and not open for revision, then list exactly what would justify REVISE. Put an explicit solon review after every edit that touches regulated wording (FDA, device, clinical claims, posture, labeling, HIPAA). Put a final karim integrity review after the last code edit.',
    '6. Carry invariants forward. Every later edit of the same file repeats the checks that must stay true (final sentences with their exact counts, banned phrases, keep-list items).',
    '7. Each edit step must add at least one check of its own that FAILS on the unmodified file - otherwise the step measures nothing and the server will reject it.',
    '8. Never ban a word that a required text contains. Never invent facts, citations, numbers or clinical content that are not in the brief or the files.',
    '9. Keep the plan within 10 steps. Keep the draft plan\'s intent and order unless the brief requires otherwise.'
  ].join('\n');

  const PLAN_SCHEMA = [
    'OUTPUT: one ```json block {"goal": "...", "steps": [ ... ], "notes": ["..."]}.',
    'Step shapes:',
    '  {"id","tool":"edit_file","file":"<exact attached file name>","task","checks":{"required":[{"text","min","max"}],"banned":["..."]}}   (max null means no upper limit)',
    '  {"id","tool":"review","desk":"solon|karim|galen|...","target":"<earlier step id>","criteria"}',
    '  {"id","tool":"desk","desk","task","checks":{"required":[],"banned":[]}}',
    '  {"id","tool":"fetch_url","url"}',
    'ids are short and unique (s1, r1, k1 ...). A task or criteria may contain {{id}} to insert the output of an EARLIER step.'
  ].join('\n');

  function parseJson(text) {
    const t = String(text || '');
    const re = /```(?:json)?[^\n]*\n([\s\S]*?)```/g; let m; const cands = [];
    while ((m = re.exec(t)) !== null) cands.push(m[1]);
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) cands.push(t.slice(a, b + 1));
    for (let i = 0; i < cands.length; i++) { try { return JSON.parse(cands[i]); } catch (e) {} }
    return null;
  }
  function countOf(hay, needle) { if (!needle) return 0; let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; }
  function countCI(hay, needle) { return countOf(String(hay).toLowerCase(), String(needle).toLowerCase()); }

  async function ask(system, user, maxTokens) {
    if (askImpl) return askImpl(system, user);
    const key = process.env.ANTHROPIC_API_KEY || '';
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    let model = null;
    try { model = await latest.latestOpusId(); } catch (e) {}
    model = process.env.KANON_MODEL || model || 'claude-opus-5-5';
    const ac = new AbortController();
    const t = setTimeout(function () { ac.abort(); }, CALL_MS);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model, max_tokens: maxTokens || 16000, system: system, messages: [{ role: 'user', content: user }] })
      });
      const j = await r.json().catch(function () { return null; });
      if (!r.ok) throw new Error('Kanon model error ' + r.status + ': ' + String((j && j.error && j.error.message) || '').slice(0, 240));
      const text = ((j && j.content) || []).filter(function (b) { return b && b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
      return { text: text, model: model };
    } finally { clearTimeout(t); }
  }

  function filesBlock(files) {
    const names = Object.keys(files || {});
    let budget = FILE_BUDGET; const out = [];
    names.forEach(function (n) {
      const t = String(files[n] || '');
      const take = Math.max(0, Math.min(t.length, budget));
      budget -= take;
      out.push('<<<FILE ' + n + ' (' + t.length + ' chars' + (take < t.length ? ', first ' + take + ' shown' : '') + ')\n' + t.slice(0, take) + '\nFILE>>>');
    });
    return names.length ? out.join('\n\n') : '(no files attached)';
  }
  function countProbes(probes, files) {
    const names = Object.keys(files || {});
    return probes.map(function (p) {
      const per = {}; names.forEach(function (n) { per[n] = { exact: countOf(String(files[n]), p), anyCase: countCI(String(files[n]), p) }; });
      return { text: p, counts: per };
    });
  }
  function countsBlock(counted) {
    return counted.map(function (c, i) {
      return (i + 1) + '. ' + JSON.stringify(c.text) + ' -> ' + Object.keys(c.counts).map(function (n) { return n + ': ' + c.counts[n].exact + ' exact, ' + c.counts[n].anyCase + ' any case'; }).join('; ');
    }).join('\n') || '(no probes)';
  }
  function cleanProbes(p) {
    const arr = (p && Array.isArray(p.probes)) ? p.probes : [];
    const seen = {}; const out = [];
    arr.forEach(function (s) { s = String(s == null ? '' : s); if (s.length >= 2 && s.length <= 600 && !seen[s]) { seen[s] = 1; out.push(s); } });
    return out.slice(0, MAX_PROBES);
  }
  async function probePass(context, files) {
    const r = await ask(METHOD, context + '\n\nPHASE 1 - PROBE. List the exact strings the server must count so your checks rest on real numbers: every phrase that must be removed, every text that must be added (its current count is usually 0), every sentence the brief rules final, and every name, endpoint, id or token that must survive unchanged. Copy each exactly from the files or the brief. Return one ```json block {"probes": ["..."]} with at most ' + MAX_PROBES + ' items.', 4000);
    const probes = cleanProbes(parseJson(r.text));
    return { probes: probes, counted: countProbes(probes, files), model: r.model };
  }

  // ---- PROVE (deterministic) ------------------------------------------------
  function checkText(text, checks) {
    const fails = [];
    (checks.banned || []).forEach(function (b) { const c = countCI(text, b); if (c) fails.push('banned "' + b + '" appears ' + c + ' times'); });
    (checks.required || []).forEach(function (r) {
      const c = countOf(text, r.text); const max = (r.max == null) ? Infinity : r.max;
      if (c < r.min || c > max) fails.push('required "' + String(r.text).slice(0, 60) + '" appears ' + c + ' times');
    });
    return fails;
  }
  function checkKeys(checks) {
    const k = [];
    (checks.banned || []).forEach(function (b) { k.push('B:' + String(b).toLowerCase()); });
    (checks.required || []).forEach(function (r) { k.push('R:' + r.text + '|' + r.min + '|' + r.max); });
    return k;
  }
  function contradictions(id, checks) {
    const errs = [];
    (checks.required || []).forEach(function (r) {
      if (!r || typeof r.text !== 'string' || !r.text) { errs.push('Step ' + id + ' has a required entry without text.'); return; }
      if (r.max != null && r.min > r.max) errs.push('Step ' + id + ': required "' + r.text.slice(0, 60) + '" has min ' + r.min + ' above max ' + r.max + '.');
      if (r.min > 0) (checks.banned || []).forEach(function (b) { if (b && r.text.toLowerCase().indexOf(String(b).toLowerCase()) >= 0) errs.push('Step ' + id + ': required "' + r.text.slice(0, 60) + '" contains the banned term "' + b + '", so the step can never pass.'); });
    });
    return errs;
  }
  function provePlan(steps, files) {
    const errs = []; const seenByFile = {};
    steps.forEach(function (st) {
      if (st.tool === 'review' && String(st.criteria || '').trim().length < 40) errs.push('Review ' + st.id + ' needs specific criteria (at least one full sentence of what to check).');
      if (st.tool !== 'edit_file') return;
      const checks = st.checks || { banned: [], required: [] };
      const n = (checks.banned || []).length + (checks.required || []).length;
      if (!n) { errs.push('Edit step ' + st.id + ' has no checks. Every edit needs checks the server can prove.'); return; }
      contradictions(st.id, checks).forEach(function (e) { errs.push(e); });
      const original = String((files || {})[st.file] || '');
      const seen = seenByFile[st.file] || (seenByFile[st.file] = {});
      const own = { banned: [], required: [] };
      (checks.banned || []).forEach(function (b) { if (!seen['B:' + String(b).toLowerCase()]) own.banned.push(b); });
      (checks.required || []).forEach(function (r) { if (!seen['R:' + r.text + '|' + r.min + '|' + r.max]) own.required.push(r); });
      if (!own.banned.length && !own.required.length) errs.push('Edit step ' + st.id + ' only repeats earlier checks. Add at least one check for what this step itself adds or removes.');
      else if (!checkText(original, own).length) errs.push('Edit step ' + st.id + ': its own checks already pass on the unmodified ' + st.file + ', so they cannot show that the step did anything. Add a check that measures this step\'s change (for example text it adds, with its count).');
      checkKeys(checks).forEach(function (k) { seen[k] = 1; });
    });
    return errs;
  }

  // ---- MISSION ----------------------------------------------------------------
  // opts: { brief, files, draft (validated steps), validate(plan) -> {ok, steps, errors, governance} }
  async function compileMission(opts) {
    const files = opts.files || {};
    const context = 'OPERATOR BRIEF:\n' + String(opts.brief || '') + '\n\nHANNA DRAFT PLAN (already valid; you harden it):\n' + JSON.stringify({ steps: opts.draft || [] }, null, 1) + '\n\nATTACHED FILES:\n' + filesBlock(files);
    const pr = await probePass(context, files);
    let fb = '', last = null, model = pr.model;
    for (let t = 1; t <= MAX_TRIES; t++) {
      const r = await ask(METHOD, context + '\n\nPROBE COUNTS (measured by the server in the real files):\n' + countsBlock(pr.counted) + '\n\nPHASE 2 - COMPILE the command-grade plan.\n' + PLAN_SCHEMA + (fb ? ('\n\nTHE SERVER REJECTED YOUR PREVIOUS PLAN. Fix exactly this:\n' + fb) : ''), 16000);
      model = r.model || model;
      const plan = parseJson(r.text);
      if (!plan || !Array.isArray(plan.steps)) { fb = 'Your reply had no ```json block with a "steps" array.'; continue; }
      const v = opts.validate({ goal: plan.goal, steps: plan.steps });
      const errs = v.ok ? provePlan(v.steps, files) : (v.errors || ['invalid plan']);
      if (!errs.length) return { ok: true, v: v, goal: String(plan.goal || '').slice(0, 600), notes: (Array.isArray(plan.notes) ? plan.notes : []).map(String).slice(0, 12), tries: t, probes: pr.probes.length, model: model };
      fb = errs.join('\n'); last = errs;
    }
    return { ok: false, reason: 'Kanon could not produce a provable plan after ' + MAX_TRIES + ' tries: ' + (last || [fb]).join(' | ').slice(0, 900), probes: pr.probes.length, model: model };
  }

  // ---- JOB ----------------------------------------------------------------------
  function normReq(list) {
    return (Array.isArray(list) ? list : []).map(function (r) {
      if (!r || typeof r.text !== 'string' || !r.text) return null;
      const min = Math.max(0, parseInt(r.min == null ? 1 : r.min, 10) || 0);
      const max = (r.max == null || r.max === '') ? null : Math.max(0, parseInt(r.max, 10) || 0);
      return { text: r.text, min: min, max: max };
    }).filter(Boolean).slice(0, 40);
  }
  async function compileJob(opts) {
    const files = {}; files[opts.fileName] = String(opts.text || '');
    const context = 'JOB TASK FOR KARAM (the operator left the rules empty; you write them):\n' + String(opts.task || '') + '\n\nFILE TO BE EDITED:\n' + filesBlock(files);
    const pr = await probePass(context, files);
    let fb = '', model = pr.model, last = null;
    for (let t = 1; t <= MAX_TRIES; t++) {
      const r = await ask(METHOD, context + '\n\nPROBE COUNTS (measured by the server):\n' + countsBlock(pr.counted) + '\n\nPHASE 2 - write the rules for this one edit. Return one ```json block {"banned": ["..."], "required": [{"text","min","max"}], "notes": ["..."]}. Include what the task adds (with counts), what it removes (banned), and what must survive unchanged (with its current count).' + (fb ? ('\n\nTHE SERVER REJECTED YOUR PREVIOUS RULES. Fix exactly this:\n' + fb) : ''), 6000);
      model = r.model || model;
      const p = parseJson(r.text) || {};
      const checks = { banned: (Array.isArray(p.banned) ? p.banned : []).map(String).filter(function (s) { return s.trim(); }).slice(0, 40), required: normReq(p.required) };
      const errs = provePlan([{ id: 'job', tool: 'edit_file', file: opts.fileName, checks: checks }], files);
      if (!errs.length) return { ok: true, checks: checks, notes: (Array.isArray(p.notes) ? p.notes : []).map(String).slice(0, 8), tries: t, model: model };
      fb = errs.join('\n'); last = errs;
    }
    return { ok: false, reason: 'Kanon could not write provable rules after ' + MAX_TRIES + ' tries: ' + (last || [fb]).join(' | ').slice(0, 600), model: model };
  }

  module.exports = { compileMission: compileMission, compileJob: compileJob, METHOD: METHOD,
    _test: { provePlan: provePlan, countProbes: countProbes, parseJson: parseJson, setAsk: function (f) { askImpl = f; } } };
})();
