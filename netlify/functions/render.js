'use strict';
// netlify/functions/render.js - thin server-side proxy to the karam-code /render endpoint.
// Purpose: keep KARAM_SHARED_TOKEN out of the browser. The page posts { html } here
// with no token; this function forwards it upstream with x-karam-token and passes
// the upstream JSON response through untouched. Part 2 of designed-PDF delivery.

var MAX_HTML_BYTES = 8 * 1024 * 1024;

function jsonResp(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

exports.handler = async function (event) {
  if (!event || event.httpMethod !== 'POST') {
    return jsonResp(405, { ok: false, error: 'method not allowed' });
  }
  var url = process.env.KARAM_RENDER_URL;
  var token = process.env.KARAM_SHARED_TOKEN;
  if (!url || !token) {
    return jsonResp(500, { ok: false, error: 'render proxy not configured' });
  }
  var html;
  try {
    var body = JSON.parse(event.body || '{}');
    html = body && body.html;
  } catch (err) {
    return jsonResp(400, { ok: false, error: 'bad json' });
  }
  if (typeof html !== 'string' || html.length === 0) {
    return jsonResp(400, { ok: false, error: 'missing html' });
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return jsonResp(413, { ok: false, error: 'html too large' });
  }
  var ctl = new AbortController();
  var tm = setTimeout(function () { ctl.abort(); }, 25000);
  try {
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-karam-token': token },
      body: JSON.stringify({ html: html }),
      signal: ctl.signal
    });
    var text = await r.text();
    return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: text };
  } catch (err) {
    return jsonResp(502, { ok: false, error: 'render upstream unreachable' });
  } finally {
    clearTimeout(tm);
  }
};
