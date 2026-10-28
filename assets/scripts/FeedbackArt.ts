import { Node, Layers, UITransform, Sprite, SpriteFrame, Texture2D, resources, Label, Color } from 'cc';
import { read } from './Platform';
import { FEEDBACK_SIZES } from './shared/feedback-art';
/** Pixel art assets with independent controls and live text. Coordinates are local, top down. */
export class FeedbackArt {
  frames = new Map<string, SpriteFrame>(); ready = false; failed = false; disposed = false;
  constructor(changed: () => void) {
    for (const key of Object.keys(FEEDBACK_SIZES)) resources.load('art/feedback/' + key + '/texture', Texture2D, (error, texture) => {
      if (this.disposed) return;
      if (error) { this.failed = true; changed(); return; }
      const frame = new SpriteFrame(); frame.texture = texture; this.frames.set(key, frame);
      if (this.frames.size === Object.keys(FEEDBACK_SIZES).length) { this.ready = true; changed(); }
    });
  }
  group(parent: Node, name: string, y: number, scale = 1) {
    const node = new Node(name); node.layer = Layers.Enum.UI_2D; parent.addChild(node); node.addComponent(UITransform); node.setPosition(0, y); node.setScale(scale, scale, 1); return node;
  }
  image(parent: Node, key: string, x: number, y: number, width: number, action?: () => void) {
    const size = FEEDBACK_SIZES[key]; const height = width * size[1] / size[0];
    const node = this.group(parent, 'FeedbackArt-' + key, -y); node.setPosition(x, -y);
    const sprite = node.addComponent(Sprite); sprite.spriteFrame = this.frames.get(key)!; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    node.getComponent(UITransform)!.setContentSize(width, height);
    if (action) {
      node.on(Node.EventType.TOUCH_START, () => { if (read('motion','1') === '1') node.setScale(.98,.98,1); });
      node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1,1,1));
      node.on(Node.EventType.TOUCH_END, () => { node.setScale(1,1,1); action(); });
    }
    return node;
  }
  label(parent: Node, text: string, x: number, y: number, width: number, height: number, size = 26, color = '#352719') {
    const node = this.group(parent, 'FeedbackText', -y); node.setPosition(x, -y);node.getComponent(UITransform)!.setContentSize(width, height);
    const label = node.addComponent(Label); label.string = text; label.fontFamily = 'Georgia, Songti SC, serif'; label.fontSize = size; label.lineHeight = size * 1.3; label.color = new Color(color); label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER; label.overflow = Label.Overflow.SHRINK;
    return label;
  }
}
