import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdownUrgency } from '../assets/scripts/shared/shader-feedback';
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
