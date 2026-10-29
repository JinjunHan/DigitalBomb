import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, WebSocket } from 'ws';
import { Service } from './service';
import { DEFAULT_RULES } from './game';
import type { User } from './service';
import type { Command } from '../assets/scripts/shared/protocol';

const port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? '127.0.0.1';
const preview = process.env.DEPLOYMENT_MODE === 'preview';
const production = process.env.NODE_ENV === 'production';
// Public launch requires moderation, TLS, durable room recovery and platform configuration.
if (production) throw Error('This milestone is local development only. Complete docs/IMPLEMENTATION.md release gates before public deployment.');
// Explicit local-only UI inspection mode; normal runs retain PRD timeouts.
if (!preview && process.env.DEV_SLOW_TIMERS === '1') Object.assign(DEFAULT_RULES, { prepareMs: 600000, turnMs: 600000 });
mkdirSync('data', { recursive: true });
const db = new DatabaseSync('data/digital-bomb.sqlite');
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, token TEXT UNIQUE, name TEXT, avatar INTEGER); CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, payload TEXT, created INTEGER)');
db.exec('CREATE TABLE IF NOT EXISTS wechat_users (openid TEXT PRIMARY KEY, user_id TEXT UNIQUE)');
if (!db.prepare('PRAGMA table_info(users)').all().some(row => row.name === 'avatar_url')) db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
const service = new Service();
for (const row of db.prepare('SELECT * FROM users').all()) service.add({ id: String(row.id), name: String(row.name), avatar: Number(row.avatar), avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined }, String(row.token));
service.saveProfile = p => { db.prepare('UPDATE users SET name=?, avatar=?, avatar_url=? WHERE id=?').run(p.name, p.avatar, p.avatarUrl ?? null, p.id); };
service.saveResult = r => db.prepare('INSERT OR IGNORE INTO results VALUES (?, ?, ?)').run(r.id, JSON.stringify({ result: r.result, players: r.seats.map(s => ({ id: s.profile.id, bot: s.bot })), turns: r.history.length }), Date.now());
const sockets = new Map<string, WebSocket>(), fingerprints = new Map<string, string>();
const send = (ws: WebSocket, data: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
service.changed = () => {
  for (const [id, ws] of sockets) {
    const u = service.users.get(id)!; const state = service.snapshot(u);
    const key = JSON.stringify({ ...state, serverNow: 0 });
    if (fingerprints.get(id) !== key) { fingerprints.set(id, key); send(ws, { type: 'state', state }); }
  }
};
const allowedOrigin = (origin?: string) => !origin || (preview && origin === 'https://bomb.aiforevery.cn') || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const loginRates = new Map<string, { at: number; count: number }>();
const server = createServer(async (req, res) => {
  if (!allowedOrigin(req.headers.origin)) { res.writeHead(403); res.end(); return; }
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') { res.end(JSON.stringify({ ok: true, mode: preview ? 'preview' : 'local-development', wechatConfigured: Boolean(process.env.WECHAT_APP_SECRET) })); return; }
  if (req.url !== '/api/login' || req.method !== 'POST') { res.writeHead(404); res.end('{}'); return; }
  try {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    for (const [key, value] of loginRates) if (now - value.at > 60000) loginRates.delete(key);
    const rate = loginRates.get(ip) ?? { at: now, count: 0 }; loginRates.set(ip, rate);
    if (++rate.count > 120) { res.writeHead(429); res.end('{}'); return; }
    let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 4096) throw Error('request too large'); }
    const input = JSON.parse(data || '{}');
    let user = typeof input.token === 'string' ? [...service.users.values()].find(u => u.token === input.token) : undefined;
    let openid: string | undefined;
    if (typeof input.code === 'string') {
      if (!process.env.WECHAT_APP_SECRET) { res.writeHead(503); res.end(JSON.stringify({ error: '微信登录尚未配置，请稍后重试' })); return; }
      const query = new URLSearchParams({ appid: 'wx3f231fcad8d0170f', secret: process.env.WECHAT_APP_SECRET, js_code: input.code, grant_type: 'authorization_code' });
      const response = await fetch('https://api.weixin.qq.com/sns/jscode2session?' + query, { signal: AbortSignal.timeout(8000) });
      const session = await response.json() as { openid?: string; errcode?: number };
      if (!response.ok || session.errcode || !session.openid) throw Error('wechat login rejected');
      openid = session.openid;
      const row = db.prepare('SELECT user_id FROM wechat_users WHERE openid=?').get(openid);
      user = row ? service.users.get(String(row.user_id)) : undefined;
    }
    if (!user) {
      if (service.users.size >= 5000) { res.writeHead(503); res.end('{}'); return; }
      const id = randomUUID(), token = randomBytes(32).toString('hex');
      user = service.add({ id, name: '玩家' + String(service.users.size + 1).padStart(4, '0'), avatar: service.users.size % 8 }, token);
      db.prepare('INSERT INTO users (id, token, name, avatar) VALUES (?, ?, ?, ?)').run(id, token, user.profile.name, user.profile.avatar);
    }
    if (openid) db.prepare('INSERT OR IGNORE INTO wechat_users VALUES (?, ?)').run(openid, user.profile.id);
    res.end(JSON.stringify({ token: user.token, me: user.profile }));
  } catch { res.writeHead(400); res.end(JSON.stringify({ error: '登录请求无效' })); }
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
wss.on('connection', (ws, req) => {
  if (!allowedOrigin(req.headers.origin)) { ws.close(1008); return; }
  let user: User | undefined, windowAt = Date.now(), count = 0;
  const authTimer = setTimeout(() => { if (!user) ws.close(1008, 'auth timeout'); }, 5000);
  ws.on('message', raw => {
    try {
      if (Date.now() - windowAt > 1000) { count = 0; windowAt = Date.now(); }
      if (++count > 30) { ws.close(1008, 'rate limit'); return; }
      const msg = JSON.parse(String(raw));
      if (!user) {
        if (msg.action !== 'auth' || typeof msg.token !== 'string') throw Error('请先登录');
        user = [...service.users.values()].find(u => u.token === msg.token); if (!user) throw Error('登录已失效');
        const old = sockets.get(user.profile.id); if (old && old !== ws) old.close(4001, 'session replaced');
        sockets.set(user.profile.id, ws); fingerprints.delete(user.profile.id); service.heartbeat(user); clearTimeout(authTimer); service.changed(); return;
      }
      if (sockets.get(user.profile.id) !== ws) { ws.close(4001); return; }
      if (msg.action === 'heartbeat') { service.heartbeat(user); send(ws, { type: 'state', state: service.snapshot(user) }); return; }
      const result = service.command(user, msg as Command);
      send(ws, { type: result.error ? 'error' : 'ack', id: msg.id, message: result.error });
    } catch { send(ws, { type: 'error', message: '请求无效或会话过期' }); }
  });
  ws.on('close', () => { clearTimeout(authTimer); if (user && sockets.get(user.profile.id) === ws) { sockets.delete(user.profile.id); fingerprints.delete(user.profile.id); service.disconnect(user); } });
  ws.on('error', () => {});
});
const timer = setInterval(() => { try { service.tick(); } catch (e) { console.error('Room tick failed:', e instanceof Error ? e.message : 'unknown'); } }, 250);
server.listen(port, host, () => console.log(`Digital Bomb local service: http://${host}:${port}`));
function stop() { clearInterval(timer); for (const ws of sockets.values()) ws.close(1001); wss.close(); server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
