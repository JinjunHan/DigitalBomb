import type { RoomView } from './protocol';

/** Local action warning only; waiting for another player must never look like our deadline. */
export function countdownUrgency(room: RoomView | undefined, meId: string | undefined, now: number): number {
  if (!room || !meId || !Number.isFinite(now) || !Number.isFinite(room.deadline)) return 0;
  const preparing = room.phase === 'preparing' && !room.ownSecret;
  const acting = (room.phase === 'playing' || room.phase === 'reply')
    && room.current === meId && Number.isFinite(room.startAt) && now >= room.startAt;
  if (!preparing && !acting) return 0;
  const remaining = room.deadline - now;
  if (remaining <= 0 || remaining > 5000) return 0;
  return .25 + .75 * (1 - remaining / 5000);
}
