import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputEditSession } from '../assets/scripts/shared/input-edit-session';

test('touch-start protects the input before native focus; resize and refresh stay deferred', () => {
  const session = new InputEditSession();
  assert.equal(session.deferResize(), false);
  session.begin(); // Touch capture occurs before showKeyboard / editing-did-began.
  assert.equal(session.deferResize(), true);
  session.begin(); // Native focus callback must not discard the pending resize.
  assert.equal(session.deferRedraw(), true);
  assert.equal(session.deferRedraw(), true);
  assert.equal(session.active, true);
  assert.deepEqual(session.end(), { redraw: true, resize: true });
  assert.equal(session.active, false);
  assert.equal(session.deferRedraw(), false);
  assert.deepEqual(session.end(), { redraw: false, resize: false });
});
test('an ordinary editing session does not force a redraw or leak pending work to the next focus', () => {
  const session = new InputEditSession();
  session.begin(); assert.deepEqual(session.end(), { redraw: false, resize: false });
  session.begin(); session.deferResize(); session.end();
  session.begin(); assert.deepEqual(session.end(), { redraw: false, resize: false });
});
