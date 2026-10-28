import { Node, UITransform, UIOpacity, Graphics, Color, Layers, BlockInputEvents, Vec3 } from 'cc';
import { MODAL_MOTION, modalPose, modalExitPose, modalDetail, type ModalKind, type ModalPose } from './shared/modal-motion';
interface Detail { node: Node; rest: Vec3; opacity: UIOpacity; baseOpacity: number }
interface Surface {
  key: ModalKind; node?: Node; elapsed: number; rest?: Vec3; scale?: number;
  opacity?: UIOpacity; details: Detail[]; from?: ModalPose; exitElapsed: number;
}
/** Lives outside Interface: redraws refresh content without restarting the transition clock. */
export class ModalLayer {
  readonly node: Node;
  private shade: Node;
  private shadeOpacity: UIOpacity;
  private guard: Node;
  private active?: Surface;
  private outgoing?: Surface;
  private enabled = true;
  constructor(parent: Node) {
    this.node = new Node('ModalLayer'); this.node.layer = Layers.Enum.UI_2D; parent.addChild(this.node);
    this.shade = this.make('ModalBlocker'); this.shade.addComponent(BlockInputEvents);
    this.shade.addComponent(Graphics); this.shadeOpacity = this.shade.addComponent(UIOpacity);
    this.guard = this.make('ModalTransitionGuard'); this.guard.addComponent(BlockInputEvents);
    this.resize(1334); this.sync();
  }
  private make(name: string) {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; this.node.addChild(n); n.addComponent(UITransform); return n;
  }
  resize(height: number) {
    for (const n of [this.shade, this.guard]) n.getComponent(UITransform)!.setContentSize(750, height);
    const g = this.shade.getComponent(Graphics)!; g.clear(); g.fillColor = new Color(5, 17, 16, 170);
    g.rect(-375, -height / 2, 750, height); g.fill();
  }
  /** Called once per redraw, before reconstructing only the active content. */
  begin(key: ModalKind | undefined, enabled: boolean) {
    this.enabled = enabled;
    if (this.active?.key !== key) {
      this.remove(this.outgoing); this.outgoing = undefined;
      if (this.active?.node?.isValid && enabled) {
        this.outgoing = this.active; this.outgoing.from = modalPose(this.active.key, this.active.elapsed);
        this.outgoing.exitElapsed = 0;
      } else this.remove(this.active);
      this.active = key ? { key, elapsed: enabled ? 0 : MODAL_MOTION[key].duration, exitElapsed: 0, details: [] } : undefined;
    } else if (this.active) {
      this.remove(this.active); this.active.node = undefined; this.active.details = [];
    }
    if (!enabled) { this.remove(this.outgoing); this.outgoing = undefined; if (this.active) this.active.elapsed = MODAL_MOTION[this.active.key].duration; }
    this.sync();
  }
  attach(node: Node, scale: number) {
    const s = this.active; if (!s) return;
    s.node = node; s.rest = node.position.clone(); s.scale = scale; s.opacity = node.addComponent(UIOpacity);
    // The body contains static artwork; animate the separate controls and live content only.
    s.details = node.children.filter(n => !n.name.endsWith('-body')).map(n => {
      const opacity = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
      return { node: n, rest: n.position.clone(), opacity, baseOpacity: opacity.opacity };
    });
    this.guard.setSiblingIndex(this.node.children.length - 1); this.apply(s, modalPose(s.key, s.elapsed), true); this.sync();
  }
  get interactive() { return !!this.active?.node?.isValid && !this.outgoing && this.active.elapsed >= MODAL_MOTION[this.active.key].duration; }
  update(dt: number, enabled: boolean) {
    const snap = enabled !== this.enabled && !enabled;
    if (snap) {
      this.remove(this.outgoing); this.outgoing = undefined;
      if (this.active) this.active.elapsed = MODAL_MOTION[this.active.key].duration;
    }
    this.enabled = enabled;
    const delta = Math.min(.05, Math.max(0, dt));
    const s = this.active;
    const moving = s?.node?.isValid && s.elapsed < MODAL_MOTION[s.key].duration;
    if (moving) s!.elapsed = Math.min(MODAL_MOTION[s!.key].duration, s!.elapsed + delta);
    if (s && (moving || snap)) this.apply(s, modalPose(s.key, s.elapsed), true);
    const out = this.outgoing;
    if (out) {
      out.exitElapsed += delta; this.apply(out, modalExitPose(out.key, out.exitElapsed, out.from!), false);
      if (out.exitElapsed >= MODAL_MOTION[out.key].exit) { this.remove(out); this.outgoing = undefined; }
    }
    this.sync();
  }
  private apply(s: Surface, pose: ModalPose, details: boolean) {
    if (!s.node?.isValid || !s.rest || !s.opacity) return;
    const scale = s.scale!;
    // Scale around the paper center, not its source-space top edge.
    const center = s.node.getComponent(UITransform)!.height / 2;
    const angle = pose.angle * Math.PI / 180;
    s.node.setPosition(s.rest.x + pose.x * scale - Math.sin(angle) * center * scale * pose.scale,
      s.rest.y + pose.y * scale + center * scale * (Math.cos(angle) * pose.scale - 1));
    s.node.setScale(scale * pose.scale, scale * pose.scale, 1); s.node.angle = pose.angle;
    s.opacity.opacity = Math.round(255 * pose.opacity);
    if (details) s.details.forEach((d, i) => {
      const p = modalDetail(s.key, s.elapsed, i);
      d.node.setPosition(d.rest.x, d.rest.y + p.y, d.rest.z); d.opacity.opacity = Math.round(d.baseOpacity * p.opacity);
    });
  }
  private sync() {
    const incoming = this.active ? modalPose(this.active.key, this.active.elapsed).opacity : 0;
    const outgoing = this.outgoing ? modalExitPose(this.outgoing.key, this.outgoing.exitElapsed, this.outgoing.from!).opacity : 0;
    this.node.active = !!this.active || !!this.outgoing;
    this.shadeOpacity.opacity = Math.round(255 * Math.max(incoming, outgoing));
    this.guard.active = !this.interactive || !!this.outgoing;
  }
  private remove(surface?: Surface) { if (surface?.node?.isValid) { surface.node.removeFromParent(); surface.node.destroy(); } }
  destroy() { this.node.destroy(); }
}
