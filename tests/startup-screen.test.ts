import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('WeChat splash hands its canvas to the scene before releasing WebGL', async () => {
  const rectangles: number[][] = [];
  const surface = { width: 750, height: 1334, getContext: () => ({ fillStyle: '', fillRect: (...args: number[]) => rectangles.push(args) }) };
  let finalProgress = 0;
  const context = vm.createContext({
    module: { exports: {} }, canvas: { width: 750, height: 1334 }, window: { devicePixelRatio: 2 },
    cancelAnimationFrame() {}, surface,
    mockGL: new Proxy({}, { get: () => () => {} }),
    recordProgress: async (value: number) => { finalProgress = value; },
  });
  vm.runInContext(readFileSync('build-templates/wechatgame/first-screen.js', 'utf8'), context);
  vm.runInContext('image = surface; gl = mockGL; setProgress = recordProgress;', context);
  await context.module.exports.end();
  assert.equal(context.__digitalBombStartupImage, surface);
  assert.equal(finalProgress, 0.9, 'keep progress incomplete until authentication');
  assert.equal(rectangles.length, 2);
  assert.ok(rectangles.flat().every(Number.isFinite));
  assert.equal(rectangles[1][2], rectangles[0][2] * 0.9);
});
