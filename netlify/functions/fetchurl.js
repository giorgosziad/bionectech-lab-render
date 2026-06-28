// fetchurl.js — fetch a public URL's readable text so Karam can work on it.
// Hardened against SSRF: only http/https, DNS-resolved IP must be public,
// short timeout, capped size, text-only content types.
const { cors, json, userFrom } = require('./lib/auth');
const dns = require('dns').promises;

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80')) return true;
  const p = ip.split('.').map(Number);
  if (p.length === 4 && p.every(function (n) { return Number.isFinite(n); })) {
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;          // link-local / cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] >= 224) return true;                            // multicast/reserved
  }
  return false;
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON.' }); }
  let url = (b.url || '').toString().trim();
  if (!url) return json(400, { error: 'Provide a url.' });
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let parsed;
  try { parsed = new URL(url); } catch (e) { return json(400, { error: 'Invalid URL.' }); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return json(400, { error: 'Only http/https allowed.' });
  if (/^(localhost|metadata|metadata\.google\.internal)$/i.test(parsed.hostname)) return json(400, { error: 'Blocked host.' });
  // Private, login-required pages can't be read by a server fetch. Tell the user the real path.
  if (/(^|\.)claude\.ai$|(^|\.)anthropic\.com$/i.test(parsed.hostname)) {
    return json(422, { error: 'Claude project links are private and cannot be read by Link. Open the project, copy its content, and paste it into chat (or use + Attach).' });
  }
  if (/(^|\.)(docs\.google\.com|notion\.so|sharepoint\.com|onedrive\.live\.com|dropbox\.com)$/i.test(parsed.hostname)) {
    return json(422, { error: 'That host usually needs a login, so its real content is not readable by Link. Paste the content or use + Attach. (A public, shared-to-anyone link may work.)' });
  }

  try {
    const addrs = await dns.lookup(parsed.hostname, { all: true });
    if (!addrs.length || addrs.some(function (a) { return isPrivateIp(a.address); })) {
      return json(400, { error: 'Blocked: URL resolves to a private/internal address.' });
    }
  } catch (e) {
    return json(400, { error: 'Could not resolve host.' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 8000);
  try {
    const r = await fetch(parsed.href, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'BionectechLab/1.0' } });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!/text\/|application\/(json|xml|xhtml)/.test(ct)) {
      clearTimeout(timer);
      return json(415, { error: 'Unsupported content type: ' + (ct || 'unknown') });
    }
    const raw = await r.text();
    clearTimeout(timer);
    const capped = raw.slice(0, 600 * 1024); // cap bytes read into memory
    const isHtml = /text\/html|xhtml/.test(ct);
    let title = '';
    const tm = isHtml ? capped.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null;
    if (tm) title = htmlToText(tm[1]).slice(0, 200);
    const text = (isHtml ? htmlToText(capped) : capped.replace(/\s+/g, ' ').trim()).slice(0, 12000);
    // Detect bot-check / login interstitials (e.g. Cloudflare "Just a moment...") so we
    // don't hand Karam a useless block page.
    const probe = (title + ' ' + text.slice(0, 800)).toLowerCase();
    const blocked = /just a moment|enable javascript and cookies|checking your browser|attention required|cf-browser-verification|verify you are human|please sign in|log in to continue|you need to enable javascript/.test(probe);
    if (blocked || text.replace(/\s/g, '').length < 40) {
      return json(422, { error: 'That page is protected (a login or bot-check blocked it), so its real content could not be read. Please copy the content and paste it into chat, or use + Attach.' });
    }
    return json(200, { url: parsed.href, title: title, text: text, truncated: raw.length > capped.length || text.length >= 12000 });
  } catch (e) {
    clearTimeout(timer);
    const msg = (e && e.name === 'AbortError') ? 'Timed out fetching the URL.' : ('Could not fetch the URL. ' + (e && e.message ? e.message : ''));
    return json(502, { error: msg });
  }
};
