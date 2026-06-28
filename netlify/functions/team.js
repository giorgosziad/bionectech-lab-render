// team.js — shared, team-wide data (everyone in the lab sees it):
//   team:meeting -> { url, label }            the official Team meeting link (admin sets)
//   team:rooms   -> [ {id,label,url,by} ]      other call rooms / links (anyone adds)
//   team:board   -> [ {id,title,body,tasks,by,ts} ]  shared notes with tasks
const { cors, json, userFrom, readJSON, writeJSON } = require('./lib/auth');

const M_KEY = 'team:meeting', R_KEY = 'team:rooms', B_KEY = 'team:board', C_KEY = 'team:code';
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function clip(s, n) { return (s == null ? '' : String(s)).slice(0, n); }
function normUrl(u) { u = clip(u, 500).trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const user = userFrom(event);
  if (!user) return json(401, { error: 'Sign in first.' });
  const me = (user.desk || 'someone');
  const isAdmin = user.role === 'admin';

  let meeting = await readJSON(null, M_KEY, { url: '', label: 'Team Meeting' });
  let rooms = await readJSON(null, R_KEY, []);
  let board = await readJSON(null, B_KEY, []);
  let code = await readJSON(null, C_KEY, { url: '', token: '' });
  let clear = await readJSON(null, 'nicolle:clearance', {});
  if (!clear || typeof clear !== 'object') clear = {};
  const meLc = String(me).toLowerCase();
  const myDegree = isAdmin ? 5 : (parseInt(clear[meLc], 10) || 0);   // owner always 5; others have NO access until assigned
  const nicolleAllowed = isAdmin || myDegree >= 1;                    // everyone can reach Nicolle, but only gets info <= their degree
  if (!code || typeof code !== 'object') code = { url: '', token: '' };
  if (!meeting || typeof meeting !== 'object') meeting = { url: '', label: 'Team Meeting' };
  if (!Array.isArray(rooms)) rooms = [];
  if (!Array.isArray(board)) board = [];
  // Auto-expire instant rooms (those given an 'expires' time) so the list self-cleans.
  const now = Date.now();
  const pruned = rooms.filter(function (r) { return !(r && r.expires && r.expires < now); });
  if (pruned.length !== rooms.length) { rooms = pruned; await writeJSON(null, R_KEY, rooms); }

  if (event.httpMethod === 'GET') {
    let present = [];
    try {
      const names = await readJSON(null, 'desks', []);
      const list = Array.isArray(names) ? names.slice(0, 80) : [];
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (let i = 0; i < list.length; i++) {
        const u = await readJSON(null, 'usage:' + String(list[i]).toLowerCase(), null);
        if (u && u.lastActive && u.lastActive > cutoff) present.push({ desk: list[i], ts: u.lastActive });
      }
      present.sort(function (a, b) { return b.ts - a.ts; });
    } catch (e) { present = []; }
    return json(200, { meeting: meeting, rooms: rooms, board: board, present: present, code: code, nicolleAllowed: nicolleAllowed, myDegree: myDegree, clearance: (isAdmin ? clear : {}) });
  }

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON.' }); }
  const a = b.action;

  if (a === 'setMeeting') {
    if (!isAdmin) return json(403, { error: 'Admins set the team meeting link.' });
    meeting = { url: normUrl(b.url), label: clip(b.label, 60).trim() || 'Team Meeting' };
    await writeJSON(null, M_KEY, meeting);
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (a === 'setCode') {
    if (!isAdmin) return json(403, { error: 'Admins set the code service.' });
    code = { url: normUrl(b.url), token: clip(b.token, 200).trim() };
    await writeJSON(null, C_KEY, code);
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (a === 'addRoom') {
    const label = clip(b.label, 60).trim(); const url = normUrl(b.url);
    if (!label || !url) return json(400, { error: 'Need a label and a link.' });
    const room = { id: id(), label: label, url: url, by: me };
    if (b.ephemeral) { room.expires = Date.now() + 3 * 3600 * 1000; room.kind = 'instant'; } // auto-expire in 3h
    rooms.push(room); rooms = rooms.slice(-50);
    await writeJSON(null, R_KEY, rooms);
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (a === 'delRoom') {
    rooms = rooms.filter(function (r) { return !(r && r.id === b.id && (isAdmin || r.by === me)); });
    await writeJSON(null, R_KEY, rooms);
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (a === 'addNote') {
    const title = clip(b.title, 120).trim() || 'Note';
    const body = clip(b.body, 4000).trim();
    let tasks = Array.isArray(b.tasks) ? b.tasks : [];
    tasks = tasks.map(function (t) { return { id: id(), text: clip(t, 200).trim(), done: false }; }).filter(function (t) { return t.text; }).slice(0, 30);
    board.unshift({ id: id(), title: title, body: body, tasks: tasks, by: me, ts: Date.now() });
    board = board.slice(0, 200);
    await writeJSON(null, B_KEY, board);
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (a === 'addTask') {
    const note = board.filter(function (n) { return n.id === b.noteId; })[0];
    if (!note) return json(404, { error: 'Note not found.' });
    note.tasks = note.tasks || [];
    const text = clip(b.text, 200).trim();
    if (text) note.tasks.push({ id: id(), text: text, done: false });
    await writeJSON(null, B_KEY, board);
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (a === 'toggleTask') {
    const note = board.filter(function (n) { return n.id === b.noteId; })[0];
    if (note && note.tasks) { note.tasks.forEach(function (t) { if (t.id === b.taskId) t.done = !t.done; }); await writeJSON(null, B_KEY, board); }
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (a === 'delNote') {
    board = board.filter(function (n) { return !(n && n.id === b.id && (isAdmin || n.by === me)); });
    await writeJSON(null, B_KEY, board);
    return json(200, { meeting: meeting, rooms: rooms, board: board, code: code });
  }
  if (b.action === 'setDegree') {
    if (!isAdmin) return json(403, { error: 'Only the owner sets confidentiality degrees.' });
    const name = String(b.desk || '').toLowerCase().trim();
    if (!name) return json(400, { error: 'Need a user name.' });
    const deg = parseInt(b.degree, 10);
    if (deg >= 1 && deg <= 5) { clear[name] = deg; } else { delete clear[name]; }   // out-of-range removes them (back to default 1)
    await writeJSON(null, 'nicolle:clearance', clear);
    return json(200, { ok: true, clearance: clear });
  }
  return json(400, { error: 'Unknown action.' });
};
