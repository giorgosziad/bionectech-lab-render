// sendmail.js — sends an email the user has written/reviewed, via the Resend API.
// Nicolle DRAFTS; the human reviews and clicks Send; this function does the actual send.
// Requires two Netlify env vars:
//   RESEND_API_KEY  - from https://resend.com (free tier available)
//   MAIL_FROM       - a VERIFIED sender, e.g. "Bionectech <giorgos@yourdomain.com>"
// Until those are set, sending returns a clear, honest "not configured" message.
const { cors, json, userFrom, rlHit, clientIp } = require('./lib/auth');

function clip(s, n) { return (s == null ? '' : String(s)).slice(0, n); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()); }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });
  if (event.httpMethod === 'GET') {
    return json(200, { ok: true, canSend: user.role === 'admin', configured: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM), from: (user.role === 'admin' ? (process.env.MAIL_FROM || '') : '') });
  }
  if (user.role !== 'admin') return json(403, { error: 'Only the admin can send email from the Bionectech address. You can use "Open in mail app" to send from your own email.' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only.' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON.' }); }

  const to = clip(b.to, 200).trim();
  const subject = clip(b.subject, 300).trim();
  const body = clip(b.body, 50000);
  const replyTo = clip(b.replyTo, 200).trim();
  function emailList(v){ return clip(v, 600).split(/[,;\s]+/).map(function(x){return x.trim();}).filter(function(x){return validEmail(x);}).slice(0, 25); }
  const cc = emailList(b.cc);
  const bcc = emailList(b.bcc);
  if (!validEmail(to)) return json(400, { error: 'Please enter a valid recipient email.' });
  if (!subject) return json(400, { error: 'Please add a subject.' });
  if (!body.trim()) return json(400, { error: 'The email body is empty.' });

  // Rate limit: 30 sends / hour per desk+IP.
  const rlKey = 'rl:mail:' + clientIp(event) + ':' + (user.desk || '').toLowerCase();
  const n = await rlHit(rlKey, 3600);
  if (n > 30) return json(429, { error: 'Too many emails sent this hour. Please wait a bit.' });

  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    return json(503, { error: 'Email sending is not set up yet. In Netlify, add RESEND_API_KEY and MAIL_FROM (a verified sender), then redeploy. Until then, use "Open in mail app" to send from your own email.' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key },
      body: JSON.stringify({
        from: from,
        to: [to],
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject: subject,
        text: body,
        reply_to: validEmail(replyTo) ? replyTo : undefined
      })
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) return json(502, { error: 'Send failed: ' + ((j && (j.message || j.error)) || ('HTTP ' + r.status)) });
    return json(200, { ok: true, id: (j && j.id) || null, sentBy: user.desk });
  } catch (e) {
    return json(502, { error: 'Could not reach the email service. Try again.' });
  }
};
