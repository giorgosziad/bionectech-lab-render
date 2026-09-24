// job.js - Bionectech AI Lab managed build jobs (BNT_JOBS v1).
//
// A job runs on the Render server, not in a browser tab:
//   1. The operator (or Hanna) creates a job: source file + task + acceptance checks.
//   2. Karam is called server-side through chat.js handleChat (persona logic untouched).
//      He returns ONLY a JSON list of anchored edits {find, replace} - never the whole file.
//   3. The server applies the edits to the stored source. Every "find" must occur exactly
//      once in the original; anything else is rejected and Karam retries with the exact reason.
//   4. A code gate decides: banned terms, required strings, HTML structure, inline-script
//      syntax (compiled, never executed), encoding. Pass/fail is code, not a persona's opinion.
//   5. The verified file is stored with its SHA-256 and Hanna emails DELIVERED (file attached)
//      or ESCALATED (exact reason). Every job ends in one of those two states.
//
// Storage keys (Upstash via lib/auth, chunked for large values):
//   hjob:<id>      job record (small, written only by the runner)
//   hjobprog:<id>  live progress heartbeat (separate key - it can never clobber the record)
//   hjobsrc:<id>   source file
//   hjobfile:<id>  delivered file
//   hjobs:index    newest job ids
// The session token and owner code are held in memory only for the run; never stored.
(function () {
  'use strict';
  const crypto = require('crypto');
  const tls = require('tls');
  const net = require('net');
  const vm = require('vm');
  const { cors, json, userFrom, readJSON, writeJSON, expire, clientIp } = require('./lib/auth');
  const accessGate = require('./lib/gate');

  const MAX_ATTEMPTS = 3;
  const KEEP_SECONDS = 60 * 60 * 24 * 30;      // 30 days
  const STALE_MS = 3 * 60 * 1000;              // a running job with no runner for 3 min = server restarted
  const INDEX_KEY = 'hjobs:index';
  const RUNNING = {};                          // in-process: id -> { headers, ownerCode, at }

  function now() { return Date.now(); }
  function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
  function newId() { return 'J' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }
  function countOf(hay, needle) {
    if (!needle) return 0;
    let n = 0, i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    return n;
  }
  function countCI(hay, needle) { return countOf(String(hay).toLowerCase(), String(needle).toLowerCase()); }
  function nonAscii(s) { let n = 0; for (let i = 0; i < s.length; i++) { if (s.charCodeAt(i) > 127) n++; } return n; }
  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().slice(0, 120); }

  // ---------------------------------------------------------------- edits ----------------
  function parseEdits(text) {
    const t = String(text || '');
    const cands = [];
    const re = /```(?:json)?[^\n]*\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(t)) !== null) cands.push(m[1]);
    const a = t.indexOf('['), b = t.lastIndexOf(']');
    if (a !== -1 && b > a) cands.push(t.slice(a, b + 1));
    for (let i = 0; i < cands.length; i++) {
      try {
        const v = JSON.parse(cands[i].trim());
        if (Array.isArray(v)) return { ok: true, edits: v };
        if (v && Array.isArray(v.edits)) return { ok: true, edits: v.edits };
      } catch (e) {}
    }
    return { ok: false, error: 'The reply did not contain a valid JSON array of {"find","replace"} edits.' };
  }

  // Every find is located in the ORIGINAL source; must occur exactly once; spans must not overlap.
  // Untouched bytes are copied verbatim, so everything outside the edits is identical by construction.
  function applyEdits(src, edits) {
    const problems = [], spans = [];
    if (!Array.isArray(edits) || !edits.length) return { ok: false, problems: ['No edits were returned.'] };
    edits.forEach(function (e, k) {
      const n = k + 1;
      if (!e || typeof e.find !== 'string' || typeof e.replace !== 'string') { problems.push('Edit ' + n + ': needs string fields "find" and "replace".'); return; }
      if (!e.find.length) { problems.push('Edit ' + n + ': "find" is empty.'); return; }
      const c = countOf(src, e.find);
      if (c !== 1) { problems.push('Edit ' + n + ': "find" occurs ' + c + ' times in the source (must be exactly 1). It starts: ' + JSON.stringify(e.find.slice(0, 140))); return; }
      const at = src.indexOf(e.find);
      spans.push({ at: at, end: at + e.find.length, replace: e.replace, n: n });
    });
    spans.sort(function (x, y) { return x.at - y.at; });
    for (let i = 1; i < spans.length; i++) {
      if (spans[i].at < spans[i - 1].end) problems.push('Edits ' + spans[i - 1].n + ' and ' + spans[i].n + ' overlap.');
    }
    if (problems.length) return { ok: false, problems: problems };
    let out = '', pos = 0;
    spans.forEach(function (s) { out += src.slice(pos, s.at) + s.replace; pos = s.end; });
    out += src.slice(pos);
    return { ok: true, text: out, count: spans.length };
  }

  // ---------------------------------------------------------------- code gate ------------
  function gate(name, before, after, checks) {
    checks = checks || {};
    const res = [];
    function add(id, pass, detail) { res.push({ id: id, pass: !!pass, detail: detail || '' }); }

    (checks.banned || []).forEach(function (term) {
      const c = countCI(after, term);
      add('banned term absent: ' + term, c === 0, c + ' found');
    });
    (checks.required || []).forEach(function (r) {
      const text = (typeof r === 'string') ? r : (r && r.text);
      if (!text) return;
      const min = (r && typeof r === 'object' && r.min != null) ? r.min : 1;
      const max = (r && typeof r === 'object' && r.max != null) ? r.max : Infinity;
      const c = countOf(after, text);
      const want = (max === Infinity) ? (min + ' or more') : (min === max ? String(min) : (min + ' to ' + max));
      add('required text: ' + text.slice(0, 90), c >= min && c <= max, c + ' found, want ' + want);
    });

    const isHtml = checks.html === true || (checks.html !== false && /\.html?$/i.test(name || ''));
    if (isHtml) {
      const t = after.replace(/^\uFEFF/, '');
      const dt = (t.match(/<!doctype html/ig) || []).length;
      const eh = (t.match(/<\/html>/ig) || []).length;
      add('html starts with <!doctype html>', /^\s*<!doctype html/i.test(t));
      add('html has exactly one <!doctype html>', dt === 1, dt + ' found');
      add('html ends at </html> with nothing after', /<\/html>\s*$/i.test(t), 'last chars: ' + JSON.stringify(t.slice(-40)));
      add('html has exactly one </html>', eh === 1, eh + ' found');
      const scr = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
      let m, k = 0;
      while ((m = scr.exec(t)) !== null) {
        const attrs = m[1] || '';
        if (/\bsrc\s*=/i.test(attrs)) continue;
        if (/type\s*=\s*["']?(module|application\/(ld\+)?json|text\/(template|x-template|plain|html))/i.test(attrs)) continue;
        k++;
        try { new vm.Script(m[2], { filename: 'inline-script-' + k + '.js' }); add('inline script ' + k + ' compiles', true); }
        catch (e) { add('inline script ' + k + ' compiles', false, String((e && e.message) || e)); }
      }
    }
    if (/\.(m?js|cjs)$/i.test(name || '')) {
      try { new vm.Script(after, { filename: name }); add('script compiles', true); }
      catch (e) { add('script compiles', false, String((e && e.message) || e)); }
    }
    const fb = countOf(before, '\uFFFD'), fa = countOf(after, '\uFFFD');
    add('no new replacement characters', fa <= fb, fb + ' before, ' + fa + ' after');
    const mb = countOf(before, '\u00C3') + countOf(before, '\u00E2\u20AC');
    const ma = countOf(after, '\u00C3') + countOf(after, '\u00E2\u20AC');
    add('no new mojibake sequences', ma <= mb, mb + ' before, ' + ma + ' after');
    add('file actually changed', after !== before);
    return { pass: res.every(function (r) { return r.pass; }), checks: res, nonAscii: { before: nonAscii(before), after: nonAscii(after) } };
  }

  // ---------------------------------------------------------------- prompt ---------------
  function buildPrompt(job, src, feedback) {
    const parts = [
      'LAB BUILD JOB ' + job.id + ': ' + job.title,
      'You are editing the file "' + job.sourceName + '", shown in full at the end of this message. Everything you need is in this message; do not ask for inputs.',
      'Do NOT reproduce the file. Return your changes as ONE ```json fenced block holding a JSON array of edits:',
      '[{"find": "exact text copied from the file", "replace": "new text"}]',
      'Rules the server enforces: each "find" is copied character-for-character from the ORIGINAL file below and occurs EXACTLY ONCE in it (include surrounding text until it is unique); edits must not overlap; strings must be valid JSON (escape double quotes and backslashes). The server applies the edits and runs a code gate; anything outside the json block is ignored.'
    ];
    if (job.checks && job.checks.banned && job.checks.banned.length) {
      parts.push('After your edits the file must contain none of these terms anywhere (case-insensitive): ' + job.checks.banned.join(', ') + '.');
    }
    if (job.checks && job.checks.required && job.checks.required.length) {
      parts.push('After your edits these must be present: ' + job.checks.required.map(function (r) {
        const t = typeof r === 'string' ? r : r.text;
        const c = (typeof r === 'object' && r.min != null && r.min === r.max) ? (' (exactly ' + r.min + ' times)') : '';
        return JSON.stringify(t) + c;
      }).join('; ') + '.');
    }
    parts.push('', 'TASK:', job.instructions);
    if (feedback) {
      parts.push('', 'YOUR PREVIOUS ATTEMPT WAS REJECTED BY THE SERVER. Fix exactly this, then return the COMPLETE edit list again (all edits, each against the original file):', feedback);
    }
    parts.push('', '<<<FILE ' + job.sourceName + ' (' + src.length + ' characters)', src, 'FILE>>>');
    return parts.join('\n');
  }

  // ---------------------------------------------------------------- desk call ------------
  async function callDesk(job, user, ctx, prompt, onProgress) {
    const chat = require('./chat');                       // lazy: chat.js is large; FERRIS untouched
    const body = {
      prompt: prompt, history: [], files: [], model: job.model || '', mode: 'answer',
      temperature: 0.2, engine: false, ownerCode: ctx.ownerCode || '', web: false,
      fast: false, smart: false, persona: job.persona || 'karam'
    };
    const ev = { httpMethod: 'POST', headers: ctx.headers || {}, body: JSON.stringify(body), queryStringParameters: {}, path: '/.netlify/functions/chat' };
    const out = await chat.handleChat(ev, user, null, onProgress);
    let p = null;
    try { p = JSON.parse((out && out.body) || '{}'); } catch (e) {}
    if (!out || out.statusCode < 200 || out.statusCode >= 300) {
      throw new Error((p && p.error) || ('desk returned HTTP ' + (out && out.statusCode)));
    }
    return { text: String((p && (p.text || p.reply || p.answer)) || ''), model: (p && p.model) || '' };
  }

  // ---------------------------------------------------------------- store ----------------
  async function saveJob(job) { job.updatedAt = now(); await writeJSON(null, 'hjob:' + job.id, job); }
  async function indexAdd(id) {
    let ids = await readJSON(null, INDEX_KEY, []);
    if (!Array.isArray(ids)) ids = [];
    ids = [id].concat(ids.filter(function (x) { return x !== id; })).slice(0, 60);
    await writeJSON(null, INDEX_KEY, ids);
  }
  function progressWriter(id) {
    let last = 0;
    return function (p) {
      const t = now();
      if (p && p.stage !== 'done' && t - last < 1000) return;
      last = t;
      writeJSON(null, 'hjobprog:' + id, { at: t, stage: p && p.stage, model: p && p.model, chars: (p && p.chars) || 0, tokens: (p && p.tokens) || 0 }).catch(function () {});
    };
  }

  // ---------------------------------------------------------------- runner ---------------
  async function runJob(id, user, ctx) {
    if (RUNNING[id]) return;
    RUNNING[id] = { headers: ctx.headers, ownerCode: ctx.ownerCode, at: now() };
    let job = null;
    try {
      job = await readJSON(null, 'hjob:' + id, null);
      const srcRec = await readJSON(null, 'hjobsrc:' + id, null);
      if (!job) throw new Error('job record missing from store');
      if (!srcRec || typeof srcRec.text !== 'string') throw new Error('source file missing from store');
      const src = srcRec.text;
      job.status = 'building'; job.stage = 'Starting'; job.attempts = []; job.startedAt = now();
      job.reason = ''; job.result = null; job.email = '';
      await saveJob(job);
      /* BNT_KANON: rules left empty on a panel job -> Kanon writes them from the real file; the server proves them */
      const _noRules = !((job.checks && job.checks.banned) || []).length && !((job.checks && job.checks.required) || []).length;
      if (_noRules && job.notify !== false) {
        job.stage = 'Kanon is writing the rules'; await saveJob(job);
        try {
          const kr = await require('./lib/kanon').compileJob({ task: job.instructions, fileName: job.sourceName, text: src });
          if (kr.ok) { job.checks = Object.assign({}, job.checks || {}, { banned: kr.checks.banned, required: kr.checks.required }); job.kanon = { status: 'compiled', tries: kr.tries, notes: kr.notes }; }
          else job.kanon = { status: 'skipped', reason: kr.reason };
        } catch (e) { job.kanon = { status: 'skipped', reason: String((e && e.message) || e) }; }
        await saveJob(job);
      }
      let feedback = '';
      for (let a = 1; a <= MAX_ATTEMPTS; a++) {
        const at = { n: a, startedAt: now() };
        job.attempts.push(at);
        job.stage = 'Karam is writing edits (attempt ' + a + ' of ' + MAX_ATTEMPTS + ')';
        await saveJob(job);
        let reply;
        try { reply = await callDesk(job, user, ctx, buildPrompt(job, src, feedback), progressWriter(id)); }
        catch (e) { at.result = 'desk error'; at.detail = String((e && e.message) || e); at.ms = now() - at.startedAt; await saveJob(job); continue; }
        at.model = reply.model; at.replyChars = reply.text.length;
        const pe = parseEdits(reply.text);
        if (!pe.ok) {
          at.result = 'no edits'; at.detail = pe.error; at.ms = now() - at.startedAt;
          feedback = pe.error + ' Your reply began: ' + JSON.stringify(reply.text.slice(0, 300));
          await saveJob(job); continue;
        }
        at.edits = pe.edits.length;
        const ap = applyEdits(src, pe.edits);
        if (!ap.ok) {
          at.result = 'edits rejected'; at.detail = ap.problems.join(' | ').slice(0, 2000); at.ms = now() - at.startedAt;
          feedback = ap.problems.join('\n');
          await saveJob(job); continue;
        }
        job.stage = 'Code gate (attempt ' + a + ')';
        await saveJob(job);
        const g = gate(job.sourceName, src, ap.text, job.checks);
        const failed = g.checks.filter(function (c) { return !c.pass; });
        if (!g.pass) {
          at.result = 'gate failed'; at.detail = failed.map(function (c) { return c.id + ' (' + c.detail + ')'; }).join(' | ').slice(0, 2000); at.ms = now() - at.startedAt;
          feedback = 'The code gate failed on:\n' + failed.map(function (c) { return '- ' + c.id + ': ' + c.detail; }).join('\n');
          await saveJob(job); continue;
        }
        const sha = sha256(ap.text);
        await writeJSON(null, 'hjobfile:' + id, { name: job.sourceName, text: ap.text, sha256: sha });
        at.result = 'passed'; at.ms = now() - at.startedAt;
        job.status = 'delivered'; job.stage = 'Delivered'; job.finishedAt = now();
        job.result = { name: job.sourceName, sha256: sha, bytes: Buffer.byteLength(ap.text, 'utf8'), edits: ap.count, checks: g.checks, nonAscii: g.nonAscii };
        await saveJob(job);
        await finishStore(id);
        await notify(job, ap.text);
        return;
      }
      const last = job.attempts[job.attempts.length - 1] || {};
      job.status = 'escalated'; job.stage = 'Escalated'; job.finishedAt = now();
      job.reason = 'All ' + MAX_ATTEMPTS + ' attempts failed. Last attempt: ' + (last.result || '?') + (last.detail ? (' - ' + last.detail) : '');
      await saveJob(job);
      await finishStore(id);
      await notify(job, null);
    } catch (e) {
      console.log('[job] ' + id + ' crashed: ' + ((e && e.stack) || e));
      if (job) {
        job.status = 'escalated'; job.stage = 'Escalated'; job.finishedAt = now();
        job.reason = 'The job engine hit an error: ' + String((e && e.message) || e);
        try { await saveJob(job); await notify(job, null); } catch (e2) {}
      }
    } finally {
      delete RUNNING[id];
    }
  }
  async function finishStore(id) {
    try { await expire('hjob:' + id, KEEP_SECONDS); } catch (e) {}
    try { await expire('hjobsrc:' + id, KEEP_SECONDS); } catch (e) {}
    try { await expire('hjobfile:' + id, KEEP_SECONDS); } catch (e) {}
    try { await expire('hjobprog:' + id, 3600); } catch (e) {}
  }

  // ---------------------------------------------------------------- email ----------------
  function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }
  function wrap76(s) { return s.replace(/(.{76})/g, '$1\r\n'); }
  function buildMime(from, toList, subject, text, att) {
    const bnd = 'bnt_' + crypto.randomBytes(8).toString('hex');
    const lines = [
      'From: Hanna - Bionectech AI Lab <' + from + '>',
      'To: ' + toList.join(', '),
      'Subject: =?UTF-8?B?' + b64(subject) + '?=',
      'Date: ' + new Date().toUTCString(),
      'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@bionectech-lab>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + bnd + '"',
      '',
      '--' + bnd,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(b64(text))
    ];
    if (att && att.text != null) {
      const fname = safeName(att.name) || 'deliverable.txt';
      lines.push('--' + bnd,
        'Content-Type: application/octet-stream; name="' + fname + '"',
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="' + fname + '"',
        '',
        wrap76(b64(att.text)));
    }
    lines.push('--' + bnd + '--', '');
    return lines.join('\r\n');        // base64 bodies never begin a line with "." - no dot-stuffing needed
  }
  function smtpSend(opt) {
    return new Promise(function (resolve, reject) {
      const host = process.env.SMTP_HOST || 'smtp.gmail.com';
      const port = parseInt(process.env.SMTP_PORT || '465', 10);
      const plain = process.env.SMTP_PLAIN_TEST === '1';   // local tests only
      let sock, buf = '', waiter = null, done = false;
      const timer = setTimeout(function () { fail(new Error('SMTP timed out after 45s')); }, 45000);
      function fail(e) { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch (x) {} reject(e); }
      function finish() { if (done) return; done = true; clearTimeout(timer); try { sock.end(); } catch (x) {} resolve(); }
      function pump() {
        if (!waiter) return;
        const lines = buf.split('\r\n');
        for (let i = 0; i < lines.length - 1; i++) {
          if (/^\d{3} /.test(lines[i])) {
            const reply = lines.slice(0, i + 1).join('\n');
            buf = lines.slice(i + 1).join('\r\n');
            const w = waiter; waiter = null; w(reply); return;
          }
        }
      }
      function expect(code) {
        return new Promise(function (res) {
          waiter = function (reply) {
            if (reply.slice(0, 3) !== String(code)) { fail(new Error('SMTP expected ' + code + ', got: ' + reply.split('\n').pop())); return; }
            res(reply);
          };
          pump();
        });
      }
      function send(line) { sock.write(line + '\r\n'); }
      try {
        sock = plain ? net.connect(port, host) : tls.connect({ host: host, port: port, servername: host });
      } catch (e) { fail(e); return; }
      sock.setEncoding('utf8');
      sock.on('data', function (d) { buf += d; pump(); });
      sock.on('error', fail);
      (async function () {
        await expect(220);
        send('EHLO bionectech-lab'); await expect(250);
        send('AUTH LOGIN'); await expect(334);
        send(b64(opt.user)); await expect(334);
        send(b64(opt.pass)); await expect(235);
        send('MAIL FROM:<' + opt.user + '>'); await expect(250);
        for (let i = 0; i < opt.to.length; i++) { send('RCPT TO:<' + opt.to[i] + '>'); await expect(250); }
        send('DATA'); await expect(354);
        sock.write(opt.message + '\r\n.\r\n'); await expect(250);
        send('QUIT');
        finish();
      })().catch(fail);
    });
  }
  function mailConfig() {
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    const to = (process.env.REPORT_TO || user).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return { user: user, pass: pass, to: to, ok: !!(user && pass && to.length) };
  }
  async function sendMail(subject, text, att) {
    const cfg = mailConfig();
    if (!cfg.ok) throw new Error('email not configured: set SMTP_USER, SMTP_PASS and REPORT_TO on the Render service');
    await smtpSend({ user: cfg.user, pass: cfg.pass, to: cfg.to, message: buildMime(cfg.user, cfg.to, subject, text, att) });
    return cfg.to.join(', ');
  }
  function secs(ms) { return Math.round((ms || 0) / 1000) + 's'; }
  function reportText(job) {
    const L = ['Hanna - Bionectech AI Lab', '', 'Job: ' + job.title + ' (' + job.id + ')', 'Status: ' + String(job.status).toUpperCase()];
    L.push('Source: ' + job.sourceName + ' (' + job.sourceBytes + ' bytes, SHA-256 ' + job.sourceSha256 + ')');
    L.push('Time: ' + secs((job.finishedAt || now()) - (job.startedAt || job.createdAt)) + ', attempts: ' + (job.attempts || []).length + ' of ' + MAX_ATTEMPTS);
    if (job.kanon) L.push('Kanon: ' + (job.kanon.status === 'compiled' ? ('wrote and proved the rules from the real file (' + job.kanon.tries + ' tries)') : ('not used - ' + job.kanon.reason)));
    if (job.status === 'delivered' && job.result) {
      L.push('', 'Delivered file: ' + job.result.name + ' (' + job.result.bytes + ' bytes)', 'SHA-256: ' + job.result.sha256, 'Edits applied: ' + job.result.edits);
      L.push('Non-ASCII characters: ' + job.result.nonAscii.before + ' before, ' + job.result.nonAscii.after + ' after', '', 'Checks passed:');
      job.result.checks.forEach(function (c) { L.push('  - ' + c.id + (c.detail ? (' (' + c.detail + ')') : '')); });
      L.push('', 'The verified file is attached. Nothing is waiting on you.');
    } else {
      L.push('', 'Why it stopped: ' + (job.reason || 'unknown'), '', 'Attempts:');
      (job.attempts || []).forEach(function (a) { L.push('  ' + a.n + '. ' + (a.result || '?') + (a.detail ? (' - ' + String(a.detail).slice(0, 600)) : '')); });
      L.push('', 'What I need from you: adjust the task or the source in the Lab Jobs panel, then press Rerun.');
    }
    return L.join('\n');
  }
  async function notify(job, fileText) {
    if (job.notify === false) { job.email = 'reported in the mission email'; try { await saveJob(job); } catch (e) {} return; }
    const subject = (job.status === 'delivered' ? 'DELIVERED: ' : 'ESCALATED: ') + job.title;
    try {
      const to = await sendMail(subject, reportText(job), fileText != null ? { name: job.sourceName, text: fileText } : null);
      job.email = 'sent to ' + to + ' at ' + new Date().toISOString();
    } catch (e) {
      job.email = 'not sent: ' + String((e && e.message) || e);
    }
    try { await saveJob(job); } catch (e) {}
  }

  // ---------------------------------------------------------------- http ------------------
  function summary(job, prog) {
    return {
      id: job.id, title: job.title, status: job.status, stage: job.stage, sourceName: job.sourceName,
      createdAt: job.createdAt, updatedAt: job.updatedAt, finishedAt: job.finishedAt || null,
      attempts: (job.attempts || []).map(function (a) { return { n: a.n, result: a.result || 'running', detail: a.detail || '', edits: a.edits || 0, ms: a.ms || 0, model: a.model || '' }; }),
      reason: job.reason || '', email: job.email || '',
      result: job.result ? { name: job.result.name, sha256: job.result.sha256, bytes: job.result.bytes, edits: job.result.edits, checks: job.result.checks } : null,
      progress: prog || null, running: !!RUNNING[job.id]
    };
  }
  async function loadWithStaleCheck(id) {
    const job = await readJSON(null, 'hjob:' + id, null);
    if (!job) return null;
    if ((job.status === 'queued' || job.status === 'building') && !RUNNING[id] && now() - (job.updatedAt || 0) > STALE_MS) {
      job.status = 'escalated'; job.stage = 'Escalated'; job.finishedAt = now();
      job.reason = 'The server restarted while this job was running. Press Rerun.';
      await saveJob(job);
      await notify(job, null);
    }
    return job;
  }
  function normRequired(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 100).map(function (r) {
      if (typeof r === 'string') return r ? { text: r, min: 1, max: null } : null;
      if (!r || typeof r.text !== 'string' || !r.text) return null;
      const min = (r.min != null && isFinite(r.min)) ? Math.max(0, parseInt(r.min, 10)) : 1;
      const max = (r.max != null && isFinite(r.max)) ? Math.max(min, parseInt(r.max, 10)) : null;
      return { text: r.text, min: min, max: max };
    }).filter(Boolean);
  }

  function makeHandler(skipGate) { return async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
    const user = userFrom(event);
    if (!user) return json(401, { error: 'Sign in first.' });
    if (user.role !== 'admin') return json(403, { error: 'Build jobs are admin-only.' });
    const q = event.queryStringParameters || {};
    let b = {};
    if (event.httpMethod === 'POST') {
      try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Body must be JSON.' }); }
    }
    const action = String(b.action || q.action || '');
    const ctx = { headers: Object.assign({}, event.headers || {}), ownerCode: String(b.ownerCode || '') };
    /* BNT_GATE: server-enforced panel code */
    if (action === 'unlock') { const g = await accessGate.unlock('jobs', user, b.code, clientIp(event)); return json(g.status || (g.ok ? 200 : 401), g); }
    if (action === 'lock') { return json(200, await accessGate.lock('jobs', user)); }
    if (!skipGate && !(await accessGate.isUnlocked('jobs', user))) return json(423, { error: accessGate.lockedMessage('jobs'), locked: true });
    try {
      if (action === 'create') {
        const title = String(b.title || '').trim().slice(0, 200) || 'Untitled job';
        const instructions = String(b.instructions || '').trim();
        const sourceName = safeName(b.sourceName);
        const sourceText = (typeof b.sourceText === 'string') ? b.sourceText : '';
        if (!instructions) return json(400, { error: 'Write the task.' });
        if (!sourceName || !sourceText) return json(400, { error: 'Attach the source file.' });
        if (sourceText.length > 3000000) return json(413, { error: 'Source file is over 3 MB.' });
        const banned = (Array.isArray(b.banned) ? b.banned : String(b.banned || '').split(','))
          .map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 50);
        const id = newId();
        const job = {
          id: id, title: title, instructions: instructions.slice(0, 60000), sourceName: sourceName,
          sourceSha256: sha256(sourceText), sourceBytes: Buffer.byteLength(sourceText, 'utf8'),
          checks: { banned: banned, required: normRequired(b.required), html: (b.html === false ? false : (b.html === true ? true : undefined)) },
          persona: 'karam', notify: (b.notify !== false), model: String(b.model || ''), createdBy: String(user.name || user.u || user.user || ''),
          createdAt: now(), status: 'queued', stage: 'Queued', attempts: []
        };
        await writeJSON(null, 'hjobsrc:' + id, { name: sourceName, text: sourceText });
        await saveJob(job);
        await indexAdd(id);
        setImmediate(function () { runJob(id, user, ctx).catch(function (e) { console.log('[job] ' + id + ' ' + e.message); }); });
        return json(200, { ok: true, id: id, job: summary(job, null) });
      }
      if (action === 'get') {
        const id = String(q.id || b.id || '');
        const job = await loadWithStaleCheck(id);
        if (!job) return json(404, { error: 'No such job.' });
        const prog = await readJSON(null, 'hjobprog:' + id, null);
        return json(200, { ok: true, job: summary(job, prog) });
      }
      if (action === 'kanon-preview') {   /* BNT_KANON_VISIBLE: Kanon writes the rules in front of the operator; nothing runs */
        const task = String(b.instructions || b.task || '').trim(), name = safeName(b.sourceName) || 'file', text = (typeof b.sourceText === 'string') ? b.sourceText : '';
        if (!task || !text) return json(400, { error: 'Choose the file and write the task first.' });
        if (text.length > 3000000) return json(413, { error: 'Source file is over 3 MB.' });
        const kr = await require('./lib/kanon').compileJob({ task: task, fileName: name, text: text });
        return json(200, kr.ok ? { ok: true, checks: kr.checks, notes: kr.notes, tries: kr.tries } : { ok: false, error: kr.reason });
      }
      if (action === 'list') {
        let ids = await readJSON(null, INDEX_KEY, []);
        if (!Array.isArray(ids)) ids = [];
        const out = [];
        for (let i = 0; i < Math.min(ids.length, 25); i++) {
          const job = await loadWithStaleCheck(ids[i]);
          if (!job) continue;
          const prog = (job.status === 'building') ? await readJSON(null, 'hjobprog:' + job.id, null) : null;
          out.push(summary(job, prog));
        }
        let kst = null; try { kst = await require('./lib/kanon').status(); } catch (e) {}
        return json(200, { ok: true, jobs: out, email: mailConfig().ok ? 'configured' : 'not configured', kanon: kst });
      }
      if (action === 'file') {
        const id = String(q.id || b.id || '');
        const f = await readJSON(null, 'hjobfile:' + id, null);
        if (!f) return json(404, { error: 'No delivered file for this job.' });
        return json(200, { ok: true, name: f.name, sha256: f.sha256, text: f.text });
      }
      if (action === 'rerun') {
        const id = String(b.id || '');
        const job = await readJSON(null, 'hjob:' + id, null);
        if (!job) return json(404, { error: 'No such job.' });
        if (RUNNING[id]) return json(409, { error: 'This job is already running.' });
        job.status = 'queued'; job.stage = 'Queued for rerun';
        await saveJob(job);
        setImmediate(function () { runJob(id, user, ctx).catch(function (e) { console.log('[job] ' + id + ' ' + e.message); }); });
        return json(200, { ok: true, id: id });
      }
      if (action === 'testmail') {
        const to = await sendMail('Lab email test', 'Hanna - Bionectech AI Lab\n\nThis is a test. Job reports will arrive at this address.', null);
        return json(200, { ok: true, sentTo: to });
      }
      return json(400, { error: 'Unknown action. Use create, get, list, file, rerun or testmail.' });
    } catch (e) {
      return json(500, { error: String((e && e.message) || e) });
    }
  }; };
  const handler = makeHandler(false);
  const internalHandler = makeHandler(true);   // in-process only (missions); never mounted on a URL

  module.exports = { handler: handler, internalHandler: internalHandler, _test: { parseEdits: parseEdits, applyEdits: applyEdits, gate: gate, buildPrompt: buildPrompt, buildMime: buildMime, smtpSend: smtpSend } };
})();
