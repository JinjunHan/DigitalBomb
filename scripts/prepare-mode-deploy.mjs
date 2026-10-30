// Compile first: tsc -p tsconfig.server.json --outDir temp/mode-service-review --rootDir .
// This writes a local candidate only; it never changes the running service.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root = new URL('../temp/mode-service-review/', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const dependency = 'assets/scripts/shared/wechat-flow.js';
const expectedDependency = '86fcddc954e059c1601e2daa4b84e7db6c3fcadf910ec2ac33eaf1107f1aa128';
assert.equal(hash(await readFile(new URL(dependency, root))), expectedDependency, 'Existing remote dependency must match');
const { Service } = createRequire(import.meta.url)(new URL('server/service.js', root).pathname);
for (const size of [2, 3, 4]) {
  let now = 1000;
  const service = new Service(() => now);
  const user = service.add({ id: 'candidate-test', name: '候选验证', avatar: 0 }, 'memory-only');
  assert.deepEqual(service.snapshot(user).supportedDigitCounts, [2, 3, 4]);
  assert.equal(service.command(user, { id: 'create', action: 'create', payload: { digitCount: size } }).error, undefined);
  let room = service.snapshot(user).room;
  assert.equal(room.digitCount, size); assert.equal(room.roundLimit, 30); assert.equal(room.turnMs, 60000);
  assert.match(room.code, /^\d{4}$/);
  service.command(user, { id: 'leave', action: 'leave', payload: { roomId: room.id } });
  assert.equal(service.command(user, { id: 'queue', action: 'queue', payload: { digitCount: size } }).error, undefined);
  assert.equal(service.snapshot(user).queuedDigitCount, size);
  now += 9000; service.tick(); room = service.snapshot(user).room;
  assert.equal(room.digitCount, size);
}
const files = {}, hashes = {};
for (const path of ['server/service.js', 'server/game.js', 'assets/scripts/shared/game-mode.js', 'assets/scripts/shared/deduction.js']) {
  files[path] = await readFile(new URL(path, root), 'utf8'); hashes[path] = hash(files[path]);
}
const candidate = {
  target: '/www/wwwroot/digital-bomb-service', service: 'digital-bomb.service',
  expected: {
    'server/service.js': 'f79b552fb8f42d5ae4519bd572baeb851add2954d6bf310a4b1f328a26a837c3',
    'server/game.js': 'ae94f0bbca5c57477e99f7cdc960ebc12e76ef7abc8bd077a226dd714f2da990',
    [dependency]: expectedDependency,
  }, hashes, files,
};
await writeFile(new URL('release.json', root), JSON.stringify(candidate, null, 2) + '\n');
console.log('Candidate verified: 2/3/4-digit friend rooms, queues and bot fallback; 30 rounds / 60s.');
console.log(JSON.stringify(hashes, null, 2));
