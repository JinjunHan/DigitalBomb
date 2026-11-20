import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import type { Snapshot, ServerMessage } from '../assets/scripts/shared/protocol';

test('real HTTP + WebSocket: two clients join, lock, crack, reply, return to friend room, reconnect', { timeout: 20000 }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'digital-bomb-test-'));
  // Existing installations can have thousands of dormant accounts and the original schema.
  mkdirSync(join(folder, 'data'));
  const db = new DatabaseSync(join(folder, 'data/digital-bomb.sqlite'));
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, token TEXT UNIQUE, name TEXT, avatar INTEGER);
    WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM seq WHERE n < 5000)
    INSERT INTO users SELECT 'old-' || n, 'token-' || n, '旧玩家' || n, 0 FROM seq`);
  db.close();
  const processChild = spawn(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/index.ts')], { cwd: folder, env: { ...process.env, PORT: '18787', HOST: '127.0.0.1', NODE_ENV: 'test', ALLOW_GUEST_SIGNUP: '1', WECHAT_APP_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const clients: WebSocket[] = [];
  try {
    await new Promise<void>((resolveReady, reject) => { const timeout = setTimeout(() => reject(Error('server startup timeout')), 5000); processChild.stdout.on('data', chunk => { if (String(chunk).includes('local service:')) { clearTimeout(timeout); resolveReady(); } }); processChild.on('exit', code => { clearTimeout(timeout); reject(Error('server exited ' + code)); }); });
    async function client(token = '') {
      const auth = await (await fetch('http://127.0.0.1:18787/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })).json() as any;
      const ws = new WebSocket('ws://127.0.0.1:18787/ws'); clients.push(ws);
      const state = { value: null as Snapshot | null }; const waiting = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
      ws.on('message', raw => { const m: ServerMessage = JSON.parse(String(raw)); if (m.type === 'state') state.value = m.state!; if (m.id) { const q = waiting.get(m.id); if (q) { m.type === 'error' ? q.reject(Error(m.message)) : q.resolve(); waiting.delete(m.id); } } });
      await new Promise<void>(resolveOpen => ws.on('open', () => { ws.send(JSON.stringify({ action: 'auth', token: auth.token })); resolveOpen(); }));
      const until = async (fn: () => boolean) => { const end = Date.now() + 5000; while (!fn()) { if (Date.now() > end) throw Error('state timeout'); await new Promise(r => setTimeout(r, 20)); } };
      await until(() => !!state.value);
      const command = (action: string, payload: any = {}, id = Math.random().toString()) => new Promise<void>((resolveCommand, reject) => { waiting.set(id, { resolve: resolveCommand, reject }); ws.send(JSON.stringify({ id, action, payload: { roomId: state.value?.room?.id, ...payload } })); });
      return { ws, auth, state, until, command };
    }
    const unavailable = await fetch('http://127.0.0.1:18787/api/login', { method: 'POST', body: JSON.stringify({ code: 'not-a-real-code' }) });
    assert.equal(unavailable.status, 503);
    const denied = await fetch('http://127.0.0.1:18787/api/login', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: '{}' });
    assert.equal(denied.status, 403);
    const legacy = await client('token-5000');
    assert.equal(legacy.state.value!.me.name, '旧玩家5000');
    const a = await client(), b = await client();
    assert.equal(a.auth.me.name, '玩家5001');
    await a.command('profile', { name: '小羊🌟', avatar: 1 });
    const restored = await fetch('http://127.0.0.1:18787/api/login', {
      method: 'POST', body: JSON.stringify({ token: a.auth.token }),
    });
    assert.equal((await restored.json()).me.name, '小羊🌟');
    await a.command('create'); await a.until(() => !!a.state.value?.room?.code); const code = a.state.value!.room!.code;
    const invitation = { code, inviteRoomId: a.state.value!.room!.id };
    assert.equal(b.state.value!.wechatSharingEnabled, false);
    await assert.rejects(b.command('join', invitation), /分享暂未开放/);
    mkdirSync(join(folder, 'config'));
    const sharing = join(folder, 'config/wechat-sharing.json');
    writeFileSync(sharing, '{"enabled":true}');
    await b.until(() => b.state.value?.wechatSharingEnabled === true);
    await assert.rejects(b.command('join', { code, inviteRoomId: 'expired' }), /邀请已过期/);
    const image = {imageUrlId:'approved-id',imageUrl:'https://mmocgame.qpic.cn/wechatgame/test/0'};
    writeFileSync(sharing, JSON.stringify({enabled:true,images:[{approved:false,...image},{approved:true,...image}]}));
    await b.until(() => b.state.value?.wechatShareImages?.length === 1);
    assert.deepEqual(b.state.value!.wechatShareImages,[image]);
    writeFileSync(sharing, '{');
    await b.until(() => b.state.value?.wechatSharingEnabled === false);
    await assert.rejects(b.command('join', invitation), /分享暂未开放/);
    await b.command('join', { code }); await a.until(() => a.state.value?.room?.phase === 'preparing');
    await a.command('lock', { digits: '1122' }); await b.command('lock', { digits: '0123' });
    await a.until(() => a.state.value?.room?.phase === 'playing'); await b.until(() => b.state.value?.room?.phase === 'playing');
    assert.equal(a.state.value!.room!.revealed, undefined); assert.equal(a.state.value!.room!.ownSecret, '1122');
    const first = a.state.value!.room!.current === a.auth.me.id ? a : b, second = first === a ? b : a;
    await new Promise(r => setTimeout(r, Math.max(0, a.state.value!.room!.startAt - Date.now() + 40)));
    await first.command('guess', { turn: 0, digits: first === a ? '0123' : '1122' }, 'same-request');
    await first.command('guess', { turn: 0, digits: first === a ? '0123' : '1122' }, 'same-request');
    await second.until(() => second.state.value?.room?.phase === 'reply'); assert.equal(second.state.value!.room!.history.length, 1); assert.equal(second.state.value!.room!.revealed, undefined);
    await second.command('guess', { turn: 1, digits: second === a ? '0123' : '1122' });
    await a.until(() => a.state.value?.room?.phase === 'finished'); assert.equal(a.state.value!.room!.result?.reason, 'same_round');
    const oldId = a.state.value!.room!.id, oldFirst = a.state.value!.room!.first;
    await a.command('returnToRoom'); await b.command('returnToRoom'); await a.until(() => a.state.value?.room?.id !== oldId);
    await a.command('lock', { digits: '0000' }); await b.command('lock', { digits: '9999' });
    await a.until(() => a.state.value?.room?.phase === 'playing'); assert.notEqual(a.state.value!.room!.first, oldFirst);
    const currentRoom = a.state.value!.room!.id; a.ws.close();
    const reconnected = await client(a.auth.token); assert.equal(reconnected.state.value!.room!.id, currentRoom); assert.equal(reconnected.state.value!.room!.ownSecret, '0000');
    const challenger = await client();
    const customCode = code === '0012' ? '0013' : '0012';
    await Promise.all([legacy, challenger].map(player => player.command('createOrJoin', { code: customCode })));
    for (const player of [legacy, challenger]) {
      await player.until(() => player.state.value?.room?.phase === 'preparing');
      assert.equal(player.state.value!.room!.code, customCode);
    }
    assert.equal(legacy.state.value!.room!.id, challenger.state.value!.room!.id);
  } finally {
    for (const ws of clients) ws.close(); processChild.kill('SIGTERM');
    await new Promise<void>(resolveExit => { if (processChild.exitCode !== null) resolveExit(); else processChild.on('exit', () => resolveExit()); });
    rmSync(folder, { recursive: true, force: true });
  }
});
