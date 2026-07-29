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
  let job = null;
  try { job = await readJSON(null, 'job:' + jobId, null); } catch (e) { job = null; }
  if (!job) return json(200, { status: 'missing' });
  // BP-DELIVERY-GUARD: never delete a result on first read. If that one response is
  // lost in transit, the answer is gone forever and the UI freezes on stale progress.
  // Instead, give terminal results a short TTL so retried polls can re-fetch them,
  // and Redis still cleans up on its own.
  if (job.status === 'done' || job.status === 'error') {
    try { await expire('job:' + jobId, 180); } catch (e) {}
  }
  return json(200, job);
};
