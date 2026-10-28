import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRIEND_RETURN_DURATION, friendReturnPose, shouldReturnToJoin } from '../assets/scripts/shared/friend-return';
test('only a confirmed departure from a waiting friend room returns to join', () => {
  assert.equal(shouldReturnToJoin('r', 'waiting', false, false), true);
  assert.equal(shouldReturnToJoin('r', 'waiting', true, false), false); // Cancel, failure or friend joining.
  assert.equal(shouldReturnToJoin('', '', false, false), false);
  assert.equal(shouldReturnToJoin('r', 'playing', false, false), false);
  assert.equal(shouldReturnToJoin('r', 'finished', false, false), false);
  assert.equal(shouldReturnToJoin('r', 'waiting', false, true), false);
});
test('departing room is initially unchanged; incoming page and keyboard appear in sequence', () => {
  const start = friendReturnPose(0);
  assert.equal(start.outgoingX, 0); assert.equal(start.outgoingOpacity, 1); assert.equal(start.outgoingScale, 1);
  assert.equal(start.incomingOpacity, 0); assert.equal(start.keyboardOpacity, 0);
  const middle = friendReturnPose(.15);
  assert.ok(middle.outgoingOpacity > 0 && middle.outgoingOpacity < 1);
  assert.ok(middle.incomingOpacity > 0); assert.equal(middle.keyboardOpacity, 0);
  assert.ok(friendReturnPose(.3).keyboardOpacity > 0);
});
test('completion restores exact input layout and never leaves a transparent input blocker', () => {
  for (const elapsed of [FRIEND_RETURN_DURATION, 5]) {
    const pose = friendReturnPose(elapsed);
    assert.equal(pose.outgoingOpacity, 0); assert.equal(pose.incomingOpacity, 1);
    assert.ok(Math.abs(pose.incomingX) < 1e-9); assert.ok(Math.abs(pose.keyboardY) < 1e-9);
    assert.equal(pose.keyboardOpacity, 1); assert.equal(pose.complete, true);
  }
});
