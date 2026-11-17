// Load test: N students move at 8 Hz for D seconds. node tests/load-test.mjs [N=40] [seconds=30] [url]
const N = +process.argv[2] || 40, D = +process.argv[3] || 30, S = process.argv[4] || 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { token } = await (await fetch(S + '/api/teacher/login', { method: 'POST', body: JSON.stringify({ password: '310348' }) })).json();
const bots = [];
const mk = (join) => new Promise((res) => { const ws = new WebSocket(S.replace('http', 'ws') + '/ws'); const b = { ws, bytes: 0, msgs: 0, lat: [], x: Math.random() * 60 - 30, z: 20 + Math.random() * 30, id: join.sid };
  ws.onmessage = (e) => { b.bytes += e.data.length; b.msgs++; const m = JSON.parse(e.data);
    if (m.t === 'players' && b.id !== 'bot0') { const r = m.list.find((q) => q[0] === 'bot0'); if (r && b.probe && r[4] !== b.lastX) { b.lastX = r[4]; if (bots[0].sent[r[4]]) b.lat.push(Date.now() - bots[0].sent[r[4]]); } } };
  b.sent = {}; ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', ...join })); res(b); }; });
const T = await mk({ role: 'teacher', token }); T.id = 'teacher';
for (let i = 0; i < N; i++) { bots.push(await mk({ role: 'student', name: 'bot' + i, no: String(i), cls: 'test', sid: 'bot' + i, look: i % 12 })); bots[i].probe = i === N - 1; }
await sleep(500);
T.ws.send(JSON.stringify({ t: 'cmd', c: 'start', spots: Array.from({ length: 48 }, (_, i) => [(i % 8) * 25 - 90, Math.floor(i / 8) * 25 - 70, Math.floor(i / 8)]) }));
await sleep(4500);
bots.forEach((b) => { b.bytes = 0; b.msgs = 0; });
const t0 = Date.now(); let tick = 0;
const iv = setInterval(() => { tick++; bots.forEach((b, i) => { b.x += Math.sin(tick / 9 + i) * 0.4; b.z += Math.cos(tick / 11 + i) * 0.4; const x = +b.x.toFixed(2); if (i === 0) b.sent[x] = Date.now(); b.ws.send(JSON.stringify({ t: 'pos', x, y: 0, z: +b.z.toFixed(2), ry: 1, s: 2, a: 1 })); }); }, 125);
await sleep(D * 1000); clearInterval(iv);
const secs = (Date.now() - t0) / 1000, avg = (f) => bots.reduce((a, b) => a + f(b), 0) / bots.length, lat = bots[N - 1].lat.sort((a, b) => a - b);
console.log(`bots=${N} duration=${secs.toFixed(0)}s`);
console.log(`per client downstream: ${(avg((b) => b.bytes) / secs / 1024).toFixed(1)} KB/s, ${(avg((b) => b.msgs) / secs).toFixed(1)} msg/s`);
console.log(`total server egress: ${(bots.reduce((a, b) => a + b.bytes, 0) / secs / 1024).toFixed(0)} KB/s`);
console.log(`move latency (bot0 -> bot${N - 1}) ms: p50=${lat[lat.length >> 1]} p95=${lat[Math.floor(lat.length * 0.95)]} max=${lat.at(-1)} n=${lat.length}`);
T.ws.send(JSON.stringify({ t: 'cmd', c: 'clear' })); bots.forEach((b) => b.ws.close()); T.ws.close(); await sleep(200); process.exit(0);
