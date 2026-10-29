/** Survives UI node rebuilds; one short vertical roll for each consecutive round. */
export class RoundRoll {
  room = ''; current = 0; previous = 0; elapsed = .4;
  readonly duration = .4;
  sync(room: string, round: number, animated: boolean, reset = false) {
    if (room !== this.room || reset || !animated) {
      this.room = room; this.current = this.previous = round; this.elapsed = this.duration; return;
    }
    if (round === this.current) return;
    this.previous = this.current; this.current = round;
    // A skipped snapshot is synchronization, not a sequence to replay.
    this.elapsed = round === this.previous + 1 && this.previous > 0 ? 0 : this.duration;
  }
  advance(dt: number, animated: boolean) {
    this.elapsed = animated ? Math.min(this.duration, this.elapsed + Math.min(Math.max(dt, 0), .05)) : this.duration;
  }
  get pose() {
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = 1 - (1 - t) ** 3;
    return { oldY: 42 * eased, newY: 42 * (eased - 1), active: t < 1 };
  }
}
