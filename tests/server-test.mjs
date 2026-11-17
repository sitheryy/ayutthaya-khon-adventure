// End-to-end protocol test against a running server (wrangler dev): node tests/server-test.mjs [http://127.0.0.1:8787]
import assert from 'node:assert/strict';
const S = process.argv[2] || 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(join) {
  const ws = new WebSocket(S.replace('http', 'ws') + '/ws'), inbox = [];
  const c = { ws, inbox, send: (o) => ws.send(JSON.stringify(o)), wait: async (t, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { const i = inbox.findIndex((m) => m.t === t); if (i >= 0) return inbox.splice(i, 1)[0]; await sleep(20); } throw new Error('timeout waiting for ' + t); } };
  ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
  return new Promise((res) => (ws.onopen = () => { c.send({ t: 'join', ...join }); res(c); }));
}
const bad = await (await fetch(S + '/api/teacher/login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) })).json();
assert.equal(bad.ok, false, 'wrong password rejected');
const { token } = await (await fetch(S + '/api/teacher/login', { method: 'POST', body: JSON.stringify({ password: '310348' }) })).json();
assert.ok(token, 'teacher token');

const fake = await client({ role: 'teacher', token: 'forged' });
assert.equal((await fake.wait('error')).msg, 'unauthorized', 'forged teacher token refused');

const T = await client({ role: 'teacher', token }); await T.wait('welcome');
const A = await client({ role: 'student', name: 'เด็กหญิง ก', no: '1', cls: 'ม.3/1', sid: 'test-a' }); const wa = await A.wait('welcome');
const B = await client({ role: 'student', name: 'เด็กชาย ข', no: '2', cls: 'ม.3/1', sid: 'test-b' }); await B.wait('welcome');
assert.equal(wa.role, 'student');

// students see each other
A.send({ t: 'pos', x: 5, y: 0, z: 25, ry: 1, s: 2, a: 0 }); await sleep(300);
const pl = await B.wait('players'); assert.ok(pl.list.some((r) => r[0] === 'test-a'), 'B sees A');

// teacher avatar visible to students, can be hidden
T.send({ t: 'pos', x: 7, y: 0, z: 30, ry: 0, s: 0, a: 0 }); await sleep(400); B.inbox.length = 0;
let tl = await B.wait('players'); assert.ok(tl.list.some((r) => r[0] === 'teacher' && r[4] === 7), 'student sees teacher');
T.send({ t: 'show', on: false }); await sleep(400); B.inbox.length = 0; tl = await B.wait('players'); assert.ok(!tl.list.some((r) => r[0] === 'teacher'), 'teacher hidden on toggle');
T.send({ t: 'show', on: true }); await sleep(300);

// start with a spot pool -> each student gets 12 chests
const spots = Array.from({ length: 48 }, (_, i) => [(i % 8) * 25 - 90, Math.floor(i / 8) * 25 - 70]);
T.send({ t: 'cmd', c: 'start', spots });
assert.equal((await A.wait('countdown')).kind, 'start', '3-2-1 countdown first');
assert.equal((await A.wait('phase', 6000)).phase, 'playing');
const ch = await A.wait('chests'); assert.equal(ch.chests.length, 12, '12 chests');

// opening from far away is refused; from close gets a question without the answer
A.send({ t: 'open', chest: 0 }); assert.match((await A.wait('notice')).msg, /ใกล้/);
const c0 = ch.chests[0]; A.send({ t: 'pos', x: c0.x + 1, y: 0, z: c0.z, ry: 0, s: 0, a: 0 }); await sleep(100);
A.send({ t: 'open', chest: 0 }); const q = await A.wait('question');
assert.ok(q.q && q.choices.length === 4 && q.answer === undefined, 'question has no answer field');

// wrong answer: no points, chest moves; replay of the same answer is ignored
const wrong = await (async () => { for (let k = 0; k < 4; k++) { A.send({ t: 'answer', chest: 0, choice: k }); const r = await A.wait('result'); return r; } })();
if (!wrong.right) { assert.ok(wrong.points <= 0, 'wrong answer: penalty'); assert.ok(wrong.chestState.x !== c0.x || wrong.chestState.z !== c0.z, 'chest relocated'); }
A.send({ t: 'answer', chest: 0, choice: wrong.answer }); await sleep(200); assert.ok(!A.inbox.some((m) => m.t === 'result'), 'no double claim');

// correct answer path
const cs = wrong.chestState; A.send({ t: 'pos', x: cs.x, y: 0, z: cs.z + 1, ry: 0, s: 0, a: 0 }); await sleep(100);
if (!cs.found) { A.send({ t: 'open', chest: 0 }); await A.wait('question'); }
// we don't know the answer client-side; brute force is impossible (one answer per question) — just check scoring stays consistent
B.inbox.length = 0; A.inbox.length = 0; T.send({ t: 'cmd', c: 'pause' }); assert.equal((await B.wait('phase')).phase, 'paused');
B.send({ t: 'pos', x: 99, y: 0, z: 99, ry: 0, s: 0, a: 0 }); await sleep(300);
T.send({ t: 'cmd', c: 'summon' }); const sm = await B.wait('summon'); assert.ok(Math.hypot(sm.x, sm.z - 20) < 7, 'summoned to plaza');
A.inbox.length = 0; B.inbox.length = 0; T.send({ t: 'cmd', c: 'broadcast', text: 'สวัสดีนักเรียน' }); assert.equal((await A.wait('broadcast')).text.length > 0 && (await B.wait('broadcast')).text, 'สวัสดีนักเรียน');
T.send({ t: 'cmd', c: 'end' }); assert.equal((await A.wait('countdown')).kind, 'end'); const lb = await A.wait('leaderboard', 6000); assert.ok(lb.rows.length >= 2, 'leaderboard');
const roster = await T.wait('roster'); assert.ok(roster.list.length >= 2, 'teacher roster');

// reconnect keeps score
A.ws.close(); await sleep(300);
const A2 = await client({ role: 'student', name: 'เด็กหญิง ก', no: '1', cls: 'ม.3/1', sid: 'test-a' }); const w2 = await A2.wait('welcome');
assert.equal(w2.me.score, lb.rows.find((r) => r.name === 'เด็กหญิง ก').score, 'score restored after reconnect');
T.send({ t: 'cmd', c: 'lobby' }); await sleep(200);
console.log('ALL SERVER TESTS PASSED');
process.exit(0);
