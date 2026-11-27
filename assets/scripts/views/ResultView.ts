import { Color, Font, Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3, tween } from 'cc';
import type { FeedbackArt } from '../FeedbackArt';
import { SpriteEffects } from '../SpriteEffects';
import { burstParticles, flipRevealCard } from '../BattleEffects';
import { formatMatchDuration } from '../shared/battle-feedback';
import { cancellationArt, resultCaption } from '../shared/feedback-state';
import type { Profile, RoomView } from '../shared/protocol';

export interface ResultViewOptions {
  root: Node;
  effects: Node;
  room: RoomView;
  me: Profile;
  screenHeight: number;
  layoutTop: number;
  bottomSafe: number;
  busy: boolean;
  shouldAnimate: boolean;
  feedbackArt: FeedbackArt;
  cardPaper: SpriteFrame | null;
  friendDigitFont?: Font;
  inkColor: string;
  bindPressEffect: (node: Node) => void;
  addCardDigit: (parent: Node, char: string, x: number, y: number, height: number, tone: 'ink' | 'crimson') => Node;
  playerPortrait: (parent: Node, profile: { avatar: number; avatarUrl?: string }, x: number, y: number, size: number) => void;
  playTap: () => void;
  onUnlockAudio: () => void;
  onRecords: () => void;
  onShare: () => void;
  onReturnToRoom: () => void;
  onRematch: () => void;
  onHome: () => void;
}

export function renderResultView(opts: ResultViewOptions) {
  const {
    root, effects, room: r, me, screenHeight, layoutTop, bottomSafe, busy, shouldAnimate,
    feedbackArt, cardPaper, friendDigitFont, inkColor, bindPressEffect, addCardDigit,
    playerPortrait, playTap, onUnlockAudio, onRecords, onShare, onReturnToRoom, onRematch, onHome,
  } = opts;

  const meId = me.id, win = r.result?.winner === meId, draw = !r.result?.winner;
  const available = screenHeight - layoutTop - bottomSafe - 20;
  const scale = Math.min(750 / 941, available / 1410);
  const group = feedbackArt.group(root, 'ArtResult', screenHeight / 2 - layoutTop - (available - 1410 * scale) / 2, scale);

  const touch = (node: Node, fn: () => void) => {
    bindPressEffect(node);
    node.on(Node.EventType.TOUCH_START, () => node.setScale(0.97, 0.97, 1));
    node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
    node.on(Node.EventType.TOUCH_END, () => {
      node.setScale(1, 1, 1);
      onUnlockAudio();
      playTap();
      fn();
    });
  };
  const art = (name: string, x: number, y: number, width: number, fn?: () => void, parent = group) => {
    const node = feedbackArt.image(parent, name, x, y, width, fn ? () => { onUnlockAudio(); playTap(); fn(); } : undefined);
    if (fn) bindPressEffect(node);
    return node;
  };
  const label = (text: string, x: number, y: number, width: number, height: number, size: number, color = inkColor, parent = group) =>
    feedbackArt.label(parent, text, x, y, width, height, size, color);
  const shortName = (name: string, limit: number) =>
    Array.from(name).length > limit ? Array.from(name).slice(0, limit - 1).join('') + '…' : name;

  if (r.phase === 'cancelled') {
    art(cancellationArt(r.result?.reason), 0, 620, 700);
    art('home', 0, 910, 410, onHome);
    return;
  }

  // 1. Unified open outcome header
  const headerGroup = feedbackArt.group(group, 'ResultHeader', 0);
  let titleSprite: Sprite | null = null;
  if (win) {
    const titleNode = art('victory-title', 0, 174, 670, undefined, headerGroup);
    titleSprite = titleNode.getComponent(Sprite);
    const cap = label(resultCaption(r, meId), 0, 297, 420, 44, 26, '#FFF0C8', headerGroup);
    cap.isBold = true;
  } else if (!draw) {
    const titleNode = art('defeat-title', 0, 178, 740, undefined, headerGroup);
    titleSprite = titleNode.getComponent(Sprite);
    label(resultCaption(r, meId), 0, 299, 460, 44, 26, inkColor, headerGroup);
  } else {
    const titleNode = art('draw-title', 0, 146, 470, undefined, headerGroup);
    titleSprite = titleNode.getComponent(Sprite);
    const pill = feedbackArt.group(headerGroup, 'DrawReasonPill', -332);
    const pg = pill.addComponent(Graphics);
    pg.fillColor = new Color('#261A13'); pg.roundRect(-220, -23, 440, 46, 23); pg.fill();
    pg.strokeColor = new Color('#D8A856'); pg.lineWidth = 2.2; pg.roundRect(-219, -22, 438, 44, 22); pg.stroke();
    const cap = label(resultCaption(r, meId), 0, 330, 410, 40, 24, '#FFF0C8', headerGroup);
    cap.isBold = true;
  }

  // 2. Single clean parchment recap card with translucent vintage sepia bands (matching deduction ledger!)
  const cardGroup = feedbackArt.group(group, 'ResultCard', 0);
  art('result-paper', 0, 788, 816, undefined, cardGroup);

  const peer = r.players.find(p => p.id !== meId);
  const digitCount = r.digitCount ?? 4;
  const guessCount = (id: string) => r.history.filter(h => h.playerId === id && h.digits !== null).length;
  const cardW = digitCount === 2 ? 108 : digitCount === 3 ? 98 : 90;
  const cardH = Math.round(cardW * 1.32);
  const gap = digitCount === 2 ? 26 : digitCount === 3 ? 18 : 13;
  const step = cardW + gap;

  const drawPaperBand = (y: number, h: number, fill: Color, stroke: Color, lineWidth: number) => {
    const band = feedbackArt.group(cardGroup, 'ResultBand', -y);
    const bg = band.addComponent(Graphics);
    const w = 668, c = 8;
    const drawChamfer = (shrink: number) => {
      const hw = w / 2 - shrink, hh = h / 2 - shrink;
      bg.moveTo(-hw + c, hh); bg.lineTo(hw - c, hh); bg.lineTo(hw, hh - c);
      bg.lineTo(hw, -hh + c); bg.lineTo(hw - c, -hh); bg.lineTo(-hw + c, -hh);
      bg.lineTo(-hw, -hh + c); bg.lineTo(-hw, hh - c); bg.close();
    };
    bg.fillColor = fill; drawChamfer(0); bg.fill();
    bg.strokeColor = stroke; bg.lineWidth = lineWidth; drawChamfer(1); bg.stroke();
  };

  // Row 1 (Primary Focus): Opponent's revealed password
  drawPaperBand(620, 162, new Color(172, 102, 28, 26), new Color(192, 136, 62, 180), 1.9);
  if (peer) playerPortrait(cardGroup, peer, -276, -620, 76);
  const oppTag = label('对手密码', -176, 600, 134, 38, 26, '#962B12', cardGroup);
  oppTag.isBold = true;
  label(shortName(peer?.name ?? '对手', 6), -176, 640, 138, 34, 21, '#5D4329', cardGroup);
  const oppSecret = r.revealed?.[peer?.id ?? ''] ?? '';
  for (let i = 0; i < digitCount; i++) {
    const cx = 122 + (i - (digitCount - 1) / 2) * step;
    const card = feedbackArt.group(cardGroup, 'ResultOppDigit-' + i, -620);
    card.setPosition(cx, -620);
    const sp = card.addComponent(Sprite);
    sp.spriteFrame = cardPaper; sp.sizeMode = Sprite.SizeMode.CUSTOM;
    card.getComponent(UITransform)!.setContentSize(cardW, cardH);
    const digitNode = addCardDigit(card, oppSecret[i] ?? '—', 0, 0, Math.round(cardH * 0.66), win ? 'crimson' : 'ink');
    if (shouldAnimate) {
      sp.color = new Color('#2A4A64');
      digitNode.active = false;
      flipRevealCard(card, () => {
        sp.color = Color.WHITE;
        digitNode.active = true;
        playTap();
      }, 0.22 + i * 0.085);
    }
  }

  // Row 2 (Secondary Reference): Player's own secret
  drawPaperBand(796, 146, new Color(116, 70, 26, 16), new Color(176, 134, 78, 145), 1.5);
  playerPortrait(cardGroup, me, -276, -796, 68);
  const ownTag = label('我的底牌', -176, 778, 134, 36, 24, inkColor, cardGroup);
  ownTag.isBold = true;
  label(shortName(me.name, 6), -176, 814, 138, 32, 20, '#6F563C', cardGroup);
  const mySecret = r.ownSecret ?? '';
  const ownW = cardW - 6, ownH = Math.round(ownW * 1.3);
  for (let i = 0; i < digitCount; i++) {
    const cx = 122 + (i - (digitCount - 1) / 2) * step;
    const card = feedbackArt.group(cardGroup, 'ResultOwnDigit-' + i, -796);
    card.setPosition(cx, -796);
    const sp = card.addComponent(Sprite);
    sp.spriteFrame = cardPaper; sp.sizeMode = Sprite.SizeMode.CUSTOM;
    card.getComponent(UITransform)!.setContentSize(ownW, ownH);
    addCardDigit(card, mySecret[i] ?? '—', 0, 0, Math.round(ownH * 0.66), 'ink');
  }

  // Row 3: Compact 3-column horizontal translucent stats strip
  drawPaperBand(946, 92, new Color(116, 70, 26, 20), new Color(176, 134, 78, 145), 1.5);
  const divNode = feedbackArt.group(cardGroup, 'ResultStatDividers', -946);
  const sg = divNode.addComponent(Graphics);
  sg.strokeColor = new Color(176, 134, 78, 145); sg.lineWidth = 1.4;
  for (const dx of [-112, 112]) { sg.moveTo(dx, -26); sg.lineTo(dx, 26); }
  sg.stroke();

  const duration = formatMatchDuration(r.startAt, r.endedAt);
  const cols: [string, string, number][] = [
    [`${guessCount(meId)} 次`, '我的猜测', -224],
    [`${guessCount(peer?.id ?? '')} 次`, '对手猜测', 0],
    duration
      ? [duration, `${digitCount}位 · 第${r.round}轮`, 224]
      : [`第 ${r.round} 轮`, `${digitCount} 位密码`, 224],
  ];
  for (const [val, sub, cx] of cols) {
    const vLbl = label(val, cx, 932, 200, 44, 33, inkColor, cardGroup);
    if (/^[0-9:]+$/.test(val) && friendDigitFont) { vLbl.font = friendDigitFont; vLbl.lineHeight = 38; }
    else vLbl.isBold = true;
    label(sub, cx, 972, 204, 32, 20, '#73583B', cardGroup);
  }

  // Symmetrical twin pills tucked cleanly inside lower parchment: [本局记录] + [分享战绩]
  const drawSubPill = (name: string, text: string, cx: number, fill: Color, stroke: Color, textColor: string, fn: () => void) => {
    const pill = feedbackArt.group(cardGroup, name, -1076);
    pill.setPosition(cx, -1076);
    pill.getComponent(UITransform)!.setContentSize(284, 62);
    const pg = pill.addComponent(Graphics);
    pg.fillColor = fill; pg.roundRect(-142, -31, 284, 62, 31); pg.fill();
    pg.strokeColor = stroke; pg.lineWidth = 2; pg.roundRect(-141, -30, 282, 60, 30); pg.stroke();
    const lbl = label(text, 0, 2, 250, 44, 25, textColor, pill);
    lbl.isBold = true;
    touch(pill, fn);
    return pill;
  };
  drawSubPill('ResultRecordsPill', '查看本局记录', -158, new Color(116, 70, 26, 26), new Color(172, 126, 66, 175), '#4A2B11', onRecords);
  drawSubPill('ResultSharePill', win ? '晒战绩 · 邀好友' : '分享本局战绩', 158, new Color(45, 118, 72, 232), new Color('#DFB362'), '#FFF5DC', onShare);

  // 3. Unified bottom action bar
  const actionGroup = feedbackArt.group(group, 'ResultActions', 0);
  let primaryBtnSprite: Sprite | null = null;
  if (r.mode === 'friend') {
    const backBtn = art('rematch', 0, 1292, 620, () => { if (!busy) onReturnToRoom(); }, actionGroup);
    if (busy) backBtn.addComponent(UIOpacity).opacity = 150;
    primaryBtnSprite = backBtn.getComponent(Sprite);
    const backLbl = label('确认 · 返回房间', 0, 0, 520, 76, 36, '#FFF5DC', backBtn);
    backLbl.isBold = true;
  } else {
    const matchBtn = art('match', -200, 1292, 376, () => { if (!busy) onRematch(); }, actionGroup);
    if (busy) matchBtn.addComponent(UIOpacity).opacity = 150;
    primaryBtnSprite = matchBtn.getComponent(Sprite);
    art('result-home', 200, 1292, 370, onHome, actionGroup);
  }

  // 4. Choreographed entrance & victory gold foil confetti
  if (shouldAnimate) {
    const hOp = headerGroup.addComponent(UIOpacity); hOp.opacity = 0;
    headerGroup.setScale(0.82, 0.82, 1);
    tween(hOp).to(0.22, { opacity: 255 }).start();
    tween(headerGroup).to(0.28, { scale: Vec3.ONE }, { easing: 'backOut' }).call(() => {
      if (titleSprite?.isValid) SpriteEffects.attach(titleSprite).sweep();
    }).start();

    const cOp = cardGroup.addComponent(UIOpacity); cOp.opacity = 0;
    cardGroup.setPosition(0, -24);
    tween(cOp).delay(0.08).to(0.24, { opacity: 255 }).start();
    tween(cardGroup).delay(0.08).to(0.28, { position: Vec3.ZERO }, { easing: 'quadOut' }).start();

    const aOp = actionGroup.addComponent(UIOpacity); aOp.opacity = 0;
    actionGroup.setPosition(0, -18);
    tween(aOp).delay(0.32).to(0.22, { opacity: 255 }).start();
    tween(actionGroup).delay(0.32).to(0.24, { position: Vec3.ZERO }, { easing: 'quadOut' }).call(() => {
      if (primaryBtnSprite?.isValid) SpriteEffects.attach(primaryBtnSprite).sweep();
    }).start();

    if (win) burstParticles(effects, 0, screenHeight * 0.2, 'confetti');
  }
}
