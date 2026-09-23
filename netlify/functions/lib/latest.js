// lib/latest.js - BNT_LATEST_OPUS: one source of truth for the model list and "Latest (auto)".
// Live from Anthropic's /v1/models (release dates included). "Latest" = newest Opus by release
// date, so a new Opus is picked up automatically - no code change, no hand-typed list.
// 10-minute cache in memory; last good answer also kept in Redis for when the API is unreachable.
(function () {
  'use strict';
  const { readJSON, writeJSON } = require('./auth');
  const TTL_MS = 10 * 60 * 1000, RETRY_MS = 60 * 1000, KEY = 'model:latest-opus';
  let mem = null;               // { at, ttl, models:[{id,name,created}], latest:{id,name}|null }

  async function fetchModels(key) {
    const ac = new AbortController();
    const t = setTimeout(function () { ac.abort(); }, 3000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: ac.signal });
      clearTimeout(t);
      const j = await r.json();
      return ((j && j.data) || [])
        .filter(function (m) { return m && typeof m.id === 'string' && !/mythos/i.test(m.id); })
        .map(function (m) { return { id: m.id, name: m.display_name || m.id, created: String(m.created_at || '') }; });
    } catch (e) { clearTimeout(t); return []; }
  }
  function byNewest(a, b) {
    const c = String(b.created).localeCompare(String(a.created));   // newest release first
    return c !== 0 ? c : (a.id.length - b.id.length);                // tie: prefer the alias over a dated id
  }
  function dedupe(list) {
    const seen = {}, out = [];
    list.slice().sort(byNewest).forEach(function (m) {
      const k = String(m.name).toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(m); }
    });
    return out;
  }
  function pickLatestOpus(list) {
    const o = list.filter(function (m) { return /opus/i.test(m.id); }).sort(byNewest);
    return o.length ? { id: o[0].id, name: o[0].name } : null;
  }
  async function snapshot() {
    const now = Date.now();
    if (mem && now - mem.at < mem.ttl) return mem;
    const key = process.env.ANTHROPIC_API_KEY || '';
    const list = key ? await fetchModels(key) : [];
    if (list.length) {
      mem = { at: now, ttl: TTL_MS, models: dedupe(list), latest: pickLatestOpus(list) };
      if (mem.latest) { try { await writeJSON(null, KEY, { id: mem.latest.id, name: mem.latest.name, ts: now }); } catch (e) {} }
      return mem;
    }
    // API unreachable: keep what we had; otherwise use the last good answer from Redis. Retry soon.
    if (mem) { mem.at = now; mem.ttl = RETRY_MS; return mem; }
    let saved = null;
    try { saved = await readJSON(null, KEY, null); } catch (e) {}
    mem = { at: now, ttl: RETRY_MS, models: [], latest: (saved && saved.id) ? { id: saved.id, name: saved.name || saved.id } : null };
    return mem;
  }
  async function latestOpusId() { const s = await snapshot(); return (s.latest && s.latest.id) || null; }

  module.exports = { snapshot: snapshot, latestOpusId: latestOpusId, _test: { dedupe: dedupe, pickLatestOpus: pickLatestOpus, reset: function () { mem = null; } } };
})();
