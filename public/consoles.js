/* consoles.js - BNT_CONSOLE_GATE for the Hanna and Tekton consoles.
   1. The Hanna and Tekton buttons and consoles exist on the page ONLY while a Lab session is signed in.
      Signed out (or a session the server rejects with 401) they are removed and their contents cleared.
   2. The console codes are checked on the SERVER (console-gate + lib/gate.js). No code lives in this page.
   3. Opening a console asks the server whether this account is unlocked; the browser cannot fake it. */
(function () {
  'use strict';
  function call(path, opts) {
    if (typeof api === 'function') return api(path, opts);
    var h = { 'Content-Type': 'application/json' };
    try { if (typeof TOKEN !== 'undefined' && TOKEN) h.Authorization = 'Bearer ' + TOKEN; } catch (e) {}
    return fetch('/.netlify/functions/' + path, Object.assign({ headers: h }, opts || {})).then(function (r) {
      return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { ok: r.ok, status: r.status, data: j }; });
    });
  }
  var DEF = {
    hanna: { fab: 'hannaFab', panel: 'hannaPanel', gate: 'hannaGate', work: 'hannaWork', label: 'Hanna', open: 'hannaOpenPanel', show: 'hannaShowWork', flag: '_hannaUnlocked', files: '_hannaFiles',
      css: 'position:fixed;right:18px;bottom:52px;z-index:9998;background:var(--gold,#FFD600);color:#052744;border:none;border-radius:20px;padding:8px 16px;font-weight:bold;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4);font-family:monospace' },
    tekton: { fab: 'tektonFab', panel: 'tektonPanel', gate: 'tektonGate', work: 'tektonWork', label: 'Tekton', open: 'tektonOpenPanel', show: 'tektonShowWork', flag: '_tektonUnlocked', files: '_tektonFiles',
      css: 'position:fixed;right:18px;bottom:96px;z-index:9998;background:#2ec4b6;color:#042;border:none;border-radius:20px;padding:8px 16px;font-weight:bold;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4);font-family:monospace' }
  };
  var KEYS = ['hanna', 'tekton'];
  var rejectedToken = null;
  function signedIn() { try { return typeof TOKEN !== 'undefined' && !!TOKEN && TOKEN !== rejectedToken; } catch (e) { return false; } }
  function byId(id) { return document.getElementById(id); }
  function drop(id) { var e = byId(id); if (e && e.parentNode) e.parentNode.removeChild(e); }
  function setFlag(d, v) { try { window[d.flag] = v; } catch (e) {} }
  function showGate(d) { var g = byId(d.gate), w = byId(d.work); if (g) g.style.display = 'block'; if (w) w.style.display = 'none'; }
  function authRejected() { try { rejectedToken = TOKEN; } catch (e) {} sync(); }

  /* Called by hannaTryUnlock / tektonTryUnlock in index.html. */
  window.bntConsoleUnlock = function (panel, code) {
    return call('console-gate', { method: 'POST', body: JSON.stringify({ action: 'unlock', panel: panel, code: code }) }).then(function (r) {
      if (r && r.status === 401 && !(r.data && r.data.attemptsLeft != null)) { authRejected(); return { ok: false, error: 'Signed out. Sign in to the Lab first.' }; }
      if (r && r.ok && r.data && r.data.ok) return { ok: true };
      var m = (r && r.data && r.data.error) || ('Unlock failed (HTTP ' + (r && r.status) + ').');
      if (r && r.data && r.data.attemptsLeft != null) m += ' ' + r.data.attemptsLeft + ' attempt(s) left.';
      return { ok: false, error: m };
    }).catch(function () { return { ok: false, error: 'Could not reach the Lab server.' }; });
  };

  function openConsole(key) {
    var d = DEF[key];
    if (!signedIn() || typeof window[d.open] !== 'function') return;
    window[d.open]();
    var pan = byId(d.panel);
    if (!pan || pan.style.display === 'none') return;
    call('console-gate', { method: 'POST', body: JSON.stringify({ action: 'status', panel: key }) }).then(function (r) {
      if (r && r.status === 401) { authRejected(); return; }
      if (r && r.ok && r.data && r.data.unlocked) { setFlag(d, true); if (typeof window[d.show] === 'function') window[d.show](); }
      else { setFlag(d, false); showGate(d); }
    }).catch(function () { setFlag(d, false); showGate(d); });
  }
  function makeFab(key) {
    var d = DEF[key], b = document.createElement('button');
    b.id = d.fab; b.type = 'button'; b.textContent = d.label; b.style.cssText = d.css;
    b.setAttribute('data-bnt-guard', '1');
    b.addEventListener('click', function () { openConsole(key); });
    return b;
  }
  function clearConsole(d) {
    drop(d.panel); drop(d.fab); setFlag(d, false);
    try { window[d.files] = []; } catch (e) {}
  }
  function sync() {
    var s = signedIn();
    KEYS.forEach(function (key) {
      var d = DEF[key], f = byId(d.fab);
      if (!s) { if (f || byId(d.panel)) clearConsole(d); return; }
      if (f && f.getAttribute('data-bnt-guard') === '1') return;
      if (f && f.parentNode) f.parentNode.removeChild(f);     /* replace the page's own always-on button */
      document.body.appendChild(makeFab(key));
    });
  }
  function mount() { sync(); setInterval(sync, 1000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
