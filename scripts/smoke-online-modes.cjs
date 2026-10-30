// Execute with cwd at the installed service (ws dependency); no credentials logged.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const WebSocket = require(require.resolve('ws', { paths: [process.cwd()] }));
const base = process.argv[2] || 'https://bomb.aiforevery.cn';
const clients = [];
const until = async predicate => {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw Error('Timed out waiting for server state');
    await new Promise(resolve => setTimeout(resolve, 40));
  }
};
async function client() {
  const response = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  const auth = await response.json();
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  const c = { ws, state: null, pending: new Map(), heartbeat: null }; clients.push(c);
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    if (message.type === 'state') c.state = message.state;
    const pending = c.pending.get(message.id);
    if (pending) { clearTimeout(pending.timer); c.pending.delete(message.id); message.type === 'error' ? pending.reject(Error(message.message)) : pending.resolve(); }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ action: 'auth', token: auth.token }));
  await until(() => c.state);
  assert.deepEqual(c.state.supportedDigitCounts, [2, 3, 4]);
  c.send = (action, payload = {}) => new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { c.pending.delete(id); reject(Error('Command timed out: ' + action)); }, 10000);
    c.pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, action, payload: { roomId: c.state.room?.id, ...payload } }));
  });
  c.heartbeat = setInterval(() => ws.send(JSON.stringify({ action: 'heartbeat' })), 4000);
  return c;
}
const check = (c, size) => {
  assert.equal(c.state.room.digitCount, size);
  assert.equal(c.state.room.turnMs, 60000); assert.equal(c.state.room.roundLimit, 30);
};
async function leave(c) {
  if (c.state?.queuedAt != null) await c.send('cancelQueue');
  if (!c.state?.room) return;
  if (['playing', 'reply'].includes(c.state.room.phase)) await c.send('resign');
  await c.send('leave'); await until(() => !c.state.room);
}
(async () => {
  try {
    const a = await client(), b = await client();
    for (const size of [2, 3, 4]) {
      await a.send('create', { digitCount: size }); check(a, size);
      const code = a.state.room.code; assert.match(code, /^\d{4}$/);
      await b.send('join', { code }); check(b, size);
      await assert.rejects(a.send('lock', { digits: '0'.repeat(size + 1) }), /请输入/);
      await a.send('lock', { digits: '0'.repeat(size) }); await b.send('lock', { digits: '1'.repeat(size) });
      await until(() => a.state.room.phase === 'playing' && b.state.room.phase === 'playing');
      const first = a.state.room.current === a.state.me.id ? a : b, second = first === a ? b : a;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, a.state.room.startAt - Date.now() + 120)));
      await first.send('guess', { digits: (first === a ? '1' : '0').repeat(size), turn: first.state.room.turn });
      await until(() => second.state.room.phase === 'reply');
      await second.send('guess', { digits: (second === a ? '1' : '0').repeat(size), turn: second.state.room.turn });
      await until(() => a.state.room.phase === 'finished' && b.state.room.phase === 'finished');
      assert.equal(a.state.room.result.reason, 'same_round');
      await a.send('returnToRoom'); check(a, size); assert.equal(a.state.room.code, code);
      await b.send('returnToRoom'); check(b, size);
      await leave(b); await leave(a);
      await Promise.all([a.send('queue', { digitCount: size }), b.send('queue', { digitCount: size })]);
      await until(() => a.state.room && b.state.room); check(a, size); check(b, size);
      await leave(a); await leave(b);
      console.log(`PASS online ${size} digits: friend create/join/lock/full draw/return, matching, 60s and 30 rounds`);
    }
  } finally {
    for (const c of clients) {
      try { if (c.send) await leave(c); } catch { /* Close sockets even if cleanup fails. */ }
      clearInterval(c.heartbeat); c.ws.close();
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
