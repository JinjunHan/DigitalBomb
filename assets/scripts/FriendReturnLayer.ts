import { Node, UITransform, UIOpacity, Layers, BlockInputEvents, Vec3 } from 'cc';
import { FRIEND_RETURN_DURATION, friendReturnPose } from './shared/friend-return';
interface Detail { node: Node; rest: Vec3; opacity: UIOpacity; baseOpacity: number }
/** Preserve the departing room while Interface redraws the destination underneath it. */
export class FriendReturnLayer {
  readonly node: Node;
  private guard: Node;
  private outgoing?: Node;
  private outgoingRest = new Vec3();
  private outgoingScale = 1;
  private incoming?: Node;
  private incomingRest = new Vec3();
  private keyboard: Detail[] = [];
  elapsed = FRIEND_RETURN_DURATION;
  constructor(parent: Node) {
    this.node = new Node('FriendReturnLayer'); this.node.layer = Layers.Enum.UI_2D; parent.addChild(this.node);
    this.guard = new Node('FriendReturnGuard'); this.guard.layer = Layers.Enum.UI_2D; this.node.addChild(this.guard);
    this.guard.addComponent(UITransform); this.guard.addComponent(BlockInputEvents); this.resize(1334);
    this.node.active = false;
  }
  get active() { return this.elapsed < FRIEND_RETURN_DURATION; }
  resize(height: number) { this.guard.getComponent(UITransform)!.setContentSize(750, height); }
  start(room: Node) {
    this.finish(); this.elapsed = 0;
    this.outgoing = room; this.outgoingRest = room.position.clone(); this.outgoingScale = room.scale.x;
    room.removeFromParent(); this.node.addChild(room);
    if (!room.getComponent(UIOpacity)) room.addComponent(UIOpacity);
    this.guard.setSiblingIndex(this.node.children.length - 1); this.node.active = true; this.apply();
  }
  attach(join: Node) {
    if (!this.active) return;
    this.incoming = join; this.incomingRest = join.position.clone();
    if (!join.getComponent(UIOpacity)) join.addComponent(UIOpacity);
    this.keyboard = join.children.filter(n => n.name === 'Join-keyboard' || n.name.startsWith('Join-key-')).map(node => {
      const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
      return { node, rest: node.position.clone(), opacity, baseOpacity: opacity.opacity };
    });
    this.apply();
  }
  update(dt: number, motion: boolean) {
    if (!this.active) return;
    if (!motion) { this.finish(); return; }
    this.elapsed = Math.min(FRIEND_RETURN_DURATION, this.elapsed + Math.min(.05, Math.max(0, dt)));
    this.apply(); if (!this.active) this.finish();
  }
  private apply() {
    const p = friendReturnPose(this.elapsed);
    if (this.outgoing?.isValid) {
      this.outgoing.setPosition(this.outgoingRest.x + p.outgoingX, this.outgoingRest.y);
      this.outgoing.setScale(this.outgoingScale * p.outgoingScale, this.outgoingScale * p.outgoingScale, 1);
      this.outgoing.angle = p.outgoingAngle; this.outgoing.getComponent(UIOpacity)!.opacity = Math.round(255 * p.outgoingOpacity);
    }
    if (this.incoming?.isValid) {
      this.incoming.setPosition(this.incomingRest.x + p.incomingX, this.incomingRest.y);
      this.incoming.getComponent(UIOpacity)!.opacity = Math.round(255 * p.incomingOpacity);
      for (const d of this.keyboard) {
        d.node.setPosition(d.rest.x, d.rest.y + p.keyboardY, d.rest.z);
        d.opacity.opacity = Math.round(d.baseOpacity * p.keyboardOpacity);
      }
    }
  }
  finish() {
    this.elapsed = FRIEND_RETURN_DURATION; this.apply();
    if (this.outgoing?.isValid) { this.outgoing.removeFromParent(); this.outgoing.destroy(); }
    this.outgoing = undefined; this.incoming = undefined; this.keyboard = []; this.node.active = false;
  }
  destroy() { this.finish(); this.node.destroy(); }
}
