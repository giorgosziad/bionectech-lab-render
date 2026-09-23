// models.js - BNT_LATEST_OPUS: the Lab's model menu, live from Anthropic, newest first,
// one entry per model name, plus what "Latest (auto)" resolves to (the newest Opus).
(function () {
  'use strict';
  const { cors, json, userFrom } = require('./lib/auth');
  const latest = require('./lib/latest');
  module.exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
    const user = userFrom(event);
    if (!user) return json(401, { error: 'Sign in first.' });
    try {
      const s = await latest.snapshot();
      return json(200, { models: s.models.map(function (m) { return { id: m.id, name: m.name }; }), latest: s.latest, source: s.models.length ? 'live' : 'fallback' });
    } catch (e) {
      return json(200, { models: [], latest: null, source: 'error' });
    }
  };
})();
