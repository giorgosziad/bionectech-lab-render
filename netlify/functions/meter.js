// meter.js - BNT_METER: the Spend report. Admin only, behind the Missions code.
(function () {
  'use strict';
  const { cors, json, userFrom } = require('./lib/auth');
  const accessGate = require('./lib/gate');
  const meter = require('./lib/meter');
  module.exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
    const user = userFrom(event);
    if (!user) return json(401, { error: 'Sign in first.' });
    if (user.role !== 'admin') return json(403, { error: 'Spend is admin-only.' });
    if (!(await accessGate.isUnlocked('missions', user))) return json(423, { error: accessGate.lockedMessage('missions'), locked: true });
    const q = event.queryStringParameters || {};
    try { return json(200, { ok: true, days: await meter.report(parseInt(q.days || '14', 10) || 14) }); }
    catch (e) { return json(500, { error: String((e && e.message) || e) }); }
  };
})();
