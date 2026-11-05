import { _decorator, Component, director, EffectAsset, game, Material, resources, Sprite, Vec4 } from 'cc';
import { read } from './Platform';

const { ccclass } = _decorator;
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Local, single-pass artwork effects. Idle sprites return to their original batched material. */
@ccclass('SpriteEffects')
export class SpriteEffects extends Component {
  private static effect?: EffectAsset;
  private static loading = false;
  private static motionFrame = -1;
  private static motion = true;
  private sprite?: Sprite;
  private original: Material | null = null;
  private material?: Material;
  private revealAmount = 1;
  private ambientAmount = 0;
  private urgency = 0;
  private pressed = false;
  private sweepTime = 1;
  private flashTime = 1;
  private params = new Vec4();
  private surface = new Vec4();
  private uvX = new Vec4();
  private uvY = new Vec4();

  static prepare() {
    if (this.loading || this.effect) return;
    this.loading = true;
    resources.load('effects/ui-feedback', EffectAsset, (error, effect) => {
      // Failure leaves original art usable; avoid retrying on every button or frame.
      if (error) { console.warn('Sprite effects unavailable; keeping original artwork.'); return; }
      this.effect = effect;
    });
  }
  static attach(sprite: Sprite): SpriteEffects {
    const effect = sprite.node.getComponent(SpriteEffects) ?? sprite.node.addComponent(SpriteEffects);
    if (!effect.sprite) { effect.sprite = sprite; effect.original = sprite.customMaterial; }
    // Keep local UVs stable during batching. Existing packed frames still use their actual UVs.
    if (sprite.spriteFrame) sprite.spriteFrame.packable = false;
    this.prepare();
    return effect;
  }
  private static motionEnabled() {
    const frame = director.getTotalFrames();
    if (frame !== this.motionFrame) { this.motionFrame = frame; this.motion = read('motion', '1') === '1'; }
    return this.motion;
  }
  reveal(progress: number) { this.revealAmount = clamp(progress); this.apply(); }
  ambient(strength: number) { this.ambientAmount = Math.min(.12, clamp(strength)); this.apply(); }
  pulse(urgency: number) { this.urgency = clamp(urgency); this.apply(); }
  sweep() { this.sweepTime = SpriteEffects.motionEnabled() ? 0 : 1; this.apply(); }
  flash() { this.flashTime = SpriteEffects.motionEnabled() ? 0 : 1; this.apply(); }
  press(active: boolean) { this.pressed = active && SpriteEffects.motionEnabled(); this.apply(); }

  update(dt: number) {
    const delta = Math.min(.05, Math.max(0, Number.isFinite(dt) ? dt : 0));
    this.sweepTime = Math.min(1, this.sweepTime + delta / .65);
    this.flashTime = Math.min(1, this.flashTime + delta / .32);
    this.apply();
  }
  private restore() {
    if (this.sprite?.isValid && this.material && this.sprite.customMaterial === this.material) this.sprite.customMaterial = this.original;
  }
  private apply() {
    const sprite = this.sprite;
    if (!sprite?.isValid) return;
    if (!SpriteEffects.motionEnabled()) {
      this.sweepTime = this.flashTime = 1; this.pressed = false;
      this.restore(); return;
    }
    const active = this.revealAmount < 1 || this.ambientAmount > 0 || this.urgency > 0
      || this.pressed || this.sweepTime < 1 || this.flashTime < 1;
    if (!active) { this.restore(); return; }
    const effect = SpriteEffects.effect, frame = sprite.spriteFrame;
    if (!effect || !frame) return;
    frame.packable = false;
    if (!this.material) {
      this.material = new Material();
      this.material.initialize({ effectAsset: effect, defines: { USE_TEXTURE: true } });
    }
    // Inverse of the actual top-left/right/bottom-left UV basis handles rects, flips and rotated atlases.
    const uv = frame.uv, ox = uv[4], oy = uv[5];
    const xx = uv[6] - ox, xy = uv[7] - oy, yx = uv[0] - ox, yy = uv[1] - oy;
    const determinant = xx * yy - xy * yx;
    if (Math.abs(determinant) < 1e-10) { this.restore(); return; }
    const inverse = 1 / determinant;
    this.uvX.set(yy * inverse, -yx * inverse, (yx * oy - yy * ox) * inverse, 0);
    this.uvY.set(-xy * inverse, xx * inverse, (xy * ox - xx * oy) * inverse, 0);
    // UI redraws replace components: continuous effects use the shared clock, so typing
    // cannot restart a warning beat. Urgency changes amplitude, keeping its phase smooth.
    const time = game.totalTime / 1000;
    const beat = .5 + .5 * Math.sin(time * 8);
    this.params.set(this.sweepTime < 1 ? this.sweepTime : -1,
      this.flashTime < 1 ? Math.sin(Math.PI * this.flashTime) * .38 : 0,
      this.urgency * (.18 + .28 * beat), this.pressed ? .24 : 0);
    // All ambient frequencies are multiples of .01: this wrap is visually continuous.
    this.surface.set(this.revealAmount, this.ambientAmount, time % (200 * Math.PI), sprite.grayscale ? 1 : 0);
    this.material.setProperty('fxParams', this.params);
    this.material.setProperty('surfaceParams', this.surface);
    this.material.setProperty('uvX', this.uvX);
    this.material.setProperty('uvY', this.uvY);
    if (sprite.customMaterial !== this.material) sprite.customMaterial = this.material;
  }
  onDisable() { this.restore(); this.sweepTime = this.flashTime = 1; this.pressed = false; }
  onDestroy() { this.restore(); this.material?.destroy(); this.material = undefined; }
}
