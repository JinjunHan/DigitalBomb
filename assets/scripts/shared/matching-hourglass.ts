/** Sample the baked 16-frame sheet from queue time; UI redraws never restart it. */
export function matchingHourglass(seconds: number, motion = true): number {
  const time = motion ? Math.max(0, Number.isFinite(seconds) ? seconds : 0) : 0;
  // Integer milliseconds avoid floating point ambiguity at 4.8-second loop edges.
  const local = Math.floor(time * 1000) % 4800;
  return local < 4000 ? Math.floor(local / 500) : 8 + Math.floor((local - 4000) / 100);
}
