import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingHourglass } from '../assets/scripts/shared/matching-hourglass';
test('sand transfers with constant total amount, then pauses while turning', () => {
  for (let t = 0; t < 20; t += .037) {
    const p = matchingHourglass(t);
    assert.ok(Math.abs(p.upper + p.lower - 1.2) < 1e-9);
    assert.ok(p.upper >= .2 && p.upper <= 1 && p.lower >= .2 && p.lower <= 1);
  }
  assert.ok(matchingHourglass(2).upper < matchingHourglass(1).upper);
  assert.equal(matchingHourglass(4.4).flowing, false);
  assert.ok(matchingHourglass(4.4).angle < 0);
  assert.ok(matchingHourglass(6).upper > matchingHourglass(5).upper);
});
test('half-turn boundary preserves sand volumes and orientation across redraws', () => {
  const before = matchingHourglass(4.8 - 1e-7), after = matchingHourglass(4.8);
  assert.ok(Math.abs(before.angle - after.angle) < 1e-5);
  assert.ok(Math.abs(before.upper - after.upper) < 1e-7);
  assert.ok(Math.abs(before.lower - after.lower) < 1e-7);
  assert.equal(matchingHourglass(9.6).angle, 0);
});
test('motion-off and invalid clocks give a stable non-flowing pose', () => {
  assert.deepEqual(matchingHourglass(123, false), matchingHourglass(0, false));
  assert.equal(matchingHourglass(123, false).flowing, false);
  assert.deepEqual(matchingHourglass(-1), matchingHourglass(0));
  assert.deepEqual(matchingHourglass(NaN), matchingHourglass(0));
});
