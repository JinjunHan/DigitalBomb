import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneCamera, SCENE_VIEWS } from '../assets/scripts/shared/scene-camera';

test('repeated UI refresh does not restart the scene transition', () => {
  const camera = new SceneCamera();
  for (let i = 0; i < 60; i++) { camera.setView('game', true); camera.step(1 / 60); }
  assert.deepEqual(camera.pose, SCENE_VIEWS.game);
});
test('rapid reversal starts at the current visual pose and returns to lobby', () => {
  const camera = new SceneCamera(); camera.setView('matching', true);
  for (let i = 0; i < 20; i++) camera.step(1 / 60);
  const before = { ...camera.pose }; camera.setView('friend', true); camera.step(0);
  assert.deepEqual(camera.pose, before);
  camera.setView('lobby', true);
  for (let i = 0; i < 60; i++) camera.step(1 / 60);
  assert.deepEqual(camera.pose, SCENE_VIEWS.lobby);
});
test('motion off snaps, stalled frame is bounded, and all views cover the screen', () => {
  const camera = new SceneCamera(); camera.setView('game', true); camera.step(10);
  assert.ok(camera.pose.zoom > 0 && camera.pose.zoom < .1);
  camera.setView('friend', false); assert.deepEqual(camera.pose, SCENE_VIEWS.friend);
  for (const p of Object.values(SCENE_VIEWS)) {
    const tableScale = 1.08 + p.zoom * .1;
    assert.ok(-tableScale / 2 + p.lift <= -.5, 'table covers lower screen edge');
    assert.ok(tableScale / 2 - Math.abs(p.pan) >= .5, 'table covers both sides');
    const roomScale = 1.1 + p.zoom * .025;
    assert.ok(roomScale / 2 - Math.abs(p.lift * .25) >= .5);
    assert.ok(24 + p.zoom * 15 >= Math.abs(p.pan * 750 * 1.6), 'cropped prop edges remain outside viewport');
  }
});
