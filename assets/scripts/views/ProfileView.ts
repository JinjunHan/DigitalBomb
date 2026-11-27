import { Color, EditBox, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { SpriteEffects } from '../SpriteEffects';
import { bestStepsText, winRateText, type CareerStats } from '../shared/career-stats';
import { AVATARS } from '../shared/protocol';

export interface ProfileSheetOptions {
  nickname: string;
  avatar: number;
  draftAvatarUrl: string;
  stats: CareerStats;
  busy: boolean;
  inMotion: boolean;
  inkColor: string;
  creamColor: string;
  blueColor: string;
  hasAvatarArt: (index: number) => boolean;
  avatarOverride: SpriteFrame | undefined;
  createNode: (name: string, x: number, y: number, w: number, h: number) => Node;
  createBox: (x: number, y: number, w: number, h: number, color?: string, radius?: number) => Node;
  createText: (value: string, x: number, y: number, size?: number, color?: string, width?: number, height?: number) => Label;
  profileSprite: (name: string, x: number, y: number, w: number, h: number, override?: SpriteFrame) => Node | null;
  profileButton: (art: string, label: string, x: number, y: number, w: number, h: number, action: () => void) => Node;
  onClose: () => void;
  onCycleAvatar: () => void;
  onSelectAvatar: (index: number) => void;
  onAuthorizeWechat: () => void;
  onOpenPrivacy: () => void;
  onSave: () => void;
  onBeginEdit: () => void;
  onCancelEdit: (edit: EditBox) => void;
  onDidBeginEdit: () => void;
  onTextChanged: (value: string) => void;
  onDidEndEdit: (edit: EditBox) => void;
}

export interface ProfileSheetRefs {
  paper?: SpriteEffects;
  back: Node;
  editBox: EditBox;
  wechatNode: Node;
}

/** Draw the profile parchment content including nickname editor, avatar selector, and translucent career stats card. */
export function renderProfileSheet(opts: ProfileSheetOptions): ProfileSheetRefs {
  const {
    nickname, avatar, draftAvatarUrl, stats, busy, inMotion,
    inkColor, creamColor, blueColor, hasAvatarArt, avatarOverride,
    createNode, createBox, createText, profileSprite, profileButton,
    onClose, onCycleAvatar, onSelectAvatar, onAuthorizeWechat, onOpenPrivacy, onSave,
    onBeginEdit, onCancelEdit, onDidBeginEdit, onTextChanged, onDidEndEdit,
  } = opts;

  const paperNode = profileSprite('paper', 375, 710, 710, 1090);
  const paper = paperNode ? SpriteEffects.attach(paperNode.getComponent(Sprite)!) : undefined;
  if (!paperNode) createBox(375, 710, 710, 1090, creamColor, 24);
  if (!profileSprite('heading', 375, 146, 300, 89)) createText('个人资料', 375, 146, 40);
  const back = profileButton('back', '返回', 100, 85, 166, 62, onClose);

  // Portrait & quick cycle button
  profileSprite('portrait-background', 375, 304, 276, 276);
  if (!profileSprite('avatar-' + avatar, 375, 304, 166, 166, avatarOverride)) {
    createBox(375, 304, 158, 158, blueColor, 79);
    createText(AVATARS[avatar], 375, 304, 62, creamColor, 134, 104);
  }
  profileSprite('portrait-frame', 375, 304, 204, 204);
  profileButton('change-avatar', '更换头像', 375, 418, 224, 58, onCycleAvatar);

  // Nickname editor
  createText('昵称', 132, 502, 29, inkColor, 90, 52);
  createBox(434, 502, 430, 64, '#EBD1A6', 10);
  profileSprite('input', 434, 502, 430, 66);
  const n = createNode('NicknameInput', 434, 502, 430, 66);
  const eb = n.addComponent(EditBox);
  eb.inputMode = EditBox.InputMode.SINGLE_LINE;
  eb.inputFlag = EditBox.InputFlag.DEFAULT;
  eb.returnType = EditBox.KeyboardReturnType.DONE;
  const label = new Node('Text'); label.layer = Layers.Enum.UI_2D; n.addChild(label);
  const labelTransform = label.addComponent(UITransform); labelTransform.setAnchorPoint(0, 1);
  const l = label.addComponent(Label); l.fontSize = 28; l.lineHeight = 34;
  l.color = new Color(inkColor); l.horizontalAlign = Label.HorizontalAlign.LEFT;
  l.verticalAlign = Label.VerticalAlign.CENTER; l.enableWrapText = false; l.overflow = Label.Overflow.CLAMP;
  eb.textLabel = l; eb.maxLength = -1; eb.string = nickname; eb.enabled = !inMotion && !busy;
  labelTransform.setContentSize(350, 66); label.setPosition(-195, 33);
  n.on(Node.EventType.TOUCH_START, () => { if (eb.enabled) onBeginEdit(); }, undefined, true);
  n.on(Node.EventType.TOUCH_CANCEL, () => onCancelEdit(eb));
  n.on('editing-did-began', () => onDidBeginEdit());
  n.on('text-changed', (edit: EditBox) => onTextChanged(edit.string));
  n.on('editing-did-ended', (edit: EditBox) => onDidEndEdit(edit));
  createText('1–12 个字符', 324, 550, 20, '#8D714E', 220, 32);

  const wechatNode = profileButton('wechat', '使用微信头像昵称', 375, 616, 510, 94, onAuthorizeWechat);

  // Avatar selector row
  createText('—  选择头像  —', 375, 690, 25, inkColor, 500, 38);
  AVATARS.slice(0, 4).forEach((a, i) => {
    const x = 165 + (i % 4) * 140, y = 776;
    const face = profileSprite('avatar-' + i, x, y, 102, 102) ?? createBox(x, y, 100, 100, blueColor, 50);
    if (!hasAvatarArt(i)) createText(a, x, y, 32, creamColor, 72, 62);
    if (!busy && !inMotion) face.on(Node.EventType.TOUCH_END, () => onSelectAvatar(i));
    const frameSize = !draftAvatarUrl && i === avatar ? 128 : 122;
    profileSprite('portrait-frame', x, y, frameSize, frameSize);
    if (!draftAvatarUrl && i === avatar && !profileSprite('avatar-selected', x + 38, y + 36, 46, 46)) {
      createText('✓', x + 37, y + 36, 22, inkColor, 32, 32);
    }
  });

  // Translucent vintage sepia Career Stats Strip (harmonized with paper.png grain!)
  const statsY = 918, statsW = 540, statsH = 116;
  const statsNode = createNode('CareerStatsCard', 375, statsY, statsW, statsH);
  const sg = statsNode.addComponent(Graphics);
  const c = 8, hw = statsW / 2, hh = statsH / 2;
  const drawFrame = (shrink: number) => {
    const w = hw - shrink, h = hh - shrink;
    sg.moveTo(-w + c, h); sg.lineTo(w - c, h); sg.lineTo(w, h - c);
    sg.lineTo(w, -h + c); sg.lineTo(w - c, -h); sg.lineTo(-w + c, -h);
    sg.lineTo(-w, -h + c); sg.lineTo(-w, h - c); sg.close();
  };
  sg.fillColor = new Color(118, 72, 26, 22); drawFrame(0); sg.fill();
  sg.strokeColor = new Color(176, 130, 68, 165); sg.lineWidth = 1.6; drawFrame(1); sg.stroke();
  sg.strokeColor = new Color(176, 130, 68, 110); sg.lineWidth = 1.2;
  for (const dx of [-135, 0, 135]) { sg.moveTo(dx, -20); sg.lineTo(dx, 26); }
  sg.stroke();

  const headerText = stats.dailySolvedCount > 0
    ? `我的战绩  ·  每日一题已破 ${stats.dailySolvedCount} 题${stats.dailyStreak > 1 ? `（连卡 ${stats.dailyStreak} 天）` : ''}`
    : '我的战绩  ·  实局推理记录';
  const hdrLbl = createText(headerText, 375, statsY - 40, 19, '#6E4C28', statsW - 24, 28);
  hdrLbl.isBold = true;

  const metrics: [string, string, number][] = [
    [`${stats.totalGames}`, '总对局', 375 - 202],
    [winRateText(stats), '胜率', 375 - 67],
    [stats.bestStreak > 0 ? `${stats.bestStreak}连` : '—', '最佳连胜', 375 + 67],
    [bestStepsText(stats), '最快破译', 375 + 202],
  ];
  for (const [val, sub, cx] of metrics) {
    const vLbl = createText(val, cx, statsY + 4, 26, '#3B1E08', 120, 34);
    vLbl.isBold = true;
    createText(sub, cx, statsY + 35, 18, '#795937', 120, 26);
  }

  const privacy = createText('隐私保护指引', 375, 1004, 21, '#6A4E2F', 280, 36);
  privacy.node.on(Node.EventType.TOUCH_END, onOpenPrivacy);

  // Strictly tucked inside paper.png's inner gold filigree bottom safe margin!
  profileButton('cancel', '取消', 220, 1084, 232, 86, onClose);
  profileButton('save', '保存修改', 518, 1084, 268, 86, onSave);

  return { paper, back, editBox: eb, wechatNode };
}
