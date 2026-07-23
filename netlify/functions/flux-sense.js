// ============================================================
// FLUX PHASE 1 - FIELD SENSING
// Computes and logs the field. Injects NOWHERE. Strength: 0.
// Standalone function - touches no persona, no briefing, no other file.
// Auth: header x-flux-key ONLY (query params land in request logs).
//       Fails CLOSED if FLUX_SENSE_KEY is unset. Constant-time compare.
// Storage: the Lab's own readJSON/writeJSON, same path as drift:log.
// Accepts NO caller payload - every logged field is computed server-side.
// ============================================================
"use strict";

const crypto = require("crypto");

const FLUX_VERSION = "1.0-sense";
const DIARY_KEY = "flux:diary";
const DIARY_CAP = 200;

function buildField() {
  return {
    header: {
      version: FLUX_VERSION,
      strength: 0,
      couplings: {},
      refreshed: new Date().toISOString(),
      phase: "1-sensing (computed + logged, injected nowhere)"
    },
    constants: [
      { id: "reg-001",  body: "non-device CDS under Section 520(o)(1)(E)", src: "canonical", ttl: "perm" },
      { id: "conf-001", body: "Consumer tracker platform: NO public surface", src: "canonical", ttl: "perm" },
      { id: "conf-002", body: "Wellness platform: NO public surface; wellness language only, never medical", src: "canonical", ttl: "perm" },
      { id: "brand-01", body: "SVG icons only; zero emoji; locked palette tokens", src: "canonical", ttl: "perm" },
      { id: "std-01",   body: "VERIFIED vs STATED never blended", src: "doctrine", ttl: "perm" },
      { id: "std-02",   body: "Deployed = independently confirmed; delivered = actual artifact checked", src: "doctrine", ttl: "perm" }
    ],
    live: []  // fills only from operator DECLARE events, never from conversation
  };
}

function keyMatches(got, expected) {
  if (!expected || !got) return false;
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

async function appendDiary(entry) {
  try {
    const { readJSON, writeJSON } = require("./lib/auth");
    let arr = [];
    try { arr = (await readJSON(null, DIARY_KEY)) || []; } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.push(entry);
    if (arr.length > DIARY_CAP) arr = arr.slice(arr.length - DIARY_CAP);
    await writeJSON(null, DIARY_KEY, arr);
    return { mode: "persisted", total: arr.length, tail: arr.slice(-5) };
  } catch (e) {
    return { mode: "NOT PERSISTED (" + ((e && e.message) || "unknown") + ")", total: 1, tail: [entry] };
  }
}

exports.handler = async function (event) {
  const expected = process.env.FLUX_SENSE_KEY || "";
  if (!expected) {
    return {
      statusCode: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "not configured: FLUX_SENSE_KEY is unset" })
    };
  }
  const h = (event && event.headers) || {};
  const got = h["x-flux-key"] || h["X-Flux-Key"] || "";
  if (!keyMatches(got, expected)) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "unauthorized" })
    };
  }

  const field = buildField();
  const bytes = Buffer.byteLength(JSON.stringify(field), "utf8");

  const entry = {
    id: "flux-" + Date.now(),
    verb: "SENSE",
    version: field.header.version,
    constants: field.constants.length,
    live: field.live.length,
    bytes: bytes,
    at: field.header.refreshed
  };
  const diary = await appendDiary(entry);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      flux: field.header,
      reading: { constants: field.constants.length, live: field.live.length, bytes: bytes },
      diary: diary,
      note: "Phase 1: field computed and logged only. Nothing was injected into any persona. Strength remains 0."
    }, null, 2)
  };
};
