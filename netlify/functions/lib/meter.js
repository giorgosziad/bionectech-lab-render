// lib/meter.js - BNT_METER: measure every Anthropic call the Lab makes, by desk and model, per day.
// Installed once at server start (server.js). It wraps the global fetch: requests to api.anthropic.com/v1/messages
// pass through UNCHANGED; the response is read on a copy (streaming answers are teed), and the usage numbers Anthropic
// returns (input, output, cache read, cache write tokens) are added to daily counters in Redis.
// It never blocks, delays or alters a call. If anything in the meter fails, the call goes on untouched.
(function () {
  'use strict';
  const FLUSH_MS = 10000, KEEP_DAYS = 120;
  let pending = {};   // day -> { desks: {name: row}, models: {id: row} }
  let installed = false, timer = null, origFetch = null;

  function day(d) { return (d || new Date()).toISOString().slice(0, 10); }
  function row() { return { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }; }
  function add(r, u) { r.calls += 1; r.input += u.input || 0; r.output += u.output || 0; r.cacheRead += u.cacheRead || 0; r.cacheWrite += u.cacheWrite || 0; }

  // Which desk made the call: read from the standing instructions sent with it.
  function deskOf(body) {
    let sys = body && body.system;
    if (Array.isArray(sys)) sys = sys.map(function (x) { return (x && x.text) || ''; }).join('\n');
    sys = String(sys || '');
    if (sys.indexOf('You are KANON') === 0) return 'Kanon';
    let m = sys.match(/You are ([A-Z][a-z]+) for this reply/);
    if (m) return m[1];
    m = sys.match(/\bYou are ([A-Z][a-z]{2,})\b/);
    if (m) return m[1];
    return sys ? 'other' : 'no-instructions';
  }
  function record(desk, model, u) {
    const d = day(); const p = pending[d] || (pending[d] = { desks: {}, models: {} });
    add(p.desks[desk] || (p.desks[desk] = row()), u);
    add(p.models[model] || (p.models[model] = row()), u);
  }
  function usageFrom(obj) {
    const u = (obj && obj.usage) || {};
    return { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 };
  }
  async function readStream(stream, desk, model) {
    const reader = stream.getReader(); const dec = new TextDecoder(); let buf = '';
    const u = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }; let m = model;
    try {
      for (;;) {
        const r = await reader.read(); if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (line.indexOf('data:') !== 0) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
          if (ev.type === 'message_start' && ev.message) { const s = usageFrom(ev.message); u.input = s.input; u.cacheRead = s.cacheRead; u.cacheWrite = s.cacheWrite; if (ev.message.model) m = ev.message.model; }
          if (ev.type === 'message_delta' && ev.usage) { if (ev.usage.output_tokens != null) u.output = ev.usage.output_tokens; }
        }
      }
    } catch (e) { /* a broken stream still records what it saw */ }
    record(desk, m, u);
  }

  async function flush() {
    const batch = pending; pending = {};
    const days = Object.keys(batch); if (!days.length) return;
    let auth; try { auth = require('./auth'); } catch (e) { return; }
    for (const d of days) {
      try {
        const key = 'meter:day:' + d;
        const cur = (await auth.readJSON(null, key, null)) || { desks: {}, models: {} };
        ['desks', 'models'].forEach(function (k) {
          Object.keys(batch[d][k]).forEach(function (name) {
            const a = cur[k][name] || (cur[k][name] = row()), b = batch[d][k][name];
            a.calls += b.calls; a.input += b.input; a.output += b.output; a.cacheRead += b.cacheRead; a.cacheWrite += b.cacheWrite;
          });
        });
        cur.updatedAt = Date.now();
        await auth.writeJSON(null, key, cur);
        try { await auth.expire(key, KEEP_DAYS * 86400); } catch (e) {}
      } catch (e) { /* keep the batch for the next flush */
        const back = pending[d] || (pending[d] = { desks: {}, models: {} });
        ['desks', 'models'].forEach(function (k) { Object.keys(batch[d][k]).forEach(function (n) { const a = back[k][n] || (back[k][n] = row()), b = batch[d][k][n]; a.calls += b.calls; a.input += b.input; a.output += b.output; a.cacheRead += b.cacheRead; a.cacheWrite += b.cacheWrite; }); });
      }
    }
  }

  function install() {
    if (installed || typeof globalThis.fetch !== 'function') return false;
    installed = true; origFetch = globalThis.fetch;
    globalThis.fetch = async function (input, init) {
      const url = String((input && input.url) || input || '');
      if (url.indexOf('api.anthropic.com/v1/messages') < 0) return origFetch(input, init);
      let desk = 'other', model = 'unknown';
      try { const b = JSON.parse((init && init.body) || '{}'); desk = deskOf(b); model = String(b.model || 'unknown'); } catch (e) {}
      const res = await origFetch(input, init);
      try {
        if (!res.ok || !res.body) return res;
        const ct = String(res.headers.get('content-type') || '');
        if (ct.indexOf('text/event-stream') >= 0) {
          const pair = res.body.tee();
          readStream(pair[1], desk, model);
          return new Response(pair[0], { status: res.status, statusText: res.statusText, headers: res.headers });
        }
        res.clone().json().then(function (j) { record(desk, (j && j.model) || model, usageFrom(j)); }).catch(function () {});
      } catch (e) {}
      return res;
    };
    timer = setInterval(function () { flush().catch(function () {}); }, FLUSH_MS);
    if (timer.unref) timer.unref();
    return true;
  }

  async function report(days) {
    const auth = require('./auth'); const out = [];
    for (let i = 0; i < Math.min(days || 14, 120); i++) {
      const d = day(new Date(Date.now() - i * 86400000));
      const r = await auth.readJSON(null, 'meter:day:' + d, null);
      const p = pending[d];
      if (r || p) {
        const merged = JSON.parse(JSON.stringify(r || { desks: {}, models: {} }));
        if (p) ['desks', 'models'].forEach(function (k) { Object.keys(p[k]).forEach(function (n) { const a = merged[k][n] || (merged[k][n] = row()), b = p[k][n]; a.calls += b.calls; a.input += b.input; a.output += b.output; a.cacheRead += b.cacheRead; a.cacheWrite += b.cacheWrite; }); });
        out.push({ day: d, desks: merged.desks, models: merged.models });
      }
    }
    return out;
  }

  module.exports = { install: install, report: report, flush: flush, _test: { deskOf: deskOf, pending: function () { return pending; } } };
})();
