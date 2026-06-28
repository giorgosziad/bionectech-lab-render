// engine.js — reports whether the AEGIS-4M engine is loaded server-side and
// passes its live self-check. Used by the Lab "Engine status" readout.
const { cors, json, userFrom } = require('./lib/auth');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });
  if (user.role !== 'admin') return json(403, { error: 'Admins only.' });
  try {
    const AEGIS = require('./lib/aegis');   // require here so a load failure is reported, not fatal
    return json(200, AEGIS.selfCheck());
  } catch (e) {
    return json(200, { loaded: false, healthy: false, error: (e && e.message) || 'engine failed to load' });
  }
};
