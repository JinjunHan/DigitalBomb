import test from 'node:test';
import assert from 'node:assert/strict';
import { StartupAssets } from '../assets/scripts/shared/startup-assets';
const flush = () => new Promise(resolve => setImmediate(resolve));

test('startup never exposes partially loaded visuals or completes before registration', async () => {
  const assets = new StartupAssets(() => {});
  let finish!: () => void;
  assets.add('title', async () => {});
  assets.add('scene', () => new Promise<void>(resolve => { finish = resolve; }));
  await flush();
  assert.equal(assets.ready, false);
  finish(); await flush();
  assert.equal(assets.ready, false);
  assets.seal(); assert.equal(assets.ready, true);
});

test('failed visuals keep startup visible and retry does not reload successful textures', async () => {
  let good = 0, bad = 0;
  const assets = new StartupAssets(() => {});
  assets.add('title', async () => { good++; });
  assets.add('scene', async () => { if (++bad === 1) throw Error('network'); });
  assets.seal(); await flush();
  assert.equal(assets.ready, false); assert.equal(assets.failed, true);
  assets.retry(); assets.retry();
  assert.equal(assets.failed, false); assert.equal(assets.ready, false);
  await flush();
  assert.equal(assets.ready, true); assert.equal(good, 1); assert.equal(bad, 2);
});
