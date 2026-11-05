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

/** Invert the top-left/right/bottom-left UV basis, including rotated and flipped atlas rects. */
export function spriteUVTransform(uv: readonly number[]): readonly [number, number, number, number, number, number] | undefined {
  const ox = uv[4], oy = uv[5];
  const xx = uv[6] - ox, xy = uv[7] - oy, yx = uv[0] - ox, yy = uv[1] - oy;
  const determinant = xx * yy - xy * yx;
  if (![ox, oy, xx, xy, yx, yy, determinant].every(Number.isFinite) || Math.abs(determinant) < 1e-10) return undefined;
  const inverse = 1 / determinant;
  return [yy * inverse, -yx * inverse, (yx * oy - yy * ox) * inverse,
    -xy * inverse, xx * inverse, (xy * ox - xx * oy) * inverse];
}
