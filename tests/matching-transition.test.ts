import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingTransition } from '../assets/scripts/shared/matching-transition';

test('matching entrance overlaps the outgoing page and settles exactly', () => {
  const start = matchingTransition(0);
  assert.equal(start.outgoingOpacity, 1);
  assert.equal(start.incomingOpacity, 0);
  assert.equal(start.incomingY, -48);
  const overlap = matchingTransition(.16);
  assert.ok(overlap.outgoingOpacity > 0 && overlap.outgoingOpacity < 1);
  assert.ok(overlap.incomingOpacity > 0 && overlap.incomingOpacity < 1);
  assert.equal(matchingTransition(.32).outgoingOpacity, 0);
  assert.equal(matchingTransition(.59).complete, false);
  const end = matchingTransition(.6);
  assert.equal(end.incomingOpacity, 1);
  assert.equal(end.incomingY, 0);
  assert.equal(end.incomingScale, 1);
  assert.equal(end.complete, true);
  assert.deepEqual(matchingTransition(10), end);
});

test('sampling after redraw preserves progress and clamps negative time', () => {
  assert.deepEqual(matchingTransition(-1), matchingTransition(0));
  for (const t of [.1, .25, .4]) {
    const before = matchingTransition(t);
    assert.deepEqual(matchingTransition(t), before);
    const after = matchingTransition(t + .01);
    assert.ok(after.incomingOpacity >= before.incomingOpacity);
    assert.ok(after.outgoingOpacity <= before.outgoingOpacity);
  }
});
