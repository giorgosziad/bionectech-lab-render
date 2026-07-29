// chat-background.js — Netlify BACKGROUND function (the "-background" suffix makes it async with
// up to a 15-minute limit). Used for heavy turns (deep thinking and/or attached files) that would
// 504 on the normal 26s synchronous path. It runs the exact same logic as chat.js (handleChat),
// then stores the result in Redis under a job id. The browser polls chat-result for the answer.
const { userFrom, readJSON, writeJSON, json } = require('./lib/auth');
const { handleChat } = require('./chat');
// BP-DELIVERY-GUARD: the final result write is the single most important write in the
// system — if it fails, the whole job's work is lost and the UI freezes on stale
// progress. Retry it up to 3 times before giving up.
async function writeFinal(key, value) {
  let lastErr = null;
  for (let a = 0; a < 3; a++) {
    try { await writeJSON(null, key, value); return true; }
    catch (e) { lastErr = e; await new Promise(function (r) { setTimeout(r, 800); }); }
  }
  return false;
}
exports.handler = async function (event) {
  // Background functions return 202 immediately to the caller; the real work continues here.
  const user = userFrom(event);
  if (!user) return { statusCode: 401, body: 'Sign in first.' };
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const jobId = (body.jobId || '').toString();
  if (!jobId) return { statusCode: 400, body: 'Missing jobId.' };
  const key = 'job:' + jobId;
  // Mark the job as running so the poller can show progress.
  try { await writeJSON(null, key, { status: 'running', startedAt: Date.now() }); } catch (e) {}
  try {
    // Reuse the identical chat logic. handleChat reads event.body, so we pass the same event through.
    const res = await handleChat(event, user);
    let payload = null;
    try { payload = JSON.parse(res.body || '{}'); } catch (e) { payload = { error: 'Bad result.' }; }
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    await writeFinal(key, {
      status: ok ? 'done' : 'error',
      httpStatus: res.statusCode,
      result: payload,
      finishedAt: Date.now()
    });
  } catch (e) {
    await writeFinal(key, {
      status: 'error',
      httpStatus: 500,
      result: { error: 'Background chat failed: ' + (e && e.message ? e.message : String(e)) },
      finishedAt: Date.now()
    });
  }
  // Background functions ignore the return value, but we return 200 for cleanliness.
  return { statusCode: 200, body: 'ok' };
};
