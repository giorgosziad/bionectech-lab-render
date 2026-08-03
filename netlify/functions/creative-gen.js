// creative-gen.js - one endpoint for every Runway creative output: images, video,
// voice-over, localization. The key NEVER reaches the browser; the browser calls this,
// this calls Runway.
//
// POST { kind:'image'|'video', model, promptText, ratio, duration, promptImage }
//   -> { ok:true, id }            generation started
// GET  ?id=<taskId>
//   -> { ok:true, status, url }   poll until status is SUCCEEDED
//
// Runway is asynchronous by design: you start a task, then poll it. A single request
// that waited for completion would exceed the function timeout on any real generation,
// which is why this is split in two.
const { cors, json, userFrom } = require('./lib/auth');

const RW = 'https://api.dev.runwayml.com/v1';
const VER = '2024-11-06';

// Cost discipline: only models we have deliberately chosen are callable. An open model
// field would let a typo spend credits on something unintended.
const IMAGE_MODELS = ['gen4_image', 'gen4_image_turbo', 'gemini_image3_pro', 'gemini_image3.1_flash', 'product_campaign_image', 'marketing_stock_image', 'gpt_image_2'];
const VIDEO_MODELS = ['veo3','veo3.1','veo3.1_fast','kling3.0_standard','kling3.0_pro','kling3.0_4k','klingO3_standard','klingO3_pro','klingO3_4k','seedance2','seedance2_fast','seedance2_mini','happyhorse_1_0','gen4_turbo','gen3a_turbo'];

function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }

async function rw(path, opts) {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error('RUNWAY_API_KEY is not set on this service.');
  opts = opts || {};
  opts.headers = Object.assign({
    'Authorization': 'Bearer ' + key,
    'X-Runway-Version': VER,
    'Content-Type': 'application/json'
  }, opts.headers || {});
  const r = await fetch(RW + path, opts);
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { ok: r.ok, status: r.status, data: j, raw: t.slice(0, 600) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });

  // POLL
  if (event.httpMethod === 'GET') {
    const id = clip((event.queryStringParameters || {}).id, 100).trim();
    if (!id) return json(400, { error: 'Missing id.' });
    const r = await rw('/tasks/' + encodeURIComponent(id), { method: 'GET' });
    if (!r.ok) return json(502, { error: 'Runway poll failed: ' + r.raw });
    const d = r.data || {};
    const out = Array.isArray(d.output) ? d.output[0] : (d.output || null);
    return json(200, {
      ok: true,
      status: d.status || 'UNKNOWN',
      url: out || null,
      progress: d.progress || null,
      failure: d.failure || d.failureCode || null
    });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Use GET or POST.' });

  // Generation spends credits. Admin only, deliberately.
  if (user.role !== 'admin') return json(403, { error: 'Only the admin can generate creative.' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON.' }); }

  const kind = clip(b.kind, 12).toLowerCase();
  const model = clip(b.model, 60).trim();
  const promptText = clip(b.promptText, 2000).trim();
  const ratio = clip(b.ratio, 20).trim() || '1920:1080';
  if (!promptText) return json(400, { error: 'promptText is required.' });

  if (kind === 'image') {
    if (IMAGE_MODELS.indexOf(model) < 0) return json(400, { error: 'Unknown image model. Allowed: ' + IMAGE_MODELS.join(', ') });
    const body = { model: model, promptText: promptText, ratio: ratio };
    const r = await rw('/text_to_image', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) return json(502, { error: 'Runway rejected the image request: ' + r.raw });
    return json(200, { ok: true, id: (r.data && r.data.id) || null, kind: 'image' });
  }

  if (kind === 'video') {
    if (VIDEO_MODELS.indexOf(model) < 0) return json(400, { error: 'Unknown video model. Allowed: ' + VIDEO_MODELS.join(', ') });
    const dur = Math.max(2, Math.min(10, parseInt(b.duration || 5, 10)));
    const body = { model: model, promptText: promptText, ratio: ratio, duration: dur };
    // Image-to-video models need a starting frame; text-to-video ones do not.
    if (b.promptImage) body.promptImage = clip(b.promptImage, 2000);
    const path = b.promptImage ? '/image_to_video' : '/text_to_video';
    const r = await rw(path, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) return json(502, { error: 'Runway rejected the video request: ' + r.raw });
    return json(200, { ok: true, id: (r.data && r.data.id) || null, kind: 'video' });
  }

  return json(400, { error: "kind must be 'image' or 'video'." });
};
