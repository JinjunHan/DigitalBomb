import { _decorator, Component, Node, UITransform, Label, Graphics, Color, Layers, view, ResolutionPolicy, resources, SpriteFrame, Sprite, Texture2D, profiler, tween, Tween, UIOpacity, Vec3, EditBox, input, Input, EventKeyboard, KeyCode, game, Game, BlockInputEvents, ScrollView, Mask, Vec2, Font, Rect } from 'cc';
import { RoundRoll } from './shared/round-roll';
import { FeedbackArt } from './FeedbackArt';
import { feedbackEvent, cancellationArt, resultCaption, type FeedbackEvent } from './shared/feedback-state';
import { FriendReturnLayer } from './FriendReturnLayer';
import { shouldReturnToJoin } from './shared/friend-return';
import { ModalLayer } from './ModalLayer';
import type { ModalKind } from './shared/modal-motion';
import { MODAL_RECTS } from './shared/modal-art';
import { confirmationValid, type ConfirmationContext, type ConfirmationKind } from './shared/modal-state';
import { BATTLE_RECTS } from './shared/battle-art';
import { matchingHourglass } from './shared/matching-hourglass';
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
  private roundRoll = new RoundRoll();
  private roundOld?: Node;
  private roundNew?: Node;
  private feedbackArt!: FeedbackArt;
  private suppressFeedback = false;
  private rematchNotice = '';
  private loginFailed = false;
  private endFeedbackUntil = 0;
  private net = new Connection(); private root!: Node; private scenery!: SceneBackdrop;
  private effects!: Node; private seenGuesses = 0; private submitting = false;
  private modals!: ModalLayer;
  private friendReturn!: FriendReturnLayer;
  private modalArt = new Map<string, SpriteFrame>();
  private modalArtReady = false;
  private modalArtFailed = false;
  private reconnecting = false;
  private confirmation?: ConfirmationContext;
  private lobbyArt = new Map<string, SpriteFrame>();
  private profileArt = new Map<string, SpriteFrame>();
  private friendArt = new Map<string, SpriteFrame>();
  private friendArtReady = false;
  private joinArt = new Map<string, SpriteFrame>();
  private joinArtReady = false;
  private battleArt = new Map<string, SpriteFrame>();
  private battleArtReady = false;
  private matchingArt = new Map<string, SpriteFrame>();
  private matchingArtReady = false;
  private hourglass?: Sprite;
  private hourglassFrames: SpriteFrame[] = [];
  private joinDigits: Label[] = [];
  private joinGlows: UIOpacity[] = [];
  private joinButton?: Node;
  private friendDigitFont?: Font;
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
  private confirmAction?: () => void; private hideSecret = false;
  private screenHeight = 1334; private layoutTop = 80; private layoutScale = 1;
  private resizeLayout = () => {
    if (this.nicknameSession.deferResize()) return;
    this.screenHeight = view.getVisibleSize().height;
    this.layoutTop = topSafeInset() + 16;
    this.layoutScale = (this.screenHeight - this.layoutTop - bottomSafeInset() - 24) / 1274;
    this.root?.getComponent(UITransform)?.setContentSize(750, this.screenHeight);
    this.effects?.getComponent(UITransform)?.setContentSize(750, this.screenHeight);
    this.scenery?.resize(this.screenHeight);
    this.modals?.resize(this.screenHeight);
    this.friendReturn?.resize(this.screenHeight);
    this.clearEffects(); this.render();
  };
  onLoad() {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
    this.scenery = new SceneBackdrop(this.node);
    this.root = new Node('Interface'); this.node.addChild(this.root); this.root.layer = Layers.Enum.UI_2D; this.root.addComponent(UITransform).setContentSize(750, 1334);
    this.effects = new Node('FeedbackLayer'); this.effects.layer = Layers.Enum.UI_2D; this.node.addChild(this.effects); this.effects.addComponent(UITransform).setContentSize(750, 1334);
    this.friendReturn = new FriendReturnLayer(this.node);
    this.modals = new ModalLayer(this.node);
    this.audio = new GameAudio(this.node);
    this.feedbackArt = new FeedbackArt(() => { if (this.isValid) this.render(); });
    this.net.onState = () => this.stateChanged(); this.net.onStatus = () => { if (!this.net.online) this.suppressFeedback = true; this.render(); }; this.net.onError = s => this.toast(s);
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
    resources.load('fonts/friend-digits/FriendDigits', Font, (err, font) => {
      if (err || !this.isValid) return;
      this.friendDigitFont = font; this.render();
    });
    const friendNames = ['back', 'heading', 'waiting', 'count', 'paper', 'copy', 'nameplate', 'seated', 'close'];
    for (const name of friendNames) {
      resources.load('art/friend/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || !this.isValid) return;
        const frame = new SpriteFrame(); frame.texture = texture; this.friendArt.set(name, frame);
        if (friendNames.every(key => this.friendArt.has(key))) { this.friendArtReady = true; this.render(); }
      });
    }
    const joinNames = ['back', 'heading', 'paper', 'join', 'create', 'keyboard', ...Array.from({ length: 10 }, (_, i) => 'key-' + i), 'key-clear', 'key-delete'];
    for (const name of joinNames) {
      resources.load('art/join/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || !this.isValid) return;
        const frame = new SpriteFrame(); frame.texture = texture; this.joinArt.set(name, frame);
        if (joinNames.every(key => this.joinArt.has(key))) { this.joinArtReady = true; this.render(); }
      });
    }
    const battleNames = Object.keys(BATTLE_RECTS);
    for (const name of battleNames) {
      resources.load('art/battle/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || !this.isValid) return;
        const frame = new SpriteFrame(); frame.texture = texture; this.battleArt.set(name, frame);
        if (battleNames.every(key => this.battleArt.has(key))) { this.battleArtReady = true; this.render(); }
      });
    }
    const matchingNames = ['opponent', 'heading', 'base', 'hourglass-sheet', 'portrait-rim', 'nameplate', 'cancel'];
    for (const name of matchingNames) {
      resources.load('art/matching/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || !this.isValid) return;
        const frame = new SpriteFrame(); frame.texture = texture; this.matchingArt.set(name, frame);
        if (name === 'hourglass-sheet') {
          this.hourglassFrames = Array.from({ length: 16 }, (_, index) => {
            const cell = new SpriteFrame(); cell.texture = texture;
            cell.rect = new Rect(index % 4 * 320, Math.floor(index / 4) * 320, 320, 320);
            return cell;
          });
        }
        if (matchingNames.every(key => this.matchingArt.has(key))) { this.matchingArtReady = true; this.render(); }
      });
    }
    const modalNames = Object.keys(MODAL_RECTS);
    for (const name of modalNames) {
      resources.load('art/modals/' + name + '/texture', Texture2D, (err, texture) => {
        if (!this.isValid) return;
        if (err) { this.modalArtFailed = true; this.render(); return; }
        const frame = new SpriteFrame(); frame.texture = texture; this.modalArt.set(name, frame);
        if (modalNames.every(key => this.modalArt.has(key))) { this.modalArtReady = true; this.render(); }
      });
    }
    profiler.hideStats();
    input.on(Input.EventType.KEY_DOWN, this.onKey, this); game.on(Game.EVENT_SHOW, this.onShow, this); game.on(Game.EVENT_HIDE, this.onHide, this);
    view.on('canvas-resize', this.resizeLayout, this);
    this.resizeLayout(); this.connect(); this.schedule(this.updateTimer, 0.2);
  }
  onDestroy() { if (this.feedbackArt) this.feedbackArt.disposed = true; this.friendReturn?.destroy(); this.modals?.destroy(); this.stopJoinMotion(); this.scenery?.destroy(); view.off('canvas-resize', this.resizeLayout, this); this.audio.dispose(); if (this.profilePanel) Tween.stopAllByTarget(this.profilePanel); this.clearEffects(); this.net.stop(); input.off(Input.EventType.KEY_DOWN, this.onKey, this); game.off(Game.EVENT_SHOW, this.onShow, this); game.off(Game.EVENT_HIDE, this.onHide, this); }
  private onHide() { this.audio.background(true); }
  private onShow() { this.audio.background(false); if (this.net.online) this.net.command('sync').catch(() => {}); }
  private async connect() { this.loginFailed = false; try { await this.net.start(); } catch (e) { this.loginFailed = true; this.toast((e as Error).message); } }
  private stateChanged() {
    const s = this.net.state!, r = s.room;
    const event = r ? feedbackEvent(r, s.me.id, { roomId: this.lastRoom, phase: this.lastPhase, guesses: this.seenGuesses }, this.suppressFeedback) : undefined;
    if (r && this.suppressFeedback) this.roundRoll.sync(r.id, r.round, false, true);
    this.suppressFeedback = false;
    if (this.confirmation && !confirmationValid(this.confirmation, r, s.me.id)) {
      this.confirmation = undefined; this.confirmAction = undefined;
      if (this.overlay === 'confirm') this.overlay = '';
    }
    if (this.overlay === 'gameMenu' && (!r || !['playing', 'reply'].includes(r.phase))) this.overlay = '';
    if (this.overlay === 'guessRecords' && r && ['finished', 'cancelled'].includes(r.phase)) this.overlay = 'resultRecords';
    if (shouldReturnToJoin(this.lastRoom, this.lastPhase, !!r, s.queuedAt !== null)) {
      this.page = 'join';
      const departing = this.root.getChildByName('FriendRoom');
      if (departing && this.joinArtReady && read('motion', '1') === '1') this.friendReturn.start(departing);
    }
    const sameRoom = !!r && r.id === this.lastRoom, oldTurn = this.lastTurn, oldPhase = this.lastPhase;
    if (!sameRoom && r && r.phase === 'preparing') this.audio.play('ready');
    if (!sameRoom) { this.clearEffects(); this.submitting = false; this.rematchNotice = ''; }
    this.seenGuesses = r?.history.length ?? 0;
    if ((r?.id ?? '') !== this.lastRoom) { this.draft = ''; this.recordScrolls = []; this.recordPositions.clear(); this.recordsOpponent = false; this.overlay = ''; this.lastRoom = r?.id ?? ''; this.lastTurn = -1; }
    if (r && r.turn !== this.lastTurn) { this.draft = ''; this.selected = -1; this.lastTurn = r.turn; this.openingRendered = false; }
    if (r && this.lastPhase === 'preparing' && r.phase === 'playing') { this.draft = ''; this.selected = -1; }
    this.lastPhase = r?.phase ?? '';
    const key = JSON.stringify({ ...s, serverNow: 0 }); if (key !== this.lastKey) { this.lastKey = key; this.render(); }
    if (r?.phase === 'cancelled') this.clearEffects();
    if (event) {
      this.submitting = false;
      if (event.kind === 'end') {
        event.caption = resultCaption(r!, s.me.id);
        if(r!.result?.reason==='timeout')event.art=r!.result.winner===s.me.id?'timeout-end-1':'timeout-end-0';
        if(r!.result?.reason==='reply_timeout'&&r!.result.winner!==s.me.id)event.art='timeout-end-2';
        this.endFeedbackUntil = Date.now() + 1800;
      }
      this.showFeedback(event);
    } else if (sameRoom && r && r.current === s.me.id && (r.turn !== oldTurn || oldPhase === 'preparing') && ['playing', 'reply'].includes(r.phase)) {
      this.turnCue(r.phase === 'reply' ? '最后一次补猜！' : '轮到你出牌了');
    }
  }

  private toast(text: string) { this.notice = text; this.noticeUntil = Date.now() + 6500; this.render(); }
  private async act(action: string, payload: Record<string, unknown> = {}) {
    if (this.busy) return; this.busy = true;
    if (action === 'guess') { this.submitting = true; this.feedback('正在验证', null, String(payload.digits ?? ''), '等待牌桌确认…', true); this.render(); }
    try { await this.net.command(action, { roomId: this.net.state?.room?.id, ...payload }); if (action === 'lock') this.audio.play('ready'); }
    catch (e) { this.audio.play('error'); if (action === 'guess') { this.submitting = false; this.clearEffects(); } this.notice = (e as Error).message; if (action === 'rematch' && /对方已离开|再战邀请已过期/.test(this.notice)) this.rematchNotice = this.notice; this.noticeUntil = Date.now() + 6500; }
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
    this.showFeedback({ kind: 'own', title: pending ? '正在验证' : title, hits: hits ?? undefined, caption, art: hits === 4 ? 'own-gold' : 'own' }, pending);
  }
  private showFeedback(event: FeedbackEvent, pending = false) {
    this.clearEffects();
    const available = this.screenHeight - this.layoutTop - bottomSafeInset() - 24;
    const group = this.feedbackArt.group(this.effects, 'GuessFeedback', this.screenHeight / 2 - this.layoutTop - available * .29, Math.min(1, available / 1100));
    const opponent = event.kind === 'opponent', own = event.kind === 'own';
    const width = own ? 430 : event.kind === 'end' ? 480 : 650;
    if (this.feedbackArt.ready) {
      this.feedbackArt.image(group, event.art, 0, 0, width);
      if (own) {
        this.feedbackArt.label(group, event.title, 0, -94, 335, 50, 29);
        const value = this.feedbackArt.label(group, pending ? '···' : `${event.hits} / 4`, 0, 40, 310, 100, 68);
        value.font = this.friendDigitFont ?? null;
        this.feedbackArt.label(group, event.caption, 0, 126, 354, 58, 22);
      } else if (opponent) {
        const value = this.feedbackArt.label(group, `${event.hits} / 4`, 24, -8, 285, 96, 68, event.urgent ? '#751F23' : C.ink);value.font = this.friendDigitFont ?? null;
      } else if (event.kind === 'end') {
        // The fixed success/failure heading remains in the artwork. Overlay actual reason below.
        const label = this.feedbackArt.label(group, event.art.startsWith('timeout-')?'':event.caption, 0, 125, 420, 60, 23, C.ink);
        label.node.name = 'ActualEndReason';
      }
    } else this.feedbackArt.label(group, event.title + '\n' + event.caption, 0, 0, 650, 140, 30, C.cream);
    this.audio.play(pending ? 'submit' : opponent ? (event.urgent ? 'warning' : 'tap') : event.kind === 'timeout' ? 'warning' : event.kind === 'end' ? (this.net.state?.room?.result?.winner === this.net.state?.me.id ? 'win' : this.net.state?.room?.result?.winner ? 'lose' : 'draw') : 'hit' + event.hits);
    if (event.urgent) vibrate();
    const opacity = group.addComponent(UIOpacity), motion = read('motion','1') === '1', scale = group.scale.clone();
    if (motion) { opacity.opacity = 0; group.setScale(scale.x*.92,scale.y*.92,1);tween(opacity).to(.16,{opacity:255}).start();tween(group).to(.2,{scale},{easing:'backOut'}).start(); }
    if (motion && opponent && event.hits === 0) tween(group).by(.07,{position:new Vec3(-6,0,0)}).by(.1,{position:new Vec3(12,0,0)}).by(.07,{position:new Vec3(-6,0,0)}).start();
    if (!pending) tween(opacity).delay(event.urgent ? 1.8 : 1.5).to(motion ? .18 : 0,{opacity:0}).call(()=>{group.destroy();}).start();
  }
  private turnCue(message: string) {
    if (Date.now() < this.endFeedbackUntil) return;
    this.audio.play('turn'); this.clearEffects();
    const group = this.feedbackArt.group(this.effects, 'TurnCue', this.screenHeight/2-this.layoutTop-(this.screenHeight-this.layoutTop-bottomSafeInset())*.28);
    if(this.feedbackArt.ready) this.feedbackArt.image(group,'turn',0,0,600);
    this.feedbackArt.label(group,message,56,8,430,70,28,this.feedbackArt.ready?C.ink:C.cream);
    const opacity=group.addComponent(UIOpacity);tween(opacity).delay(1.2).to(read('motion','1')==='1'?.18:0,{opacity:0}).call(()=>group.destroy()).start();vibrate();
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
    if (this.friendReturn.active && (this.net.state?.room || this.net.state?.queuedAt != null || this.page !== 'join' || read('motion', '1') !== '1')) this.friendReturn.finish();
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
    this.stopJoinMotion(); this.joinDigits = []; this.joinGlows = []; this.joinButton = undefined;
    this.hourglass = undefined; this.roundOld = undefined; this.roundNew = undefined;
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
    const modalKey = s && !this.net.online ? 'reconnect' : this.modalKey();
    this.modals.begin(this.modalArtReady ? modalKey : undefined, read('motion', '1') === '1');
    if (modalKey) this.artModal(modalKey);
    if (this.notice && Date.now() < this.noticeUntil) {
      if (this.feedbackArt.ready) {
        const group=this.feedbackArt.group(this.root,'Notice',0);
        let noticeArt: Node;
        if(this.notice.startsWith('确认超时')) {
          noticeArt=this.feedbackArt.image(group,'timeout-2',0,0,520);
          this.toastLabel=this.feedbackArt.label(group,'',0,0,1,1,1);
        } else {
          noticeArt=this.feedbackArt.image(group,/复制/.test(this.notice)?'toast':'warning',0,0,690);
          this.toastLabel=this.feedbackArt.label(group,this.notice,75,10,470,92,24);
        }
        // New artwork is taller than the original text-only toast. Keep its whole frame above the safe area.
        const height=noticeArt.getComponent(UITransform)!.height;
        group.setPosition(0,-this.screenHeight/2+bottomSafeInset()+16+height/2);
      } else { this.box(375,1278,700,62,C.dark);this.toastLabel=this.text(this.notice,375,1278,22,C.cream,670,58); }
    }
    this.updateTimer();
  }
  private loading() {
    if(this.feedbackArt.ready) {
      const group=this.feedbackArt.group(this.root,'LoginStatus',0,Math.min(1,(this.screenHeight-this.layoutTop-bottomSafeInset())/720));
      this.feedbackArt.image(group,this.loginFailed?'connection-1':'connection-0',0,0,620);
      if(this.loginFailed) this.feedbackArt.image(group,'retry',0,180,350,()=>{if(!this.reconnecting)this.retryLogin();});
      else this.feedbackArt.label(group,'连接中…',0,155,400,70,28);
      return;
    }
    this.header('猜数字暗号');this.text(this.loginFailed?'暂时无法连接牌桌':'正在连接牌桌',375,540,36);this.button('重新连接',375,780,360,84,()=>this.retryLogin(),true);
  }
  private async retryLogin() { if(this.reconnecting)return;this.reconnecting=true;this.net.stop();this.net=new Connection();this.net.onState=()=>this.stateChanged();this.net.onStatus=()=>this.render();this.net.onError=s=>this.toast(s);try{await this.connect();}finally{this.reconnecting=false;this.render();} }
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
    if (this.matchingArtReady) { this.matchingArtwork(); return; }
    this.header('在线匹配'); this.text('正在寻找对手', 375, 440, 44); this.text('准备迎接挑战了吗', 375, 505, 23, C.gold);
    this.box(375, 695, 260, 220, C.dark, 100); this.timerLabel = this.text('00:00', 375, 695, 54);
    const me = this.net.state!.me; this.portrait(me.name, me.avatar, 375, 925);
    this.button('取消匹配', 375, 1140, 520, 90, () => this.act('cancelQueue'), false, !this.busy);
  }
  private matchingArtwork() {
    const scale = Math.min(750 / 941, (this.screenHeight - this.layoutTop - bottomSafeInset() - 24) / (1545 - 157));
    const group = this.n('MatchingRoom', 375, 667, 941, 1672);
    const contentBottom = this.layoutTop + (1545 - 157) * scale;
    const shift = Math.max(0, (this.screenHeight - bottomSafeInset() - 80 - contentBottom) * .65);
    group.setPosition(0, this.screenHeight / 2 - this.layoutTop + 157 * scale - shift); group.setScale(scale, scale, 1);
    const sprite = (name: string, rect: number[], parent = group, frame = this.matchingArt.get(name)!) => {
      const [l,t,r,b] = rect;
      const node = this.n('Matching-' + name, 375, 667, r-l, b-t, parent);
      node.setPosition((l+r)/2 - 470.5, -(t+b)/2 + (parent === group ? 0 : 705));
      const image = node.addComponent(Sprite); image.spriteFrame = frame; image.sizeMode = Sprite.SizeMode.CUSTOM;
      node.getComponent(UITransform)!.setContentSize(r-l, b-t); return node;
    };
    sprite('opponent', [383,157,555,329]); sprite('heading', [229,344,716,550]);
    sprite('base', [142,704,799,1010]);
    // Uniform square cells keep the art pivot fixed, including tilted frames.
    const hourglass = sprite('hourglass-sheet', [302.5,537,638.5,873], group, this.hourglassFrames[0]);
    this.hourglass = hourglass.getComponent(Sprite)!;
    this.timerLabel = this.text('',375,667,57,'#FFD978',225,72,group);
    this.timerLabel.fontFamily = 'Times New Roman'; this.timerLabel.isBold = true;
    this.timerLabel.node.setPosition(0,-913);
    const me=this.net.state!.me, portrait=this.profileArt.get('avatar-'+me.avatar);
    const portraitBackground=this.profileArt.get('portrait-background');
    const portraitClip=this.n('MatchingPortraitClip',375,667,206,206,group);portraitClip.setPosition(1.5,-1160);
    portraitClip.addComponent(Mask).type=Mask.Type.GRAPHICS_ELLIPSE;
    const clipPortrait=(node:Node)=>{node.parent=portraitClip;node.setPosition(0,0);};
    if(portraitBackground) clipPortrait(sprite('portrait-background',[369,1057,575,1263],group,portraitBackground));
    if (portrait) clipPortrait(sprite('portrait',[369,1057,575,1263],group,portrait));
    else { const label=this.text(AVATARS[me.avatar] ?? '客',375,667,65,C.ink,180,190,group);label.node.setPosition(0,-1158); }
    sprite('portrait-rim',[315,1040,626,1240]); sprite('nameplate',[337,1224,603,1284]);
    const displayName=Array.from(me.name).length>7?Array.from(me.name).slice(0,6).join('')+'…':me.name;
    const name=this.text(displayName,375,667,32,C.cream,215,45,group);name.node.setPosition(0,-1253);name.enableWrapText=false;
    const cancel=sprite('cancel',[207,1390,734,1545]);
    if(this.busy) cancel.addComponent(UIOpacity).opacity=150;
    else {
      cancel.on(Node.EventType.TOUCH_START,()=>{if(read('motion','1')==='1')cancel.setScale(.97,.97,1);});
      cancel.on(Node.EventType.TOUCH_CANCEL,()=>cancel.setScale(1,1,1));
      cancel.on(Node.EventType.TOUCH_END,()=>{cancel.setScale(1,1,1);this.audio.unlock();this.audio.play('tap');this.act('cancelQueue');});
    }
    this.applyMatchingMotion();
  }
  private applyMatchingMotion() {
    const queuedAt=this.net.state?.queuedAt;
    if(!this.hourglass?.isValid || queuedAt == null || this.net.state?.room) return;
    const frame=this.hourglassFrames[matchingHourglass((this.net.now()-queuedAt)/1000,read('motion','1')==='1')];
    if(this.hourglass.spriteFrame !== frame) this.hourglass.spriteFrame=frame;
  }
  private join() {
    if (this.joinArtReady) { this.joinArtwork(); return; }
    this.header('好友对战', () => { this.page = 'lobby'; this.render(); });
    this.text('输入房间口令', 375, 340, 38); this.text('四位口令，加入好友的牌桌', 375, 402, 23, C.gold);
    this.cards(this.code, 520, 100); this.button('加入房间', 375, 680, 560, 85, () => this.act('join', { code: this.code }), true, this.code.length === 4 && !this.busy);
    this.button('自己创建房间', 375, 782, 560, 70, () => this.act('create'), false, !this.busy); this.keypad(925, 'join');
  }
  private joinArtwork() {
    // Fit the complete 941px source composition, including the keyboard, inside safe bounds.
    const scale = Math.min(750 / 941, (this.screenHeight - this.layoutTop - bottomSafeInset() - 16) / (1632 - 46));
    const group = this.n('JoinRoom', 375, 667, 941, 1672);
    group.setPosition(0, this.screenHeight / 2 - this.layoutTop + 46 * scale); group.setScale(scale, scale, 1);
    const art = (name: string, rect: readonly number[], action?: () => void, enabled = true) => {
      const [left, top, right, bottom] = rect, w = right - left, h = bottom - top;
      const node = this.n('Join-' + name, 375, 667, w, h, group);
      node.setPosition((left + right) / 2 - 470.5, -(top + bottom) / 2);
      const sprite = node.addComponent(Sprite); sprite.spriteFrame = this.joinArt.get(name)!;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM; node.getComponent(UITransform)!.setContentSize(w, h);
      if (!enabled) { sprite.grayscale = true; node.addComponent(UIOpacity).opacity = 165; }
      if (action && (enabled || name === 'join')) {
        node.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') node.setScale(.97, .97, 1); });
        node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
        node.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); if (name === 'join' && (this.code.length !== 4 || this.busy || !this.net.online)) return; this.audio.unlock(); if (!name.startsWith('key-')) this.audio.play('tap'); action(); });
      }
      return node;
    };
    art('back', [26, 46, 227, 122], () => { this.page = 'lobby'; this.render(); }, !this.busy);
    art('heading', [249, 65, 696, 256]); art('paper', [120, 292, 823, 998]);
    for (let i = 0; i < 4; i++) {
      const digit = this.text(this.code[i] ?? '', 375, 667, 105, C.ink, 110, 140, group);
      digit.node.setPosition([266, 402, 540, 677][i] - 470.5, -557);
      digit.font = this.friendDigitFont ?? null; digit.fontFamily = 'serif'; digit.isBold = !this.friendDigitFont;
      digit.lineHeight = 112; digit.enableWrapText = false;
      digit.node.addComponent(UIOpacity); this.joinDigits.push(digit);
      const glow = this.n('JoinDigitGlow', 375, 667, 120, 145, group);
      glow.setPosition([266, 402, 540, 677][i] - 470.5, -557);
      const border = glow.addComponent(Graphics); border.strokeColor = new Color('#E9B55A'); border.lineWidth = 3;
      border.roundRect(-58, -71, 116, 142, 7); border.stroke();
      const opacity = glow.addComponent(UIOpacity); opacity.opacity = 0; this.joinGlows.push(opacity);
    }
    this.joinButton = art('join', [221, 716, 723, 842], () => this.act('join', { code: this.code }), this.code.length === 4 && !this.busy && this.net.online);
    art('create', [244, 849, 699, 949], () => this.act('create'), !this.busy && this.net.online);
    art('keyboard', [0, 1047, 941, 1632]);
    const keys: [string, number[]][] = [
      ['1', [103,1100,341,1200]], ['2', [353,1100,591,1200]], ['3', [604,1100,842,1200]],
      ['4', [90,1205,337,1309]], ['5', [350,1205,594,1309]], ['6', [607,1205,854,1309]],
      ['7', [77,1315,332,1422]], ['8', [347,1315,598,1422]], ['9', [611,1315,867,1422]],
      ['clear', [58,1430,327,1559]], ['0', [340,1430,601,1559]], ['delete', [613,1430,883,1559]],
    ];
    for (const [key, rect] of keys) art('key-' + key, rect,
      () => this.digit(key === 'clear' ? '清空' : key === 'delete' ? '删除' : key, 'join'), !this.busy && this.net.online);
    this.friendReturn.attach(group);
  }
  private stopJoinMotion() {
    for (const label of this.joinDigits) {
      if (!label.isValid) continue;
      Tween.stopAllByTarget(label.node); const opacity = label.node.getComponent(UIOpacity);
      if (opacity) Tween.stopAllByTarget(opacity);
    }
    for (const glow of this.joinGlows) if (glow.isValid) Tween.stopAllByTarget(glow);
    if (this.joinButton?.isValid) Tween.stopAllByTarget(this.joinButton);
  }
  private animateJoinDigits(previous: string, next: string) {
    const motion = read('motion', '1') === '1';
    this.joinDigits.forEach((label, i) => {
      if (previous[i] === next[i]) return;
      const node = label.node, opacity = node.getComponent(UIOpacity)!, glow = this.joinGlows[i];
      Tween.stopAllByTarget(node); Tween.stopAllByTarget(opacity); Tween.stopAllByTarget(glow);
      const rest = new Vec3([266, 402, 540, 677][i] - 470.5, -557, 0);
      node.setPosition(rest); node.setScale(1, 1, 1); opacity.opacity = 255; glow.opacity = 0;
      if (!motion) { label.string = next[i] ?? ''; return; }
      if (next[i] !== undefined) {
        label.string = next[i]; node.setPosition(rest.x, rest.y + 10); node.setScale(.85, .85, 1); opacity.opacity = 0;
        tween(node).to(.12, { position: rest, scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadOut' })
          .to(.06, { scale: Vec3.ONE }).start();
        tween(opacity).to(.10, { opacity: 255 }).start();
        tween(glow).to(.06, { opacity: 150 }).to(.16, { opacity: 0 }).start();
      } else {
        // State changes immediately; a retyped slot cancels both exit tweens before reuse.
        const delay = next.length === 0 ? (previous.length - 1 - i) * .03 : 0;
        tween(node).delay(delay).to(.13, { position: new Vec3(rest.x, rest.y + 8, 0), scale: new Vec3(.85, .85, 1) }, { easing: 'quadIn' }).start();
        tween(opacity).delay(delay).to(.13, { opacity: 0 }).call(() => { label.string = ''; }).start();
      }
    });
    const button = this.joinButton;
    if (button?.isValid) {
      const enabled = next.length === 4 && !this.busy && this.net.online;
      button.getComponent(Sprite)!.grayscale = !enabled;
      const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity); opacity.opacity = enabled ? 255 : 165;
      Tween.stopAllByTarget(button); button.setScale(1, 1, 1);
      if (motion && enabled && previous.length < 4) tween(button).to(.09, { scale: new Vec3(1.025, 1.025, 1) }).to(.11, { scale: Vec3.ONE }).start();
    }
  }
  private keypad(top: number, context: 'join' | 'secret' | 'guess', enabled = true) {
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '删除', '0', context === 'secret' ? '随机' : '清空'];
    labels.forEach((label, i) => { if (context === 'guess' && i === 11) return; this.button(label, 165 + i % 3 * 210, top + Math.floor(i / 3) * 80, 194, 66, () => this.digit(label, context), false, enabled && !this.busy); });
  }
  private digit(value: string, context: 'join' | 'secret' | 'guess') {
    if (context === 'join' && (this.friendReturn.active || this.busy || !this.net.online)) return;
    this.audio.play('tap');
    let v = context === 'join' ? this.code : this.draft;
    if (value === '删除') v = v.slice(0, -1);
    else if (value === '清空') v = '';
    else if (value === '随机') v = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    else if (this.selected >= 0 && context !== 'join' && this.selected < v.length) { v = v.slice(0, this.selected) + value + v.slice(this.selected + 1); this.selected = this.selected < 3 ? this.selected + 1 : -1; }
    else if (v.length < 4) v += value;
    if (context === 'join') {
      const previous = this.code; this.code = v;
      if (this.joinDigits.length === 4 && this.joinDigits.every(label => label.isValid)) {
        this.animateJoinDigits(previous, v); return;
      }
    } else this.draft = v;
    this.render();
  }
  private onKey(e: EventKeyboard) {
    this.audio.unlock();
    if (this.friendReturn.active || this.modals.node.active || this.overlay || this.page === 'profile' && !this.net.state?.room || !this.net.online || this.busy) return;
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
    if (this.battleArtReady) { this.battleArtwork(r); return; }
    const opponent = r.players.find(p => p.id !== this.net.state!.me.id)!;
    this.header(r.phase === 'preparing' ? '设置底牌' : `第 ${r.round} 轮 / 20`, () => {
      if (r.phase === 'preparing') this.ask('leave', () => this.act('leave'));
      else { this.overlay = 'gameMenu'; this.render(); }
    });
    this.actor(214, 230); this.box(375, 305, 290, 40, C.dark);
    this.text(opponent.name + (opponent.online ? '' : ' · 连接中'), 375, 305, 21, C.cream, 270, 38); this.cards('', 270, 45, true);
    if (r.phase === 'preparing') this.preparation(r); else this.play(r);
  }
  private waiting(r: RoomView) {
    if (this.friendArtReady) { this.friendWaiting(r); return; }
    this.header('好友房', () => this.ask('close', () => this.act('leave')));
    this.text('等待好友入座', 375, 390, 36); this.text('1 / 2', 375, 455, 24, C.gold);
    this.box(375, 685, 650, 350, C.dark); this.text('房间口令', 375, 555, 28); this.cards(r.code!, 660, 100);
    this.button('复制口令', 375, 800, 340, 62, () => { copy(r.code!); this.toast('房间口令：' + r.code); }, true);
    this.timerLabel = this.text('', 375, 930, 24); this.button('关闭房间', 375, 1120, 520, 88, () => this.ask('close', () => this.act('leave')));
  }
  /** Source-space composition: one uniform transform also scales fonts and hit targets. */
  private friendWaiting(r: RoomView) {
    const scale = Math.min(750 / 941, (this.screenHeight - this.layoutTop - bottomSafeInset() - 24) / 1463);
    const group = this.n('FriendRoom', 375, 667, 941, 1672);
    group.setPosition(0, this.screenHeight / 2 - this.layoutTop + 32 * scale);
    group.setScale(scale, scale, 1);
    // Keep navigation fixed; use tall-screen space below the body, like the reference.
    const bodyBottom = this.layoutTop + (1495 - 32) * scale;
    const targetBottom = this.screenHeight - bottomSafeInset() - Math.min(120, this.screenHeight * .09);
    const bodyShift = Math.max(0, targetBottom - bodyBottom) / scale;
    const place = (node: Node, x: number, y: number) => { node.setPosition(x - 470.5, -y - (y > 128 ? bodyShift : 0)); return node; };
    const art = (name: string, x: number, y: number, w: number, h: number, action?: () => void) => {
      const node = place(this.n('Friend-' + name, 375, 667, w, h, group), x, y);
      const sprite = node.addComponent(Sprite); sprite.spriteFrame = this.friendArt.get(name)!;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM; node.getComponent(UITransform)!.setContentSize(w, h);
      if (action) {
        if (this.busy) node.addComponent(UIOpacity).opacity = 150;
        else {
          node.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') node.setScale(.97, .97, 1); });
          node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
          node.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); this.audio.unlock(); this.audio.play('tap'); action(); });
        }
      }
      return node;
    };
    const label = (value: string, x: number, y: number, size: number, color: string, w: number, h: number) => {
      const l = this.text(value, 375, 667, size, color, w, h, group); place(l.node, x, y); return l;
    };
    const close = () => this.ask('close', () => this.act('leave'));
    art('back', 133.5, 81, 199, 84, close);
    art('heading', 471, 80, 320, 96);
    art('waiting', 471, 328, 158, 148);
    art('count', 471.5, 488, 187, 76);
    label(`${r.players.length}/2`, 492, 487, 37, C.cream, 78, 50);
    art('paper', 478.5, 814.5, 807, 561);
    for (let i = 0; i < 4; i++) {
      const digit = label(r.code?.[i] ?? '—', [254, 398, 545, 687][i], 720, 105, '#191007', 112, 140);
      // Embedded lining figures share a baseline; system Georgia uses old-style descenders.
      digit.font = this.friendDigitFont ?? null;
      digit.fontFamily = 'serif'; digit.isBold = !this.friendDigitFont;
      digit.lineHeight = 112; digit.enableWrapText = false;
    }
    art('copy', 470.5, 872.5, 397, 105, () => { if (r.code) { copy(r.code); this.toast('房间口令：' + r.code); } });
    this.timerLabel = label('', 569, 1024, 27, C.ink, 88, 40);
    const me = this.net.state!.me;
    // Actual player portrait, followed by the existing hollow decorative rim.
    for (const [key, size] of [['portrait-background', 178], ['avatar-' + me.avatar, 178], ['portrait-frame', 198]] as const) {
      const frame = this.profileArt.get(key);
      if (!frame) { if (size === 178) label(AVATARS[me.avatar] ?? '客', 471, 1195, 60, C.ink, 150, 160); continue; }
      const node = place(this.n('Friend-' + key, 375, 667, size, size, group), 471, 1195);
      const sprite = node.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      node.getComponent(UITransform)!.setContentSize(size, size);
    }
    art('nameplate', 471, 1278.5, 210, 51);
    label(me.name, 471, 1278, 26, C.cream, 174, 38);
    art('seated', 471.5, 1318, 163, 36);
    art('close', 470.5, 1439.5, 447, 111, close);
  }
  /** Both battle screens use the reference coordinate system and one safe-area transform. */
  private battleArtwork(r: RoomView) {
    const prep = r.phase === 'preparing', me = this.net.state!.me;
    const opponent = r.players.find(p => p.id !== me.id)!;
    const scale = Math.min(750 / 941, (this.screenHeight - this.layoutTop - bottomSafeInset() - 16) / 1590);
    const group = this.n('BattleRoom', 375, 667, 941, 1672);
    group.setPosition(0, this.screenHeight / 2 - this.layoutTop + 20 * scale); group.setScale(scale, scale, 1);
    const place = (node: Node, x: number, y: number) => { node.setPosition(x - 470.5, -y); return node; };
    const touch = (node: Node, action: () => void, enabled = true) => {
      if (!enabled) { node.addComponent(UIOpacity).opacity = 170; return; }
      node.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') node.setScale(.98, .98, 1); });
      node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
      node.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); this.audio.unlock(); action(); });
    };
    const art = (name: string, rect = BATTLE_RECTS[name], frame = this.battleArt.get(name)!) => {
      const [l,t,r,b] = rect;
      const node = place(this.n('Battle-' + name,375,667,r-l,b-t,group),(l+r)/2,(t+b)/2);
      const sprite = node.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      node.getComponent(UITransform)!.setContentSize(r-l,b-t); return node;
    };
    const label = (value: string, x: number, y: number, size: number, w: number, color = C.ink, h = size * 1.5) => {
      const l = this.text(value,375,667,size,color,w,h,group); place(l.node,x,y); l.enableWrapText = false; return l;
    };
    const number = (value: string, x: number, y: number, size: number, w: number, h = size * 1.5) => {
      const l = label(value,x,y,size,w,C.ink,h);
      if (this.friendDigitFont && /^[0-9—]+$/.test(value)) { l.font=this.friendDigitFont; l.lineHeight=size*1.1; }
      else l.isBold=true;
      return l;
    };
    const shortName = (name: string, limit: number) => Array.from(name).length > limit ? Array.from(name).slice(0,limit-1).join('')+'…' : name;
    // The tray is below all controls and hands; each key remains independently clickable.
    art(prep ? 'tray' : 'play-tray');
    art('opponent');
    const nameplate=art('nameplate');
    touch(nameplate,()=>this.toast(opponent.name+(opponent.online?'':' · 连接中')));
    label(shortName(opponent.name,6),472,153,23,134,C.cream,30);
    art('card-backs');
    const nav = art('round');
    const navText = (value: string, x: number, width: number, parent = nav) => {
      const item = this.text(value,375,667,30,C.cream,width,44,parent);
      item.node.setPosition(x,0);item.lineHeight=36;item.enableWrapText=false;
      return item;
    };
    navText('‹',105,22);
    if (prep) {
      this.roundRoll.sync(r.id,0,false,true);
      navText('设置底牌',-9,190);
    } else {
      navText('第',-78,32);navText('轮 / 20',32,94);
      const clip = this.n('RoundDigitViewport',375,667,50,42,nav);clip.setPosition(-40,0);
      clip.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
      this.roundRoll.sync(r.id,r.round,read('motion','1')==='1');
      const oldDigit=navText(String(this.roundRoll.previous),0,50,clip);
      const newDigit=navText(String(r.round),0,50,clip);
      oldDigit.node.name='RoundPrevious';newDigit.node.name='RoundCurrent';
      this.roundOld=oldDigit.node;this.roundNew=newDigit.node;
      this.applyRoundRoll();
    }
    touch(nav, () => { if (prep) this.ask('leave',()=>this.act('leave')); else { this.overlay='gameMenu';this.render(); } });
    const editable = !this.busy && this.net.online && (prep ? !r.ownSecret : r.current === me.id && this.net.now() >= r.startAt);
    if (prep) {
      art('status'); label(opponent.ready ? '对手已准备' : '对手正在设置',470,323,23,170,C.cream);
      art('heading'); art('timer');
      this.timerLabel=label('',497,489,42,70,'#FFD978',54);
      if(this.friendDigitFont) this.timerLabel.font=this.friendDigitFont;
      this.timerLabel.lineHeight=46;
      label('s',540,493,29,20,'#FFD978',38);
      const rules=art('rules'); touch(rules,()=>{this.overlay='rules';this.render();});
      const value=r.ownSecret ?? this.draft;
      // Palm behind the cards; only the isolated thumb crosses their front edge.
      art('hand-right');
      for(let i=0;i<4;i++) {
        const active=editable && (this.selected===i || this.selected<0 && value.length===i);
        const x=248+i*149, y=752+(i===0||i===3?25:0)-(active?14:0);
        const card=art('card-paper',[x-96,y-132,x+96,y+132]);card.angle=[14,5,-5,-14][i];
        if(active) { const edge=art('card-selected',[x-100,y-137,x+100,y+137]);edge.angle=card.angle; }
        const digit=number(value[i] ?? '',x,y,132,155,172);digit.node.angle=card.angle;
        if(editable) { touch(card,()=>{this.selected=i;this.render();});touch(digit.node,()=>{this.selected=i;this.render();}); }

      }
      art('hands');art('right-thumb');
      const lock=art('lock');touch(lock,()=>this.lockSecret(),editable&&this.draft.length===4);
      art('status',[230,1546,711,1603]);
      label(r.ownSecret ? '底牌已锁定，等待对手' : 'ⓘ 锁定后本局不可修改',470,1572,29,650,C.gold);
    } else {
      art('records');
      const records=art('all-records');touch(records,()=>{this.recordsOpponent=false;this.overlay='guessRecords';this.render();});
      const rows=r.history.filter(h=>h.playerId===me.id).slice(-3);
      if(!rows.length) label('暂无记录，输入四位数字开始猜测',470,532,27,620);
      rows.forEach((h,i)=>{
        const y=443+i*94;
        art('record-row',[149,y-46,805,y+44]);
        label(`第${Math.floor(h.turn/2)+1}轮`,231,y,30,145);
        if(h.digits) for(let j=0;j<4;j++) number(h.digits[j],349+j*88,y,45,67);
        else label('本次超时',481,y,30,350);
        label(h.hits===null?'—':`${h.hits}/4`,727,y,35,110,'#FFD978');
      });
      art('guess');
      for(let i=0;i<4;i++) {
        const digit=number(this.draft[i] ?? '',298+i*116,840,77,95,106);
        touch(digit.node,()=>{this.selected=i;this.render();},editable);
      }
      for(let i=0;i<4;i++) {
        const x=306+i*105,y=1030+(i===0||i===3?15:0);
        const card=art('card-paper',[x-69,y-95,x+69,y+95]);card.angle=[16,6,-6,-16][i];
        const digit=number(this.hideSecret?'?':r.ownSecret?.[i] ?? '',x,y,83,100,115);digit.node.angle=card.angle;
        touch(card,()=>{this.hideSecret=!this.hideSecret;this.render();});touch(digit.node,()=>{this.hideSecret=!this.hideSecret;this.render();});
      }
      art('play-hand-left'); art('play-hand-right');
      const portraitRect=[28,1000,208,1180];
      const portrait=this.profileArt.get('avatar-'+me.avatar);
      const portraitBg=this.profileArt.get('portrait-background');
      const portraitClip=place(this.n('BattlePortraitClip',375,667,180,180,group),118,1090);
      portraitClip.addComponent(Mask).type=Mask.Type.GRAPHICS_ELLIPSE;
      const clipPortrait=(node:Node)=>{node.parent=portraitClip;node.setPosition(0,0);};
      if(portraitBg) clipPortrait(art('portrait-background',portraitRect,portraitBg));
      if(portrait) clipPortrait(art('portrait',portraitRect,portrait));
      else label(AVATARS[me.avatar] ?? '客',118,1090,64,140,C.ink,120);
      const rim=this.profileArt.get('portrait-frame');
      if(rim) art('portrait-frame',[23,995,213,1185],rim);
      art('nameplate',[18,1154,213,1192]);
      label(shortName(me.name,7),115,1173,24,181,C.cream);
      const secretStatus=art('status',[315,1106,626,1151]);
      touch(secretStatus,()=>{this.hideSecret=!this.hideSecret;this.render();});
      label(this.hideSecret?'底牌已隐藏 · 点击查看':'我的底牌 · 已锁定',470,1128,23,280,C.cream);
      art('turn');this.timerLabel=label('',470,1190,28,330,C.cream,48);
    }
    const prefix=prep?'prep-':'play-';
    for(const key of ['1','2','3','4','5','6','7','8','9','delete','0','action']) {
      const node=art(prefix+key);
      touch(node,()=>{if(key==='action') {if(prep)this.digit('随机','secret');else this.submitGuess();}
        else this.digit(key==='delete'?'删除':key,prep?'secret':'guess');}, editable && (key!=='action'||prep||this.draft.length===4));
    }
  }
  private preparation(r: RoomView) {
    this.text(r.players.find(p => p.id !== this.net.state!.me.id)?.ready ? '对手已准备' : '对手正在设置', 375, 365, 22, C.gold);
    this.timerLabel = this.text('', 375, 425, 28); this.text(r.ownSecret ? '底牌已锁定，等待对手' : '设置你的四位密码', 375, 485, 34);
    this.cards(r.ownSecret ?? this.draft, 625, 112, false, !r.ownSecret); this.text('允许重复，允许 0 开头', 375, 730, 22, C.gold);
    this.keypad(835, 'secret', !r.ownSecret && this.net.online);
    this.button(r.ownSecret ? '已准备' : '锁定并准备', 375, 1195, 610, 84, () => this.lockSecret(), true, !r.ownSecret && this.draft.length === 4 && !this.busy);
  }
  private lockSecret() { const digits = this.draft; if (digits.length === 4) this.ask('lock', () => this.act('lock', { digits })); }
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
    const digits = this.draft; const submit = () => this.act('guess', { digits, turn: r.turn });
    if (r.history.some(h => h.playerId === this.net.state!.me.id && h.digits === this.draft)) this.ask('repeat', submit); else submit();
  }
  private artResult(r: RoomView) {
    const me=this.net.state!.me.id;
    const available=this.screenHeight-this.layoutTop-bottomSafeInset()-20;
    const scale=Math.min(750/941,available/1450);
    const group=this.feedbackArt.group(this.root,'ArtResult',this.screenHeight/2-this.layoutTop-(available-1450*scale)/2,scale);
    const art=(key:string,x:number,y:number,w:number,action?:()=>void)=>this.feedbackArt.image(group,key,x,y,w,action?()=>{this.audio.unlock();this.audio.play('tap');action();}:undefined);
    const label=(text:string,x:number,y:number,w:number,h:number,size=30)=>this.feedbackArt.label(group,text,x,y,w,h,size);
    const home=()=>{this.page='lobby';this.act('leave');};
    if(r.phase==='cancelled') {
      art(cancellationArt(r.result?.reason),0,650,720);
      art('home',0,860,420,home);return;
    }
    const win=r.result?.winner===me, draw=!r.result?.winner;
    art(draw?'draw-title':win?'victory-title':'defeat-title',0,win||draw?180:200,draw?550:win?500:750);
    if(!r.rematch.includes(me)&&!this.rematchNotice)label(resultCaption(r,me),0,380,650,50,28).color=new Color(C.cream);
    if(r.rematch.includes(me)||this.rematchNotice) {
      const key=this.rematchNotice.includes('离开')?1:this.rematchNotice?2:0;
      art('rematch-'+key,0,850,730);
      if(key===0)label('等待中…',0,1080,450,65,30);
      else art('match',0,1080,360,()=>this.act('queue'));
      art('result-home',0,1190,360,home);return;
    }
    art('result-paper',0,810,840);
    const peer=r.players.find(p=>p.id!==me);
    const count=(id:string)=>r.history.filter(h=>h.playerId===id&&h.digits!==null).length;
    label(`我的猜测      ${count(me)} 次`,0,620,700,70,35);
    label(`对手猜测      ${count(peer?.id??'')} 次`,0,720,700,70,35);
    label('我的底牌',-260,870,200,70,30);label('对手密码',-260,1010,200,70,30);
    for(const [digits,y] of [[r.ownSecret??'',870],[r.revealed?.[peer?.id??'']??'',1010]] as const) {
      for(let i=0;i<4;i++) {
        const x=-75+i*116;
        const n=this.feedbackArt.group(group,'ResultDigit',-y);n.setPosition(x,-y);
        const sprite=n.addComponent(Sprite);sprite.spriteFrame=this.battleArt.get('card-paper')??this.joinArt.get('digit-slot')??null;sprite.sizeMode=Sprite.SizeMode.CUSTOM;n.getComponent(UITransform)!.setContentSize(98,125);
        const digit=label(digits[i]??'—',x,y,90,110,72);digit.font=this.friendDigitFont??null;
      }
    }
    art('records',0,1135,380,()=>{this.overlay='resultRecords';this.render();});
    art('rematch',0,1260,767,()=>{if(!this.busy)this.act('rematch');});
    art('match',-200,1390,368,()=>{if(!this.busy)this.act('queue');});
    art('result-home',200,1390,362,home);
  }
  private result(r: RoomView) {
    if (this.feedbackArt.ready) { this.artResult(r); return; }
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
  private applyRoundRoll() {
    const pose=this.roundRoll.pose;
    if(this.roundOld?.isValid){this.roundOld.active=pose.active;this.roundOld.setPosition(0,pose.oldY);}
    if(this.roundNew?.isValid)this.roundNew.setPosition(0,pose.newY);
  }
  update(dt: number) {
    this.roundRoll.advance(dt,read('motion','1')==='1');this.applyRoundRoll();
    this.scenery?.update(dt);
    this.applyMatchingMotion();
    this.modals?.update(dt, read('motion', '1') === '1');
    this.friendReturn?.update(dt, read('motion', '1') === '1');
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
  private ask(kind: ConfirmationKind, action: () => void) {
    const room = this.net.state?.room; if (!room) return;
    this.confirmation = { kind, roomId: room.id, turn: room.turn, digits: this.draft };
    this.confirmAction = action; this.overlay = 'confirm'; this.render();
  }
  private closeModal = () => { this.overlay = ''; this.confirmation = undefined; this.confirmAction = undefined; this.render(); };
  private acceptModal = () => {
    const pending = this.confirmation, state = this.net.state;
    if (!pending || !state || !this.net.online || this.busy || !confirmationValid(pending, state.room, state.me.id)) { this.closeModal(); return; }
    const action = this.confirmAction; this.closeModal(); action?.();
  };
  private async retryConnection() {
    if (this.reconnecting || this.net.online) return;
    this.reconnecting = true;
    const state = this.net.state;
    this.net.onStatus = () => {}; this.net.onState = () => {}; this.net.stop();
    this.net = new Connection(); this.net.state = state;
    this.net.onState = () => this.stateChanged(); this.net.onStatus = () => { if (!this.net.online) this.suppressFeedback = true; this.render(); }; this.net.onError = s => this.toast(s);
    this.render();
    try { await this.connect(); } finally { this.reconnecting = false; this.render(); }
  }
  private modalKey(): ModalKind | undefined {
    return this.overlay === 'confirm' ? this.confirmation?.kind
      : ({ settings: 'settings', rules: 'rules', gameMenu: 'menu', guessRecords: 'live', resultRecords: 'result' } as Record<string, ModalKind>)[this.overlay];
  }
  /** All artwork, text and hit targets share one source-space transform. */
  private artModal(key: ModalKind) {
    if (!this.modalArtReady) {
      const blocker = this.n('ModalBlocker', 375, 667, 750, this.screenHeight); blocker.setPosition(0, 0); blocker.addComponent(BlockInputEvents);
      const shade = blocker.addComponent(Graphics); shade.fillColor = new Color(5, 17, 16, 170); shade.rect(-375, -this.screenHeight / 2, 750, this.screenHeight); shade.fill();
      if(this.feedbackArt.ready) {
        const group=this.feedbackArt.group(blocker,'InterfaceLoading',0,Math.min(1,(this.screenHeight-this.layoutTop-bottomSafeInset())/750));
        this.feedbackArt.image(group,this.modalArtFailed?'connection-3':'connection-2',0,0,620);
      } else this.text(this.modalArtFailed ? '弹窗素材加载失败，请返回重试' : '正在加载弹窗素材…', 375, 620, 28);
      this.button(key === 'reconnect' ? '重新连接' : '返回', 375, 800, 360, 80, key === 'reconnect' ? () => this.retryConnection() : this.closeModal);
      return;
    }
    const bounds = MODAL_RECTS[key + '-body'];
    const top = Math.min(bounds[1], MODAL_RECTS[key + '-back']?.[1] ?? bounds[1]);
    const available = this.screenHeight - this.layoutTop - bottomSafeInset() - 32;
    const scale = Math.min(750 / 941, available / (bounds[3] - top + 50));
    const group = this.n('Modal-' + key, 375, 667, 941, 1672, this.modals.node);
    group.setScale(scale, scale, 1);
    group.setPosition(0, this.screenHeight / 2 - this.layoutTop - (available - (bounds[3] - top) * scale) / 2 + top * scale);
    const place = (n: Node, x: number, y: number) => { n.setPosition(x - 470.5, -y); return n; };
    const art = (name: string, action?: () => void, rect = MODAL_RECTS[name], parent = group) => {
      const [l, t, r, b] = rect;
      const n = place(this.n('ModalArt-' + name, 375, 667, r - l, b - t, parent), (l + r) / 2, (t + b) / 2);
      const sprite = n.addComponent(Sprite); sprite.spriteFrame = this.modalArt.get(name)!; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      n.getComponent(UITransform)!.setContentSize(r - l, b - t);
      if (action) {
        n.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') n.setScale(.98, .98, 1); });
        n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1));
        n.on(Node.EventType.TOUCH_END, () => { n.setScale(1, 1, 1); if (!this.modals.interactive) return; this.audio.unlock(); this.audio.play('tap'); action(); });
      }
      return n;
    };
    const label = (value: string, x: number, y: number, size: number, width: number, height: number, color = C.ink, parent = group) => {
      const l = this.text(value, 375, 667, size, color, width, height, parent); place(l.node, x, y); return l;
    };
    art(key + '-body');
    if (MODAL_RECTS[key + '-back']) art(key + '-back', this.closeModal);
    if (MODAL_RECTS[key + '-done']) art(key + '-done', this.closeModal);
    if (key === 'settings') {
      ['music', 'sound', 'motion', 'vibration'].forEach((setting, i) => {
        const y = [542, 733, 923, 1114][i];
        art(read(setting, '1') === '1' ? 'toggle-on' : 'toggle-off', () => {
          if (setting === 'music' || setting === 'sound') this.audio.toggle(setting);
          else write(setting, read(setting, '1') === '1' ? '0' : '1');
          this.render();
        }, [610, y, 774, y + 88]);
      });
    } else if (key === 'menu') {
      art('menu-continue', this.closeModal); art('menu-resign', () => this.ask('resign', () => this.act('resign')));
    } else if (key === 'reconnect') {
      const retry = art('reconnect-retry', () => this.retryConnection());
      if (this.reconnecting) retry.addComponent(UIOpacity).opacity = 150;
    } else if (['lock', 'repeat', 'leave', 'close', 'resign'].includes(key)) {
      art(key + '-cancel', this.closeModal); art(key + '-confirm', this.acceptModal);
      if (key === 'lock' || key === 'repeat') {
        const xs = key === 'lock' ? [214, 385, 557, 729] : [225, 389, 553, 717];
        xs.forEach((x, i) => {
          const digit = label(this.confirmation?.digits[i] ?? '—', x, key === 'lock' ? 822 : 794, 116, 126, 150, '#211005');
          digit.font = this.friendDigitFont ?? null; digit.lineHeight = 125; digit.enableWrapText = false;
        });
      }
    } else if (key === 'live' || key === 'result') {
      const state = this.net.state, room = state?.room; if (!state || !room) return;
      const live = key === 'live';
      if (live) this.timerLabel = label('', 513, 416, 31, 310, 56, C.cream);
      const tabY = live ? 476 : 428, headerY = live ? 575 : 535, rowTop = live ? 644 : 616;
      for (const [opponent, x] of [[false, 130], [true, 482]] as const) {
        const selected = this.recordsOpponent === opponent;
        art(selected ? 'tab-on' : 'tab-off', () => { this.recordsOpponent = opponent; this.render(); }, [x, tabY, x + 340, tabY + 84]);
        const count = room.history.filter(h => (h.playerId !== state.me.id) === opponent).length;
        label(`${opponent ? '对手' : '我的'}猜测  ${count}`, x + 170, tabY + 42, 34, 320, 66, selected ? C.cream : C.ink);
      }
      art('record-header', undefined, [144, headerY, 802, headerY + 64]);
      const rows = room.history.filter(h => (h.playerId !== state.me.id) === this.recordsOpponent);
      const rowHeight = live ? 73 : 100, height = live ? 584 : 600, width = 660;
      const viewport = place(this.n('ModalRecordsViewport', 375, 667, width, height, group), 470.5, rowTop + height / 2);
      viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      const content = new Node('ModalRecordsContent'); content.layer = Layers.Enum.UI_2D; viewport.addChild(content);
      const transform = content.addComponent(UITransform); transform.setAnchorPoint(.5, 1); transform.setContentSize(width, Math.max(height, rows.length * rowHeight));
      content.setPosition(0, height / 2);
      const scroll = viewport.addComponent(ScrollView); scroll.content = content; scroll.horizontal = false; scroll.vertical = true; scroll.inertia = true; scroll.elastic = false;
      rows.forEach((h, i) => {
        const y = i * rowHeight;
        art(i === rows.length - 1 ? 'record-latest-row' : 'record-row', undefined, [144, y, 797, y + rowHeight - 3], content);
        label(String(Math.floor(h.turn / 2) + 1), 227, y + rowHeight / 2, 35, 100, rowHeight - 6, C.ink, content);
        label(h.digits ? h.digits.split('').join(' ') : '本次超时', 470, y + rowHeight / 2, 37, 280, rowHeight - 6, C.ink, content);
        label(h.hits === null ? '—' : h.hits + '位', 692, y + rowHeight / 2, 35, 120, rowHeight - 6, C.ink, content);
      });
      if (!rows.length) {
        if (this.feedbackArt.ready) this.feedbackArt.image(group,'empty-ledger',0,rowTop+height/2-65,200);
        label('暂无猜测记录',470,rowTop+height/2+100,32,580,60);
        label('完成一次猜测后，记录会显示在这里',470,rowTop+height/2+160,24,580,60);
      }
      const scrollKey = `modal-${key}:${this.recordsOpponent}`, position = this.recordPositions.get(scrollKey);
      const max = Math.max(0, rows.length * rowHeight - height);
      scroll.scrollToOffset(new Vec2(0, position && !position.bottom ? Math.min(max, position.offset) : max));
      this.recordScrolls.push({ view: scroll, key: scrollKey });
      if (max > 0) {
        art('record-track', undefined, [802, rowTop, 817, rowTop + height]);
        const thumbHeight = Math.max(46, height * height / (rows.length * rowHeight));
        const thumb = art('record-thumb', undefined, [802, rowTop, 817, rowTop + thumbHeight]);
        const updateThumb = () => place(thumb, 809.5, rowTop + thumbHeight / 2 + Math.max(0, Math.min(1, scroll.getScrollOffset().y / max)) * (height - thumbHeight));
        viewport.on(ScrollView.EventType.SCROLLING, updateThumb); updateThumb();
      }
      if (live) art('live-latest', () => scroll.scrollToBottom(.2));
    }
    this.modals.attach(group, scale);
  }
  private updateTimer = () => {
    const s = this.net.state, r = s?.room, now = this.net.now();
    if (r && r.phase === 'playing' && !this.openingRendered && now >= r.startAt) { this.openingRendered = true; this.render(); return; }
    if (this.timerLabel && s) {
      if (s.queuedAt !== null) { const seconds = Math.floor((now - s.queuedAt) / 1000); this.timerLabel.string = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
      else if (r) {
        const remaining = Math.max(0, Math.ceil((r.deadline - now) / 1000));
        if (r.phase === 'waiting') this.timerLabel.string = `${this.friendArtReady ? '' : '房间有效期  '}${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
        else if (r.phase === 'preparing') this.timerLabel.string = this.battleArtReady ? String(remaining) : `准备倒计时 ${remaining}s`;
        else if (now < r.startAt) this.timerLabel.string = `即将开局 ${Math.ceil((r.startAt - now) / 1000)}s`;
        else this.timerLabel.string = `${r.phase === 'reply' ? '最后一次补猜 · ' : ''}${r.current === s.me.id ? '轮到你了' : '对手正在猜测'}  ${remaining}s`;
        if (['playing', 'reply'].includes(r.phase) && remaining <= 5 && r.current === s.me.id && this.warnedTurn !== r.turn) { this.warnedTurn = r.turn; vibrate(); this.audio.play('warning'); }
      }
    }
    if (this.toastLabel && Date.now() >= this.noticeUntil) { this.notice = ''; this.render(); }
  };
}
