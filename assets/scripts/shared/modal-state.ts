import { validCode } from './game-mode';
import type { RoomView } from './protocol';
export type ConfirmationKind = 'lock' | 'repeat' | 'leave' | 'close' | 'resign';
export interface ConfirmationContext { kind: ConfirmationKind; roomId: string; turn: number; digits: string }
/** A confirmation must never submit a draft into a different room, phase or turn. */
export function confirmationValid(pending: ConfirmationContext, room: RoomView | null | undefined, playerId: string): boolean {
  if (!room || room.id !== pending.roomId) return false;
  switch (pending.kind) {
    case 'close': return room.phase === 'waiting';
    case 'leave': return room.phase === 'preparing';
    case 'lock': return room.phase === 'preparing' && !room.ownSecret && validCode(pending.digits, room.digitCount ?? 4);
    case 'repeat': return ['playing', 'reply'].includes(room.phase) && room.turn === pending.turn && room.current === playerId && validCode(pending.digits, room.digitCount ?? 4);
    case 'resign': return ['playing', 'reply'].includes(room.phase);
  }
}
