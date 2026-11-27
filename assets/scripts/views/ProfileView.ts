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

  const paperNode = profileSprite('paper', 375, 715, 710, 1080);
  const paper = paperNode ? SpriteEffects.attach(paperNode.getComponent(Sprite)!) : undefined;
  if (!paperNode) createBox(375, 715, 710, 1080, creamColor, 24);
  if (!profileSprite('heading', 375, 152, 300, 89)) createText('个人资料', 375, 152, 40);
  const back = profileButton('back', '返回', 100, 85, 166, 62, onClose);

  // Portrait & quick cycle button
  profileSprite('portrait-background', 375, 326, 290, 290);
  if (!profileSprite('avatar-' + avatar, 375, 326, 174, 174, avatarOverride)) {
    createBox(375, 326, 166, 166, blueColor, 83);
    createText(AVATARS[avatar], 375, 326, 66, creamColor, 140, 110);
  }
  profileSprite('portrait-frame', 375, 326, 214, 214);
  profileButton('change-avatar', '更换头像', 375, 444, 232, 60, onCycleAvatar);

  // Nickname editor
  createText('昵称', 132, 536, 30, inkColor, 90, 56);
  createBox(434, 536, 430, 68, '#EBD1A6', 10);
  profileSprite('input', 434, 536, 430, 70);
  const n = createNode('NicknameInput', 434, 536, 430, 70);
  const eb = n.addComponent(EditBox);
  eb.inputMode = EditBox.InputMode.SINGLE_LINE;
  eb.inputFlag = EditBox.InputFlag.DEFAULT;
  eb.returnType = EditBox.KeyboardReturnType.DONE;
  const label = new Node('Text'); label.layer = Layers.Enum.UI_2D; n.addChild(label);
  const labelTransform = label.addComponent(UITransform); labelTransform.setAnchorPoint(0, 1);
  const l = label.addComponent(Label); l.fontSize = 29; l.lineHeight = 36;
  l.color = new Color(inkColor); l.horizontalAlign = Label.HorizontalAlign.LEFT;
  l.verticalAlign = Label.VerticalAlign.CENTER; l.enableWrapText = false; l.overflow = Label.Overflow.CLAMP;
  eb.textLabel = l; eb.maxLength = -1; eb.string = nickname; eb.enabled = !inMotion && !busy;
  labelTransform.setContentSize(350, 70); label.setPosition(-195, 35);
  n.on(Node.EventType.TOUCH_START, () => { if (eb.enabled) onBeginEdit(); }, undefined, true);
  n.on(Node.EventType.TOUCH_CANCEL, () => onCancelEdit(eb));
  n.on('editing-did-began', () => onDidBeginEdit());
  n.on('text-changed', (edit: EditBox) => onTextChanged(edit.string));
  n.on('editing-did-ended', (edit: EditBox) => onDidEndEdit(edit));
  createText('1–12 个字符', 324, 588, 21, '#8D714E', 220, 36);

  const wechatNode = profileButton('wechat', '使用微信头像昵称', 375, 658, 520, 102, onAuthorizeWechat);

  // Avatar selector row
  createText('—  选择头像  —', 375, 738, 26, inkColor, 520, 44);
  AVATARS.slice(0, 4).forEach((a, i) => {
    const x = 165 + (i % 4) * 140, y = 832;
    const face = profileSprite('avatar-' + i, x, y, 108, 108) ?? createBox(x, y, 106, 106, blueColor, 53);
    if (!hasAvatarArt(i)) createText(a, x, y, 34, creamColor, 76, 66);
    if (!busy && !inMotion) face.on(Node.EventType.TOUCH_END, () => onSelectAvatar(i));
    const frameSize = !draftAvatarUrl && i === avatar ? 136 : 130;
    profileSprite('portrait-frame', x, y, frameSize, frameSize);
    if (!draftAvatarUrl && i === avatar && !profileSprite('avatar-selected', x + 40, y + 38, 50, 50)) {
      createText('✓', x + 39, y + 38, 24, inkColor, 34, 34);
    }
  });

  // Translucent vintage sepia Career Stats Strip (harmonized with paper.png grain!)
  const statsY = 986, statsW = 548, statsH = 128;
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
  for (const dx of [-137, 0, 137]) { sg.moveTo(dx, -22); sg.lineTo(dx, 28); }
  sg.stroke();

  const headerText = stats.dailySolvedCount > 0
    ? `我的战绩  ·  每日一题已破 ${stats.dailySolvedCount} 题${stats.dailyStreak > 1 ? `（连卡 ${stats.dailyStreak} 天）` : ''}`
    : '我的战绩  ·  实局推理记录';
  const hdrLbl = createText(headerText, 375, statsY - 44, 20, '#6E4C28', statsW - 24, 30);
  hdrLbl.isBold = true;

  const metrics: [string, string, number][] = [
    [`${stats.totalGames}`, '总对局', 375 - 205],
    [winRateText(stats), '胜率', 375 - 68],
    [stats.bestStreak > 0 ? `${stats.bestStreak}连` : '—', '最佳连胜', 375 + 68],
    [bestStepsText(stats), '最快破译', 375 + 205],
  ];
  for (const [val, sub, cx] of metrics) {
    const vLbl = createText(val, cx, statsY + 4, 28, '#3B1E08', 124, 38);
    vLbl.isBold = true;
    createText(sub, cx, statsY + 38, 19, '#795937', 124, 28);
  }

  const privacy = createText('隐私保护指引', 375, 1084, 22, '#6A4E2F', 280, 40);
  privacy.node.on(Node.EventType.TOUCH_END, onOpenPrivacy);

  profileButton('cancel', '取消', 210, 1184, 248, 94, onClose);
  profileButton('save', '保存修改', 526, 1184, 286, 94, onSave);

  return { paper, back, editBox: eb, wechatNode };
}
