import { _decorator, Component, Node, UITransform, Label, Graphics, Color, Layers, view, ResolutionPolicy, resources, SpriteFrame, Sprite, Texture2D, profiler, tween, Tween, UIOpacity, Vec3, EditBox, input, Input, EventKeyboard, KeyCode, game, Game, BlockInputEvents, ScrollView, Mask, Vec2 } from 'cc';
import { SceneBackdrop } from './SceneBackdrop';
import { InputEditSession } from './shared/input-edit-session';
import { profileTransition } from './shared/profile-transition';
import { GameAudio } from './GameAudio';
import { Connection } from './Connection';
import { AVATARS, type RoomView } from './shared/protocol';
import { read, write, copy, vibrate, topSafeInset, bottomSafeInset, wechat } from './Platform';
const { ccclass } = _decorator;
const C = { ink: '#352719', cream: '#F7E7C8', paper: '#EAD5AC', gold: '#D8AA58', teal: '#173E3C', dark: '#102D2C', muted: '#C3C8B6', orange: '#D96A32', blue: '#2A4656' };
const reasons: Record<string, string> = { same_round: '同轮破解，旗鼓相当', reply_missed: '后手补猜未命中', reply_timeout: '后手补猜超时', cracked: '四位密码全部破解', round_limit: '20 轮挑战完成', timeout: '连续两次行动超时', disconnect: '对方未能重新连接', resigned: '一方认输', prepare_timeout: '准备超时，本局不计胜负', room_expired: '房间已过期', player_left: '玩家离开，本局已取消', both_offline: '双方掉线，本局不计胜负' };

@ccclass('GameApp')
export class GameApp extends Component {
  private audio!: GameAudio;
  private net = new Connection(); private root!: Node; private scenery!: SceneBackdrop;
  private effects!: Node; private seenGuesses = 0; private submitting = false;
  private lobbyArt = new Map<string, SpriteFrame>();
  private profileArt = new Map<string, SpriteFrame>();
  private profilePanel?: Node;
  private profileBack?: Node;
  private profileBackRest = new Vec3();
  private profileFit = 1;
  private transitionLobby?: Node;
  private profileMotion: '' | 'in' | 'out' = '';
  private profileMotionElapsed = 0;
  private profileMotionFrames = 0;
  private profileMotionFrom?: { position: Vec3; angle: number };
  private profileMotionTo?: { position: Vec3; angle: number };
  private opponentArt: SpriteFrame | null = null;
  private page = 'lobby'; private overlay = ''; private draft = ''; private code = ''; private selected = -1;
  private recordsOpponent = false;
  private recordScrolls: { view: ScrollView; key: string }[] = [];
  private recordPositions = new Map<string, { offset: number; bottom: boolean }>();
  private nicknameSession = new InputEditSession();
  private nicknameEditBox?: EditBox;
  private nicknameEditingBegan = false;
  private nickname = ''; private avatar = 0; private busy = false; private notice = ''; private noticeUntil = 0;
  private timerLabel?: Label; private toastLabel?: Label; private lastKey = ''; private lastRoom = ''; private lastPhase = ''; private lastTurn = -1; private warnedTurn = -1; private openingRendered = false;
  private confirmAction?: () => void; private confirmText = ''; private hideSecret = false;
  private screenHeight = 1334; private layoutTop = 80; private layoutScale = 1;
  private resizeLayout = () => {
    if (this.nicknameSession.deferResize()) return;
    this.screenHeight = view.getVisibleSize().height;
    this.layoutTop = topSafeInset() + 16;
    this.layoutScale = (this.screenHeight - this.layoutTop - bottomSafeInset() - 24) / 1274;
    this.root?.getComponent(UITransform)?.setContentSize(750, this.screenHeight);
    this.effects?.getComponent(UITransform)?.setContentSize(750, this.screenHeight);
    this.scenery?.resize(this.screenHeight);
    this.clearEffects(); this.render();
  };
  onLoad() {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
    this.scenery = new SceneBackdrop(this.node);
    this.root = new Node('Interface'); this.node.addChild(this.root); this.root.layer = Layers.Enum.UI_2D; this.root.addComponent(UITransform).setContentSize(750, 1334);
    this.effects = new Node('FeedbackLayer'); this.effects.layer = Layers.Enum.UI_2D; this.node.addChild(this.effects); this.effects.addComponent(UITransform).setContentSize(750, 1334);
    this.audio = new GameAudio(this.node);
    this.net.onState = () => this.stateChanged(); this.net.onStatus = () => this.render(); this.net.onError = s => this.toast(s);
    resources.load('art/opponent/texture', Texture2D, (err, texture) => { if (!err) { const sf = new SpriteFrame(); sf.texture = texture; this.opponentArt = sf; this.render(); } });
    for (const name of ['title', 'machine', 'match-full', 'friend-full', 'help-full', 'settings-full', 'sound-full', 'avatar-frame', 'nickname-frame']) {
      resources.load('art/lobby/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || !this.isValid) return;
        const sf = new SpriteFrame(); sf.texture = texture; this.lobbyArt.set(name, sf); this.render();
      });
    }
    for (const name of ['portrait-frame', 'portrait-background', 'avatar-selected', 'paper', 'back', 'heading', 'change-avatar', 'wechat', 'cancel', 'save', 'input', 'avatar-0', 'avatar-1', 'avatar-2', 'avatar-3']) {
      resources.load('art/profile/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || !this.isValid) return;
        const sf = new SpriteFrame(); sf.texture = texture; this.profileArt.set(name, sf); this.render();
      });
    }
    profiler.hideStats();
    input.on(Input.EventType.KEY_DOWN, this.onKey, this); game.on(Game.EVENT_SHOW, this.onShow, this); game.on(Game.EVENT_HIDE, this.onHide, this);
    view.on('canvas-resize', this.resizeLayout, this);
    this.resizeLayout(); this.connect(); this.schedule(this.updateTimer, 0.2);
  }
  onDestroy() { this.scenery?.destroy(); view.off('canvas-resize', this.resizeLayout, this); this.audio.dispose(); if (this.profilePanel) Tween.stopAllByTarget(this.profilePanel); this.clearEffects(); this.net.stop(); input.off(Input.EventType.KEY_DOWN, this.onKey, this); game.off(Game.EVENT_SHOW, this.onShow, this); game.off(Game.EVENT_HIDE, this.onHide, this); }
  private onHide() { this.audio.background(true); }
  private onShow() { this.audio.background(false); if (this.net.online) this.net.command('sync').catch(() => {}); }
  private async connect() { try { await this.net.start(); } catch (e) { this.toast((e as Error).message); } }
  private stateChanged() {
    const s = this.net.state!, r = s.room;
    const sameRoom = !!r && r.id === this.lastRoom, oldTurn = this.lastTurn, oldPhase = this.lastPhase;
    const fresh = sameRoom && r.history.length > this.seenGuesses ? r.history[r.history.length - 1] : undefined;
    if (!sameRoom && r && r.phase === 'preparing') this.audio.play('ready');
    if (!sameRoom) { this.clearEffects(); this.submitting = false; }
    this.seenGuesses = r?.history.length ?? 0;
    if ((r?.id ?? '') !== this.lastRoom) { this.draft = ''; this.recordScrolls = []; this.recordPositions.clear(); this.recordsOpponent = false; this.overlay = ''; this.lastRoom = r?.id ?? ''; this.lastTurn = -1; }
    if (r && r.turn !== this.lastTurn) { this.draft = ''; this.selected = -1; this.lastTurn = r.turn; this.openingRendered = false; }
    if (r && this.lastPhase === 'preparing' && r.phase === 'playing') { this.draft = ''; this.selected = -1; }
    this.lastPhase = r?.phase ?? '';
    const key = JSON.stringify({ ...s, serverNow: 0 }); if (key !== this.lastKey) { this.lastKey = key; this.render(); }
    if (fresh && fresh.playerId === s.me.id && fresh.hits !== null) {
      this.submitting = false; vibrate();
      const title = r?.phase === 'finished' ? (r.result?.winner === s.me.id ? '破解成功 · 你赢了' : r.result?.winner ? '本局结束' : '同轮破解 · 平局') : fresh.hits === 4 ? '全部命中 · 等待对手补猜' : '猜测结果';
      this.feedback(title, fresh.hits, fresh.digits ?? '', fresh.hits === 4 ? '四位密码全部破解' : ['暂未命中，换个思路', '找到一点线索了', '推理正在接近答案', '只差一步，继续推理'][fresh.hits]);
    } else if (sameRoom && r?.phase === 'finished' && oldPhase !== 'finished') {
      this.feedback(r.result?.winner === s.me.id ? '胜利' : r.result?.winner ? '再接再厉' : '旗鼓相当 · 平局', null, '', reasons[r.result?.reason ?? ''] ?? '对局结束');
    } else if (sameRoom && r && r.current === s.me.id && (r.turn !== oldTurn || oldPhase === 'preparing') && ['playing', 'reply'].includes(r.phase)) {
      this.turnCue(r.phase === 'reply' ? '最后一次补猜！' : '轮到你出牌了');
    }
  }
  private toast(text: string) { this.notice = text; this.noticeUntil = Date.now() + 6500; this.render(); }
  private async act(action: string, payload: Record<string, unknown> = {}) {
    if (this.busy) return; this.busy = true;
    if (action === 'guess') { this.submitting = true; this.feedback('正在验证', null, String(payload.digits ?? ''), '等待牌桌确认…', true); this.render(); }
    try { await this.net.command(action, { roomId: this.net.state?.room?.id, ...payload }); if (action === 'lock') this.audio.play('ready'); }
    catch (e) { this.audio.play('error'); if (action === 'guess') { this.submitting = false; this.clearEffects(); } this.notice = (e as Error).message; this.noticeUntil = Date.now() + 6500; }
    finally { this.busy = false; this.render(); }
  }
  private n(name: string, x: number, y: number, w: number, h: number, parent = this.root) {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.setPosition(x - 375, parent === this.root ? this.screenHeight / 2 - (this.layoutTop + (y - 60) * this.layoutScale) : 667 - y);
    n.addComponent(UITransform).setContentSize(w, h); return n;
  }
  private box(x: number, y: number, w: number, h: number, color = C.teal, radius = 16, parent = this.root) {
    if (parent === this.root && h >= 150) h *= this.layoutScale;
    const n = this.n('Panel', x, y, w, h, parent), g = n.addComponent(Graphics);
    g.fillColor = new Color(color); g.roundRect(-w / 2, -h / 2, w, h, radius); g.fill();
    g.strokeColor = new Color(C.gold); g.lineWidth = 1.6; g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, radius); g.stroke(); return n;
  }
  private text(value: string, x: number, y: number, size = 26, color = C.cream, width = 660, height = 60, parent = this.root) {
    const n = this.n(value.slice(0, 30), x, y, width, height, parent), l = n.addComponent(Label); l.string = value; l.fontSize = size; l.lineHeight = size * 1.35;
    l.color = new Color(color); l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.overflow = Label.Overflow.SHRINK; l.fontFamily = 'Georgia, Songti SC, serif'; return l;
  }
  private button(label: string, x: number, y: number, w: number, h: number, fn: () => void, primary = false, enabled = true) {
    const key = /^([0-9]|删除|清空|随机)$/.test(label);
    this.box(x, y + 5, w, h, '#301B10', 12);
    const n = this.box(x, y, w, h, enabled ? (primary ? C.orange : key ? C.cream : C.teal) : '#344442', 12);
    const g = n.getComponent(Graphics)!;
    g.strokeColor = new Color(primary ? '#FFBA65' : key ? '#FFF2D8' : '#71918A'); g.lineWidth = 2;
    g.roundRect(-w/2+5, -h/2+5, w-10, h-10, 9); g.stroke();
    const l = this.text(label, x, y - 1, key && label.length === 1 ? 35 : h > 70 ? 30 : 23, enabled ? (key ? C.ink : C.cream) : '#85908A', w - 16, h - 8);
    l.node.removeFromParent(); n.addChild(l.node); l.node.setPosition(0, 1);
    if (enabled) {
      n.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') n.setScale(.97, .97, 1); });
      n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1));
      n.on(Node.EventType.TOUCH_END, () => { n.setScale(1, 1, 1); this.audio.unlock(); if (!key) this.audio.play('tap'); fn(); });
    }
    return n;
  }
  private clearEffects() {
    if (!this.effects?.isValid) return;
    const stop = (n: Node) => { Tween.stopAllByTarget(n); const opacity = n.getComponent(UIOpacity); if (opacity) Tween.stopAllByTarget(opacity); n.children.forEach(stop); };
    for (const child of [...this.effects.children]) { stop(child); child.removeFromParent(); child.destroy(); }
  }
  private feedback(title: string, hits: number | null, digits: string, caption: string, pending = false) {
    const r = this.net.state?.room;
    this.audio.play(pending ? 'submit' : r?.phase === 'finished' ? (r.result?.winner === this.net.state?.me.id ? 'win' : r.result?.winner ? 'lose' : 'draw') : hits === null ? 'draw' : 'hit'+hits);
    this.clearEffects();
    const group = this.n('GuessFeedback', 375, 667, 750, 1334, this.effects);
    const panel = this.box(375, 550, 620, 290, C.dark, 24, group);
    this.box(375, 550, 600, 270, C.teal, 20, group);
    this.text(title, 375, 448, 29, C.gold, 570, 48, group);
    const value = this.text(pending ? digits.split('').join('  ') : hits === null ? '◇' : '0 / 4', 375, 540, 68, C.cream, 570, 100, group);
    this.text(caption, 375, 635, 24, C.cream, 560, 50, group);
    const motion = read('motion', '1') === '1';
    if (!motion) {
      if (hits !== null) value.string = hits + ' / 4';
      if (!pending) tween(group).delay(2).call(() => { group.destroy(); }).start();
      return;
    }
    const opacity = group.addComponent(UIOpacity); opacity.opacity = 0; group.setScale(.85, .85, 1);
    tween(opacity).to(.14, { opacity: 255 }).start();
    tween(group).to(.22, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    if (pending) {
      tween(value.node).to(.35, { scale: new Vec3(1.06, 1.06, 1) }).to(.35, { scale: Vec3.ONE }).union().repeatForever().start();
      return;
    }
    let reveal = tween(value.node).delay(.22);
    if (hits !== null) {
      for (let i = 1; i <= hits; i++) reveal = reveal.delay(.13).call(() => { value.string = i + ' / 4'; });
      reveal.to(.1, { scale: new Vec3(1.2, 1.2, 1) }).to(.2, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
      if (hits === 0) tween(group).delay(.25).by(.06, { position: new Vec3(-9, 0, 0) }).by(.06, { position: new Vec3(18, 0, 0) }).by(.06, { position: new Vec3(-9, 0, 0) }).start();
      if (hits === 4) {
        for (let i = 0; i < 14; i++) {
          const angle = i * Math.PI * 2 / 14;
          const spark = this.text('✦', 375, 540, 24, C.gold, 40, 40, group);
          const alpha = spark.node.addComponent(UIOpacity); alpha.opacity = 0;
          tween(alpha).delay(.7).to(.1, { opacity: 255 }).to(.65, { opacity: 0 }).start();
          tween(spark.node).delay(.7).by(.75, { position: new Vec3(Math.cos(angle) * 260, Math.sin(angle) * 170, 0) }, { easing: 'quadOut' }).start();
        }
      }
    }
    tween(opacity).delay(hits === 4 ? 2.4 : 1.8).to(.25, { opacity: 0 }).call(() => { group.destroy(); }).start();
  }
  private turnCue(message: string) {
    this.audio.play('turn');
    this.clearEffects();
    const group = this.n('TurnCue', 375, 667, 750, 1334, this.effects);
    this.box(375, 927, 560, 70, C.orange, 16, group); this.text(message, 375, 927, 30, C.cream, 530, 60, group);
    const opacity = group.addComponent(UIOpacity);
    if (read('motion', '1') === '1') { group.setPosition(-50, 0); tween(group).to(.25, { position: Vec3.ZERO }, { easing: 'quadOut' }).start(); }
    tween(opacity).delay(1.2).to(.2, { opacity: 0 }).call(() => { group.destroy(); }).start(); vibrate();
  }
  private actor(y: number, height = 230) {
    if (!this.opponentArt) return;
    const n = this.n('OpponentCharacter', 375, y, height * 2 / 3, height);
    const sp = n.addComponent(Sprite); sp.spriteFrame = this.opponentArt; sp.sizeMode = Sprite.SizeMode.CUSTOM;
    n.getComponent(UITransform)!.setContentSize(height * 2 / 3, height);
  }
  private header(title: string, back?: () => void) {
    // Nothing interactive is placed in the top-right native WeChat menu region.
    const y = 110;
    this.text(title, 375, y, 32); if (back) this.button('‹ 返回', 95, y, 140, 52, back);
  }
  private portrait(name: string, avatar: number, x: number, y: number) {
    this.box(x, y, 64, 64, C.blue, 30); this.text(AVATARS[avatar] ?? '客', x, y, 30, C.cream, 60);
    this.text(name, x, y + 52, 21, C.cream, 240, 35);
  }
  private cards(digits: string, y: number, size = 90, backs = false, editable = false) {
    const gap = 12, start = 375 - 1.5 * (size + gap);
    for (let i = 0; i < 4; i++) {
      const x = start + i * (size + gap), selected = editable && this.selected === i;
      const n = this.box(x, y - (selected ? 10 : 0), size, size * 1.25, backs ? C.blue : C.cream, 10);
      const g = n.getComponent(Graphics)!; g.strokeColor = new Color(backs ? C.gold : '#B9925A'); g.lineWidth = 1;
      g.roundRect(-size/2+5, -size*.625+5, size-10, size*1.25-10, 6); g.stroke();
      if (backs) { g.circle(0,0,size*.29); g.moveTo(-size*.3,0); g.lineTo(size*.3,0); g.moveTo(0,-size*.38); g.lineTo(0,size*.38); g.stroke(); }
      else { for (const a of [-1,1]) for (const b of [-1,1]) { const cx=a*(size/2-12), cy=b*(size*.625-12); g.moveTo(cx-4,cy); g.lineTo(cx,cy+4); g.lineTo(cx+4,cy); g.lineTo(cx,cy-4); g.close(); g.stroke(); } }
      this.text(backs ? '◇' : digits[i] ?? '—', x, y - (selected ? 10 : 0), size * .63, backs ? C.gold : C.ink, size - 10, size);
      if (editable) n.on(Node.EventType.TOUCH_END, () => { this.selected = i; this.render(); });
    }
  }
  private render() {
    if (!this.root?.isValid) return;
    const keepInput = this.page === 'profile' && !this.profileMotion && !this.busy && !this.overlay
      && !this.net.state?.room && this.net.state?.queuedAt === null;
    if (keepInput && this.nicknameSession.deferRedraw()) return;
    this.nicknameSession.end(); this.nicknameEditBox = undefined;
    for (const { view: scroll, key } of this.recordScrolls) {
      if (!scroll.isValid) continue;
      const offset = scroll.getScrollOffset().y;
      this.recordPositions.set(key, { offset, bottom: scroll.getMaxScrollOffset().y - offset < 24 });
    }
    this.recordScrolls = [];
    this.profilePanel = undefined; this.profileBack = undefined; this.transitionLobby = undefined;
    for (const child of [...this.root.children]) { child.removeFromParent(); child.destroy(); }
    this.timerLabel = undefined; this.toastLabel = undefined;
    const state = this.net.state;
    const sceneView = state?.room ? (state.room.phase === 'waiting' ? 'friend' : 'game')
      : state?.queuedAt != null ? 'matching' : this.page === 'join' ? 'friend' : 'lobby';
    this.scenery.setView(sceneView, read('motion', '1') === '1');
    const s = this.net.state;
    if (!s) this.loading();
    else if (s.room) this.room(s.room);
    else if (s.queuedAt !== null) this.matching();
    else if (this.page === 'join') this.join();
    else if (this.page === 'profile') this.profile();
    else this.lobby();
    if (s && !this.net.online) { this.box(375, 190, 650, 60, C.orange); this.text('正在恢复连接…计时继续', 375, 190, 23); }
    if (this.overlay) this.modal();
    if (this.notice && Date.now() < this.noticeUntil) {
      this.box(375, 1278, 700, 62, C.dark); this.toastLabel = this.text(this.notice, 375, 1278, 22, C.cream, 670, 58);
    }
    this.updateTimer();
  }
  private loading() { this.header('猜数字暗号'); this.text('正在连接牌桌', 375, 540, 36); this.text('四位密码，一场智力对决', 375, 610, 22); this.button('重新连接', 375, 780, 360, 84, () => this.connect(), true); }
  /** Whole-control artwork includes lettering and icons; hit targets stay in Cocos. */
  private lobbySprite(name: string, x: number, y: number, w: number, h: number) {
    const frame = this.lobbyArt.get(name);
    if (!frame) return null;
    const n = this.n('Lobby-' + name, x, y, w, h);
    const sprite = n.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    n.getComponent(UITransform)!.setContentSize(w, h);
    return n;
  }
  private lobbyButton(art: string, label: string, x: number, y: number, w: number, h: number, fn: () => void, enabled = true) {
    const n = this.lobbySprite(art, x, y, w, h);
    if (!n) return this.button(label, x, y, w, h, fn, art === 'match-full', enabled);
    // Labels are baked into these approved slices. Do not draw duplicate system text.
    if (!enabled) n.addComponent(UIOpacity).opacity = 140;
    else {
      n.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') n.setScale(.97, .97, 1); });
      n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1));
      n.on(Node.EventType.TOUCH_END, () => { n.setScale(1, 1, 1); this.audio.unlock(); this.audio.play('tap'); fn(); });
    }
    return n;
  }
  private lobby() {
    const me = this.net.state!.me;
    // Compress artwork as well as positions on short displays, preserving its aspect ratio.
    const fit = Math.min(1, this.layoutScale);
    const openProfile = () => this.openProfile();
    // Original nameplate rim, with a small transparent text window for the live nickname.
    this.box(203, 126, 174, 43, '#302014', 4);
    const nameplate = this.lobbySprite('nickname-frame', 203, 126, 183, 54);
    this.text(me.name, 205, 126, 22, C.cream, 137, 38);
    const avatarBase = this.box(80, 120, 108, 108, '#302014', 54);
    if (!this.profileSprite('avatar-' + me.avatar, 80, 120, 108, 108)) this.text(AVATARS[me.avatar] ?? '客', 80, 120, 38, C.cream, 80, 75);
    const avatarFrame = this.lobbySprite('avatar-frame', 80, 120, 124, 123);
    for (const node of [nameplate, avatarBase, avatarFrame]) node?.on(Node.EventType.TOUCH_END, () => { this.audio.unlock(); this.audio.play('tap'); openProfile(); });
    if (!this.lobbySprite('title', 375, 330, 635 * fit, 350 * fit)) this.text('猜数字暗号', 375, 355, 72, C.cream, 660, 110);
    this.text('— 四位密码，一场智力对决 —', 375, 535, 25, C.cream, 630, 48);
    if (this.lobbySprite('machine', 375, 695, 565 * fit, 281 * fit)) {
      for (let i = 0; i < 4; i++) this.text(String(i), 375 + (i - 1.5) * 84 * fit, 703, 62 * fit, C.ink, 66 * fit, 95 * fit);
    } else this.cards('0123', 695, 88);
    this.lobbyButton('match-full', '在线匹配  ›', 375, 920, 610 * fit, 175 * fit, () => this.act('queue'), !this.busy);
    this.lobbyButton('friend-full', '好友对战  ›', 375, 1100, 610 * fit, 170 * fit, () => { this.page = 'join'; this.code = ''; this.render(); });
    this.lobbyButton('settings-full', '设置', 115, 1250, 76 * fit, 76 * fit, () => { this.overlay = 'settings'; this.render(); });
    this.lobbyButton('help-full', '怎么玩', 375, 1250, 285 * fit, 121 * fit, () => { this.overlay = 'rules'; this.render(); });
    const muted = read('music', '1') === '0' && read('sound', '1') === '0';
    const soundButton = this.lobbyButton('sound-full', muted ? '静音' : '声音', 635, 1250, 76 * fit, 76 * fit, () => {
      const next = muted ? '1' : '0';
      for (const key of ['music', 'sound'] as const) if (read(key, '1') !== next) this.audio.toggle(key);
      this.render();
    });
    if (muted) {
      soundButton.addComponent(UIOpacity).opacity = 140;
      const slashNode = this.n('MutedSlash', 375, 667, 50 * fit, 50 * fit, soundButton);
      const slash = slashNode.addComponent(Graphics); slash.strokeColor = new Color(C.cream); slash.lineWidth = 3;
      slash.moveTo(-20 * fit, -20 * fit); slash.lineTo(20 * fit, 20 * fit); slash.stroke();
    }
  }
  private matching() {
    this.header('在线匹配'); this.text('正在寻找对手', 375, 440, 44); this.text('准备迎接挑战了吗', 375, 505, 23, C.gold);
    this.box(375, 695, 260, 220, C.dark, 100); this.timerLabel = this.text('00:00', 375, 695, 54);
    const me = this.net.state!.me; this.portrait(me.name, me.avatar, 375, 925);
    this.button('取消匹配', 375, 1140, 520, 90, () => this.act('cancelQueue'), false, !this.busy);
  }
  private join() {
    this.header('好友对战', () => { this.page = 'lobby'; this.render(); });
    this.text('输入房间口令', 375, 340, 38); this.text('四位口令，加入好友的牌桌', 375, 402, 23, C.gold);
    this.cards(this.code, 520, 100); this.button('加入房间', 375, 680, 560, 85, () => this.act('join', { code: this.code }), true, this.code.length === 4 && !this.busy);
    this.button('自己创建房间', 375, 782, 560, 70, () => this.act('create'), false, !this.busy); this.keypad(925, 'join');
  }
  private keypad(top: number, context: 'join' | 'secret' | 'guess', enabled = true) {
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '删除', '0', context === 'secret' ? '随机' : '清空'];
    labels.forEach((label, i) => { if (context === 'guess' && i === 11) return; this.button(label, 165 + i % 3 * 210, top + Math.floor(i / 3) * 80, 194, 66, () => this.digit(label, context), false, enabled && !this.busy); });
  }
  private digit(value: string, context: 'join' | 'secret' | 'guess') {
    this.audio.play('tap');
    let v = context === 'join' ? this.code : this.draft;
    if (value === '删除') v = v.slice(0, -1);
    else if (value === '清空') v = '';
    else if (value === '随机') v = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    else if (this.selected >= 0 && context !== 'join' && this.selected < v.length) { v = v.slice(0, this.selected) + value + v.slice(this.selected + 1); this.selected = this.selected < 3 ? this.selected + 1 : -1; }
    else if (v.length < 4) v += value;
    if (context === 'join') this.code = v; else this.draft = v; this.render();
  }
  private onKey(e: EventKeyboard) {
    this.audio.unlock();
    if (this.overlay || this.page === 'profile' && !this.net.state?.room || !this.net.online || this.busy) return;
    const r = this.net.state?.room;
    const context = !r && this.page === 'join' ? 'join' : r?.phase === 'preparing' && !r.ownSecret ? 'secret' : r && ['playing', 'reply'].includes(r.phase) && r.current === this.net.state?.me.id ? 'guess' : null;
    if (!context) return;
    if (e.keyCode >= KeyCode.DIGIT_0 && e.keyCode <= KeyCode.DIGIT_9) this.digit(String(e.keyCode - KeyCode.DIGIT_0), context);
    else if (e.keyCode === KeyCode.BACKSPACE) this.digit('删除', context);
    else if (e.keyCode === KeyCode.ENTER) { if (context === 'guess') this.submitGuess(); else if (context === 'secret') this.lockSecret(); else if (this.code.length === 4) this.act('join', { code: this.code }); }
  }
  private room(r: RoomView) {
    if (r.phase === 'waiting') { this.waiting(r); return; }
    if (r.phase === 'finished' || r.phase === 'cancelled') { this.result(r); return; }
    const opponent = r.players.find(p => p.id !== this.net.state!.me.id)!;
    this.header(r.phase === 'preparing' ? '设置底牌' : `第 ${r.round} 轮 / 20`, () => {
      if (r.phase === 'preparing') this.ask('离开准备？本局将取消。', () => this.act('leave'));
      else { this.overlay = 'gameMenu'; this.render(); }
    });
    this.actor(214, 230); this.box(375, 305, 290, 40, C.dark);
    this.text(opponent.name + (opponent.online ? '' : ' · 连接中'), 375, 305, 21, C.cream, 270, 38); this.cards('', 270, 45, true);
    if (r.phase === 'preparing') this.preparation(r); else this.play(r);
  }
  private waiting(r: RoomView) {
    this.header('好友房', () => this.ask('关闭当前房间？', () => this.act('leave')));
    this.text('等待好友入座', 375, 390, 36); this.text('1 / 2', 375, 455, 24, C.gold);
    this.box(375, 685, 650, 350, C.dark); this.text('房间口令', 375, 555, 28); this.cards(r.code!, 660, 100);
    this.button('复制口令', 375, 800, 340, 62, () => { copy(r.code!); this.toast('房间口令：' + r.code); }, true);
    this.timerLabel = this.text('', 375, 930, 24); this.button('关闭房间', 375, 1120, 520, 88, () => this.ask('关闭当前房间？', () => this.act('leave')));
  }
  private preparation(r: RoomView) {
    this.text(r.players.find(p => p.id !== this.net.state!.me.id)?.ready ? '对手已准备' : '对手正在设置', 375, 365, 22, C.gold);
    this.timerLabel = this.text('', 375, 425, 28); this.text(r.ownSecret ? '底牌已锁定，等待对手' : '设置你的四位密码', 375, 485, 34);
    this.cards(r.ownSecret ?? this.draft, 625, 112, false, !r.ownSecret); this.text('允许重复，允许 0 开头', 375, 730, 22, C.gold);
    this.keypad(835, 'secret', !r.ownSecret && this.net.online);
    this.button(r.ownSecret ? '已准备' : '锁定并准备', 375, 1195, 610, 84, () => this.lockSecret(), true, !r.ownSecret && this.draft.length === 4 && !this.busy);
  }
  private lockSecret() { if (this.draft.length === 4) this.ask('锁定底牌 ' + this.draft + '？\n本局不可修改。', () => this.act('lock', { digits: this.draft })); }
  private recordTabs(r: RoomView, y: number) {
    const me = this.net.state!.me.id;
    for (const [opponent, x] of [[false, 180], [true, 405]] as const) {
      const count = r.history.filter(h => (h.playerId !== me) === opponent).length;
      this.button(`${opponent ? '对手' : '我的'} · ${count}`, x, y, 200, 46, () => {
        this.recordsOpponent = opponent; this.render();
      }, this.recordsOpponent === opponent);
    }
  }
  private recordList(r: RoomView, top: number, height: number, expanded: boolean, surface: string) {
    const me = this.net.state!.me.id;
    const rows = r.history.filter(h => (h.playerId !== me) === this.recordsOpponent);
    const key = `${surface}:${this.recordsOpponent}`;
    const visibleHeight = height * this.layoutScale;
    const rowHeight = visibleHeight / (expanded ? 8 : 4);
    const contentHeight = Math.max(visibleHeight, rows.length * rowHeight);
    const viewport = this.n('GuessRecordsViewport', 375, top + height / 2, 610, visibleHeight);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const content = new Node('GuessRecordsContent'); content.layer = Layers.Enum.UI_2D; viewport.addChild(content);
    const transform = content.addComponent(UITransform); transform.setAnchorPoint(.5, 1); transform.setContentSize(610, contentHeight);
    content.setPosition(0, visibleHeight / 2);
    const scroll = viewport.addComponent(ScrollView); scroll.content = content; scroll.horizontal = false;
    scroll.vertical = true; scroll.inertia = true; scroll.elastic = false; scroll.cancelInnerEvents = true;
    rows.forEach((h, i) => {
      const y = 667 + i * rowHeight + rowHeight / 2;
      this.box(375, y, 602, rowHeight - 5, i === rows.length - 1 ? '#E1BE82' : '#EBD6B1', 6, content);
      this.text(`第 ${Math.floor(h.turn / 2) + 1} 轮`, 135, y, 20, C.ink, 115, rowHeight - 8, content);
      this.text(h.digits ? h.digits.split('').join('  ') : '本次超时', 365, y, 29, C.ink, 300, rowHeight - 8, content);
      this.text(h.hits === null ? '—' : `${h.hits}/4`, 610, y, 26, h.hits === 4 ? C.teal : C.orange, 90, rowHeight - 8, content);
    });
    if (!rows.length) this.text('暂无记录，提交数字后会显示在这里', 375, top + height / 2, 22, expanded ? C.cream : C.ink, 590);
    const state = this.recordPositions.get(key);
    const max = Math.max(0, contentHeight - visibleHeight);
    scroll.scrollToOffset(new Vec2(0, state && !state.bottom ? Math.min(max, state.offset) : max));
    this.recordScrolls.push({ view: scroll, key });
    const footer = top + height + 30;
    this.text(`共 ${rows.length} 条 · 上下滑动查看`, 270, footer, 20, expanded ? C.muted : C.ink, 360, 40);
    this.button('回到最新 ↓', 580, footer, 170, 42, () => scroll.scrollToBottom(.2), false, rows.length > 0);
  }
  private play(r: RoomView) {
    const me = this.net.state!.me.id, mine = r.current === me;
    this.box(375, 543, 686, 356, '#613B21', 18);
    this.box(375, 538, 670, 346, C.cream);
    this.recordTabs(r, 405);
    this.button('展开', 625, 405, 100, 46, () => { this.overlay = 'guessRecords'; this.render(); });
    this.recordList(r, 443, 210, false, 'table');
    this.text('本次猜测', 115, 775, 22, C.cream, 180); this.cards(this.draft, 790, 66, false, mine);
    this.text('我的底牌\n已锁定', 140, 882, 19, C.gold, 190, 60); this.cards(r.ownSecret ?? '', 882, 42, this.hideSecret);
    this.button(this.hideSecret ? '查看' : '盖牌', 650, 885, 95, 44, () => { this.hideSecret = !this.hideSecret; this.render(); });
    this.timerLabel = this.text('', 375, 942, 25, C.gold);
    this.keypad(1004, 'guess', mine && this.net.online && this.net.now() >= r.startAt);
    // The last keypad key becomes submit; keeps a complete 0–9 keyboard on one screen.
    this.button(this.submitting ? '验证中…' : '确认猜测', 585, 1244, 194, 66, () => this.submitGuess(), true, mine && this.draft.length === 4 && this.net.online && !this.busy && this.net.now() >= r.startAt);
  }
  private submitGuess() {
    const r = this.net.state?.room; if (!r || this.draft.length !== 4 || r.current !== this.net.state?.me.id) return;
    const submit = () => this.act('guess', { digits: this.draft, turn: r.turn });
    if (r.history.some(h => h.playerId === this.net.state!.me.id && h.digits === this.draft)) this.ask('这组数字已经猜过，仍要提交吗？', submit); else submit();
  }
  private result(r: RoomView) {
    const me = this.net.state!.me.id, win = r.result?.winner === me;
    this.header('本局结果'); this.text(r.phase === 'cancelled' ? '对局取消' : !r.result?.winner ? '平局' : win ? '胜利' : '再接再厉', 375, 375, 68, C.gold);
    this.text(reasons[r.result?.reason ?? ''] ?? '对局结束', 375, 465, 26);
    if (r.revealed) { const other = r.players.find(p => p.id !== me)!; this.text('对手密码 · ' + other.name, 375, 550, 24); this.cards(r.revealed[other.id], 650, 92); this.text('我的底牌  ' + r.ownSecret, 375, 765, 28); }
    const own = r.history.filter(h => h.playerId === me && h.digits !== null).length;
    this.text(`有效猜测 ${own} 次`, 375, 845, 25);
    if (r.phase === 'finished') {
      this.button(r.rematch.includes(me) ? '等待对方同意…' : '与当前对手再来一局', 375, 950, 610, 82, () => this.act('rematch'), true, !r.rematch.includes(me) && !this.busy);
      this.button('重新匹配', 375, 1055, 610, 82, () => this.act('queue'), false, !this.busy);
    }
    this.button('返回大厅', 375, 1160, 610, 82, () => { this.page = 'lobby'; this.act('leave'); });
    this.button('查看本局记录', 375, 1245, 300, 48, () => { this.overlay = 'resultRecords'; this.render(); });
  }
  private openProfile() {
    const me = this.net.state?.me; if (!me || this.profileMotion) return;
    this.nickname = me.name; this.avatar = me.avatar; this.page = 'profile'; this.profileMotionFrom = undefined; this.profileMotionTo = undefined;
    this.profileMotion = read('motion', '1') === '1' ? 'in' : '';
    this.profileMotionElapsed = 0; this.profileMotionFrames = 0; this.render();
  }
  private closeProfile() {
    if (this.busy || this.profileMotion) return;
    this.finishNicknameEditing();
    if (read('motion', '1') !== '1') { this.page = 'lobby'; this.render(); return; }
    this.profileMotion = 'out'; this.profileMotionElapsed = 0; this.profileMotionFrames = 0;
    this.profileMotionFrom = undefined; this.profileMotionTo = undefined; this.render();
  }
  private async saveProfile() {
    if (this.busy || this.profileMotion) return;
    this.finishNicknameEditing();
    const name = this.nickname.trim();
    if (!/^[\p{L}\p{N} _·-]{2,12}$/u.test(name)) { this.toast('昵称需为 2–12 个中文、字母或数字'); return; }
    this.busy = true; this.render();
    try {
      await this.net.command('profile', { name, avatar: this.avatar });
      this.busy = false; this.closeProfile();
    } catch (error) { this.busy = false; this.toast((error as Error).message); }
  }
  private profileSprite(name: string, x: number, y: number, w: number, h: number) {
    const frame = this.profileArt.get(name); if (!frame) return null;
    const n = this.n('Profile-' + name, x, y, w, h);
    const sp = n.addComponent(Sprite); sp.spriteFrame = frame; sp.sizeMode = Sprite.SizeMode.CUSTOM;
    n.getComponent(UITransform)!.setContentSize(w, h); return n;
  }
  private finishNicknameEditing() {
    const edit = this.nicknameEditBox;
    if (!edit?.isValid) { this.nicknameSession.end(); return; }
    this.nickname = edit.string;
    if (this.nicknameSession.active) edit.blur();
    this.nicknameEditingEnded(edit);
  }
  private nicknameEditingEnded(edit: EditBox) {
    if (this.nicknameEditBox !== edit) return;
    this.nickname = edit.string; this.nicknameEditingBegan = false;
    const pending = this.nicknameSession.end();
    if (pending.resize || pending.redraw) this.scheduleOnce(() => {
      if (!this.isValid) return;
      if (this.nicknameSession.active) {
        if (pending.resize) this.nicknameSession.deferResize();
        if (pending.redraw) this.nicknameSession.deferRedraw();
        return;
      }
      if (pending.resize) this.resizeLayout(); else this.render();
    });
  }
  private profileButton(art: string, label: string, x: number, y: number, w: number, h: number, action: () => void) {
    const enabled = !this.busy && !this.profileMotion;
    const n = this.profileSprite(art, x, y, w, h);
    if (!n) return this.button(label, x, y, w, h, () => { this.finishNicknameEditing(); action(); }, art === 'save', enabled);
    if (!enabled) { if (this.busy) n.addComponent(UIOpacity).opacity = 150; return n; }
    n.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') n.setScale(.97, .97, 1); });
    n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1));
    n.on(Node.EventType.TOUCH_END, () => { n.setScale(1, 1, 1); this.audio.unlock(); this.audio.play('tap'); this.finishNicknameEditing(); action(); });
    return n;
  }
  private profile() {
    const host = this.root, height = this.screenHeight, top = this.layoutTop, scale = this.layoutScale;
    const fit = Math.min(1, (height - top - bottomSafeInset() - 16) / 1230);
    const center = new Vec3(0, (bottomSafeInset() - top) / 2, 0);
    if (this.profileMotion) {
      const lobby = this.n('TransitionLobby', 375, 667, 750, height); lobby.setPosition(0, 0);
      this.transitionLobby = lobby; lobby.addComponent(UIOpacity);
      this.root = lobby;
      try { this.lobby(); } finally { this.root = host; }
    }
    if (this.profileMotion) {
      const blocker = this.n('NavigationInputBlocker', 375, 667, 750, height); blocker.setPosition(0, 0);
      blocker.addComponent(BlockInputEvents);
    }
    this.profileFit = fit;
    const sheet = this.n('ProfileInsert', 375, 667, 750, 1334);
    this.profilePanel = sheet; sheet.setPosition(center); sheet.setScale(fit, fit, 1); sheet.addComponent(UIOpacity);
    // Fixed local paper coordinates: the complete sheet and its controls rotate together.
    this.root = sheet; this.screenHeight = 1334; this.layoutTop = 60; this.layoutScale = 1;
    try {
      if (!this.profileSprite('paper', 375, 715, 710, 1040)) this.box(375, 715, 710, 1040, C.cream, 24);
      if (!this.profileSprite('heading', 375, 165, 300, 89)) this.text('个人资料', 375, 165, 40);
      this.profileBack = this.profileButton('back', '返回', 100, 85, 166, 62, () => this.closeProfile());
      this.profileSprite('portrait-background', 375, 365, 320, 320);
      if (!this.profileSprite('avatar-' + this.avatar, 375, 365, 190, 190)) {
        this.box(375, 365, 180, 180, C.blue, 90); this.text(AVATARS[this.avatar], 375, 365, 72, C.cream, 150, 120);
      }
      this.profileSprite('portrait-frame', 375, 365, 234, 234);
      this.profileButton('change-avatar', '更换头像', 375, 490, 245, 64, () => {
        this.avatar = (this.avatar + 1) % 4; this.render();
      });
      this.text('昵称', 130, 600, 31, C.ink, 90, 60);
      this.box(435, 600, 435, 72, '#EBD1A6', 10);
      this.profileSprite('input', 435, 600, 435, 75);
      const n = this.n('NicknameInput', 435, 600, 435, 75), eb = n.addComponent(EditBox);
      this.nicknameEditBox = eb; this.nicknameEditingBegan = false;
      // EditBox positions its text at the upper-left; use a matching anchor and single-line layout.
      eb.inputMode = EditBox.InputMode.SINGLE_LINE;
      eb.inputFlag = EditBox.InputFlag.DEFAULT;
      eb.returnType = EditBox.KeyboardReturnType.DONE;
      const label = new Node('Text'); label.layer = Layers.Enum.UI_2D; n.addChild(label);
      const labelTransform = label.addComponent(UITransform); labelTransform.setAnchorPoint(0, 1);
      const l = label.addComponent(Label); l.fontSize = 30; l.lineHeight = 38;
      l.color = new Color(C.ink); l.horizontalAlign = Label.HorizontalAlign.LEFT;
      l.verticalAlign = Label.VerticalAlign.CENTER; l.enableWrapText = false; l.overflow = Label.Overflow.CLAMP;
      eb.textLabel = l; eb.maxLength = 12; eb.string = this.nickname; eb.enabled = !this.profileMotion && !this.busy;
      labelTransform.setContentSize(350, 75); label.setPosition(-197, 37.5);
      // Capture touch before the platform opens its keyboard (and can synchronously resize the canvas).
      n.on(Node.EventType.TOUCH_START, () => { if (eb.enabled) this.nicknameSession.begin(); }, this, true);
      n.on(Node.EventType.TOUCH_CANCEL, () => { if (!this.nicknameEditingBegan) this.nicknameEditingEnded(eb); });
      n.on('editing-did-began', () => { this.nicknameEditingBegan = true; this.nicknameSession.begin(); });
      n.on('text-changed', (edit: EditBox) => { this.nickname = edit.string; });
      n.on('editing-did-ended', (edit: EditBox) => this.nicknameEditingEnded(edit));
      this.text('2–12 个字符', 326, 657, 23, '#8D714E', 220, 40);
      this.profileButton('wechat', '使用微信头像昵称', 375, 745, 560, 114, () => this.toast(wechat() ? '当前开发版尚未配置微信资料授权，可先选择下方头像' : '微信资料需在微信真机授权，本地可编辑昵称和选择头像'));
      this.text('—  选择头像  —', 375, 840, 29, C.ink, 550, 50);
      AVATARS.slice(0, 4).forEach((a, i) => {
        const x = 150 + (i % 4) * 150, y = 985;
        const face = this.profileSprite('avatar-' + i, x, y, 125, 125) ?? this.box(x, y, 122, 122, C.blue, 61);
        if (!this.profileArt.has('avatar-' + i)) this.text(a, x, y, 36, C.cream, 80, 70);
        if (!this.busy && !this.profileMotion) face.on(Node.EventType.TOUCH_END, () => { this.finishNicknameEditing(); this.audio.play('tap'); this.avatar = i; this.render(); });
        const frameSize = i === this.avatar ? 156 : 150;
        this.profileSprite('portrait-frame', x, y, frameSize, frameSize);
        if (i === this.avatar && !this.profileSprite('avatar-selected', x + 46, y + 45, 58, 58)) {
          this.text('✓', x + 45, y + 45, 26, C.ink, 36, 36);
        }
      });
      this.profileButton('cancel', '取消', 205, 1185, 255, 98, () => this.closeProfile());
      this.profileButton('save', '保存修改', 530, 1185, 295, 98, () => this.saveProfile());
    } finally { this.root = host; this.screenHeight = height; this.layoutTop = top; this.layoutScale = scale; }
    // Back is a sibling of the sheet, so it never inherits the body's rotation or zoom.
    const back = this.profileBack!;
    this.profileBackRest.set(center.x + back.position.x * fit, center.y + back.position.y * fit, 0);
    const backLayer = this.n('ProfileBackLayer', 375, 667, 166, 62);
    backLayer.setPosition(this.profileBackRest); backLayer.setScale(fit, fit, 1); backLayer.addComponent(UIOpacity);
    back.removeFromParent(); backLayer.addChild(back); back.setPosition(0, 0);
    this.profileBack = backLayer;
    if (this.profileMotion) {
      const exiting = this.profileMotion === 'out';
      const offscreen = new Vec3(750 + 375 * fit, center.y - height * .32, 0);
      this.profileMotionFrom ??= { position: exiting ? center : offscreen, angle: exiting ? 0 : -16 };
      this.profileMotionTo = { position: exiting ? offscreen : center, angle: exiting ? -16 : 0 };
      this.applyProfileMotion();
    }
  }
  private applyProfileMotion() {
    const sheet = this.profilePanel, from = this.profileMotionFrom, to = this.profileMotionTo;
    if (!sheet?.isValid || !from || !to) return;
    const exiting = this.profileMotion === 'out';
    const pose = profileTransition(this.profileMotionElapsed, exiting), eased = pose.bodyProgress;
    sheet.setPosition(from.position.x + (to.position.x - from.position.x) * eased,
      from.position.y + (to.position.y - from.position.y) * eased, 0);
    sheet.angle = from.angle + (to.angle - from.angle) * eased;
    sheet.setScale(this.profileFit * pose.bodyScale, this.profileFit * pose.bodyScale, 1);
    sheet.getComponent(UIOpacity)!.opacity = Math.round(255 * pose.bodyOpacity);
    if (this.profileBack?.isValid) {
      const left = -500 - 166 * this.profileFit;
      const x = exiting ? this.profileBackRest.x + (left - this.profileBackRest.x) * eased
        : left + (this.profileBackRest.x - left) * eased;
      this.profileBack.setPosition(x, this.profileBackRest.y, 0);
      this.profileBack.getComponent(UIOpacity)!.opacity = Math.round(255 * pose.backOpacity);
    }
    if (this.transitionLobby?.isValid) {
      this.transitionLobby.setScale(pose.lobbyScale, pose.lobbyScale, 1);
      this.transitionLobby.getComponent(UIOpacity)!.opacity = Math.round(255 * pose.lobbyOpacity);
    }
  }
  update(dt: number) {
    this.scenery?.update(dt);
    if (!this.profileMotion || !this.profilePanel?.isValid) return;
    // Show the initial pose before advancing. Cap a stalled frame instead of skipping to the end.
    if (++this.profileMotionFrames <= 2) return;
    this.profileMotionElapsed += Math.min(Math.max(dt, 0), .05);
    this.applyProfileMotion();
    if (profileTransition(this.profileMotionElapsed, this.profileMotion === 'out').complete) {
      const exiting = this.profileMotion === 'out'; this.profileMotion = '';
      this.profileMotionFrom = undefined; this.profileMotionTo = undefined;
      if (exiting) this.page = 'lobby'; this.render();
    }
  }
  private ask(text: string, action: () => void) { this.confirmText = text; this.confirmAction = action; this.overlay = 'confirm'; this.render(); }
  private modal() {
    const blocker = this.n('ModalBlocker', 375, 667, 750, this.screenHeight); blocker.setPosition(0, 0);
    const shade = blocker.addComponent(Graphics); shade.fillColor = new Color('#0D2222'); shade.rect(-375, -this.screenHeight / 2, 750, this.screenHeight); shade.fill(); blocker.on(Node.EventType.TOUCH_END, () => {});
    this.box(375, 685, 680, 950, C.dark); this.button('关闭', 100, 260, 130, 54, () => { this.overlay = ''; this.render(); });
    if (this.overlay === 'confirm') {
      this.text(this.confirmText, 375, 565, 30, C.cream, 590, 180);
      this.button('确认', 375, 780, 460, 85, () => { const fn = this.confirmAction; this.overlay = ''; this.render(); fn?.(); }, true);
      this.button('取消', 375, 890, 460, 75, () => { this.overlay = ''; this.render(); });
    } else if (this.overlay === 'rules') {
      this.text('怎么玩', 375, 340, 42, C.gold);
      this.text('各设四位底牌，可重复、可 0 开头。\n轮流猜测，只反馈数字与位置\n同时正确的数量，不标出位置。\n\n先手猜中后，后手有本轮补猜。\n双方同轮猜中则平局。\n每次 30 秒，最多 20 轮。\n连续两次超时会判负。\n\n在线匹配优先真人，等待较久时\n自动匹配电脑对手。好友房仅限真人。', 375, 700, 27, C.cream, 590, 620);
    } else if (this.overlay === 'settings') {
      this.text('设置', 375, 380, 42, C.gold);
      for (const [i, item] of [['music', '背景音乐'], ['sound', '游戏音效'], ['motion', '界面动效'], ['vibration', '振动提醒']].entries()) this.button(item[1] + '：' + (read(item[0], '1') === '1' ? '开' : '关'), 375, 490 + i * 105, 500, 80, () => { if (item[0] === 'music' || item[0] === 'sound') this.audio.toggle(item[0]); else write(item[0], read(item[0], '1') === '1' ? '0' : '1'); this.render(); });
      this.text('开发版使用系统图形头像。\n不读取通讯录，不上传底牌到分析系统。\n尚未接入广告、付费或排行榜。', 375, 1000, 22, C.muted, 560, 160);
    } else if (this.overlay === 'gameMenu') {
      this.text('牌桌菜单', 375, 400, 40, C.gold); this.button('认输并结束', 375, 640, 500, 88, () => this.ask('确认认输？', () => this.act('resign')), true);
      this.text('切后台或断网不会暂停计时', 375, 830, 25, C.gold);
    } else if (this.overlay === 'resultRecords' || this.overlay === 'guessRecords') {
      const r = this.net.state!.room!;
      if (this.overlay === 'guessRecords') this.timerLabel = this.text('', 465, 270, 21, C.gold, 420, 40);
      this.text(this.overlay === 'resultRecords' ? '本局记录' : '猜测记录', 375, 340, 38, C.gold);
      this.recordTabs(r, 410);
      this.recordList(r, 460, 530, true, 'expanded');
      this.text('命中数 = 数字与位置同时正确的数量', 375, 1110, 21, C.muted, 610, 40);

    }
  }
  private updateTimer = () => {
    const s = this.net.state, r = s?.room, now = this.net.now();
    if (r && r.phase === 'playing' && !this.openingRendered && now >= r.startAt) { this.openingRendered = true; this.render(); return; }
    if (this.timerLabel && s) {
      if (s.queuedAt !== null) { const seconds = Math.floor((now - s.queuedAt) / 1000); this.timerLabel.string = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
      else if (r) {
        const remaining = Math.max(0, Math.ceil((r.deadline - now) / 1000));
        if (r.phase === 'waiting') this.timerLabel.string = `房间有效期  ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
        else if (r.phase === 'preparing') this.timerLabel.string = `准备倒计时 ${remaining}s`;
        else if (now < r.startAt) this.timerLabel.string = `即将开局 ${Math.ceil((r.startAt - now) / 1000)}s`;
        else this.timerLabel.string = `${r.phase === 'reply' ? '最后一次补猜 · ' : ''}${r.current === s.me.id ? '轮到你了' : '对手正在猜测'}  ${remaining}s`;
        if (['playing', 'reply'].includes(r.phase) && remaining <= 5 && r.current === s.me.id && this.warnedTurn !== r.turn) { this.warnedTurn = r.turn; vibrate(); this.audio.play('warning'); }
      }
    }
    if (this.toastLabel && Date.now() >= this.noticeUntil) { this.notice = ''; this.render(); }
  };
}
