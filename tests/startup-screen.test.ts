import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(height = 1334) {
  const texts: string[] = [], clips: number[][] = [];
  const ctx = new Proxy({}, { get: (_, key) => key === 'fillText' ? (value: string) => texts.push(value)
    : key === 'rect' ? (...values: number[]) => clips.push(values) : () => {}, set: () => true });
  const surface = { width: 0, height: 0, getContext: () => ctx };
  const context = vm.createContext({ module: { exports: {} }, canvas: { width: 750, height },
    wx: { createCanvas: () => surface }, cancelAnimationFrame() {},
    mockGL: new Proxy({}, { get: () => () => {} }) });
  vm.runInContext(readFileSync('build-templates/wechatgame/first-screen.js', 'utf8'), context);
  return { context, surface, texts, clips };
}

test('startup contains art and retry region on short and tall screens', () => {
  for (const height of [1000, 1334, 1624]) {
    const { context, surface } = fixture(height);
    const screen = vm.runInContext('createScreen({}, {})', context);
    const rect = screen.retryRect;
    assert.equal(surface.height, height);
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.width <= surface.width);
    assert.ok(rect.y + rect.height <= surface.height);
  }
});

test('live status replaces baked text and progress is clipped to its track', () => {
  const { context, texts, clips } = fixture();
  const screen = vm.runInContext('createScreen({}, {})', context);
  screen.draw(-1, '正在准备牌桌…'); screen.draw(2, '连接未完成，点击这里重试');
  assert.deepEqual(texts, ['正在准备牌桌…', '连接未完成，点击这里重试']);
  assert.equal(clips[0][2], 0); assert.equal(clips[1][2], 537);
});

test('WeChat hands the live renderer to Cocos before releasing WebGL', async () => {
  const { context } = fixture();
  let finalProgress = 0;
  context.recordProgress = async (value: number) => { finalProgress = value; };
  vm.runInContext('screen = createScreen(null, null); gl = mockGL; setProgress = recordProgress;', context);
  await context.module.exports.end();
  assert.equal(finalProgress, 0.9);
  assert.equal(typeof context.__digitalBombStartup.draw, 'function');
  assert.ok(context.__digitalBombStartup.surface);
  assert.equal(vm.runInContext('screen', context), null);
});
