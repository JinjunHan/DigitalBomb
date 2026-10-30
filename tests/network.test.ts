import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import type { Snapshot, ServerMessage } from '../assets/scripts/shared/protocol';

test('real HTTP + WebSocket: two clients join, lock, crack, reply, return to friend room, reconnect', { timeout: 20000 }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'digital-bomb-test-'));
  const processChild = spawn(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/index.ts')], { cwd: folder, env: { ...process.env, PORT: '18787', HOST: '127.0.0.1', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const a = await client(), b = await client();
    await a.command('create'); await a.until(() => !!a.state.value?.room?.code); const code = a.state.value!.room!.code;
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
  } finally {
    for (const ws of clients) ws.close(); processChild.kill('SIGTERM');
    await new Promise<void>(resolveExit => { if (processChild.exitCode !== null) resolveExit(); else processChild.on('exit', () => resolveExit()); });
    rmSync(folder, { recursive: true, force: true });
  }
});
