import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmationValid, type ConfirmationContext } from '../assets/scripts/shared/modal-state';
import type { RoomView } from '../assets/scripts/shared/protocol';
const room: RoomView = { id: 'a', mode: 'friend', phase: 'preparing', players: [], version: 1, round: 1, turn: 0, current: 'me', first: 'me', deadline: 999, startAt: 0, history: [], rematch: [] };
const pending = (kind: ConfirmationContext['kind']): ConfirmationContext => ({ kind, roomId: 'a', turn: 0, digits: '0123' });
test('lock preserves leading zero and rejects an already locked secret or changed phase', () => {
  assert.equal(confirmationValid(pending('lock'), room, 'me'), true);
  assert.equal(confirmationValid(pending('lock'), { ...room, ownSecret: '0123' }, 'me'), false);
  assert.equal(confirmationValid(pending('lock'), { ...room, phase: 'playing' }, 'me'), false);
  assert.equal(confirmationValid({ ...pending('lock'), digits: '123' }, room, 'me'), false);
});
test('repeat confirmation expires on another turn, player, room or game end', () => {
  const active = { ...room, phase: 'playing' as const };
  assert.equal(confirmationValid(pending('repeat'), active, 'me'), true);
  for (const changed of [{ ...active, turn: 1 }, { ...active, current: 'other' }, { ...active, id: 'b' }, { ...active, phase: 'finished' as const }, null]) {
    assert.equal(confirmationValid(pending('repeat'), changed, 'me'), false);
  }
  assert.equal(confirmationValid(pending('repeat'), { ...active, phase: 'reply' }, 'me'), true);
});
test('leave, close and resign apply only to their intended phase', () => {
  assert.equal(confirmationValid(pending('leave'), room, 'me'), true);
  assert.equal(confirmationValid(pending('close'), room, 'me'), false);
  assert.equal(confirmationValid(pending('close'), { ...room, phase: 'waiting' }, 'me'), true);
  assert.equal(confirmationValid(pending('leave'), { ...room, phase: 'playing' }, 'me'), false);
  assert.equal(confirmationValid(pending('resign'), { ...room, phase: 'reply' }, 'me'), true);
  assert.equal(confirmationValid(pending('resign'), { ...room, phase: 'finished' }, 'me'), false);
});
