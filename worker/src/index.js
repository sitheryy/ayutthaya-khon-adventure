// AYUTTHAYA KHON ADVENTURE — game server (Cloudflare Worker + one Durable Object per classroom).
// The server owns: game phase, chest layout, questions + answers, scores. Clients only send intents.
import BANK from './questions.json';

const json = (o, status = 200, origin = '*') => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' } });
    if (url.pathname === '/' ) return new Response('Ayutthaya Khon Adventure server OK');
    const id = env.ROOM.idFromName('main');               // one classroom room (room codes removed by request)
    return env.ROOM.get(id).fetch(req);
  },
};

// ---------- helpers ----------
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
const rid = () => b64(crypto.getRandomValues(new Uint8Array(18))).replace(/[+/=]/g, '');
const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n);
const N_CHESTS = 12, FIND_BONUS = 20, PENALTY = 20, TIME_LIMIT = 30, OPEN_RANGE = 4.5, MAX_PLAYERS = 50;
const SPAWN = { x: 0, z: 20 };

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.sockets = new Map();        // ws -> { sid, role }
    this.players = new Map();        // sid -> player
    this.phase = 'lobby';
    this.layout = []; this.pool = [];
    this.tokens = new Map();         // teacher token -> expiry
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const s = ctx.storage;
      this.phase = (await s.get('phase')) || 'lobby';
      this.layout = (await s.get('layout')) || [];
      this.pool = (await s.get('pool')) || [];
      this.bank = (await s.get('bank')) || BANK.questions;
      for (const [k, v] of await s.list({ prefix: 'p:' })) this.players.set(k.slice(2), { ...v, online: false, ws: null });
      if (!(await s.get('pw'))) { const salt = rid(); await s.put('pw', { salt, hash: await pbkdf2(env.TEACHER_DEFAULT_PASSWORD || '310348', salt) }); }
    });
    this.tick = null;   // 8 Hz snapshot timer, only while someone is connected (no idle billing)
  }

  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.sockets.set(server, { sid: null, role: null });
      this.tick ||= setInterval(() => this.broadcastPlayers(), 125);
      server.addEventListener('message', (e) => this.onMessage(server, e.data).catch((err) => this.send(server, { t: 'error', msg: String(err.message || err) })));
      server.addEventListener('close', () => this.onClose(server));
      server.addEventListener('error', () => this.onClose(server));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/api/teacher/login' && req.method === 'POST') {
      const { password } = await req.json().catch(() => ({}));
      const pw = await this.ctx.storage.get('pw');
      if (!password || (await pbkdf2(String(password), pw.salt)) !== pw.hash) return json({ ok: false, error: 'รหัสผ่านไม่ถูกต้อง' }, 401);
      const token = rid(); this.tokens.set(token, Date.now() + 8 * 3600e3);
      return json({ ok: true, token });
    }
    if (url.pathname === '/api/teacher/password' && req.method === 'POST') {
      const { token, newPassword } = await req.json().catch(() => ({}));
      if (!this.isTeacher(token)) return json({ ok: false, error: 'unauthorized' }, 401);
      if (!newPassword || String(newPassword).length < 4) return json({ ok: false, error: 'รหัสผ่านสั้นเกินไป' }, 400);
      const salt = rid(); await this.ctx.storage.put('pw', { salt, hash: await pbkdf2(String(newPassword), salt) });
      return json({ ok: true });
    }
    return json({ ok: false, error: 'not found' }, 404);
  }

  isTeacher(token) { const exp = this.tokens.get(token); return !!exp && exp > Date.now(); }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch {} }
  all(o, filter = () => true) { const s = JSON.stringify(o); for (const [ws, m] of this.sockets) if (m.role && filter(m)) try { ws.send(s); } catch {} }
  save(p) { const { ws, ...rest } = p; return this.ctx.storage.put('p:' + p.sid, rest); }

  publicPlayer(p) { return [p.sid, p.name, p.no, p.cls, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), +p.s.toFixed(1), p.a ? 1 : 0, p.online ? 1 : 0, p.score, p.found, p.right, p.wrong, p.e || 0, p.look ?? -1]; }
  broadcastPlayers() {
    if (!this.sockets.size) return;
    const list = [...this.players.values()].filter((p) => p.online).map((p) => this.publicPlayer(p));
    const t = this.teacher;
    if (t?.on && [...this.sockets.values()].some((s) => s.role === 'teacher')) list.push(['teacher', 'ครู', '', '', +t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2), +t.ry.toFixed(2), +t.s.toFixed(1), t.a, 1, 0, 0, 0, 0, t.e || 0]);
    this.all({ t: 'players', list });
    this.tickN = (this.tickN || 0) + 1;
    if (this.dirtyRoster || this.tickN % 8 === 0) { this.dirtyRoster = false; this.all({ t: 'roster', list: [...this.players.values()].map((p) => this.publicPlayer(p)) }, (m) => m.role === 'teacher'); }
  }

  newChests(p) { p.chests = this.layout.map((c) => ({ x: c.x, z: c.z, found: false })); p.used = []; }
  chestView(p) { return (p.chests || []).map((c) => ({ x: c.x, z: c.z, found: c.found })); }

  async onMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 20000) return;
    const m = JSON.parse(raw), me = this.sockets.get(ws);
    if (m.t === 'join') {
      if (m.role === 'teacher') {
        if (!this.isTeacher(m.token)) return this.send(ws, { t: 'error', msg: 'unauthorized' });
        me.role = 'teacher';
        this.send(ws, { t: 'welcome', role: 'teacher', phase: this.phase, total: this.layout.length || N_CHESTS });
        this.dirtyRoster = true; return;
      }
      let sid = clean(m.sid, 40) || rid();
      // same name + number + class on a new device/browser -> continue that student's record
      if (!this.players.has(sid)) { const twin = [...this.players.values()].find((x) => !x.online && x.name === clean(m.name, 40) && x.no === clean(m.no, 4) && x.cls === clean(m.cls, 12)); if (twin) sid = twin.sid; }
      let p = this.players.get(sid);
      if (!p && [...this.players.values()].filter((x) => x.online).length >= MAX_PLAYERS) return this.send(ws, { t: 'error', msg: 'ห้องเต็มแล้ว' });
      if (!p) { p = { sid, score: 0, found: 0, right: 0, wrong: 0, x: SPAWN.x, y: 0, z: SPAWN.z, ry: 0, s: 0, a: 0 }; this.players.set(sid, p); }
      if (p.ws && p.ws !== ws) try { p.ws.close(4000, 'replaced'); } catch {}
      Object.assign(p, { name: clean(m.name, 40), no: clean(m.no, 4), cls: clean(m.cls, 12), online: true, ws });
      if (Number.isInteger(m.look) && m.look >= 0 && m.look < 12) p.look = m.look;   // chosen character (even = girl, odd = boy)
      if (this.layout.length && !p.chests) this.newChests(p);
      me.sid = sid; me.role = 'student';
      this.send(ws, { t: 'welcome', role: 'student', sid, phase: this.phase, me: { x: p.x, z: p.z, score: p.score, found: p.found }, chests: this.chestView(p), total: this.layout.length || N_CHESTS });
      this.dirtyRoster = true; await this.save(p); return;
    }
    if (!me.role) return;

    if (me.role === 'student') {
      const p = this.players.get(me.sid); if (!p) return;
      if (m.t === 'pos') {
        if (this.phase === 'paused') return;
        for (const k of ['x', 'y', 'z', 'ry', 's']) if (Number.isFinite(m[k])) p[k] = Math.max(-500, Math.min(500, m[k]));
        p.a = !!m.a; p.e = Math.max(0, Math.min(9, m.e | 0)); return;
      }
      if (m.t === 'open') {
        if (this.phase !== 'playing') return this.send(ws, { t: 'notice', msg: 'รอครูเริ่มเกมก่อนนะ' });
        const c = p.chests?.[m.chest];
        if (!c || c.found) return;
        if (Math.hypot(c.x - p.x, c.z - p.z) > OPEN_RANGE) return this.send(ws, { t: 'notice', msg: 'เข้าไปใกล้หีบอีกนิด' });
        if (p.used.length >= this.bank.length) p.used = [];
        let qi; do qi = Math.floor(Math.random() * this.bank.length); while (p.used.includes(qi));
        p.used.push(qi); p.pending = { chest: m.chest, qi, t: Date.now() };
        const q = this.bank[qi];
        return this.send(ws, { t: 'question', chest: m.chest, q: q.q, choices: q.choices, limit: TIME_LIMIT });
      }
      if (m.t === 'answer') {
        const pend = p.pending; if (!pend || pend.chest !== m.chest) return;
        p.pending = null;
        const q = this.bank[pend.qi], c = p.chests[pend.chest], late = Date.now() - pend.t > (TIME_LIMIT + 3) * 1000, right = !late && m.choice === q.answer;
        let pts = 0;
        if (right) { pts = (q.points || 100) + FIND_BONUS; p.score += pts; p.found++; p.right++; c.found = true; }
        else { p.wrong++; pts = -Math.min(PENALTY, p.score); p.score += pts; const spot = this.pickSpot(p); if (spot) { c.x = spot.x; c.z = spot.z; } }
        await this.save(p); this.dirtyRoster = true;
        return this.send(ws, { t: 'result', chest: pend.chest, right, timeout: late || m.choice < 0, answer: q.answer, explain: q.explain || '', points: pts, score: p.score, found: p.found, chestState: { x: c.x, z: c.z, found: c.found } });
      }
      return;
    }

    // ---------- teacher ----------
    if (me.role === 'teacher' && (m.t === 'pos' || m.t === 'show')) {   // teacher avatar shown to students
      const t = (this.teacher ||= { on: true, x: 0, y: 0, z: 20, ry: 0, s: 0, a: 0 }), n = (v, lim) => Math.max(-lim, Math.min(lim, +v || 0));
      if (m.t === 'show') t.on = !!m.on; else Object.assign(t, { x: n(m.x, 400), y: n(m.y, 200), z: n(m.z, 400), ry: n(m.ry, 7), s: n(m.s, 40), a: m.a ? 1 : 0, e: Math.max(0, Math.min(9, m.e | 0)) });
      return;
    }
    if (m.t === 'cmd') {
      if ((m.c === 'start' || m.c === 'end') && !m._go) {   // 3-2-1 countdown on every screen, then apply
        if (this.countingDown) return;
        this.countingDown = true; this.all({ t: 'countdown', kind: m.c, secs: 3 });
        setTimeout(async () => { this.countingDown = false; try { await this.onMessage(ws, JSON.stringify({ ...m, _go: true })); } catch {} }, 3300);
        return;
      }
      if (m.c === 'start') {
        if (Array.isArray(m.spots) && m.spots.length >= N_CHESTS) {
          this.pool = m.spots.slice(0, 200).map((s) => ({ x: +s[0], z: +s[1] })).filter((s) => Number.isFinite(s.x) && Number.isFinite(s.z));
          const shuffled = [...this.pool].sort(() => Math.random() - 0.5);
          this.layout = []; for (const s of shuffled) { if (this.layout.length >= N_CHESTS) break; if (this.layout.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > 20)) this.layout.push(s); }
          await this.ctx.storage.put({ layout: this.layout, pool: this.pool });
        }
        if (m.reset !== false) for (const p of this.players.values()) { p.score = 0; p.found = 0; p.right = 0; p.wrong = 0; this.newChests(p); await this.save(p); }
        await this.setPhase('playing');
        for (const [ws2, mm] of this.sockets) if (mm.role === 'student') { const p = this.players.get(mm.sid); this.send(ws2, { t: 'chests', chests: this.chestView(p), total: this.layout.length, score: p.score, found: p.found }); }
        this.all({ t: 'broadcast', text: '🎉 เริ่มเกมแล้ว! ใช้ไม้กายสิทธิ์ตามหาหีบสมบัติโขน' });
      } else if (m.c === 'pause') { await this.setPhase('paused'); this.all({ t: 'broadcast', text: '⏸ ครูหยุดเกมชั่วคราว' }); }
      else if (m.c === 'resume') { await this.setPhase('playing'); this.all({ t: 'broadcast', text: '▶ เล่นต่อได้แล้ว!' }); }
      else if (m.c === 'summon') {
        let i = 0;
        for (const [ws2, mm] of this.sockets) if (mm.role === 'student') {
          const a = (i++ / Math.max(1, this.sockets.size)) * Math.PI * 2, x = SPAWN.x + Math.cos(a) * 6, z = SPAWN.z + Math.sin(a) * 6;
          const p = this.players.get(mm.sid); p.x = x; p.z = z;
          this.send(ws2, { t: 'summon', x, z, text: '📣 ครูเรียกทุกคนมารวมที่ลานกลางเมือง' });
        }
      } else if (m.c === 'end') {
        await this.setPhase('ended');
        this.all({ t: 'leaderboard', rows: this.leaderboard() });
      } else if (m.c === 'lobby') { await this.setPhase('lobby'); }
      else if (m.c === 'broadcast') { this.all({ t: 'broadcast', text: clean(m.text, 200) }); }
      else if (m.c === 'kick' && this.players.has(m.sid)) { const p = this.players.get(m.sid); try { p.ws?.close(4001, 'kicked'); } catch {} this.players.delete(m.sid); await this.ctx.storage.delete('p:' + m.sid); this.dirtyRoster = true; }
      else if (m.c === 'clear') { for (const p of [...this.players.values()]) if (!p.online) { this.players.delete(p.sid); await this.ctx.storage.delete('p:' + p.sid); } this.dirtyRoster = true; }
    }
  }

  pickSpot(p) {
    const taken = p.chests.filter((c) => !c.found);
    const opts = this.pool.filter((s) => taken.every((c) => Math.hypot(c.x - s.x, c.z - s.z) > 15));
    return opts[Math.floor(Math.random() * opts.length)] || null;
  }
  leaderboard() { return [...this.players.values()].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, no: p.no, cls: p.cls, score: p.score, found: p.found, right: p.right, wrong: p.wrong })); }
  async setPhase(ph) { this.phase = ph; await this.ctx.storage.put('phase', ph); this.all({ t: 'phase', phase: ph }); this.dirtyRoster = true; }

  onClose(ws) {
    const me = this.sockets.get(ws); this.sockets.delete(ws);
    if (me?.sid) { const p = this.players.get(me.sid); if (p && p.ws === ws) { p.online = false; p.ws = null; this.save(p); } }
    this.dirtyRoster = true;
    if (!this.sockets.size && this.tick) { clearInterval(this.tick); this.tick = null; }
  }
}
