// server.js — Bionectech AI Lab on Render (replaces Netlify Functions).
// Why Render: a Render Web Service has no 15-minute/60-second function limit,
// so heavy "background" chat jobs simply run to completion and return directly —
// no job-storage, no polling, no quick-path fallback. The 60s-kill problem is gone.
//
// This server reuses your EXISTING function files unchanged. Each Netlify function
// exports `handler(event)`; we translate an Express (req,res) into the same `event`
// shape those handlers expect, call the handler, and write its {statusCode,headers,body}
// back to the Express response. Your business logic is untouched.

const express = require('express');
const path = require('path');

const app = express();

// Capture the raw body as a string (handlers do JSON.parse(event.body) themselves).
app.use(express.text({ type: '*/*', limit: '50mb' }));

// ---- Adapter: Express (req,res)  ->  Netlify-style event -> handler -> res ----
function toEvent(req) {
  return {
    httpMethod: req.method,
    headers: req.headers || {},
    // handlers do JSON.parse(event.body || '{}'); body is a raw string here.
    body: (typeof req.body === 'string' && req.body.length) ? req.body : '',
    queryStringParameters: req.query || {},
    path: req.path,
  };
}

async function runHandler(handler, req, res) {
  try {
    const event = toEvent(req);
    const out = await handler(event);
    const status = (out && out.statusCode) || 200;
    const headers = (out && out.headers) || {};
    Object.keys(headers).forEach(function (h) { res.set(h, headers[h]); });
    res.status(status).send((out && out.body) != null ? out.body : '');
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
}

// ---- Mount every existing function at /.netlify/functions/<name> ----
// (Same path the front-end already calls, so index.html needs ZERO changes.)
const FUNCTIONS = [
  'chat', 'chat-result', 'login', 'me', 'data', 'memory',
  'team', 'admin', 'lessons', 'models', 'engine', 'fetchurl',
  'sendmail', 'unlock'
];

FUNCTIONS.forEach(function (name) {
  let mod;
  try {
    mod = require('./netlify/functions/' + name);
  } catch (e) {
    console.error('Could not load function ' + name + ': ' + e.message);
    return;
  }
  if (!mod || typeof mod.handler !== 'function') {
    console.error('Function ' + name + ' has no handler export.');
    return;
  }
  const route = '/.netlify/functions/' + name;
  app.all(route, function (req, res) { runHandler(mod.handler, req, res); });
  console.log('Mounted ' + route);
});

// ---- chat-background becomes a SYNCHRONOUS direct run (the whole point of Render) ----
// On Netlify this kicked off an async job + Redis polling because of the 60s limit.
// On Render there is no such limit, so we just run handleChat directly and return the
// answer. The front-end's runBackground() polls chat-result, so to stay 100% compatible
// WITHOUT touching index.html, we still store the result under the jobId and let the
// existing poller pick it up — but the job now actually finishes because nothing kills it.
const { userFrom, writeJSON } = require('./netlify/functions/lib/auth');
const { handleChat } = require('./netlify/functions/chat');

app.all('/.netlify/functions/chat-background', async function (req, res) {
  const event = toEvent(req);
  const user = userFrom(event);
  if (!user) { res.status(401).send('Sign in first.'); return; }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const jobId = (body.jobId || '').toString();
  if (!jobId) { res.status(400).send('Missing jobId.'); return; }

  // Return 202 immediately so the front-end starts polling.
  res.status(202).send('accepted');

  // Then run the real work to completion. No platform timeout on Render.
  const key = 'job:' + jobId;
  console.log('[bg] job ' + jobId + ' START');
  try { await writeJSON(null, key, { status: 'running', startedAt: Date.now() }); } catch (e) { console.log('[bg] could not write running state: ' + e.message); }
  try {
    const out = await handleChat(event, user);
    let payload = null;
    try { payload = JSON.parse(out.body || '{}'); } catch (e) { payload = { error: 'Bad result.' }; }
    const ok = out.statusCode >= 200 && out.statusCode < 300;
    await writeJSON(null, key, { status: ok ? 'done' : 'error', httpStatus: out.statusCode, result: payload, finishedAt: Date.now() });
    console.log('[bg] job ' + jobId + ' DONE status=' + out.statusCode + (ok ? '' : (' error=' + (payload && payload.error ? payload.error : '?'))));
  } catch (e) {
    console.log('[bg] job ' + jobId + ' THREW: ' + (e && e.message ? e.message : String(e)) + (e && e.stack ? ('\n' + e.stack) : ''));
    try { await writeJSON(null, key, { status: 'error', httpStatus: 500, result: { error: 'Background chat failed: ' + (e && e.message ? e.message : String(e)) }, finishedAt: Date.now() }); } catch (e2) {}
  }
});


// ---- Serve the front-end (public/) so the whole Lab runs from one Render service ----
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, function () { console.log('Bionectech AI Lab listening on ' + PORT); });
// Big builds can run for several minutes; keep sockets open so long jobs are not cut off.
server.keepAliveTimeout = 1000 * 60 * 20; // 20 min
server.headersTimeout   = 1000 * 60 * 20 + 5000;
server.requestTimeout   = 0; // no hard request timeout
