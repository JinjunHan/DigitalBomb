import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingHourglass } from '../assets/scripts/shared/matching-hourglass';

test('flow holds frames slowly and turnover advances without skipping its endpoints', () => {
  assert.equal(matchingHourglass(.499), 0);
  assert.equal(matchingHourglass(.5), 1);
  assert.equal(matchingHourglass(3.999), 7);
  assert.equal(matchingHourglass(4), 8);
  assert.equal(matchingHourglass(4.099), 8);
  assert.equal(matchingHourglass(4.1), 9);
  assert.equal(matchingHourglass(4.799), 15);
  assert.equal(matchingHourglass(4.8), 0);
});
test('session-time sampling survives redraws and long waits, staying inside the atlas', () => {
  for (let ms = 0; ms < 60000; ms += 37) {
    const index = matchingHourglass(ms / 1000);
    assert.ok(Number.isInteger(index) && index >= 0 && index < 16);
  }
  assert.equal(matchingHourglass(12.25), matchingHourglass(2.65));
  assert.equal(matchingHourglass(480), 0);
});
test('motion disabled and invalid clocks hold the initial frame', () => {
  assert.equal(matchingHourglass(4.5, false), 0);
  for (const time of [-1, NaN, Infinity]) assert.equal(matchingHourglass(time), 0);
});
