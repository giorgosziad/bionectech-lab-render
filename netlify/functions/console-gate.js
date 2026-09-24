// console-gate.js - BNT_CONSOLE_GATE: server-side codes for the Hanna and Tekton consoles.
// The codes live only in Render env (HANNA_CODE, TEKTON_CODE, min 12 characters) and are checked
// by lib/gate.js: signed-in session required, 5 tries per 15 minutes per user and per IP,
// constant-time compare, 8-hour unlock per user, fails closed when a code is not set.
(function () {
  'use strict';
  const { cors, json, userFrom, clientIp } = require('./lib/auth');
  const accessGate = require('./lib/gate');
  const CONSOLES = ['hanna', 'tekton'];
  module.exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
    const user = userFrom(event);
    if (!user) return json(401, { error: 'Sign in first.' });
    if (event.httpMethod !== 'POST') return json(405, { error: 'POST only.' });
    let b = {};
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request.' }); }
    const panel = String(b.panel || '');
    if (CONSOLES.indexOf(panel) < 0) return json(400, { error: 'Unknown console.' });
    const action = String(b.action || '');
    if (action === 'unlock') { const g = await accessGate.unlock(panel, user, b.code, clientIp(event)); return json(g.status || (g.ok ? 200 : 401), g); }
    if (action === 'status') return json(200, { ok: true, unlocked: await accessGate.isUnlocked(panel, user), configured: accessGate.configured(panel) });
    if (action === 'lock') return json(200, await accessGate.lock(panel, user));
    return json(400, { error: 'Unknown action.' });
  };
})();
