import { _decorator, Component, director, EffectAsset, game, Material, resources, Sprite, Vec4 } from 'cc';
import { read } from './Platform';
import { spriteUVTransform } from './shared/shader-feedback';

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
  // Infinity forces the first upload (Cocos Vec4 turns NaN into zero).
  // Each sentinel is replaced with finite values before it reaches the material.
  private params = new Vec4(Infinity, Infinity, Infinity, Infinity);
  private surface = new Vec4(Infinity, Infinity, Infinity, Infinity);
  private uvX = new Vec4(Infinity, Infinity, Infinity, Infinity);
  private uvY = new Vec4(Infinity, Infinity, Infinity, Infinity);
  private sourceUV: number[] = [];

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
  reveal(progress: number) { this.revealAmount = clamp(progress); }
  ambient(strength: number) { this.ambientAmount = Math.min(.12, clamp(strength)); }
  pulse(urgency: number) { this.urgency = clamp(urgency); }
  sweep() { this.sweepTime = SpriteEffects.motionEnabled() ? 0 : 1; }
  flash() { this.flashTime = SpriteEffects.motionEnabled() ? 0 : 1; }
  press(active: boolean) { this.pressed = active && SpriteEffects.motionEnabled(); }

  // A component created during another update starts before drawing, but its first
  // lateUpdate is deferred. Publish initial paper coverage here to avoid an unmasked frame.
  start() { this.apply(); }
  lateUpdate(dt: number) {
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
    if (!effect || !frame || !sprite.enabledInHierarchy) { this.restore(); return; }
    frame.packable = false;
    if (!this.material) {
      this.material = new Material();
      this.material.initialize({ effectAsset: effect, defines: { USE_TEXTURE: true } });
    }
    // UV arrays mutate in place when a rect, flip or atlas changes: compare values,
    // not just SpriteFrame identity. Cache the inverse and upload only on a change.
    const uv = frame.uv, previous = this.sourceUV;
    if (previous.length === 0 || uv[0] !== previous[0] || uv[1] !== previous[1] || uv[4] !== previous[4]
      || uv[5] !== previous[5] || uv[6] !== previous[6] || uv[7] !== previous[7]) {
      const transform = spriteUVTransform(uv);
      if (!transform) { this.restore(); return; }
      this.upload('uvX', this.uvX, transform[0], transform[1], transform[2], 0);
      this.upload('uvY', this.uvY, transform[3], transform[4], transform[5], 0);
      this.sourceUV = uv.slice();
    }
    // UI redraws replace components: continuous effects use the shared clock, so typing
    // cannot restart a warning beat. Urgency changes amplitude, keeping its phase smooth.
    const time = game.totalTime / 1000;
    const beat = .5 + .5 * Math.sin(time * 8);
    this.upload('fxParams', this.params, this.sweepTime < 1 ? this.sweepTime : -1,
      this.flashTime < 1 ? Math.sin(Math.PI * this.flashTime) * .38 : 0,
      this.urgency * (.18 + .28 * beat), this.pressed ? .24 : 0);
    // All ambient frequencies are multiples of .01: this wrap is visually continuous.
    this.upload('surfaceParams', this.surface, this.revealAmount, this.ambientAmount,
      this.ambientAmount > 0 ? time % (200 * Math.PI) : 0, sprite.grayscale ? 1 : 0);
    if (sprite.customMaterial !== this.material) sprite.customMaterial = this.material;
  }
  private upload(name: string, value: Vec4, x: number, y: number, z: number, w: number) {
    // Material retains this Vec4 reference; compare before mutating it.
    if (value.x === x && value.y === y && value.z === z && value.w === w) return;
    value.set(x, y, z, w);
    this.material!.setProperty(name, value);
  }
  onDisable() { this.restore(); this.sweepTime = this.flashTime = 1; this.pressed = false; }
  onDestroy() { this.restore(); this.material?.destroy(); this.material = undefined; }
}
