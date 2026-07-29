// chat-result.js — the browser polls this to check on a background chat job.
// Returns { status: 'running' | 'done' | 'error' | 'missing', ... }.
const { userFrom, readJSON, expire, json } = require('./lib/auth');
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });
  let jobId = '';
  if (event.httpMethod === 'GET') {
    jobId = ((event.queryStringParameters || {}).jobId || '').toString();
  } else {
    try { jobId = (JSON.parse(event.body || '{}').jobId || '').toString(); } catch (e) {}
  }
  if (!jobId) return json(400, { error: 'Missing jobId.' });
  // BP-DELIVERY-GUARD v2: the authoritative final lives under 'jobdone:' — a key the
  // in-flight progress heartbeats never write. Read it FIRST. A late progress write can
  // clobber 'job:' back to running, but it can never touch this key, so a finished job
  // is always deliverable no matter what the heartbeats did.
  let fin = null;
  try { fin = await readJSON(null, 'jobdone:' + jobId, null); } catch (e) { fin = null; }
  if (fin && (fin.status === 'done' || fin.status === 'error')) {
    try { await expire('jobdone:' + jobId, 180); } catch (e) {}
    try { await expire('job:' + jobId, 180); } catch (e) {}
    return json(200, fin);
  }
  let job = null;
  try { job = await readJSON(null, 'job:' + jobId, null); } catch (e) { job = null; }
  if (!job) return json(200, { status: 'missing' });
  if (job.status === 'done' || job.status === 'error') {
    try { await expire('job:' + jobId, 180); } catch (e) {}
  }
  return json(200, job);
};
