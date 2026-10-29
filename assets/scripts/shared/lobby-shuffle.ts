/** Animation state is independent of UI rebuilds. Hold starts after the last reel stops. */
export class LobbyShuffle {
  visible = false;
  elapsed = 0;
  readonly stopInterval = .24;
  readonly settleDuration = .18;
  readonly rollDuration = .9 + 3 * this.stopInterval + this.settleDuration;
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
    if (!this.visible) return [];
    if (!motion) { this.elapsed = this.rollDuration; return []; }
    const previous = this.elapsed;
    this.elapsed += Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    const stopped = [0,1,2,3].filter(i=>previous < this.stopAt(i) && this.elapsed >= this.stopAt(i));
    if (this.elapsed >= this.rollDuration + this.holdDuration) this.roll();
    return stopped;
  }
  private stopAt(index: number) { return .9 + index * this.stopInterval; }
  pose(index: number) {
    const t=Math.max(0,Math.min(1,this.elapsed/this.stopAt(index)));
    const settle=Math.max(0,Math.min(1,(this.elapsed-this.stopAt(index))/this.settleDuration));
    const bounce=t<1?0:Math.sin(settle*Math.PI*2)*(1-settle);
    // Decelerate smoothly into the final digit; every crossing swaps one source numeral.
    const position=12*(1-(1-t)**2),step=Math.min(12,Math.floor(position));
    return {digit:this.reels[index][step],next:this.reels[index][Math.min(12,step+1)],offset:position-step,bounce,active:t<1};
  }
}
