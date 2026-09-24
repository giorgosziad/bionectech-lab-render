/* jobs.js - Bionectech AI Lab: managed build jobs panel (BNT_JOBS v1).
   Talks to /.netlify/functions/job. The job itself runs on the server; this panel only
   creates jobs and shows their state, so closing the tab never stops a job. */
(function () {
  'use strict';
  if (window.__bntJobsLoaded) return;
  window.__bntJobsLoaded = true;

  var C = { navy: '#052744', deep: '#031a2e', gold: '#FFD600', ink: '#e8eef5', dim: '#8aa0b6', line: '#1d3f5f', ok: '#3ddc97', bad: '#ff7a7a' };
  var pollTimer = null, open = false, lastJobs = [];

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
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }

  var style = el('style');
  style.textContent =
    '#bntJobsPanel{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);z-index:10000;background:' + C.deep + ';color:' + C.ink + ';border-left:2px solid ' + C.gold + ';display:none;flex-direction:column;font-family:inherit}' +
    '#bntJobsPanel.open{display:flex}' +
    '#bntJobsPanel header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid ' + C.line + '}' +
    '#bntJobsPanel h2{margin:0;font-size:17px;font-weight:600;color:' + C.gold + '}' +
    '#bntJobsPanel .body{overflow:auto;padding:14px 18px 40px}' +
    '#bntJobsPanel label{display:block;font-size:13px;color:' + C.dim + ';margin:10px 0 4px}' +
    '#bntJobsPanel input[type=text],#bntJobsPanel input[type=password],#bntJobsPanel textarea{width:100%;box-sizing:border-box;background:' + C.navy + ';color:' + C.ink + ';border:1px solid ' + C.line + ';border-radius:6px;padding:8px 10px;font:inherit;font-size:14px}' +
    '#bntJobsPanel textarea{min-height:92px;resize:vertical}' +
    '#bntJobsPanel button{background:transparent;color:' + C.gold + ';border:1px solid ' + C.gold + ';border-radius:6px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer}' +
    '#bntJobsPanel button.primary{background:' + C.gold + ';color:' + C.navy + ';font-weight:600}' +
    '#bntJobsPanel button:disabled{opacity:.5;cursor:default}' +
    '#bntJobsPanel button:focus-visible,#bntJobsPanel input:focus-visible,#bntJobsPanel textarea:focus-visible,#bntJobsFab:focus-visible{outline:2px solid ' + C.gold + ';outline-offset:2px}' +
    '#bntJobsPanel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center}' +
    '#bntJobsPanel .note{font-size:12px;color:' + C.dim + ';margin-top:8px;line-height:1.5}' +
    '#bntJobsPanel .job{border:1px solid ' + C.line + ';border-radius:8px;padding:12px;margin-top:10px}' +
    '#bntJobsPanel .job .t{font-weight:600;font-size:14px}' +
    '#bntJobsPanel .job .s{font-size:13px;margin-top:4px;line-height:1.5}' +
    '#bntJobsPanel details{margin-top:8px;font-size:12px;color:' + C.dim + '}' +
    '#bntJobsPanel details li{margin:2px 0}' +
    '#bntJobsPanel .sec{margin-top:22px;font-size:15px;color:' + C.ink + ';font-weight:600}';
  document.head.appendChild(style);

  var fab = el('button', 'position:fixed;left:18px;bottom:52px;z-index:9998;background:' + C.navy + ';color:' + C.gold + ';border:1px solid ' + C.gold + ';border-radius:20px;padding:8px 16px;font-weight:bold;cursor:pointer;font-family:monospace');
  fab.id = 'bntJobsFab'; fab.type = 'button'; fab.textContent = 'Jobs';
  fab.setAttribute('aria-controls', 'bntJobsPanel');

  var panel = el('aside'); panel.id = 'bntJobsPanel'; panel.setAttribute('aria-label', 'Build jobs');
  panel.innerHTML =
    '<header><h2>Build jobs</h2><div class="row" style="margin:0"><button type="button" id="bjLockBtn">Lock</button><button type="button" id="bjClose">Close</button></div></header>' +
    '<div class="body">' +
    '<div id="bjLock" hidden><div class="sec">Enter the Jobs code</div><div class="note">This panel is locked. The code is checked on the server; after 5 wrong tries it waits 15 minutes. An unlock lasts 8 hours on this account.</div><label for="bjCode">Jobs code</label><input type="password" id="bjCode" autocomplete="off" spellcheck="false"><div class="row"><button type="button" class="primary" id="bjUnlock">Unlock</button><span class="note" id="bjLockMsg" role="status"></span></div></div>' +
    '<div id="bjMain">' +
    '<div class="note">A job runs on the Lab server. Karam returns edits, the server applies them to your file, a code check decides, and you get an email with the verified file or the exact reason it stopped. Closing this tab does not stop a job.</div>' +
    '<div class="sec">New job</div>' +
    '<label for="bjTitle">Title</label><input type="text" id="bjTitle" placeholder="OncoDefy posture update">' +
    '<label for="bjFile">Source file</label><input type="file" id="bjFile">' +
    '<label for="bjTask">Task for Karam</label><textarea id="bjTask" placeholder="What to change in the file, as precisely as you can."></textarea>' +
    '<label for="bjBanned">Must not contain (comma separated, case-insensitive)</label><input type="text" id="bjBanned" placeholder="approved, cleared, clearance, approval">' +
    '<label for="bjReq">Must contain (one per line; add || N for an exact count)</label><textarea id="bjReq" placeholder="Deferred \u2014 modality pending FDA authorization || 1"></textarea>' +
    '<div class="row"><button type="button" class="primary" id="bjStart">Start job</button><button type="button" id="bjMail">Send test email</button><span class="note" id="bjMsg" role="status"></span></div>' +
    '<div class="sec">Jobs <span class="note" id="bjEmail"></span></div>' +
    '<div id="bjList"><div class="note">No jobs yet. Start one above.</div></div>' +
    '</div></div>';

  function $(id) { return document.getElementById(id) || (panel && panel.querySelector ? panel.querySelector('#' + id) : null); }
  function msg(t, bad) { var m = $('bjMsg'); m.textContent = t || ''; m.style.color = bad ? C.bad : C.dim; }

  var locked = false;
  function showLock(t) { locked = true; $('bjLock').hidden = false; $('bjMain').hidden = true; $('bjLockMsg').textContent = t || ''; $('bjLockMsg').style.color = C.dim; try { $('bjCode').focus(); } catch (e) {} }
  function hideLock() { locked = false; $('bjLock').hidden = true; $('bjMain').hidden = false; }
  function isLocked(r) { if (authRejected(r)) return true; if (r && r.status === 423) { showLock((r.data && r.data.error) || 'This panel is locked.'); return true; } return false; }
  function doUnlock() {
    var code = $('bjCode').value; $('bjCode').value = '';
    if (!code) { $('bjLockMsg').textContent = 'Enter the code.'; return; }
    $('bjUnlock').disabled = true;
    call('job', { method: 'POST', body: JSON.stringify({ action: 'unlock', code: code }) }).then(function (r) {
      $('bjUnlock').disabled = false;
      if (r.ok && r.data && r.data.ok) { hideLock(); refresh().then(schedule); return; }
      var m = (r.data && r.data.error) || ('Unlock failed (HTTP ' + r.status + ').');
      if (r.data && r.data.attemptsLeft != null) m += ' ' + r.data.attemptsLeft + ' attempt(s) left.';
      $('bjLockMsg').textContent = m; $('bjLockMsg').style.color = C.bad;
    }).catch(function () { $('bjUnlock').disabled = false; $('bjLockMsg').textContent = 'Could not reach the Lab server.'; });
  }
  function doLock() { call('job', { method: 'POST', body: JSON.stringify({ action: 'lock' }) }).then(function () { lastJobs = []; renderJobs([]); showLock('Locked.'); }); }
  function statusColor(s) { return s === 'delivered' ? C.ok : (s === 'escalated' ? C.bad : C.gold); }
  function renderJobs(jobs) {
    lastJobs = jobs || [];
    var box = $('bjList');
    if (!lastJobs.length) { box.innerHTML = '<div class="note">No jobs yet. Start one above.</div>'; return; }
    box.innerHTML = lastJobs.map(function (j) {
      var lines = [];
      lines.push('<span style="color:' + statusColor(j.status) + ';font-weight:600">' + esc(j.status) + '</span> ' + esc(j.stage || ''));
      if (j.status === 'building' && j.progress && j.progress.chars) lines.push('Karam has written ' + (j.progress.chars / 1000).toFixed(1) + 'k characters, ' + esc(ago(j.progress.at)));
      if (j.status === 'delivered' && j.result) lines.push(esc(j.result.name) + ', ' + j.result.edits + ' edits, SHA-256 ' + esc(j.result.sha256.slice(0, 16)) + '...');
      if (j.status === 'escalated' && j.reason) lines.push(esc(j.reason));
      if (j.email) lines.push('Email: ' + esc(j.email));
      lines.push('Updated ' + esc(ago(j.updatedAt)));
      var btns = '';
      if (j.status === 'delivered') btns += '<button type="button" data-dl="' + esc(j.id) + '">Download file</button>';
      if (j.status === 'escalated' || j.status === 'delivered') btns += '<button type="button" data-rr="' + esc(j.id) + '">Rerun</button>';
      var det = '';
      if ((j.attempts && j.attempts.length) || (j.result && j.result.checks)) {
        det = '<details><summary>Attempts and checks</summary><ul>' +
          (j.attempts || []).map(function (a) { return '<li>Attempt ' + a.n + ': ' + esc(a.result) + (a.edits ? (', ' + a.edits + ' edits') : '') + (a.detail ? (' - ' + esc(String(a.detail).slice(0, 400))) : '') + '</li>'; }).join('') +
          ((j.result && j.result.checks) ? j.result.checks.map(function (c) { return '<li>' + (c.pass ? 'Pass' : 'Fail') + ': ' + esc(c.id) + (c.detail ? (' (' + esc(c.detail) + ')') : '') + '</li>'; }).join('') : '') +
          '</ul></details>';
      }
      return '<div class="job"><div class="t">' + esc(j.title) + '</div><div class="s">' + lines.join('<br>') + '</div>' + (btns ? '<div class="row">' + btns + '</div>' : '') + det + '</div>';
    }).join('');
  }

  function refresh() {
    return call('job?action=list', { method: 'GET' }).then(function (r) {
      if (isLocked(r)) return;
      hideLock();
      if (!r.ok || !r.data) { $('bjEmail').textContent = (r.data && r.data.error) ? r.data.error : ('Could not load jobs (HTTP ' + r.status + ').'); return; }
      $('bjEmail').textContent = r.data.email === 'configured' ? 'Email reports on' : 'Email reports off: set SMTP_USER, SMTP_PASS, REPORT_TO on Render';
      renderJobs(r.data.jobs);
    }).catch(function () { $('bjEmail').textContent = 'Could not reach the Lab server.'; });
  }
  function schedule() {
    clearTimeout(pollTimer);
    if (!open || locked) return;
    var active = lastJobs.some(function (j) { return j.status === 'queued' || j.status === 'building'; });
    pollTimer = setTimeout(function () { refresh().then(schedule); }, active ? 3000 : 15000);
  }

  function parseRequired(txt) {
    return String(txt || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^(.*?)\s*\|\|\s*(\d+)\s*$/);
      return m ? { text: m[1], min: parseInt(m[2], 10), max: parseInt(m[2], 10) } : { text: l, min: 1, max: null };
    });
  }
  function readFile(f) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = function () { rej(new Error('Could not read the file.')); }; r.readAsText(f, 'utf-8'); });
  }
  function start() {
    var f = $('bjFile').files && $('bjFile').files[0];
    var task = $('bjTask').value.trim();
    if (!f) { msg('Choose the source file.', true); return; }
    if (!task) { msg('Write the task for Karam.', true); return; }
    $('bjStart').disabled = true; msg('Uploading...');
    readFile(f).then(function (text) {
      var model = ''; try { var m = document.getElementById('model'); if (m && m.value) model = m.value; } catch (e) {}
      var oc = ''; try { if (typeof ownerCode !== 'undefined' && ownerCode) oc = ownerCode; } catch (e) {}
      return call('job', { method: 'POST', body: JSON.stringify({
        action: 'create', title: $('bjTitle').value.trim() || f.name, instructions: task, sourceName: f.name, sourceText: text,
        banned: $('bjBanned').value, required: parseRequired($('bjReq').value), model: model, ownerCode: oc
      }) });
    }).then(function (r) {
      $('bjStart').disabled = false;
      if (isLocked(r)) return;
      if (!r.ok || !r.data || !r.data.ok) { msg((r.data && r.data.error) || ('Job was not created (HTTP ' + r.status + ').'), true); return; }
      msg('Job started. You can close this panel.');
      refresh().then(schedule);
    }).catch(function (e) { $('bjStart').disabled = false; msg(e.message, true); });
  }
  function testMail() {
    $('bjMail').disabled = true; msg('Sending test email...');
    call('job', { method: 'POST', body: JSON.stringify({ action: 'testmail' }) }).then(function (r) {
      $('bjMail').disabled = false;
      if (isLocked(r)) return;
      if (r.ok && r.data && r.data.ok) msg('Test email sent to ' + r.data.sentTo + '.'); else msg((r.data && r.data.error) || ('Test email failed (HTTP ' + r.status + ').'), true);
    }).catch(function (e) { $('bjMail').disabled = false; msg(e.message, true); });
  }
  function download(id) {
    call('job?action=file&id=' + encodeURIComponent(id), { method: 'GET' }).then(function (r) {
      if (!r.ok || !r.data || !r.data.ok) { msg((r.data && r.data.error) || 'Download failed.', true); return; }
      var blob = new Blob([r.data.text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = r.data.name || 'deliverable.txt';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  }
  function rerun(id) {
    var oc = ''; try { if (typeof ownerCode !== 'undefined' && ownerCode) oc = ownerCode; } catch (e) {}
    call('job', { method: 'POST', body: JSON.stringify({ action: 'rerun', id: id, ownerCode: oc }) }).then(function (r) {
      if (!r.ok || !r.data || !r.data.ok) { msg((r.data && r.data.error) || 'Rerun failed.', true); return; }
      msg('Rerun started.'); refresh().then(schedule);
    });
  }

  function toggle(v) {
    open = (v == null) ? !open : v;
    panel.classList.toggle('open', open);
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { refresh().then(function () { schedule(); if (!locked) $('bjTitle').focus(); }); } else { clearTimeout(pollTimer); fab.focus(); }
  }

  /* BNT_SIGNIN_GUARD: the button and panel exist on the page ONLY while a Lab session is signed in.
     Signed out (or session rejected with 401) they are removed from the page and their contents cleared. */
  var rejectedToken = null;
  function signedIn() { try { return typeof TOKEN !== 'undefined' && !!TOKEN && TOKEN !== rejectedToken; } catch (e) { return false; } }
  function sync() {
    var s = signedIn();
    if (s && !fab.isConnected) { document.body.appendChild(fab); document.body.appendChild(panel); }
    else if (!s && fab.isConnected) { if (open) toggle(false); lastJobs = []; renderJobs([]); ['bjTitle','bjTask','bjCode'].forEach(function (i) { var x = $(i); if (x) x.value = ''; }); if (panel.parentNode) panel.parentNode.removeChild(panel); if (fab.parentNode) fab.parentNode.removeChild(fab); }
  }
  function authRejected(r) { if (r && r.status === 401) { try { rejectedToken = TOKEN; } catch (e) {} sync(); return true; } return false; }
  function mount() {
    sync(); setInterval(sync, 1000);
    fab.addEventListener('click', function () { toggle(); });
    $('bjClose').addEventListener('click', function () { toggle(false); });
    $('bjLockBtn').addEventListener('click', doLock);
    $('bjUnlock').addEventListener('click', doUnlock);
    $('bjCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') doUnlock(); });
    $('bjStart').addEventListener('click', start);
    $('bjMail').addEventListener('click', testMail);
    $('bjList').addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute('data-dl')) download(t.getAttribute('data-dl'));
      if (t && t.getAttribute('data-rr')) rerun(t.getAttribute('data-rr'));
    });
    document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') toggle(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
