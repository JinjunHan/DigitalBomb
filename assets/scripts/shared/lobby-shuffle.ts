/** Animation state is independent of UI rebuilds. Hold starts after the last reel stops. */
export class LobbyShuffle {
  visible = false;
  elapsed = 0;
  readonly rollDuration = 1.25;
  readonly holdDuration = 5;
  private reels: number[][] = [];
  constructor(private random: () => number = Math.random) { this.roll(); }
  private roll() {
    this.elapsed = 0;
    this.reels = Array.from({length:4},()=>Array.from({length:13},()=>Math.floor(this.random()*10)));
  }
  show(visible: boolean) {
    if (visible && !this.visible) this.roll();
    this.visible = visible;
  }
  advance(dt: number, motion: boolean) {
    if (!this.visible) return;
    if (!motion) { this.elapsed = this.rollDuration; return; }
    this.elapsed += Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    if (this.elapsed >= this.rollDuration + this.holdDuration) this.roll();
  }
  pose(index: number) {
    const t=Math.max(0,Math.min(1,(this.elapsed-index*.08)/(1.01)));
    // Decelerate smoothly into the final digit; every crossing swaps one source numeral.
    const position=12*(1-(1-t)**2),step=Math.min(12,Math.floor(position));
    return {digit:this.reels[index][step],next:this.reels[index][Math.min(12,step+1)],offset:position-step,active:t<1};
  }
}
