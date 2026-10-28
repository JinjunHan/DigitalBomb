import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODAL_MOTION, modalPose, modalExitPose, modalDetail, type ModalKind } from '../assets/scripts/shared/modal-motion';
const kinds = Object.keys(MODAL_MOTION) as ModalKind[];
test('all 11 entrances settle exactly; controls finish with their panel', () => {
  assert.equal(kinds.length, 11);
  for (const kind of kinds) {
    const spec = MODAL_MOTION[kind];
    const settled = modalPose(kind, spec.duration);
    for (const [key, expected] of Object.entries({ x: 0, y: 0, scale: 1, angle: 0, opacity: 1 })) assert.ok(Math.abs(settled[key as keyof typeof settled] - expected) < 1e-9);
    for (const i of [0, 3, 10, 20]) { const detail = modalDetail(kind, spec.duration, i); assert.equal(detail.opacity, 1); assert.ok(Math.abs(detail.y) < 1e-9); }
    for (let i = 0; i <= 20; i++) {
      const pose = modalPose(kind, spec.duration * i / 20);
      assert.ok(pose.opacity >= 0 && pose.opacity <= 1); assert.ok(pose.scale > .8 && pose.scale < 1.1);
    }
  }
});
test('interrupted entry exits from its current pose with no jump and ends invisible', () => {
  for (const kind of kinds) {
    const spec = MODAL_MOTION[kind];
    for (const fraction of [0, .1, .5, .99, 1]) {
      const from = modalPose(kind, spec.duration * fraction);
      assert.deepEqual(modalExitPose(kind, 0, from), from);
      assert.equal(modalExitPose(kind, spec.exit, from).opacity, 0);
      assert.ok(modalExitPose(kind, spec.exit / 2, from).opacity <= from.opacity);
    }
  }
});
test('record sheets do not wobble; reconnect stays still; repeat has a distinct gentle nudge', () => {
  assert.equal(modalPose('live', .1).angle, 0);
  assert.equal(modalPose('reconnect', .1).x, 0); assert.equal(modalPose('reconnect', .1).y, 0);
  assert.ok(modalPose('rules', .1).x > 0); assert.ok(modalPose('result', .1).x < 0);
  assert.ok(modalPose('lock', 0).scale > 1); assert.ok(modalPose('resign', 0).scale < 1);
  const configurations = new Set(kinds.map(kind => JSON.stringify(MODAL_MOTION[kind])));
  assert.equal(configurations.size, 11);
});
