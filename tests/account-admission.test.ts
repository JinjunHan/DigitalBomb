import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Service } from '../server/service';

test('WeChat signup above 5000 accounts and token recovery with guest signup closed', { timeout: 10000 }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'bomb-admission-'));
  mkdirSync(join(folder, 'data'));
  const db = new DatabaseSync(join(folder, 'data/digital-bomb.sqlite'));
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, token TEXT UNIQUE, name TEXT, avatar INTEGER);
    WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n < 5001)
    INSERT INTO users SELECT 'id-' || n, 'token-' || n, '玩家' || n, 0 FROM seq`);
  const exchange = 'globalThis.fetch = async () => Response.json({ openid: "test-openid" });';
  const child = spawn(process.execPath, [
    '--import', 'data:text/javascript,' + encodeURIComponent(exchange),
    '--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/index.ts'),
  ], {
    cwd: folder, env: { ...process.env, HOST: '127.0.0.1', PORT: '18791', NODE_ENV: 'test', ALLOW_GUEST_SIGNUP: '0', WECHAT_APP_SECRET: 'test' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await once(child.stdout, 'data');
    const login = (body: object) => fetch('http://127.0.0.1:18791/api/login', { method: 'POST', body: JSON.stringify(body) });
    assert.equal((await login({})).status, 403);
    assert.equal((await login({ token: 'unknown' })).status, 403);
    const legacy = await login({ token: 'token-5001' });
    assert.equal(legacy.status, 200);
    assert.equal((await legacy.json()).me.id, 'id-5001');
    const results = await Promise.all([login({ code: 'first', token: 'token-5001' }), login({ code: 'second' })]);
    for (const result of results) assert.equal(result.status, 200);
    const [first, second] = await Promise.all(results.map(result => result.json()));
    assert.deepEqual(first, second);
    assert.notEqual(first.me.id, 'id-5001');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n, 5002);
    assert.equal(db.prepare('SELECT user_id FROM wechat_users').get()!.user_id, first.me.id);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('idle disconnected sessions expire while connected users and room members remain', () => {
  let now = 1000;
  const service = new Service(() => now);
  const add = (id: string) => service.add({ id, name: id, avatar: 0 }, id);
  const idle = add('idle'), host = add('host'), online = add('online');
  service.command(idle, { id: 'bad-code', action: 'join', payload: { code: '0000' } });
  service.perform(host, 'create', {});
  service.disconnect(host);
  service.disconnect(idle);
  now += 600001;
  service.tick();
  assert.equal(service.users.has(idle.profile.id), false);
  assert.equal(service.receipts.has(idle.profile.id), false);
  assert.equal(service.attempts.has(idle.profile.id), false);
  assert.ok(service.users.has(host.profile.id));
  assert.ok(service.users.has(online.profile.id));
});
