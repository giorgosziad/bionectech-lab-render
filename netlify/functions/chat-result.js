// chat-result.js — the browser polls this to check on a background chat job.
// Returns { status: 'running' | 'done' | 'error' | 'missing', ... }.
const { userFrom, readJSON, del, json } = require('./lib/auth');

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

  // Once the client has a terminal result, clean it up so Redis doesn't accumulate jobs.
  if (job.status === 'done' || job.status === 'error') {
    try { await del('job:' + jobId); } catch (e) {}
  }
  return json(200, job);
};
