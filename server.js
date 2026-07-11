// Bionectech AI Lab — Render Node server (Express adapter for Netlify-style functions).
//
// Heavy chat jobs run to completion and return directly — no job-storage, no polling.
// Each Netlify function exports `handler(event)`; we translate an Express (req,res) into
// the same `event` shape those handlers expect, call the handler, and write its
// {statusCode,headers,body} back to the Express response. Business logic is untouched.

const express = require('express');
const path = require('path');

const app = express();

// ---- Bulletproof raw-body reader ----------------------------------------------------
// We do NOT use express.text()/express.json() because a body-parser stream that never
// fires 'end' (content-length / keep-alive edge cases behind Render's proxy) leaves the
// request hanging forever. Instead we read the raw body ourselves with a hard safety
// timeout, so a POST body is ALWAYS captured and the route always runs.
function readRawBody(req) {
  return new Promise(function (resolve) {
    // If a body parser already populated req.body, use it.
    if (typeof req.body === 'string' && req.body.length) { resolve(req.body); return; }
    var data = '';
    var done = false;
    function finish() { if (done) return; done = true; resolve(data); }
    try {
      req.setEncoding('utf8');
      req.on('data', function (c) { data += c; });
      req.on('end', finish);
      req.on('error', finish);
      req.on('aborted', finish);
      // Safety: if the stream never ends, resolve with what we have after 10s so the
      // handler still runs instead of hanging the socket.
      setTimeout(finish, 5 * 60 * 1000); // 5min: allow big MB uploads to fully arrive
    } catch (e) { finish(); }
  });
}

function toEvent(req, rawBody) {
  return {
    httpMethod: req.method,
    headers: req.headers || {},
    body: (typeof rawBody === 'string' && rawBody.length) ? rawBody : '',
    queryStringParameters: req.query || {},
    path: req.path,
  };
}

async function runHandler(handler, req, res) {
  try {
    console.log('[req '+req.method+' '+req.path+'] reading body');
    const rawBody = await readRawBody(req);
    console.log('[req '+req.path+'] body='+(rawBody?rawBody.length:0));
    const event = toEvent(req, rawBody);
    // STREAMING: the handler may write directly to `res` (Server-Sent Events) and return
    // { __streamed: true }. Everything else keeps the old buffered {statusCode, headers, body}
    // contract untouched — this is purely additive.
    const out = await handler(event, res);
    if (out && out.__streamed) { console.log('[req '+req.path+'] streamed'); return; }
    console.log('[req '+req.path+'] handler done status='+(out&&out.statusCode));
    const status = (out && out.statusCode) || 200;
    const headers = (out && out.headers) || {};
    Object.keys(headers).forEach(function (h) { res.set(h, headers[h]); });
    if (!res.get('Content-Type')) res.set('Content-Type', 'application/json');
    res.status(status).send((out && out.body) != null ? out.body : '');
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (_) {} return; }
    res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
}

// ---- Mount every existing function at /.netlify/functions/<name> --------------------
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

// ---- chat-background: synchronous direct run ----------------------------------------
const { userFrom, writeJSON } = require('./netlify/functions/lib/auth');
const { handleChat } = require('./netlify/functions/chat');

app.all('/.netlify/functions/chat-background', async function (req, res) {
  const rawBody = await readRawBody(req);
  const event = toEvent(req, rawBody);
  const user = userFrom(event);
  if (!user) { res.status(401).send('Sign in first.'); return; }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const jobId = (body.jobId || '').toString();
  if (!jobId) { res.status(400).send('Missing jobId.'); return; }

  res.status(202).send('accepted');

  const key = 'job:' + jobId;
  console.log('[bg] job ' + jobId + ' START');
  try { await writeJSON(null, key, { status: 'running', startedAt: Date.now() }); } catch (e) { console.log('[bg] could not write running state: ' + e.message); }
  // REAL PROGRESS: handleChat streams from Anthropic internally and tells us the truth — which model
  // it called, and how many tokens it has ACTUALLY written. We put that straight into the job record.
  // The browser polls it. No guessing.
  let _lastWrite = 0;
  const onProgress = function (p) {
    const now = Date.now();
    if (p.stage !== 'done' && now - _lastWrite < 900) return;   // at most once a second
    _lastWrite = now;
    writeJSON(null, key, {
      status: 'running',
      startedAt: Date.now(),
      progress: { stage: p.stage, model: p.model, chars: p.chars || 0, tokens: p.tokens || 0 }
    }).catch(function () {});
  };

  try {
    const out = await handleChat(event, user, null, onProgress);
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

// ---- SECURITY: block sensitive paths from the web ----------------------------------
// The engine source, repo config, and metadata files must never be downloadable by an
// outsider. Any request for these returns 404 before static serving can reach them.
var BLOCKED = [
  /^\/netlify\//i,            // engine + function SOURCE (lib/aegis/full.js, etc.)
  /^\/README(\.md)?$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/netlify\.toml$/i,
  /^\/tsconfig\.json$/i,
  /^\/server\.js$/i,
  /^\/\.[^/]+$/,             // dotfiles: .env, .gitignore, .npmrc, etc.
  /^\/(LICENSE|CHANGELOG|Dockerfile|Procfile|Makefile)$/i
];
app.use(function (req, res, next) {
  var p = (req.path || '');
  for (var i = 0; i < BLOCKED.length; i++) { if (BLOCKED[i].test(p)) { return res.status(404).send('Not found'); } }
  next();
});

// ---- Serve the front-end (public/) --------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, function () { console.log('Bionectech AI Lab listening on ' + PORT); });
server.keepAliveTimeout = 1000 * 60 * 20;       // 20 min
server.headersTimeout   = 1000 * 60 * 20 + 5000;
server.requestTimeout   = 0;                     // no hard request timeout
