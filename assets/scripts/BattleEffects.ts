import { Color, Graphics, Label, Layers, Node, Tween, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { read } from './Platform';

export type ParticleMode = 'warm' | 'hot' | 'crack' | 'confetti';

const REST_POS = new WeakMap<Node, Vec3>();

function motionOn() {
  return read('motion', '1') === '1';
}

/** Lightweight procedural bursts (sparks & gold foil) with zero extra texture footprint. */
export function burstParticles(parent: Node, x: number, y: number, mode: ParticleMode) {
  if (!parent.isValid || !motionOn()) return;
  const host = new Node('ParticleBurst-' + mode);
  host.layer = Layers.Enum.UI_2D;
  parent.addChild(host);
  host.addComponent(UITransform);
  host.setPosition(x, y, 0);

  const palettes: Record<ParticleMode, string[]> = {
    warm: ['#FFE299', '#F4BA54', '#FFF3CF'],
    hot: ['#FFD460', '#FF8E3C', '#FFF2B8', '#E54B2A'],
    crack: ['#FFE985', '#F7B538', '#FFF8DC', '#D94F2A', '#FFD15C'],
    confetti: ['#FFE17D', '#F2AD3E', '#FFF3C4', '#D95B30', '#E8C163'],
  };
  const colors = palettes[mode];
  const count = mode === 'warm' ? 10 : mode === 'hot' ? 18 : mode === 'crack' ? 26 : 24;

  for (let i = 0; i < count; i++) {
    const p = new Node('P' + i);
    p.layer = Layers.Enum.UI_2D;
    host.addChild(p);
    const size = mode === 'confetti' ? 9 + (i % 4) * 3 : mode === 'crack' ? 7 + (i % 4) * 2.5 : 6 + (i % 3) * 2;
    p.addComponent(UITransform).setContentSize(size * 2, size * 2);
    const g = p.addComponent(Graphics);
    g.fillColor = new Color(colors[i % colors.length]);
    if (mode === 'confetti' || (mode === 'crack' && i % 2 === 0)) {
      g.roundRect(-size * 0.75, -size * 0.42, size * 1.5, size * 0.84, 2);
    } else {
      // 4-point star / diamond spark
      g.moveTo(0, size);
      g.lineTo(size * 0.55, 0);
      g.lineTo(0, -size);
      g.lineTo(-size * 0.55, 0);
      g.close();
    }
    g.fill();
    const op = p.addComponent(UIOpacity);

    if (mode === 'confetti') {
      const startX = (i / (count - 1) - 0.5) * 620 + ((i * 73) % 44 - 22);
      const startY = 80 + ((i * 37) % 120);
      const sway = (i % 2 === 0 ? 1 : -1) * (34 + (i * 19) % 42);
      const drop = 420 + (i * 41) % 240;
      const delay = (i % 6) * 0.06;
      const dur = 1.65 + (i % 5) * 0.22;
      p.setPosition(startX, startY, 0);
      p.angle = (i * 47) % 360;
      op.opacity = 0;
      tween(op).delay(delay).to(0.18, { opacity: 245 }).delay(dur - 0.55).to(0.38, { opacity: 0 }).start();
      tween(p)
        .delay(delay)
        .to(dur * 0.5, { position: new Vec3(startX + sway, startY - drop * 0.48, 0), angle: p.angle + (i % 2 === 0 ? 180 : -180) }, { easing: 'sineInOut' })
        .to(dur * 0.5, { position: new Vec3(startX - sway * 0.4, startY - drop, 0), angle: p.angle + (i % 2 === 0 ? 380 : -380) }, { easing: 'quadIn' })
        .start();
    } else {
      const angle = (Math.PI * 2 * i) / count + ((i * 29) % 17 - 8) * 0.03;
      const speed = (mode === 'crack' ? 155 : mode === 'hot' ? 120 : 85) + (i * 23) % 75;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed + (mode === 'crack' ? 28 : 16);
      const dur = mode === 'crack' ? 0.78 + (i % 4) * 0.08 : mode === 'hot' ? 0.56 + (i % 3) * 0.07 : 0.42;
      p.setPosition(0, 0, 0);
      p.setScale(0.45, 0.45, 1);
      p.angle = (angle * 180) / Math.PI;
      op.opacity = 255;
      tween(p)
        .to(dur * 0.45, { position: new Vec3(dx * 0.72, dy * 0.78, 0), scale: new Vec3(1.1, 1.1, 1), angle: p.angle + 70 }, { easing: 'quadOut' })
        .to(dur * 0.55, { position: new Vec3(dx, dy - 38, 0), scale: new Vec3(0.35, 0.35, 1), angle: p.angle + 150 }, { easing: 'quadIn' })
        .start();
      tween(op).delay(dur * 0.48).to(dur * 0.52, { opacity: 0 }).start();
    }
  }

  const lifetime = mode === 'confetti' ? 3.2 : mode === 'crack' ? 1.2 : 0.9;
  tween(host).delay(lifetime).call(() => { if (host.isValid) host.destroy(); }).start();
}

/** Damped screen/container shake that always snaps back to its recorded rest position. */
export function shakeNode(node: Node, amplitude: number) {
  if (!node.isValid || !motionOn() || amplitude <= 0) return;
  let rest = REST_POS.get(node);
  if (!rest) {
    rest = node.position.clone();
    REST_POS.set(node, rest);
  }
  Tween.stopAllByTarget(node);
  node.setPosition(rest);
  const a = amplitude;
  tween(node)
    .to(0.04, { position: new Vec3(rest.x - a, rest.y + a * 0.35, rest.z) })
    .to(0.05, { position: new Vec3(rest.x + a * 0.9, rest.y - a * 0.3, rest.z) })
    .to(0.05, { position: new Vec3(rest.x - a * 0.55, rest.y + a * 0.2, rest.z) })
    .to(0.05, { position: new Vec3(rest.x + a * 0.3, rest.y - a * 0.1, rest.z) })
    .to(0.05, { position: rest.clone() })
    .start();
}

/** Floating celebratory pill (e.g. "+1 ↑") that pops up and drifts upward cleanly. */
export function floatDeltaBadge(parent: Node, text: string, x: number, y: number, bg = '#B42A1B', fg = '#FFF7DE') {
  if (!parent.isValid || !text) return;
  const node = new Node('DeltaBadge');
  node.layer = Layers.Enum.UI_2D;
  parent.addChild(node);
  const w = Math.max(106, text.length * 26 + 34), h = 46;
  node.addComponent(UITransform).setContentSize(w, h);
  node.setPosition(x, y, 0);
  const g = node.addComponent(Graphics);
  g.fillColor = new Color(bg);
  g.roundRect(-w / 2, -h / 2, w, h, h / 2);
  g.fill();
  g.strokeColor = new Color('#FFD770');
  g.lineWidth = 2.4;
  g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, h / 2);
  g.stroke();

  const labelNode = new Node('Label');
  labelNode.layer = Layers.Enum.UI_2D;
  node.addChild(labelNode);
  labelNode.addComponent(UITransform).setContentSize(w - 16, h - 4);
  const label = labelNode.addComponent(Label);
  label.string = text;
  label.fontFamily = 'Helvetica Neue, Roboto, Arial, Songti SC, Noto Serif CJK SC, serif';
  label.fontSize = 26;
  label.lineHeight = 32;
  label.isBold = true;
  label.color = new Color(fg);
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;

  const op = node.addComponent(UIOpacity);
  if (!motionOn()) {
    tween(op).delay(1.1).call(() => { if (node.isValid) node.destroy(); }).start();
    return;
  }
  node.setScale(0.55, 0.55, 1);
  op.opacity = 0;
  tween(op).to(0.12, { opacity: 255 }).delay(0.72).to(0.32, { opacity: 0 }).call(() => { if (node.isValid) node.destroy(); }).start();
  tween(node)
    .to(0.18, { scale: new Vec3(1.14, 1.14, 1), position: new Vec3(x, y + 18, 0) }, { easing: 'backOut' })
    .to(0.12, { scale: Vec3.ONE })
    .to(0.84, { position: new Vec3(x, y + 58, 0) }, { easing: 'quadOut' })
    .start();
}

/** 2D horizontal flip reveal used on result password cards and table-top crack finale. */
export function flipRevealCard(card: Node, onMidpoint: () => void, delay = 0) {
  if (!card.isValid) return;
  if (!motionOn()) {
    onMidpoint();
    return;
  }
  const baseScale = card.scale.clone();
  tween(card)
    .delay(delay)
    .to(0.11, { scale: new Vec3(0.04 * baseScale.x, baseScale.y * 1.04, 1) }, { easing: 'quadIn' })
    .call(() => { if (card.isValid) onMidpoint(); })
    .to(0.18, { scale: new Vec3(baseScale.x * 1.06, baseScale.y * 1.06, 1) }, { easing: 'quadOut' })
    .to(0.1, { scale: baseScale })
    .start();
}
