// models.js — lists the models currently available on your Anthropic key,
// so the lab's model menu is always up to date with no code changes.
const { cors, json, userFrom } = require('./lib/auth');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });

  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) return json(200, { models: [] });

  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    });
    const j = await r.json();
    const list = ((j && j.data) || [])
      .filter(function (m) { return m && typeof m.id === 'string' && !/fable|mythos/i.test(m.id); })
      .map(function (m) { return { id: m.id, name: m.display_name || m.id }; });
    return json(200, { models: list });
  } catch (e) {
    return json(200, { models: [] });
  }
};
