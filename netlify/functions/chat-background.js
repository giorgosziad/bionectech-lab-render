// chat-background.js — Netlify BACKGROUND function (the "-background" suffix makes it async with
// up to a 15-minute limit). Used for heavy turns (deep thinking and/or attached files) that would
// 504 on the normal 26s synchronous path. It runs the exact same logic as chat.js (handleChat),
// then stores the result in Redis under a job id. The browser polls chat-result for the answer.
const { userFrom, readJSON, writeJSON, json } = require('./lib/auth');
const { handleChat } = require('./chat');
// BP-DELIVERY-GUARD v2: the final result write is the single most important write in the
// system. Retry it up to 3 times — AND write it under its OWN key ('jobdone:') that the
// in-flight progress heartbeats can never touch. Progress writes are fire-and-forget and
// can land LATE (after the job finished), clobbering a final written to the shared key
// back to status:'running' forever — the frozen "delivering the answer" bug. A separate
// final key makes that race impossible by construction.
async function writeFinal(jobId, value) {
  let ok = false;
  for (let a = 0; a < 3; a++) {
    try { await writeJSON(null, 'jobdone:' + jobId, value); ok = true; break; }
    catch (e) { await new Promise(function (r) { setTimeout(r, 800); }); }
  }
  // Best-effort mirror to the legacy key too (harmless if a late heartbeat clobbers it —
  // the poller reads 'jobdone:' first).
  try { await writeJSON(null, 'job:' + jobId, value); } catch (e) {}
  console.log("[bg] writeFinal jobId=" + jobId + " ok=" + ok + " bytes=" + JSON.stringify(value).length); return ok;
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
    await writeFinal(jobId, {
      status: ok ? 'done' : 'error',
      httpStatus: res.statusCode,
      result: payload,
      finishedAt: Date.now()
    });
  } catch (e) {
    await writeFinal(jobId, {
      status: 'error',
      httpStatus: 500,
      result: { error: 'Background chat failed: ' + (e && e.message ? e.message : String(e)) },
      finishedAt: Date.now()
    });
  }
  // Background functions ignore the return value, but we return 200 for cleanliness.
  return { statusCode: 200, body: 'ok' };
};
