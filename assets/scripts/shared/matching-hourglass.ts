/** Pure session-time sampling: redraws do not restart the hourglass. */
export function matchingHourglass(seconds: number, motion = true) {
  const time = motion ? Math.max(0, Number.isFinite(seconds) ? seconds : 0) : 0;
  const cycle = Math.floor(time / 4.8), local = time - cycle * 4.8;
  const progress = Math.min(local / 4.1, 1), inverted = cycle % 2 === 1;
  const turn = Math.max(0, Math.min(1, (local - 4.1) / .7));
  const easedTurn = turn * turn * (3 - 2 * turn);
  return {
    angle: -((cycle % 2) * 180 + easedTurn * 180) || 0,
    upper: .2 + .8 * (inverted ? progress : 1 - progress),
    lower: .2 + .8 * (inverted ? 1 - progress : progress),
    flowing: motion && local < 4.1,
    inverted,
    grainPhase: time * 2.2 % 1,
  };
}
