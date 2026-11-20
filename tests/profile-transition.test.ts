import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileTransition } from '../assets/scripts/shared/profile-transition';

test('home fades and shrinks for .5s; profile starts immediately and overlaps home', () => {
  const start = profileTransition(0);
  assert.equal(start.lobbyScale, 1); assert.equal(start.lobbyOpacity, 1);
  assert.equal(start.bodyScale, 1.2); assert.equal(start.bodyOpacity, .8); assert.equal(start.backOpacity, 0);
  assert.ok(profileTransition(.01).bodyProgress > 0);
  assert.ok(profileTransition(.01).backOpacity > 0);
  const overlap = profileTransition(.4);
  assert.ok(overlap.bodyProgress > 0); assert.ok(overlap.lobbyOpacity > 0 && overlap.lobbyOpacity < 1);
  const homeGone = profileTransition(.5);
  assert.equal(homeGone.lobbyScale, .8); assert.equal(homeGone.lobbyOpacity, 0); assert.equal(homeGone.complete, false);
  const settled = profileTransition(.8);
  assert.equal(settled.bodyScale, 1); assert.equal(settled.bodyOpacity, 1); assert.equal(settled.backOpacity, 1); assert.equal(settled.complete, true);
});
test('reverse transition starts settled and removes the back button', () => {
  assert.equal(profileTransition(0, true).bodyScale, 1);
  assert.equal(profileTransition(0, true).backOpacity, 1);
  assert.equal(profileTransition(.8, true).backOpacity, 0);
  assert.equal(profileTransition(.8, true).complete, true);
});

test('return exactly reverses every visual property and delays home reveal until .3s', () => {
  for (const time of [0, .1, .3, .4, .5, .7, .8]) {
    const reverse = profileTransition(time, true), forward = profileTransition(.8 - time);
    for (const key of ['bodyScale', 'bodyOpacity', 'backOpacity', 'lobbyScale', 'lobbyOpacity'] as const) {
      assert.equal(reverse[key], forward[key], key + ' at ' + time);
    }
    assert.ok(Math.abs(reverse.bodyProgress + forward.bodyProgress - 1) < 1e-12);
  }
  assert.equal(profileTransition(.29, true).lobbyOpacity, 0);
  assert.ok(profileTransition(.4, true).lobbyOpacity > 0);
  assert.equal(profileTransition(.8, true).lobbyScale, 1);
  assert.equal(profileTransition(.8, true).lobbyOpacity, 1);
});
