import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdownUrgency, spriteUVTransform } from '../assets/scripts/shared/shader-feedback';
import type { RoomView } from '../assets/scripts/shared/protocol';

const room = { phase: 'playing', current: 'me', startAt: 1000, deadline: 11000 } as RoomView;

test('countdown warns only in the final five seconds and grows towards the deadline', () => {
  assert.equal(countdownUrgency(room, 'me', 5999), 0);
  assert.equal(countdownUrgency(room, 'me', 6000), .25);
  assert.equal(countdownUrgency(room, 'me', 8500), .625);
  const lastMoment = countdownUrgency(room, 'me', 10999);
  assert.ok(lastMoment > .99 && lastMoment <= 1);
  assert.equal(countdownUrgency(room, 'me', 11000), 0);
  assert.equal(countdownUrgency(room, 'me', 12000), 0);
});

test('opening countdown and opponent turns do not trigger local urgency', () => {
  const opening = { ...room, startAt: 8000 };
  assert.equal(countdownUrgency(opening, 'me', 7999), 0);
  assert.ok(countdownUrgency(opening, 'me', 8000) > 0);
  for (const phase of ['playing', 'reply'] as const) {
    assert.ok(countdownUrgency({ ...room, phase }, 'me', 9000) > 0);
    assert.equal(countdownUrgency({ ...room, phase, current: 'peer' }, 'me', 9000), 0);
  }
});

test('preparation warns only while our secret still needs to be submitted', () => {
  const preparing = { ...room, phase: 'preparing', current: '' } as RoomView;
  assert.ok(countdownUrgency(preparing, 'me', 9000) > 0);
  assert.equal(countdownUrgency({ ...preparing, ownSecret: '1234' }, 'me', 9000), 0);
  assert.equal(countdownUrgency(preparing, 'me', 11000), 0);
});

test('queue, waiting, completed rooms and missing identity never warn', () => {
  assert.equal(countdownUrgency(undefined, 'me', 9000), 0);
  assert.equal(countdownUrgency(room, undefined, 9000), 0);
  assert.equal(countdownUrgency(room, '', 9000), 0);
  for (const phase of ['waiting', 'finished', 'cancelled'] as const) {
    assert.equal(countdownUrgency({ ...room, phase }, 'me', 9000), 0);
  }
});

test('invalid clock data never reaches shader uniforms', () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(countdownUrgency(room, 'me', invalid), 0);
    assert.equal(countdownUrgency({ ...room, deadline: invalid }, 'me', 9000), 0);
    assert.equal(countdownUrgency({ ...room, startAt: invalid }, 'me', 9000), 0);
  }
});

test('local shader UV maps full textures, cropped atlases, rotations and flips', () => {
  const frames = [
    [0, 1, 1, 1, 0, 0, 1, 0],
    [.2, .8, .7, .8, .2, .3, .7, .3],
    [.2, .3, .2, .8, .7, .3, .7, .8],
    [1, 1, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 1, 1, 1],
  ];
  for (const uv of frames) {
    const t = spriteUVTransform(uv)!;
    const map = (x: number, y: number) => [t[0] * x + t[1] * y + t[2], t[3] * x + t[4] * y + t[5]];
    for (const [index, expected] of [[0, [0, 1]], [2, [1, 1]], [4, [0, 0]], [6, [1, 0]]] as const) {
      map(uv[index], uv[index + 1]).forEach((v, axis) => assert.ok(Math.abs(v - expected[axis]) < 1e-12));
    }
    const center = map((uv[0] + uv[6]) / 2, (uv[1] + uv[7]) / 2);
    center.forEach(v => assert.ok(Math.abs(v - .5) < 1e-12));
  }
});

test('shader UV rejects degenerate or invalid frames instead of emitting nonfinite uniforms', () => {
  for (const uv of [[], [0, 0, 0, 0, 0, 0, 0, 0], [0, NaN, 1, 1, 0, 0, 1, 0], [0, Infinity, 1, 1, 0, 0, 1, 0]]) {
    assert.equal(spriteUVTransform(uv), undefined);
  }
});
