import { Color, Graphics, Label, Layers, Node, Tween, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { toastSpec } from '../shared/toast-style';

export interface TextHelper {
  (value: string, x: number, y: number, size?: number, color?: string, width?: number, height?: number, parent?: Node): Label;
}

export interface NodeHelper {
  (name: string, x: number, y: number, w: number, h: number, parent?: Node): Node;
}

export interface ReconnectBannerRefs {
  bar: Node;
  dot: UIOpacity;
  text: Label;
}

export function renderReconnectBanner(opts: {
  parent: Node;
  screenHeight: number;
  bottomSafe: number;
  reconnecting: boolean;
  createNode: NodeHelper;
  createText: TextHelper;
  onRetry: () => void;
}): ReconnectBannerRefs {
  const { parent, screenHeight, bottomSafe, reconnecting, createNode, createText, onRetry } = opts;
  const bar = createNode('ReconnectBanner', 375, 667, 424, 52, parent);
  bar.setPosition(0, -screenHeight / 2 + bottomSafe + 40);
  const g = bar.addComponent(Graphics);
  g.fillColor = new Color(28, 17, 10, 228);
  g.roundRect(-212, -26, 424, 52, 26); g.fill();
  g.strokeColor = new Color(216, 170, 88, 215); g.lineWidth = 1.8;
  g.roundRect(-211, -25, 422, 50, 25); g.stroke();

  const dot = createNode('ReconnectDot', 375, 667, 16, 16, bar);
  dot.setPosition(-178, 0);
  const dg = dot.addComponent(Graphics);
  dg.fillColor = new Color('#F5B841'); dg.circle(0, 0, 6); dg.fill();
  const dotOp = dot.addComponent(UIOpacity);

  const txt = createText(reconnecting ? '正在重新连接…' : '网络波动，自动重连中…', 375, 667, 22, '#F7E7C8', 278, 42, bar);
  txt.node.setPosition(-16, 1); txt.enableWrapText = false;

  const retryBtn = createNode('ReconnectTap', 375, 667, 74, 34, bar);
  retryBtn.setPosition(160, 0);
  const rg = retryBtn.addComponent(Graphics);
  rg.fillColor = new Color(216, 170, 88, 45); rg.roundRect(-36, -16, 72, 32, 16); rg.fill();
  rg.strokeColor = new Color(216, 170, 88, 165); rg.lineWidth = 1.2; rg.roundRect(-35, -15, 70, 30, 15); rg.stroke();
  const rl = createText('重试', 375, 667, 20, '#FFD978', 68, 32, retryBtn);
  rl.node.setPosition(0, 1); rl.isBold = true;

  bar.on(Node.EventType.TOUCH_END, onRetry);
  return { bar, dot: dotOp, text: txt };
}

export interface NoticeToastRefs {
  node: Node;
  label: Label;
}

export function renderNoticeToast(opts: {
  parent: Node;
  text: string;
  screenHeight: number;
  layoutTop: number;
  animateIn: boolean;
  motion: boolean;
  createNode: NodeHelper;
  createText: TextHelper;
  onDismiss: () => void;
}): NoticeToastRefs {
  const { parent, text, screenHeight, layoutTop, animateIn, motion, createNode, createText, onDismiss } = opts;
  const spec = toastSpec(text);
  // Clamp horizontally inside 750-wide design canvas with clean side margins for narrow/notched devices.
  const width = Math.min(710, spec.width);
  const height = spec.height;
  const radius = Math.round(height / 2);
  // Anchor cleanly below WeChat capsule + status bar safe region so it never collides with system chrome.
  const restY = screenHeight / 2 - layoutTop - 16 - height / 2;

  const capsule = createNode('NoticeToast', 375, 667, width, height, parent);
  capsule.setPosition(0, restY);
  const g = capsule.addComponent(Graphics);
  g.fillColor = new Color(6, 14, 14, 82);
  g.roundRect(-width / 2, -height / 2 - 4, width, height, radius); g.fill();
  g.fillColor = new Color(28, 17, 11, 232);
  g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
  g.strokeColor = new Color(spec.borderColor); g.lineWidth = 1.8;
  g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius - 1); g.stroke();

  const badgeX = -width / 2 + 28;
  g.fillColor = new Color(spec.badgeColor);
  g.circle(badgeX, 0, 13.5); g.fill();
  g.strokeColor = new Color(255, 245, 220, 145); g.lineWidth = 1.2;
  g.circle(badgeX, 0, 13.5); g.stroke();

  const sym = createText(spec.badgeSymbol, 375, 667, spec.badgeSymbol === '✓' ? 17 : 18, '#FFF8E8', 28, 28, capsule);
  sym.node.setPosition(badgeX, 1); sym.isBold = true; sym.enableWrapText = false;

  const multiLine = height > 60;
  const textW = width - 76;
  const lbl = createText(text, 375, 667, 23, spec.textColor, textW, height - 10, capsule);
  lbl.node.setPosition(17, 1);
  lbl.lineHeight = 28;
  lbl.enableWrapText = multiLine;
  lbl.overflow = multiLine ? Label.Overflow.CLAMP : Label.Overflow.SHRINK;

  capsule.on(Node.EventType.TOUCH_END, onDismiss);
  if (animateIn && motion) {
    const op = capsule.addComponent(UIOpacity);
    op.opacity = 0;
    capsule.setPosition(0, restY + 14);
    tween(op).to(0.18, { opacity: 255 }).start();
    tween(capsule).to(0.2, { position: new Vec3(0, restY, 0) }, { easing: 'quadOut' }).start();
  }
  return { node: capsule, label: lbl };
}

export function dismissNoticeNode(node: Node | undefined, animated: boolean, motion: boolean) {
  if (!node?.isValid) return;
  if (animated && motion) {
    const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    Tween.stopAllByTarget(node); Tween.stopAllByTarget(op);
    tween(node).by(0.18, { position: new Vec3(0, 12, 0) }, { easing: 'quadIn' }).start();
    tween(op).to(0.18, { opacity: 0 }).call(() => {
      if (node.isValid) { node.removeFromParent(); node.destroy(); }
    }).start();
    return;
  }
  node.removeFromParent(); node.destroy();
}

export function createSimpleLayer(name: string, parent: Node, width: number, height: number): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(width, height);
  return node;
}
