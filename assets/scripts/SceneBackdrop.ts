import { Node, Layers, UITransform, Sprite, SpriteFrame, Texture2D, resources, Graphics, Color } from 'cc';
import { SceneCamera, sceneTableScale, type SceneView } from './shared/scene-camera';

/** Persistent scenery, below all interactive UI. No touch handlers or DOM dependencies. */
export class SceneBackdrop {
  private root: Node;
  private fallback: Node;
  private layers = new Map<string, Node>();
  private frames: SpriteFrame[] = [];
  private camera = new SceneCamera();
  private height = 1334;
  private ready = false;
  private motion = true;
  private disposed = false;
  private view: SceneView = 'lobby';
  constructor(parent: Node) {
    this.root = new Node('PersistentStudy'); this.root.layer = Layers.Enum.UI_2D;
    parent.addChild(this.root); this.root.setSiblingIndex(0);
    this.fallback = this.makeNode('SceneFallback', this.root, 750, this.height);
    const clear = this.makeNode('SceneClearColor', this.root, 750, this.height); clear.setSiblingIndex(0);
    const g = clear.addComponent(Graphics); g.fillColor = new Color('#173E3C'); g.rect(-1000, -2000, 2000, 4000); g.fill();
    resources.load('art/lobby/background/texture', Texture2D, (err, texture) => {
      if (err || this.disposed || this.ready) return;
      this.setTexture(this.fallback, texture);
    });
    const names = ['room', 'table', 'near-left', 'near-right'];
    for (const name of names) {
      const n = this.makeNode(name, this.root, 750, this.height); n.active = false; this.layers.set(name, n);
      resources.load('art/scene/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || this.disposed) return; // A missing layer keeps the complete fallback visible.
        this.setTexture(n, texture);
        if (names.every(key => this.layers.get(key)!.getComponent(Sprite)?.spriteFrame)) {
          this.ready = true; this.fallback.active = false;
          for (const layer of this.layers.values()) layer.active = true;
          this.apply();
        }
      });
    }
  }
  private makeNode(name: string, parent: Node, w: number, h: number) {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n);
    n.addComponent(UITransform).setContentSize(w, h); return n;
  }
  private setTexture(n: Node, texture: Texture2D) {
    const frame = new SpriteFrame(); frame.texture = texture; this.frames.push(frame);
    const sprite = n.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  }
  setView(view: SceneView, motion: boolean) { this.motion = motion; this.view = view; this.camera.setView(view, motion); this.apply(); }
  resize(height: number) { this.height = height; this.apply(); }
  update(dt: number) {
    const previous = this.camera.pose;
    if (!this.motion) this.camera.setView(this.view, false);
    else this.camera.step(dt);
    const current = this.camera.pose;
    if (previous.zoom !== current.zoom || previous.lift !== current.lift || previous.pan !== current.pan) this.apply();
  }
  private apply() {
    const h = this.height, p = this.camera.pose;
    this.fallback.getComponent(UITransform)!.setContentSize(750, h);
    if (!this.ready) return;
    const room = this.layers.get('room')!, table = this.layers.get('table')!;
    // Dim distant scenery as the camera approaches the table; keep lobby/profile tones unchanged.
    const focus = Math.min(1, Math.max(0, p.zoom));
    room.getComponent(Sprite)!.color = new Color(255 - 48 * focus, 255 - 52 * focus, 255 - 54 * focus);
    table.getComponent(Sprite)!.color = new Color(255 - 22 * focus, 255 - 22 * focus, 255 - 20 * focus);
    room.getComponent(UITransform)!.setContentSize(750, h);
    room.setScale(1.1 + p.zoom * .025, 1.1 + p.zoom * .025, 1);
    room.setPosition(p.pan * 750 * .25, p.lift * h * .25);
    table.getComponent(UITransform)!.setContentSize(750, h);
    const tableScale = sceneTableScale(p);
    table.setScale(tableScale, tableScale, 1);
    table.setPosition(p.pan * 750, p.lift * h);
    for (const [name, sign] of [['near-left', -1], ['near-right', 1]] as const) {
      const n = this.layers.get(name)!;
      n.getComponent(Sprite)!.color = new Color(255 - 30 * focus, 255 - 32 * focus, 255 - 34 * focus);
      // Props move faster than the table, creating foreground parallax without covering controls.
      const width = 265, frame = n.getComponent(Sprite)!.spriteFrame!;
      n.getComponent(UITransform)!.setContentSize(width, width * frame.originalSize.height / frame.originalSize.width);
      const scale = 1 + p.zoom * .18; n.setScale(scale, scale, 1);
      // The generated props intentionally touch their outer image edge: keep that edge offscreen.
      n.setPosition(sign * (375 - width * scale / 2 + 24 + p.zoom * 15) + p.pan * 750 * 1.6,
        -h * (sign < 0 ? .24 : .16) + p.lift * h * 1.5);
    }
  }
  destroy() {
    this.disposed = true; this.root.destroy();
    for (const frame of this.frames) frame.destroy();
  }
}
