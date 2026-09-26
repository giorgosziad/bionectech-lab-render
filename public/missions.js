/* missions.js - Bionectech AI Lab: Hanna missions panel (BNT_MISSIONS v1).
   Give Hanna a brief and files. She plans; the server executes each step with checks,
   required reviews and an audit log, then emails one report. Closing the tab never stops it. */
(function () {
  'use strict';
  if (window.__bntMissionsLoaded) return;
  window.__bntMissionsLoaded = true;

  var C = { navy: '#052744', deep: '#031a2e', gold: '#FFD600', ink: '#e8eef5', dim: '#8aa0b6', line: '#1d3f5f', ok: '#3ddc97', bad: '#ff7a7a' };
  var timer = null, open = false, last = [];

  function call(path, opts) {
    if (typeof api === 'function') return api(path, opts);
    var h = { 'Content-Type': 'application/json' };
    try { if (typeof TOKEN !== 'undefined' && TOKEN) h.Authorization = 'Bearer ' + TOKEN; } catch (e) {}
    return fetch('/.netlify/functions/' + path, Object.assign({ headers: h }, opts || {})).then(function (r) {
      return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { ok: r.ok, status: r.status, data: j }; });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(t) { if (!t) return ''; var s = Math.round((Date.now() - t) / 1000); if (s < 60) return s + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago'; }
  function $(id) { return document.getElementById(id) || (panel && panel.querySelector ? panel.querySelector('#' + id) : null); }
  function el(tag, css) { var e = document.createElement(tag); if (css) e.style.cssText = css; return e; }

  var st = el('style');
  st.textContent =
    '#bntMisPanel{position:fixed;top:0;right:0;bottom:0;width:min(600px,100vw);z-index:10001;background:' + C.deep + ';color:' + C.ink + ';border-left:2px solid ' + C.gold + ';display:none;flex-direction:column;font-family:inherit}' +
    '#bntMisPanel.open{display:flex}' +
    '#bntMisPanel header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid ' + C.line + '}' +
    '#bntMisPanel h2{margin:0;font-size:17px;font-weight:600;color:' + C.gold + '}' +
    '#bntMisPanel .body{overflow:auto;padding:14px 18px 40px}' +
    '#bntMisPanel label{display:block;font-size:13px;color:' + C.dim + ';margin:10px 0 4px}' +
    '#bntMisPanel input[type=text],#bntMisPanel input[type=password],#bntMisPanel textarea{width:100%;box-sizing:border-box;background:' + C.navy + ';color:' + C.ink + ';border:1px solid ' + C.line + ';border-radius:6px;padding:8px 10px;font:inherit;font-size:14px}' +
    '#bntMisPanel textarea{min-height:130px;resize:vertical}' +
    '#bntMisPanel button{background:transparent;color:' + C.gold + ';border:1px solid ' + C.gold + ';border-radius:6px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer}' +
    '#bntMisPanel button.primary{background:' + C.gold + ';color:' + C.navy + ';font-weight:600}' +
    '#bntMisPanel button:disabled{opacity:.5;cursor:default}' +
    '#bntMisPanel button:focus-visible,#bntMisPanel input:focus-visible,#bntMisPanel textarea:focus-visible,#bntMisFab:focus-visible{outline:2px solid ' + C.gold + ';outline-offset:2px}' +
    '#bntMisPanel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center}' +
    '#bntMisPanel .note{font-size:12px;color:' + C.dim + ';margin-top:8px;line-height:1.5}' +
    '#bntMisPanel .mis{border:1px solid ' + C.line + ';border-radius:8px;padding:12px;margin-top:10px}' +
    '#bntMisPanel .t{font-weight:600;font-size:14px}' +
    '#bntMisPanel .s{font-size:13px;margin-top:4px;line-height:1.5}' +
    '#bntMisPanel ol{margin:8px 0 0 18px;padding:0;font-size:13px;line-height:1.6}' +
    '#bntMisPanel details{margin-top:8px;font-size:12px;color:' + C.dim + '}' +
    '#bntMisPanel .sec{margin-top:22px;font-size:15px;font-weight:600}';
  document.head.appendChild(st);

  var fab = el('button', 'position:fixed;left:18px;bottom:92px;z-index:9998;background:' + C.gold + ';color:' + C.navy + ';border:1px solid ' + C.gold + ';border-radius:20px;padding:8px 16px;font-weight:bold;cursor:pointer;font-family:monospace');
  fab.id = 'bntMisFab'; fab.type = 'button'; fab.textContent = 'Missions'; fab.setAttribute('aria-controls', 'bntMisPanel');

  var panel = el('aside'); panel.id = 'bntMisPanel'; panel.setAttribute('aria-label', 'Hanna missions');
  panel.innerHTML =
    '<header><h2>Hanna missions</h2><div class="row" style="margin:0"><button type="button" id="bmLockBtn">Lock</button><button type="button" id="bmClose">Close</button></div></header>' +
    '<div class="body">' +
    '<div id="bmLock" hidden><div class="sec">Enter the Missions code</div><div class="note">This panel is locked. The code is checked on the server; after 5 wrong tries it waits 15 minutes. An unlock lasts 8 hours on this account.</div><label for="bmCode">Missions code</label><input type="password" id="bmCode" autocomplete="off" spellcheck="false"><div class="row"><button type="button" class="primary" id="bmUnlock">Unlock</button><span class="note" id="bmLockMsg" role="status"></span></div></div>' +
    '<div id="bmMain">' +
    '<div class="note">Give Hanna the brief and the files once. She plans the work across the desks; the server runs every step, checks it, sends regulated wording to Solon for review, and emails you one report with the delivered files. Closing this tab does not stop a mission.</div>' +
    '<div class="note" id="bmKanon">Kanon: checking...</div>' +
    '<details id="bmKB" style="margin:10px 0"><summary style="cursor:pointer;font-weight:600;color:' + C.gold + '">Kanon: write the brief for me</summary>' +
    '<div class="note">Tell Kanon what you want and give him the record - chat exports, notes, desk outputs, any size. Attach the target files below under Files. Kanon reads everything, the server counts the target files and test-plans the brief, and the brief appears in the Brief box for you to check. Nothing starts until you press Start mission.</div>' +
    '<label for="bmKBWant">What do you want delivered?</label><textarea id="bmKBWant" placeholder="For example: OncoDefy v9 with Galen and Fotis items and the final posture sentence."></textarea>' +
    '<label for="bmKBRec">The record (any size)</label><input type="file" id="bmKBRec" multiple>' +
    '<div class="row"><button type="button" class="primary" id="bmKBGo">Kanon: write the brief</button><span class="note" id="bmKBMsg" role="status"></span></div>' +
    '<div id="bmKBOut"></div>' +
    '</details>' +
    '<details id="bmKK" style="margin:10px 0"><summary style="cursor:pointer;font-weight:600">Kanon\'s standing knowledge</summary>' +
    '<div class="note">Kanon reads this before every brief: your products, standing rules and ruled positions. Correct it once; it is saved on the server.</div>' +
    '<textarea id="bmKKText" rows="12"></textarea>' +
    '<div class="row"><button type="button" id="bmKKSave">Save knowledge</button><span class="note" id="bmKKMsg" role="status"></span></div>' +
    '</details>' +
    '<details id="bmSp" style="margin:10px 0"><summary style="cursor:pointer;font-weight:600">Spend - API tokens by desk</summary>' +
    '<div class="note">Real usage reported by Anthropic for every call the Lab makes. Input tokens are usually most of the cost; cached tokens cost a fraction of normal input.</div>' +
    '<div class="row"><button type="button" data-spd="1">Today</button><button type="button" data-spd="7">7 days</button><button type="button" data-spd="30">30 days</button><span class="note" id="bmSpMsg"></span></div>' +
    '<div id="bmSpOut"></div>' +
    '</details>' +
    '<div class="sec">New mission</div>' +
    '<label for="bmTitle">Title</label><input type="text" id="bmTitle" placeholder="OncoDefy posture update">' +
    '<label for="bmBrief">Brief for Hanna</label><textarea id="bmBrief" placeholder="What you want delivered, the rules it must follow, and what done looks like."></textarea>' +
    '<label for="bmFiles">Files (up to 8)</label><input type="file" id="bmFiles" multiple>' +
    '<div class="row"><button type="button" class="primary" id="bmStart">Start mission</button><span class="note" id="bmMsg" role="status"></span></div>' +
    '<div class="sec">Missions</div><div id="bmList"><div class="note">No missions yet.</div></div>' +
    '</div></div>';

  function msg(t, bad) { var m = $('bmMsg'); m.textContent = t || ''; m.style.color = bad ? C.bad : C.dim; }
  var locked = false;
  function showLock(t) { locked = true; $('bmLock').hidden = false; $('bmMain').hidden = true; $('bmLockMsg').textContent = t || ''; $('bmLockMsg').style.color = C.dim; try { $('bmCode').focus(); } catch (e) {} }
  function hideLock() { locked = false; $('bmLock').hidden = true; $('bmMain').hidden = false; }
  function isLocked(r) { if (authRejected(r)) return true; if (r && r.status === 423) { showLock((r.data && r.data.error) || 'This panel is locked.'); return true; } return false; }
  function doUnlock() {
    var code = $('bmCode').value; $('bmCode').value = '';
    if (!code) { $('bmLockMsg').textContent = 'Enter the code.'; return; }
    $('bmUnlock').disabled = true;
    call('mission', { method: 'POST', body: JSON.stringify({ action: 'unlock', code: code }) }).then(function (r) {
      $('bmUnlock').disabled = false;
      if (r.ok && r.data && r.data.ok) { hideLock(); refresh().then(schedule); return; }
      var m = (r.data && r.data.error) || ('Unlock failed (HTTP ' + r.status + ').');
      if (r.data && r.data.attemptsLeft != null) m += ' ' + r.data.attemptsLeft + ' attempt(s) left.';
      $('bmLockMsg').textContent = m; $('bmLockMsg').style.color = C.bad;
    }).catch(function () { $('bmUnlock').disabled = false; $('bmLockMsg').textContent = 'Could not reach the Lab server.'; });
  }
  function doLock() { call('mission', { method: 'POST', body: JSON.stringify({ action: 'lock' }) }).then(function () { render([]); showLock('Locked.'); }); }
  function color(s) { return s === 'delivered' || s === 'done' ? C.ok : ((s === 'escalated' || s === 'failed') ? C.bad : C.gold); }
  function stepLine(s) {
    var what = s.tool + (s.desk ? (' by ' + s.desk) : '') + (s.file ? (' on ' + s.file) : '') + (s.target ? (' of ' + s.target) : '');
    var extra = (s.auto ? ' [required review]' : '') + (s.verdict ? (' - verdict ' + s.verdict) : '') + (s.revisions ? (' - ' + s.revisions + ' revision(s)') : '') + (s.rules ? (' - ' + s.rules + ' proved rules') : '') + (s.reason ? (' - ' + s.reason.slice(0, 220)) : '');
    return '<li><span style="color:' + color(s.status) + '">' + esc(s.status) + '</span> ' + esc(s.id + ': ' + what) + esc(extra) + '</li>';
  }
  /* BNT_KANON_VISIBLE */
  function kanonLine(k) {
    if (!k) return '';
    return k.ready ? ('<span style="color:' + C.ok + ';font-weight:600">Kanon is ready</span> - the measuring rod. He writes the exact commands and rules for every mission after Hanna plans it, and the server proves them before anything runs. Model: ' + esc(k.model) + '.')
                   : ('<span style="color:' + C.gold + ';font-weight:600">Kanon is offline</span> - no model key on the server. Missions still run on Hanna\'s plan.');
  }
  var openPlans = {};   /* mission id -> rendered commands, kept open across refreshes */
  function rulesText(c) {
    if (!c) return '';
    var a = (c.required || []).map(function (q) { return 'must contain "' + String(q.text).slice(0, 160) + '" ' + ((q.max != null && q.min === q.max) ? ('exactly ' + q.min) : ('at least ' + q.min)) + (q.min === 1 && q.max === 1 ? ' time' : ' times'); });
    (c.banned || []).forEach(function (b) { a.push('must never contain "' + b + '"'); });
    return a.length ? ('<div style="margin:4px 0"><b>Proved rules:</b><ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>') : '';
  }
  var PRE = 'white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;background:rgba(0,0,0,.25);border:1px solid ' + C.line + ';border-radius:6px;padding:8px;font-size:12px;margin:4px 0';
  function planHtml(d) {
    var head = (d.kanon && d.kanon.status === 'compiled') ? ('<b style="color:' + C.ok + '">Commands written by Kanon and proved by the server</b>') : ('<b style="color:' + C.gold + '">Hanna\'s plan - Kanon was not used' + ((d.kanon && d.kanon.reason) ? (': ' + esc(String(d.kanon.reason).slice(0, 200))) : '') + '</b>');
    var steps = (d.steps || []).map(function (st) {
      var what = st.id + ' - ' + st.tool + (st.desk ? (' by ' + st.desk) : '') + (st.file ? (' on ' + st.file) : '') + (st.target ? (' of ' + st.target) : '') + (st.auto ? ' [required review]' : '');
      var body = st.task ? ('<div><b>Task:</b></div><div style="' + PRE + '">' + esc(st.task) + '</div>') : '';
      if (st.criteria) body += '<div><b>Review criteria:</b></div><div style="' + PRE + '">' + esc(st.criteria) + '</div>';
      return '<li style="margin:8px 0"><b>' + esc(what) + '</b>' + body + rulesText(st.checks) + '</li>';
    }).join('');
    return '<div class="kplan" style="margin-top:8px;border-top:1px solid ' + C.line + ';padding-top:8px">' + head + (d.goal ? ('<div>Goal: ' + esc(d.goal) + '</div>') : '') + '<ol>' + steps + '</ol></div>';
  }
  function togglePlan(id) {
    if (openPlans[id]) { delete openPlans[id]; render(last); return; }
    call('mission?action=plan&id=' + encodeURIComponent(id), { method: 'GET' }).then(function (r) {
      if (isLocked(r)) return;
      if (!r.ok || !r.data || !r.data.ok) { msg((r.data && r.data.error) || ('Could not load the commands (HTTP ' + r.status + ').'), true); return; }
      openPlans[id] = planHtml(r.data); render(last);
    }).catch(function () { msg('Could not reach the Lab server.', true); });
  }
  function render(list) {
    last = list || [];
    var box = $('bmList');
    if (!last.length) { box.innerHTML = '<div class="note">No missions yet.</div>'; return; }
    box.innerHTML = last.map(function (m) {
      var L = ['<span style="color:' + color(m.status) + ';font-weight:600">' + esc(m.status) + '</span> ' + esc(m.stage || '')];
      if (m.goal) L.push('Goal: ' + esc(m.goal));
      if (m.kanon) L.push(m.kanon.status === 'compiled' ? ('<span style="color:' + C.ok + '">Kanon: plan compiled and proved (' + esc(m.kanon.probes) + ' counts measured, ' + esc(m.kanon.tries) + ' tries)</span>') : ('<span style="color:' + C.gold + '">Kanon not used: ' + esc(String(m.kanon.reason || '').slice(0, 200)) + '</span>'));
      if (m.reason) L.push(esc(m.reason));
      if (m.email) L.push('Email: ' + esc(m.email));
      L.push('Updated ' + esc(ago(m.updatedAt)));
      var steps = (m.steps && m.steps.length) ? '<ol>' + m.steps.map(stepLine).join('') + '</ol>' : '';
      var dls = (m.deliverables || []).filter(function (d) { return d.jobId; }).map(function (d) {
        return '<button type="button" data-job="' + esc(d.jobId) + '" data-mis="' + esc(m.id) + '">Download ' + esc(d.name) + '</button>';
      }).join('');
      var aud = (m.audit && m.audit.length) ? '<details><summary>Audit log</summary><ul>' + m.audit.map(function (a) {
        return '<li>' + esc(new Date(a.at).toLocaleTimeString()) + ' ' + esc((a.step ? a.step + ' ' : '') + a.event) + (a.detail ? (': ' + esc(String(a.detail).slice(0, 300))) : '') + '</li>';
      }).join('') + '</ul></details>' : '';
      var kbtn = (m.steps && m.steps.length) ? ('<button type="button" data-plan="' + esc(m.id) + '">' + (openPlans[m.id] ? 'Hide Kanon\'s commands' : 'Show Kanon\'s commands') + '</button>') : '';
      return '<div class="mis"><div class="t">' + esc(m.title) + '</div><div class="s">' + L.join('<br>') + '</div>' + steps + '<div class="row">' + kbtn + dls + '</div>' + (openPlans[m.id] || '') + aud + '</div>';
    }).join('');
  }
  function refresh() {
    return call('mission?action=list', { method: 'GET' }).then(function (r) {
      if (isLocked(r)) return;
      hideLock();
      if (r.ok && r.data && r.data.ok) { if ($('bmKanon')) $('bmKanon').innerHTML = kanonLine(r.data.kanon); render(r.data.missions); } else msg((r.data && r.data.error) || ('Could not load missions (HTTP ' + r.status + ').'), true);
    }).catch(function () { msg('Could not reach the Lab server.', true); });
  }
  function schedule() {
    clearTimeout(timer);
    if (!open || locked) return;
    var active = last.some(function (m) { return m.status === 'queued' || m.status === 'planning' || m.status === 'running'; });
    timer = setTimeout(function () { refresh().then(schedule); }, active ? 3000 : 15000);
  }
  function readAll(files) {
    return Promise.all(Array.prototype.slice.call(files || [], 0, 8).map(function (f) {
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res({ name: f.name, text: String(r.result) }); }; r.onerror = function () { rej(new Error('Could not read ' + f.name)); }; r.readAsText(f, 'utf-8'); });
    }));
  }
  /* BNT_KANON_BRIEF: Kanon writes the brief */
  var PART = 700000, kbTimer = null, kbLast = null, kkLoaded = false;
  function kbMsg(t, bad) { var m = $('bmKBMsg'); if (m) { m.textContent = t || ''; m.style.color = bad ? C.bad : C.dim; } }
  function prepRecord(list) {
    var seen = {}, out = [], orig = 0, removed = 0;
    list.forEach(function (f) {
      var lines = String(f.text || '').split(/\r?\n/); orig += String(f.text || '').length;
      var tag = list.length > 1 ? (f.name + ' ') : '';
      if (list.length > 1) out.push('=== RECORD FILE ' + f.name + ' ===');
      lines.forEach(function (l, i) {
        var t = l.length > 6000 ? (l.slice(0, 4000) + ' [... ' + (l.length - 5000) + ' characters omitted ...] ' + l.slice(-1000)) : l;
        var key = t.trim();
        if (key.length >= 40) { if (seen[key]) { removed++; return; } seen[key] = 1; }
        if (!key) return;
        out.push(tag + 'L' + (i + 1) + ': ' + t);
      });
    });
    var text = out.join('\n');
    return { text: text, orig: orig, kept: text.length, removed: removed };
  }
  function kbSend(id, text, i) {
    if (i >= text.length) return Promise.resolve();
    kbMsg('Sending the record to Kanon: ' + Math.min(100, Math.round((i + PART) * 100 / text.length)) + '%...');
    return call('brief', { method: 'POST', body: JSON.stringify({ action: 'append', id: id, part: text.slice(i, i + PART) }) }).then(function (r) {
      if (isLocked(r)) throw new Error('locked');
      if (!r.ok) throw new Error((r.data && r.data.error) || ('HTTP ' + r.status));
      return kbSend(id, text, i + PART);
    });
  }
  function kbFill(force) {
    if (!kbLast || !kbLast.brief) return;
    var box = $('bmBrief');
    if (box.value.trim() && !force) return false;
    box.value = kbLast.brief; return true;
  }
  function kbRender(g) {
    var o = $('bmKBOut'); if (!o) return;
    if (!g || g.status !== 'done' || !g.result) { o.innerHTML = ''; return; }
    var r = g.result; kbLast = r;
    var h = '<div class="mis"><div class="t" style="color:' + C.ok + '">Kanon wrote the brief and the server test-planned it</div>' +
      '<div class="s">Read ' + esc(r.partsRead) + ' part(s) of the record, found ' + esc(r.itemsFound) + ' decisions and requirements, measured ' + esc(r.probes) + ' counts in the target files, and the brief plans into ' + esc(r.plannedSteps) + ' proved steps.</div>' +
      '<div class="row"><button type="button" id="bmKBPut">Put Kanon\'s brief in the Brief box</button></div>';
    if (r.flags && r.flags.length) h += '<div style="margin-top:6px"><b style="color:' + C.gold + '">Flags - read these before you start:</b><ul>' + r.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>';
    if (r.decisions && r.decisions.length) h += '<details><summary>Decision record (' + r.decisions.length + ', with line numbers in the record)</summary><ul>' + r.decisions.map(function (d) { return '<li><span style="color:' + (d.status === 'final' ? C.ok : (d.status === 'superseded' ? C.dim : C.gold)) + '">' + esc(d.status || '') + '</span> line ' + esc(d.line) + ': ' + esc(d.decision) + '</li>'; }).join('') + '</ul></details>';
    o.innerHTML = h + '</div>';
    var b = $('bmKBPut'); if (b) b.addEventListener('click', function () { kbFill(true); msg('Kanon\'s brief is in the Brief box. Check it, attach the target files, then press Start mission.'); });
  }
  function kbPoll(id) {
    clearTimeout(kbTimer);
    call('brief?action=get&id=' + encodeURIComponent(id), { method: 'GET' }).then(function (r) {
      if (isLocked(r)) return;
      var g = r.data && r.data.brief;
      if (!g) { kbMsg('Lost track of the brief. Start again.', true); $('bmKBGo').disabled = false; return; }
      if (g.status === 'done') { $('bmKBGo').disabled = false; kbRender(g); var put = kbFill(false); kbMsg(put ? 'Done - the brief is in the Brief box below.' : 'Done - your Brief box already had text; press the button above to replace it.'); return; }
      if (g.status === 'failed') { $('bmKBGo').disabled = false; kbMsg('Kanon could not finish: ' + (g.reason || 'unknown reason'), true); return; }
      kbMsg(g.stage || 'Kanon is working...');
      kbTimer = setTimeout(function () { kbPoll(id); }, 3000);
    }).catch(function () { kbTimer = setTimeout(function () { kbPoll(id); }, 5000); });
  }
  function kbGo() {
    var want = $('bmKBWant').value.trim();
    if (!want) { kbMsg('Say in a few words what you want delivered.', true); return; }
    $('bmKBGo').disabled = true; $('bmKBOut').innerHTML = ''; kbMsg('Reading your files...');
    var prep = null, id = null;
    Promise.all([readAll($('bmKBRec').files), readAll($('bmFiles').files)]).then(function (res) {
      prep = prepRecord(res[0]);
      return call('brief', { method: 'POST', body: JSON.stringify({ action: 'create', want: want, files: res[1] }) });
    }).then(function (r) {
      if (isLocked(r)) throw new Error('locked');
      if (!r.ok || !r.data || !r.data.ok) throw new Error((r.data && r.data.error) || ('HTTP ' + r.status));
      id = r.data.id; return kbSend(id, prep.text, 0);
    }).then(function () {
      return call('brief', { method: 'POST', body: JSON.stringify({ action: 'start', id: id }) });
    }).then(function (r) {
      if (!r.ok) throw new Error((r.data && r.data.error) || ('HTTP ' + r.status));
      kbMsg('Kanon started. Record: ' + prep.orig.toLocaleString() + ' characters, ' + prep.removed.toLocaleString() + ' repeated lines removed. You can close this panel.');
      kbPoll(id);
    }).catch(function (e) { $('bmKBGo').disabled = false; if (e && e.message !== 'locked') kbMsg('Could not start Kanon: ' + e.message, true); });
  }
  function kkLoad() {
    if (kkLoaded) return;
    call('brief?action=knowledge-get', { method: 'GET' }).then(function (r) {
      if (isLocked(r)) return;
      if (r.ok && r.data && r.data.ok) { kkLoaded = true; $('bmKKText').value = r.data.text || ''; $('bmKKMsg').textContent = r.data.isDefault ? 'This is the knowledge Kanon started with. Edit and save to make it yours.' : 'Saved knowledge.'; }
    });
  }
  function kkSave() {
    $('bmKKSave').disabled = true;
    call('brief', { method: 'POST', body: JSON.stringify({ action: 'knowledge-set', text: $('bmKKText').value }) }).then(function (r) {
      $('bmKKSave').disabled = false;
      if (isLocked(r)) return;
      $('bmKKMsg').textContent = (r.ok && r.data && r.data.ok) ? 'Saved. Kanon reads this before every brief.' : ('Not saved: ' + ((r.data && r.data.error) || ('HTTP ' + r.status)));
    }).catch(function () { $('bmKKSave').disabled = false; $('bmKKMsg').textContent = 'Could not reach the Lab server.'; });
  }
  /* BNT_METER: Spend view */
  function n0(x) { return Number(x || 0).toLocaleString(); }
  function spTable(title, map) {
    var rows = Object.keys(map).map(function (k) { return [k, map[k]]; }).sort(function (a, b) { return (b[1].input + b[1].cacheWrite) - (a[1].input + a[1].cacheWrite); });
    var tot = rows.reduce(function (t, r) { return t + r[1].input + r[1].cacheWrite; }, 0) || 1;
    return '<div style="margin-top:8px"><b>' + esc(title) + '</b><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="color:' + C.gold + '"><th align="left">Name</th><th align="right">Calls</th><th align="right">Input</th><th align="right">Output</th><th align="right">Cache read</th><th align="right">Cache write</th><th align="right">Share of input</th></tr>' +
      rows.map(function (r) { var v = r[1]; return '<tr style="border-top:1px solid ' + C.line + '"><td>' + esc(r[0]) + '</td><td align="right">' + n0(v.calls) + '</td><td align="right">' + n0(v.input) + '</td><td align="right">' + n0(v.output) + '</td><td align="right">' + n0(v.cacheRead) + '</td><td align="right">' + n0(v.cacheWrite) + '</td><td align="right">' + Math.round((v.input + v.cacheWrite) * 100 / tot) + '%</td></tr>'; }).join('') + '</table></div></div>';
  }
  function spLoad(days) {
    $('bmSpMsg').textContent = 'Loading...';
    call('meter?days=' + days, { method: 'GET' }).then(function (r) {
      if (isLocked(r)) return;
      if (!r.ok || !r.data || !r.data.ok) { $('bmSpMsg').textContent = (r.data && r.data.error) || ('HTTP ' + r.status); return; }
      var desks = {}, models = {}, calls = 0;
      function addTo(dst, src) { Object.keys(src || {}).forEach(function (k) { var a = dst[k] || (dst[k] = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }), b = src[k]; a.calls += b.calls; a.input += b.input; a.output += b.output; a.cacheRead += b.cacheRead; a.cacheWrite += b.cacheWrite; }); }
      (r.data.days || []).forEach(function (d) { addTo(desks, d.desks); addTo(models, d.models); });
      Object.keys(desks).forEach(function (k) { calls += desks[k].calls; });
      $('bmSpMsg').textContent = calls ? (n0(calls) + ' calls in the last ' + days + ' day(s).') : 'No calls recorded yet in this period.';
      $('bmSpOut').innerHTML = calls ? (spTable('By desk', desks) + spTable('By model', models)) : '';
    }).catch(function () { $('bmSpMsg').textContent = 'Could not reach the Lab server.'; });
  }
  function start() {
    var brief = $('bmBrief').value.trim();
    if (!brief) { msg('Write the brief for Hanna.', true); return; }
    $('bmStart').disabled = true; msg('Uploading...');
    readAll($('bmFiles').files).then(function (files) {
      var model = ''; try { var mm = document.getElementById('model'); if (mm && mm.value) model = mm.value; } catch (e) {}
      var oc = ''; try { if (typeof ownerCode !== 'undefined' && ownerCode) oc = ownerCode; } catch (e) {}
      return call('mission', { method: 'POST', body: JSON.stringify({ action: 'create', title: $('bmTitle').value.trim(), brief: brief, files: files, model: model, ownerCode: oc }) });
    }).then(function (r) {
      $('bmStart').disabled = false;
      if (isLocked(r)) return;
      if (!r.ok || !r.data || !r.data.ok) { msg((r.data && r.data.error) || ('Mission was not created (HTTP ' + r.status + ').'), true); return; }
      msg('Mission started. Hanna is planning; you can close this panel.');
      refresh().then(schedule);
    }).catch(function (e) { $('bmStart').disabled = false; msg(e.message, true); });
  }
  function download(misId, jobId) {
    call('mission?action=file&id=' + encodeURIComponent(misId) + '&job=' + encodeURIComponent(jobId), { method: 'GET' }).then(function (r) {
      if (isLocked(r)) return;
      if (!r.ok || !r.data || !r.data.ok) { msg((r.data && r.data.error) || 'Download failed.', true); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data.text], { type: 'text/plain;charset=utf-8' })); a.download = r.data.name || 'deliverable.txt';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  }
  function toggle(v) {
    open = (v == null) ? !open : v;
    panel.classList.toggle('open', open);
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { refresh().then(function () { schedule(); if (!locked) $('bmBrief').focus(); }); } else { clearTimeout(timer); fab.focus(); }
  }
  /* BNT_SIGNIN_GUARD: the button and panel exist on the page ONLY while a Lab session is signed in.
     Signed out (or session rejected with 401) they are removed from the page and their contents cleared. */
  var rejectedToken = null;
  function signedIn() { try { return typeof TOKEN !== 'undefined' && !!TOKEN && TOKEN !== rejectedToken; } catch (e) { return false; } }
  function sync() {
    var s = signedIn();
    if (s && !fab.isConnected) { document.body.appendChild(fab); document.body.appendChild(panel); }
    else if (!s && fab.isConnected) { if (open) toggle(false); render([]); clearTimeout(kbTimer); kbLast = null; kkLoaded = false; ['bmKBOut','bmSpOut'].forEach(function (i) { var x = $(i); if (x) x.innerHTML = ''; }); ['bmKBWant','bmKKText'].forEach(function (i) { var x = $(i); if (x) x.value = ''; }); ['bmTitle','bmBrief','bmCode'].forEach(function (i) { var x = $(i); if (x) x.value = ''; }); if (panel.parentNode) panel.parentNode.removeChild(panel); if (fab.parentNode) fab.parentNode.removeChild(fab); }
  }
  function authRejected(r) { if (r && r.status === 401) { try { rejectedToken = TOKEN; } catch (e) {} sync(); return true; } return false; }
  function mount() {
    sync(); setInterval(sync, 1000);
    fab.addEventListener('click', function () { toggle(); });
    $('bmClose').addEventListener('click', function () { toggle(false); });
    $('bmKBGo').addEventListener('click', kbGo);
    $('bmSp').addEventListener('click', function (e) { var dd = e.target && e.target.getAttribute('data-spd'); if (dd) spLoad(dd); });
    $('bmSp').addEventListener('toggle', function () { if ($('bmSp').open) spLoad(7); });
    $('bmKKSave').addEventListener('click', kkSave);
    $('bmKK').addEventListener('toggle', function () { if ($('bmKK').open) kkLoad(); });
    $('bmLockBtn').addEventListener('click', doLock);
    $('bmUnlock').addEventListener('click', doUnlock);
    $('bmCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') doUnlock(); });
    $('bmStart').addEventListener('click', start);
    $('bmList').addEventListener('click', function (e) { var j = e.target && e.target.getAttribute('data-job'); if (j) download(e.target.getAttribute('data-mis'), j); var pl = e.target && e.target.getAttribute('data-plan'); if (pl) togglePlan(pl); });
    document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') toggle(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
