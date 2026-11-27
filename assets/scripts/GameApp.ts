import { rememberedDigitCount, modePreferenceKey, modeLabel, type MatchMode } from './shared/game-mode';
import type { DigitCount } from './shared/deduction';
import { LearningPanel } from './LearningPanel';
import { STANDARD_ROUNDS } from './shared/deduction';
import { WechatFlow, avatarUrl, nicknameError, type Invitation } from './shared/wechat-flow';
import { _decorator, Component, Node, UITransform, Label, Graphics, Color, Layers, view, ResolutionPolicy, resources, SpriteFrame, Sprite, Texture2D, profiler, tween, Tween, UIOpacity, Vec3, EditBox, input, Input, EventKeyboard, KeyCode, game, Game, BlockInputEvents, ScrollView, Mask, Vec2, Font, Rect, assetManager, ImageAsset } from 'cc';
import { StartupAssets } from './shared/startup-assets';
import { RoundRoll } from './shared/round-roll';
import { FeedbackArt } from './FeedbackArt';
import { SpriteEffects } from './SpriteEffects';
import { countdownUrgency } from './shared/shader-feedback';
import { feedbackEvent, type FeedbackEvent } from './shared/feedback-state';
import { hitBadgePalette, guessInsight, opponentProgress } from './shared/battle-feedback';
import { toastSpec } from './shared/toast-style';
import { buildBattleShareText, parseCareerStats, recordDailySolved, recordMatchOutcome, serializeCareerStats, type CareerStats } from './shared/career-stats';
import { buildDailyShareText, dailyDateKey, loadDailyProgress, submitDailyGuess, type DailyProgress } from './shared/daily-challenge';
import { dismissNoticeNode, renderNoticeToast, renderReconnectBanner } from './views/OverlayHud';
import { renderResultView } from './views/ResultView';
import { renderProfileSheet } from './views/ProfileView';
import { burstParticles, shakeNode, floatDeltaBadge, flipRevealCard } from './BattleEffects';
import { FriendReturnLayer } from './FriendReturnLayer';
import { shouldReturnToJoin } from './shared/friend-return';
import { ModalLayer } from './ModalLayer';
import type { ModalKind } from './shared/modal-motion';
import { MODAL_RECTS } from './shared/modal-art';
import { confirmationValid, type ConfirmationContext, type ConfirmationKind } from './shared/modal-state';
import { BATTLE_RECTS } from './shared/battle-art';
import { LobbyShuffle } from './shared/lobby-shuffle';
import { SceneBackdrop } from './SceneBackdrop';
import { InputEditSession } from './shared/input-edit-session';
import { matchingTransition } from './shared/matching-transition';
import { profileTransition } from './shared/profile-transition';
import { GameAudio } from './GameAudio';
import { Connection } from './Connection';
import { AVATARS, type RoomView } from './shared/protocol';
import { read, write, copy, vibrate, topSafeInset, bottomSafeInset, wechat } from './Platform';
interface StartupScreen {
  surface: HTMLCanvasElement;
  retryRect: { x: number; y: number; width: number; height: number };
  draw(progress: number, status: string): void;
}
const { ccclass } = _decorator;
const UI_FONT = 'Helvetica Neue, Roboto, Arial, Songti SC, Noto Serif CJK SC, serif';
const C = { ink: '#352719', cream: '#F7E7C8', paper: '#EAD5AC', gold: '#D8AA58', teal: '#173E3C', dark: '#102D2C', muted: '#C3C8B6', orange: '#D96A32', blue: '#2A4656' };
const reasons: Record<string, string> = { same_round: '同轮破解，旗鼓相当', reply_missed: '后手补猜未命中', reply_timeout: '后手补猜超时', cracked: '密码全部破解', round_limit: '本局达到轮数上限', timeout: '连续两次行动超时', disconnect: '对方未能重新连接', resigned: '一方认输', prepare_timeout: '准备超时，本局不计胜负', room_expired: '房间已过期', player_left: '玩家离开，本局已取消', both_offline: '双方掉线，本局不计胜负' };

@ccclass('GameApp')
export class GameApp extends Component {
  private audio!: GameAudio;
  private learning = new LearningPanel();
  private opponentCard?: SpriteFrame;
  private digitCount(): DigitCount { return this.net.state?.room?.digitCount ?? 4; }
  private wxFlow!: WechatFlow;
  private profilePrompted = false;
  private pendingInvitation?: Invitation;
  private joiningInvitation = false;
  private draftAvatarUrl = '';
  private pendingProfileAvatar?: { url: string };
  private avatarLoads = new Map<string, Promise<SpriteFrame | null>>();
  private wechatProfileNode?: Node;
  private remoteAvatars = new Map<string, SpriteFrame | null>();
  private roundRoll = new RoundRoll();
  private roundOld?: Node;
  private roundNew?: Node;
  private feedbackArt!: FeedbackArt;
  private suppressFeedback = false;
  private opponentFeedbackActive = false;
  private loginFailed = false;
  private startupScreen?: StartupScreen;
  private startupStatus = '';
  private startupEntered = false;
  private startupAssets = new StartupAssets(() => { if (this.isValid) this.render(); });
  private startupFrame?: SpriteFrame;
  private startupTexture?: Texture2D;
  private startupImage?: ImageAsset;
  private loginDeadline?: ReturnType<typeof setTimeout>;
  private endFeedbackUntil = 0;
  private net = new Connection(); private root!: Node; private scenery!: SceneBackdrop;
  private noticeLayer!: Node;
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
  private showingMatching = false;
  private matchingMotionElapsed = 0;
  private matchingMotionFrames = 0;
  private matchingMotion = false;
  private matchingOutgoing?: Node;
  private matchingIncoming?: Node;
  private lobbyShuffle = new LobbyShuffle();
  private lobbyDigitFrames: SpriteFrame[] = [];
  private cardDigitFrames: Record<'ink' | 'crimson', Map<string, SpriteFrame>> = { ink: new Map(), crimson: new Map() };
  private lobbyReels: { current: Sprite; next: Sprite; height: number }[] = [];
  private joinDigits: Label[] = [];
  private joinGlows: UIOpacity[] = [];
  private joinButton?: Node;
  private joinPaper?: SpriteEffects;
  private playDigits: Label[] = [];
  private playSlotGlows: UIOpacity[] = [];
  private playSlotCursors: UIOpacity[] = [];
  private playActionButton?: Node;
  private playGuessPanel?: SpriteEffects;
  private prepCards: { card: Node; x: number; baseY: number; digitH: number; digitNode?: Node; char: string }[] = [];
  private prepLockButton?: Node;
  private opponentPulseRing?: UIOpacity;
  private opponentBacksNode?: Node;
  private replyAura?: UIOpacity;
  private lastAnimatedRecordTurn = -1;
  private pendingFinishTimer?: ReturnType<typeof setTimeout>;
  private finishHoldingRoomId = '';
  private finishRevealedRoomId = '';
  private resultAnimatedRoomId = '';
  private timerEffects?: SpriteEffects;
  private profilePaper?: SpriteEffects;
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
  private noticeId = 0; private noticeShownId = 0;
  private noticeNode?: Node;
  private noticePage = '';
  private reconnectBar?: Node;
  private reconnectDot?: UIOpacity;
  private reconnectText?: Label;
  private wasOfflineNotice = false;
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
    SpriteEffects.prepare();
    const startup = globalThis as typeof globalThis & { __digitalBombStartup?: StartupScreen };
    if (startup.__digitalBombStartup) {
      this.startupScreen = startup.__digitalBombStartup;
      this.startupImage = new ImageAsset(this.startupScreen.surface);
      this.startupTexture = new Texture2D(); this.startupTexture.image = this.startupImage;
      this.startupFrame = new SpriteFrame(); this.startupFrame.texture = this.startupTexture;
      delete startup.__digitalBombStartup;
    }
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
    this.scenery = new SceneBackdrop(this.node, (path, loaded) => this.loadStartupTexture(path, loaded));
    this.root = new Node('Interface'); this.node.addChild(this.root); this.root.layer = Layers.Enum.UI_2D; this.root.addComponent(UITransform).setContentSize(750, 1334);
    this.effects = new Node('FeedbackLayer'); this.effects.layer = Layers.Enum.UI_2D; this.node.addChild(this.effects); this.effects.addComponent(UITransform).setContentSize(750, 1334);
    this.friendReturn = new FriendReturnLayer(this.node);
    this.modals = new ModalLayer(this.node);
    this.noticeLayer = this.n('NoticeLayer',375,667,750,this.screenHeight,this.node);this.noticeLayer.setPosition(0,0);
    this.audio = new GameAudio(this.node);
    this.feedbackArt = new FeedbackArt(() => { if (this.isValid) this.render(); });
    this.net.onState = () => this.stateChanged(); this.net.onStatus = () => { if (!this.net.online) this.suppressFeedback = true; this.render(); }; this.net.onError = s => this.toast(s);
    resources.load('art/opponent/texture', Texture2D, (err, texture) => { if (!err) { const sf = new SpriteFrame(); sf.texture = texture; this.opponentArt = sf; this.render(); } });
    for (const name of ['title', 'machine', 'match-full', 'friend-full', 'help-full', 'settings-full', 'sound-full', 'avatar-frame', 'nickname-frame']) {
      this.loadStartupTexture('art/lobby/' + name + '/texture', texture => {
        const sf = new SpriteFrame(); sf.texture = texture; this.lobbyArt.set(name, sf); this.render();
      });
    }
    for (const name of ['portrait-frame', 'portrait-background', 'avatar-selected', 'paper', 'back', 'heading', 'change-avatar', 'wechat', 'cancel', 'save', 'input', 'avatar-0', 'avatar-1', 'avatar-2', 'avatar-3']) {
      const loaded = (texture: Texture2D) => {
        const sf = new SpriteFrame(); sf.texture = texture; this.profileArt.set(name, sf); this.render();
      };
      const path = 'art/profile/' + name + '/texture';
      if (/^avatar-[0-3]$/.test(name)) this.loadStartupTexture(path, loaded);
      else resources.load(path, Texture2D, (err, texture) => { if (!err && this.isValid) loaded(texture); });
    }
    resources.load('fonts/friend-digits/FriendDigits', Font, (err, font) => {
      if (err || !this.isValid) return;
      this.friendDigitFont = font; this.render();
    });
    const friendNames = ['back', 'heading', 'waiting', 'count', 'paper', 'copy', 'invite', 'nameplate', 'seated', 'close'];
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
        const frame = new SpriteFrame(); frame.texture = texture;
        if (name === 'grip-sleeve') { frame.insetLeft = 40; frame.insetRight = 700; }
        this.battleArt.set(name, frame);
        if (battleNames.every(key => this.battleArt.has(key))) { this.battleArtReady = true; this.render(); }
      });
    }
    this.loadStartupTexture('art/lobby/digits/texture', texture => {
      this.lobbyDigitFrames = Array.from({length:10},(_,i)=>{const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(i*64,0,64,80);return f;});
      this.render();
    });
    resources.load('art/battle/card-digits/texture', Texture2D, (err, texture) => {
      if (err || !this.isValid) return;
      const glyphs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '?'];
      const cellW = 144, cellH = 180;
      for (const map of [this.cardDigitFrames.ink, this.cardDigitFrames.crimson]) {
        for (const frame of map.values()) frame.destroy();
        map.clear();
      }
      glyphs.forEach((glyph, i) => {
        (['ink', 'crimson'] as const).forEach((tone, row) => {
          const frame = new SpriteFrame();
          frame.texture = texture;
          frame.rect = new Rect(i * cellW, row * cellH, cellW, cellH);
          this.cardDigitFrames[tone].set(glyph, frame);
        });
      });
      this.render();
    });
    const matchingNames = ['opponent', 'heading', 'base', 'hourglass-sheet', 'portrait-rim', 'nameplate', 'cancel'];
    for (const name of matchingNames) {
      resources.load('art/matching/' + name + '/texture', Texture2D, (err, texture) => {
        if (err || !this.isValid) return;
        const frame = new SpriteFrame(); frame.texture = texture; this.matchingArt.set(name, frame);
        if (name === 'hourglass-sheet') frame.rect = new Rect(0,0,320,320);
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
    this.startupAssets.seal();
    profiler.hideStats();
    input.on(Input.EventType.KEY_DOWN, this.onKey, this); game.on(Game.EVENT_SHOW, this.onShow, this); game.on(Game.EVENT_HIDE, this.onHide, this);
    view.on('canvas-resize', this.resizeLayout, this);
    this.wxFlow = new WechatFlow(wechat(), () => { const r=this.net.state?.room;return r?.mode==='friend'&&r.phase==='waiting'&&r.code?{code:r.code,roomId:r.id}:undefined; }, value => { this.pendingInvitation=value;this.consumeInvitation(); });
    this.wxFlow.start();
    this.resizeLayout(); this.connect(); this.schedule(this.updateTimer, 0.2);
  }
  onDestroy() { this.finishMatchingMotion(); clearTimeout(this.pendingFinishTimer); this.opponentCard?.destroy(); for (const map of [this.cardDigitFrames.ink, this.cardDigitFrames.crimson]) { for (const f of map.values()) f.destroy(); map.clear(); } clearTimeout(this.loginDeadline); this.releaseStartup(); this.wxFlow?.destroy(); if (this.feedbackArt) this.feedbackArt.disposed = true; this.friendReturn?.destroy(); this.modals?.destroy(); this.stopJoinMotion(); this.stopPlayMotion(); this.stopPrepMotion(); this.scenery?.destroy(); view.off('canvas-resize', this.resizeLayout, this); this.audio.dispose(); if (this.profilePanel) Tween.stopAllByTarget(this.profilePanel); this.clearEffects(); this.net.stop(); input.off(Input.EventType.KEY_DOWN, this.onKey, this); game.off(Game.EVENT_SHOW, this.onShow, this); game.off(Game.EVENT_HIDE, this.onHide, this); }
  private onHide() { this.wxFlow?.clearButton();this.audio.background(true); }
  private onShow() {
    this.audio.background(false);
    if (this.net.online) { void this.net.refreshSharing(); this.net.command('sync').catch(() => {}); }
    else if (this.net.state) this.net.reconnectNow();
  }
  private loadStartupTexture(path: string, loaded: (texture: Texture2D) => void) {
    this.startupAssets.add(path, () => new Promise<void>((resolve, reject) => {
      resources.load(path, Texture2D, (error, texture) => {
        if (error) { reject(error); return; }
        if (this.isValid) loaded(texture);
        resolve();
      });
    }));
  }
  private retryStartup() {
    this.startupAssets.retry();
    if (!this.net.online) void this.retryConnection();
  }
  private releaseStartup() {
    this.startupFrame?.destroy(); this.startupTexture?.destroy(); this.startupImage?.destroy();
    this.startupFrame = undefined; this.startupTexture = undefined; this.startupImage = undefined;
    this.startupScreen = undefined;
  }
  private async connect() {
    this.loginFailed = false;
    if (!this.net.state) this.dismissNotice();
    const connection = this.net;
    clearTimeout(this.loginDeadline);
    // start() initiates the socket; authentication finishes with its first state.
    this.loginDeadline = setTimeout(() => {
      if (!this.isValid || this.net !== connection || connection.state) return;
      this.loginFailed = true;
      this.toast('连接时间较长，请检查网络后重试');
    }, 15000);
    this.render();
    try { await connection.start(); }
    catch (e) {
      if (!this.isValid || this.net !== connection) return;
      clearTimeout(this.loginDeadline); this.loginFailed = true; this.toast((e as Error).message);
    }
  }
  private stateChanged() {
    clearTimeout(this.loginDeadline);
    const s = this.net.state!, r = s.room;
    this.wxFlow.setSharingEnabled(s.wechatSharingEnabled === true, s.wechatShareImages);
    this.consumeInvitation();
    const event = r ? feedbackEvent(r, s.me.id, { roomId: this.lastRoom, phase: this.lastPhase, guesses: this.seenGuesses }, this.suppressFeedback) : undefined;
    if (r && this.suppressFeedback) this.roundRoll.sync(r.id, r.round, false, true);
    this.suppressFeedback = false;
    if (this.confirmation && !confirmationValid(this.confirmation, r, s.me.id)) {
      this.confirmation = undefined; this.confirmAction = undefined;
      if (this.overlay === 'confirm') this.overlay = '';
      this.learning.close();
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
    if (!sameRoom) { clearTimeout(this.pendingFinishTimer); this.finishHoldingRoomId = ''; this.finishRevealedRoomId = ''; this.resultAnimatedRoomId = ''; this.lastAnimatedRecordTurn = -1; this.clearEffects(); this.dismissNotice(); this.warnedTurn=-1; this.submitting = false; }
    this.seenGuesses = r?.history.length ?? 0;
    if ((r?.id ?? '') !== this.lastRoom) { this.learning.close(); this.draft = ''; this.recordScrolls = []; this.recordPositions.clear(); this.recordsOpponent = false; this.overlay = ''; this.lastRoom = r?.id ?? ''; this.lastTurn = -1; }
    if (r && r.turn !== this.lastTurn) { this.draft = ''; this.selected = -1; this.lastTurn = r.turn; this.openingRendered = false; }
    if (r && this.lastPhase === 'preparing' && r.phase === 'playing') { this.draft = ''; this.selected = -1; }
    if (r && ['finished','cancelled'].includes(r.phase) && oldPhase !== r.phase) this.learning.close();
    if (r && r.phase === 'finished') this.recordFinishedMatch(r, s.me.id);
    const shouldCrackFinale = event?.kind === 'end' && !!r && r.phase === 'finished'
      && (oldPhase === 'playing' || oldPhase === 'reply')
      && ['cracked', 'same_round', 'reply_missed'].includes(r.result?.reason ?? '')
      && read('motion', '1') === '1' && this.finishRevealedRoomId !== r.id;
    if (shouldCrackFinale && r) {
      clearTimeout(this.pendingFinishTimer);
      this.finishHoldingRoomId = r.id;
    } else if (r?.phase === 'finished' && this.finishHoldingRoomId && this.finishHoldingRoomId !== r.id) {
      this.finishHoldingRoomId = '';
    }
    this.lastPhase = r?.phase ?? '';
    const key = JSON.stringify({ ...s, serverNow: 0 }); if (key !== this.lastKey) { this.lastKey = key; this.render(); }
    if (r?.phase === 'cancelled') this.clearEffects();
    if (event) {
      this.submitting = false;
      if (event.kind === 'end') {
        const win = r!.result?.winner === s.me.id, draw = !r!.result?.winner;
        this.endFeedbackUntil = Date.now() + 1800;
        this.audio.play(win ? 'win' : draw ? 'draw' : 'lose');
        vibrate(win ? 'heavy' : 'medium');
        if (shouldCrackFinale) {
          this.playCrackFinale(r!, s.me.id);
        } else {
          this.clearEffects();
        }
      } else {
        this.showFeedback(event);
      }
    } else if (sameRoom && r && r.current === s.me.id && (r.turn !== oldTurn || oldPhase === 'preparing') && ['playing', 'reply'].includes(r.phase)) {
      this.turnCue(r.phase === 'reply' ? '最后一次补猜！' : '轮到你出牌了');
    }
  }

  private noticeContext() { const s=this.net.state;return s?.room?s.room.id+':'+s.room.phase:s?.queuedAt!=null?'matching':this.page; }
  private setNotice(text: string, durationMs?: number) {
    const spec = toastSpec(text);
    this.noticePage = this.noticeContext();
    this.notice = text;
    this.noticeUntil = Date.now() + (durationMs ?? spec.durationMs);
    this.noticeId++;
  }
  private toast(text: string, durationMs?: number) { this.setNotice(text, durationMs); this.render(); }
  private dismissNotice(animated = false) {
    this.notice = ''; this.noticeUntil = 0;
    const node = this.noticeNode;
    this.noticeNode = undefined; this.toastLabel = undefined;
    dismissNoticeNode(node, animated, read('motion', '1') === '1');
  }
  private statsStorageKey(): string { return 'career-stats-v1-' + (this.net.state?.me.id ?? 'local'); }
  private dailyStorageKey(): string { return 'daily-v1-' + (this.net.state?.me.id ?? 'local'); }
  private loadCareerStats(): CareerStats { return parseCareerStats(read(this.statsStorageKey())); }
  private saveCareerStats(stats: CareerStats) { write(this.statsStorageKey(), serializeCareerStats(stats)); }
  private recordFinishedMatch(room: RoomView, meId: string) {
    const res = recordMatchOutcome(this.loadCareerStats(), room, meId);
    if (res.changed) this.saveCareerStats(res.stats);
  }
  private loadDaily(): DailyProgress {
    const now = this.net.state ? this.net.now() : Date.now();
    return loadDailyProgress(read(this.dailyStorageKey()), dailyDateKey(now), now);
  }
  private handleDailySubmit(digits: string): { error?: string; solved?: boolean; hits?: number } {
    const now = this.net.state ? this.net.now() : Date.now();
    const current = this.loadDaily();
    const res = submitDailyGuess(current, digits, now);
    if (res.error) { this.audio.play('error'); return { error: res.error }; }
    write(this.dailyStorageKey(), JSON.stringify(res.progress));
    if (res.progress.solved) {
      const updated = recordDailySolved(this.loadCareerStats(), res.progress.dateKey);
      if (updated.changed) this.saveCareerStats(updated.stats);
      this.audio.play('win'); vibrate('heavy');
    } else {
      this.audio.play('hit' + Math.min(4, res.hits ?? 0)); vibrate('light');
    }
    return { solved: res.progress.solved, hits: res.hits };
  }
  private async shareRecap(text: string, wxTitle: string) {
    if (this.wxFlow.shareCustom(wxTitle)) return;
    try {
      await copy(text);
      this.toast('战绩已复制，可直接粘贴分享给好友');
    } catch {
      this.toast('当前环境无法直接分享，可截图发送给好友');
    }
  }
  private async act(action: string, payload: Record<string, unknown> = {}) {
    if (this.busy) return; this.busy = true;
    if (action === 'guess') {
      this.submitting = true;
      this.audio.play('submit');
      this.playGuessPanel?.sweep();
      if (this.playActionButton?.isValid) {
        this.playActionButton.getComponent(Sprite)!.grayscale = true;
        (this.playActionButton.getComponent(UIOpacity) ?? this.playActionButton.addComponent(UIOpacity)).opacity = 160;
      }
    } else {
      this.render();
    }
    try { await this.net.command(action, { roomId: this.net.state?.room?.id, ...payload }); if (action === 'lock') this.audio.play('ready'); }
    catch (e) { this.audio.play('error'); if (action === 'guess') { this.submitting = false; this.clearEffects(); } this.setNotice((e as Error).message); }
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
    l.color = new Color(color); l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.overflow = Label.Overflow.SHRINK; l.fontFamily = UI_FONT; return l;
  }
  /** Render bespoke 0-9/? gilded card-face artwork; falls back cleanly to Label if unavailable or placeholder. */
  private addCardDigit(parent: Node, char: string, x: number, y: number, height: number, tone: 'ink' | 'crimson' = 'ink', angle = 0): Node {
    const frame = this.cardDigitFrames[tone].get(char);
    if (frame) {
      const node = new Node('CardDigit-' + char);
      node.layer = Layers.Enum.UI_2D;
      parent.addChild(node);
      node.setPosition(x, y, 0);
      node.angle = angle;
      const sprite = node.addComponent(Sprite);
      sprite.spriteFrame = frame;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      node.getComponent(UITransform)!.setContentSize(Math.round(height * (144 / 180)), height);
      return node;
    }
    const l = this.text(char, 375, 667, Math.round(height * 0.72), tone === 'crimson' ? '#8E2414' : C.ink, Math.round(height * 0.92), height, parent);
    l.node.setPosition(x, y, 0);
    l.node.angle = angle;
    l.enableWrapText = false;
    if (this.friendDigitFont && /^[0-9—]+$/.test(char)) { l.font = this.friendDigitFont; l.lineHeight = Math.round(height * 0.8); }
    else l.isBold = true;
    return l.node;
  }
  /** Bind only enabled controls; material allocation is deferred until first press. */
  private bindPressEffect(node: Node, enabled: () => boolean = () => true) {
    const sprite = node.getComponent(Sprite); if (!sprite) return;
    node.on(Node.EventType.TOUCH_START, () => {
      if (enabled() && read('motion', '1') === '1') SpriteEffects.attach(sprite).press(true);
    });
    const release = () => node.getComponent(SpriteEffects)?.press(false);
    node.on(Node.EventType.TOUCH_CANCEL, release);
    node.on(Node.EventType.TOUCH_END, release);
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
  private setOpponentSeatVisible(visible: boolean) {
    const room=this.root?.getChildByName('BattleRoom');
    for(const name of ['PlayerPortrait','PlayerPortraitRim','Battle-nameplate','Battle-card-backs','OpponentNickname','OpponentProgress','OpponentPulseRing']) {
      const node=room?.getChildByName(name);if(node)node.active=visible;
    }
  }
  private clearEffects() {
    this.opponentFeedbackActive=false;this.setOpponentSeatVisible(true);
    if (!this.effects?.isValid) return;
    const stop = (n: Node) => { Tween.stopAllByTarget(n); const opacity = n.getComponent(UIOpacity); if (opacity) Tween.stopAllByTarget(opacity); n.children.forEach(stop); };
    for (const child of [...this.effects.children]) { stop(child); child.removeFromParent(); child.destroy(); }
  }
  private feedback(title: string, hits: number | null, digits: string, caption: string, pending = false) {
    this.showFeedback({ kind: 'own', title: pending ? '正在验证' : title, hits: hits ?? undefined, caption, art: hits === this.digitCount() ? 'own-gold' : 'own' }, pending);
  }
  private playCrackFinale(r: RoomView, meId: string) {
    this.clearEffects();
    const win = r.result?.winner === meId, draw = !r.result?.winner;
    const peer = r.players.find(p => p.id !== meId);
    const secret = r.revealed?.[peer?.id ?? ''] ?? '';
    const count = r.digitCount ?? 4;
    const available = this.screenHeight - this.layoutTop - bottomSafeInset() - 16;
    const scale = Math.min(750 / 941, available / 1750);
    const cardY = this.screenHeight / 2 - this.layoutTop + 20 * scale - 239 * scale;

    shakeNode(this.root, win ? 10 : 6);
    burstParticles(this.effects, 0, cardY, win ? 'crack' : 'hot');

    // Flip revealed opponent password right at the opponent's seat during the 0.95s crack finale!
    if (secret && this.battleArtReady) {
      const seat = this.feedbackArt.group(this.effects, 'CrackFinaleCards', cardY, scale);
      const paper = this.battleArt.get('card-paper')!;
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * 86;
        const card = this.feedbackArt.group(seat, 'FinaleCard-' + i, 0);
        card.setPosition(x, 0, 0);
        const sp = card.addComponent(Sprite);
        sp.spriteFrame = paper; sp.sizeMode = Sprite.SizeMode.CUSTOM;
        card.getComponent(UITransform)!.setContentSize(82, 110);
        const digitNode = this.addCardDigit(card, secret[i] ?? '—', 0, 0, 73, win ? 'crimson' : 'ink');
        digitNode.active = false;
        sp.color = new Color('#294963');
        flipRevealCard(card, () => {
          sp.color = new Color('#FFF7DF');
          digitNode.active = true;
          this.audio.play('tap');
        }, 0.06 + i * 0.08);
      }
    }

    // Crisp floating banner across upper felt without double-stacking a second victory card.
    const bannerY = this.screenHeight / 2 - this.layoutTop - available * 0.34;
    const banner = this.feedbackArt.group(this.effects, 'CrackFinaleBanner', bannerY, Math.min(1, available / 1100));
    const g = banner.addComponent(Graphics);
    const bw = 440, bh = 88;
    g.fillColor = new Color(win ? '#9E2B14' : draw ? '#2A4E54' : '#3C2318');
    g.roundRect(-bw / 2, -bh / 2, bw, bh, 44); g.fill();
    g.strokeColor = new Color('#FFD770'); g.lineWidth = 3;
    g.roundRect(-bw / 2 + 2, -bh / 2 + 2, bw - 4, bh - 4, 42); g.stroke();
    const title = this.feedbackArt.label(banner, win ? '密码全部破译！' : draw ? '同轮破译 · 旗鼓相当！' : '对手抢先破译', 0, 0, 400, 68, 36, '#FFF4CE');
    title.isBold = true;
    const op = banner.addComponent(UIOpacity);
    op.opacity = 0; banner.setScale(0.84, 0.84, 1);
    tween(op).to(0.16, { opacity: 255 }).delay(0.6).to(0.18, { opacity: 0 }).start();
    tween(banner).to(0.22, { scale: Vec3.ONE }, { easing: 'backOut' }).start();

    this.pendingFinishTimer = setTimeout(() => {
      if (!this.isValid) return;
      this.finishHoldingRoomId = '';
      this.finishRevealedRoomId = r.id;
      this.clearEffects();
      this.render();
    }, 960);
  }
  private showFeedback(event: FeedbackEvent, pending = false) {
    this.clearEffects();
    const available = this.screenHeight - this.layoutTop - bottomSafeInset() - 24;
    const opponent = event.kind === 'opponent', own = event.kind === 'own';
    const room = this.net.state?.room, meId = this.net.state?.me.id ?? '', count = this.digitCount();
    const insight = own && !pending && room ? guessInsight(room.history, meId, count) : undefined;
    // Opponent feedback occupies the opponent seat, above the record sheet.
    const battleScale = Math.min(750 / 941, (available + 8) / 1750);
    const groupY = this.screenHeight / 2 - this.layoutTop - (opponent ? 160 * battleScale : available * .31);
    const group = this.feedbackArt.group(this.effects, 'GuessFeedback', groupY, opponent ? battleScale : Math.min(1, available / 1150));
    if (opponent) {
      // Center opponent banner cleanly so it never clips off the right viewport edge.
      group.setPosition(0, group.position.y);
      group.setScale(battleScale * 590 / 650, battleScale * 590 / 650, 1);
      this.opponentFeedbackActive = true; this.setOpponentSeatVisible(false);
    }
    const width = own ? 396 : event.kind === 'end' ? 480 : 640;
    if (this.feedbackArt.ready) {
      const artKey = own && insight?.tier === 'crack' ? 'own-gold' : event.art;
      const art = this.feedbackArt.image(group, artKey, 0, 0, width);
      if (!pending) {
        const fx = SpriteEffects.attach(art.getComponent(Sprite)!);
        if (event.hits === 0 || event.kind === 'timeout' || (opponent && event.urgent)) fx.flash();
        else if ((event.hits !== undefined && event.hits > 0) || (event.kind === 'end' && room?.result?.winner === meId)) fx.sweep();
      }
      if (own) {
        const tier = insight?.tier ?? (event.hits === 0 ? 'zero' : event.hits === count ? 'crack' : event.hits === count - 1 ? 'hot' : 'low');
        const headingText = insight?.headline ?? event.title;
        const captionText = insight?.caption ?? event.caption;
        const scoreColor = tier === 'zero' ? '#2A5563' : tier === 'hot' ? '#B42A1B' : tier === 'crack' ? '#A35C05' : tier === 'warm' ? '#9C4E0E' : C.ink;
        const headingLabel = this.feedbackArt.label(group, headingText, 0, -48, 310, 48, 33, tier === 'hot' ? '#A82616' : C.ink);
        headingLabel.isBold = true;
        const value = this.feedbackArt.label(group, pending ? '···' : `${event.hits} / ${count}`, 0, 46, 290, 108, 74, scoreColor);
        if (this.friendDigitFont && !pending) value.font = this.friendDigitFont; else value.isBold = true;
        if (insight?.deductionHighlight) {
          const pill = this.feedbackArt.group(group, 'InsightPill', -145);
          const pg = pill.addComponent(Graphics);
          pg.fillColor = new Color('#F7DFA8'); pg.roundRect(-162, -24, 324, 48, 12); pg.fill();
          pg.strokeColor = new Color('#C98632'); pg.lineWidth = 2; pg.roundRect(-161, -23, 322, 46, 11); pg.stroke();
        }
        const cap = this.feedbackArt.label(group, captionText, 0, 145, 314, 44, 21, insight?.deductionHighlight ? '#8A2312' : C.ink);
        if (insight?.deductionHighlight) cap.isBold = true;
        if (!pending && read('motion', '1') === '1') {
          if (tier === 'crack') {
            burstParticles(this.effects, 0, groupY, 'crack');
            shakeNode(this.root, 9); vibrate('heavy');
          } else if (tier === 'hot') {
            burstParticles(this.effects, 0, groupY, 'hot');
            shakeNode(this.root, 6); vibrate('medium');
          } else if (tier === 'warm' || (insight && insight.deltaBest > 0)) {
            burstParticles(this.effects, 0, groupY, 'warm');
            vibrate('light');
          } else if (tier === 'zero') {
            tween(group).by(.06, { position: new Vec3(-7, 0, 0) }).by(.09, { position: new Vec3(14, 0, 0) }).by(.06, { position: new Vec3(-7, 0, 0) }).start();
            vibrate('light');
          }
          if (insight?.deltaLabel) {
            floatDeltaBadge(this.effects, insight.deltaLabel, 138, groupY + 62, tier === 'hot' || tier === 'crack' ? '#B42A1B' : '#BA6518');
          }
        }
      } else if (opponent) {
        const peer = room?.players.find(p => p.id !== meId);
        if (peer) this.playerPortrait(group, peer, -206.5, -14, 98, false);
        const value = this.feedbackArt.label(group, `${event.hits} / ${count}`, 22, -10, 285, 96, 64, event.urgent ? '#8B1E1A' : C.ink);
        if (this.friendDigitFont) value.font = this.friendDigitFont; else value.isBold = true;
        if (event.urgent) {
          shakeNode(this.root, 6);
          burstParticles(this.effects, 0, groupY, 'hot');
        }
      } else if (event.kind === 'end') {
        const label = this.feedbackArt.label(group, event.art.startsWith('timeout-') ? '' : event.caption, 0, 125, 420, 60, 23, C.ink);
        label.node.name = 'ActualEndReason';
      }
    } else this.feedbackArt.label(group, event.title + '\n' + event.caption, 0, 0, 650, 140, 30, C.cream);
    this.audio.play(pending ? 'submit' : opponent ? (event.urgent ? 'warning' : 'tap') : event.kind === 'timeout' ? 'warning' : event.kind === 'end' ? (room?.result?.winner === meId ? 'win' : room?.result?.winner ? 'lose' : 'draw') : 'hit' + Math.min(4, event.hits ?? 0));
    if (event.urgent) vibrate('medium');
    const opacity = group.addComponent(UIOpacity), motion = read('motion','1') === '1', scale = group.scale.clone();
    if (motion) { opacity.opacity = 0; group.setScale(scale.x*.88,scale.y*.88,1);tween(opacity).to(.15,{opacity:255}).start();tween(group).to(.22,{scale},{easing:'backOut'}).start(); }
    if (motion && opponent && event.hits === 0) tween(group).by(.07,{position:new Vec3(-6,0,0)}).by(.1,{position:new Vec3(12,0,0)}).by(.07,{position:new Vec3(-6,0,0)}).start();
    const hold = insight?.deductionHighlight ? 2.1 : event.urgent ? 1.85 : 1.5;
    if (!pending) tween(opacity).delay(hold).to(motion ? .18 : 0,{opacity:0}).call(()=>{group.destroy();if(opponent){this.opponentFeedbackActive=false;this.setOpponentSeatVisible(true);}}).start();
  }
  private turnCue(message: string) {
    if (Date.now() < this.endFeedbackUntil) return;
    this.audio.play('turn'); this.clearEffects();
    this.timerEffects?.sweep();
    const group = this.feedbackArt.group(this.effects, 'TurnCue', this.screenHeight/2-this.layoutTop-(this.screenHeight-this.layoutTop-bottomSafeInset())*.28);
    if(this.feedbackArt.ready) {
      const img = this.feedbackArt.image(group,'turn',0,0,580);
      SpriteEffects.attach(img.getComponent(Sprite)!).sweep();
    }
    this.feedbackArt.label(group,message,52,8,420,70,28,this.feedbackArt.ready?C.ink:C.cream);
    const opacity=group.addComponent(UIOpacity), motion = read('motion','1')==='1';
    if (motion) {
      opacity.opacity = 0; group.setScale(0.92, 0.92, 1);
      tween(opacity).to(.14, { opacity: 255 }).delay(1.05).to(.18, { opacity: 0 }).call(()=>group.destroy()).start();
      tween(group).to(.2, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    } else {
      tween(opacity).delay(1.2).to(0,{opacity:0}).call(()=>group.destroy()).start();
    }
    vibrate('light');
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
  private cards(digits: string, y: number, size = 90, backs = false, editable = false, count = this.digitCount()) {
    const gap = 12, start = 375 - (count - 1) / 2 * (size + gap);
    for (let i = 0; i < count; i++) {
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
    const enteringMatching = !!this.net.state && !this.net.state.room && this.net.state.queuedAt !== null;
    const motionEnabled = read('motion', '1') === '1';
    if (!enteringMatching || !motionEnabled) this.finishMatchingMotion();
    if (enteringMatching && !this.showingMatching && this.startupEntered && motionEnabled) {
      this.matchingMotion = true; this.matchingMotionElapsed = 0; this.matchingMotionFrames = 0;
      const outgoing = this.n('MatchingOutgoing', 375, 667, 750, this.screenHeight, this.node);
      outgoing.setSiblingIndex(this.root.getSiblingIndex());
      outgoing.addComponent(UIOpacity);
      for (const child of [...this.root.children]) child.parent = outgoing;
      outgoing.pauseSystemEvents(true);
      this.matchingOutgoing = outgoing;
    }
    this.showingMatching = enteringMatching;
    this.matchingIncoming = undefined;
    this.wxFlow?.clearButton();this.wechatProfileNode=undefined;
    this.nicknameSession.end(); this.nicknameEditBox = undefined;
    for (const { view: scroll, key } of this.recordScrolls) {
      if (!scroll.isValid) continue;
      const offset = scroll.getScrollOffset().y;
      this.recordPositions.set(key, { offset, bottom: scroll.getMaxScrollOffset().y - offset < 24 });
    }
    this.recordScrolls = [];
    const noticePage=this.noticeContext();
    if(this.noticePage!==noticePage){this.dismissNotice();this.noticePage=noticePage;}
    if(this.noticeNode?.isValid){this.noticeNode.removeFromParent();this.noticeNode.destroy();}
    this.noticeNode=undefined;
    if(this.reconnectBar?.isValid){this.reconnectBar.removeFromParent();this.reconnectBar.destroy();}
    this.reconnectBar=undefined; this.reconnectDot=undefined; this.reconnectText=undefined;
    this.stopJoinMotion(); this.joinDigits = []; this.joinGlows = []; this.joinButton = undefined; this.joinPaper = undefined;
    this.stopPlayMotion(); this.playDigits = []; this.playSlotGlows = []; this.playSlotCursors = []; this.playActionButton = undefined; this.playGuessPanel = undefined;
    this.stopPrepMotion(); this.prepCards = []; this.prepLockButton = undefined;
    this.opponentPulseRing = undefined; this.opponentBacksNode = undefined; this.replyAura = undefined;
    this.lobbyReels = []; this.roundOld = undefined; this.roundNew = undefined;
    this.profilePaper = undefined; this.profilePanel = undefined; this.profileBack = undefined; this.transitionLobby = undefined;
    for (const child of [...this.root.children]) { child.removeFromParent(); child.destroy(); }
    this.timerLabel = undefined; this.timerEffects = undefined; this.toastLabel = undefined;
    const state = this.net.state;
    const sceneView = state?.room ? (state.room.phase === 'waiting' ? 'friend' : 'game')
      : state?.queuedAt != null ? 'matching' : this.page === 'join' ? 'friend' : 'lobby';
    this.audio.setScene(sceneView === 'game' ? 'battle' : 'lobby');
    this.scenery.setView(sceneView, read('motion', '1') === '1');
    const s = this.net.state;
    const starting = !this.startupEntered && (!s || !this.net.online || !this.startupAssets.ready);
    if (!starting && !this.startupEntered) {
      this.startupEntered = true;
      this.releaseStartup();
      if (wechat() && !this.profilePrompted) {
        this.profilePrompted = true; this.scheduleOnce(() => this.offerWechatProfile(), .6);
      }
    }
    this.lobbyShuffle.show(this.lobbyDigitFrames.length === 10 && this.lobbyArt.has('machine') && !starting && !!s && !s.room && s.queuedAt === null && this.page === 'lobby');
    if (starting || !s) this.startup();
    else if (s.room) this.room(s.room);
    else if (s.queuedAt !== null) this.matching();
    else if (this.page === 'join') this.join();
    else if (this.page === 'profile') this.profile();
    else this.lobby();
    if (enteringMatching && this.matchingMotion) {
      const children = [...this.root.children];
      const incoming = this.n('MatchingIncoming', 375, 667, 750, this.screenHeight);
      incoming.setPosition(0, 0); incoming.addComponent(UIOpacity);
      for (const child of children) child.parent = incoming;
      this.matchingIncoming = incoming;
      this.applyMatchingMotion();
    }
    if (!starting && s && !s.room && s.queuedAt === null && this.page === 'lobby' && !this.overlay && !this.pendingInvitation && !this.learning.visible && this.profileArt.has('paper') && this.modalArt.has('tab-off') && read('learning-offered-v1-'+s.me.id) !== '1') {
      write('learning-offered-v1-'+s.me.id,'1'); this.learning.open('menu');
    }
    // Learning pages share the scene, while their underlying page controls stay hidden.
    if (!starting && this.learning.visible) for (const child of this.root.children) child.active = false;
    if (!starting && this.learning.visible) {
      const daily = this.loadDaily();
      const stats = this.loadCareerStats();
      this.learning.render({
        parent: this.root, height: this.screenHeight, top: this.layoutTop, bottom: bottomSafeInset(),
        paper: this.profileArt.get('paper'), button: this.modalArt.get('tab-off'), card: this.battleArt.get('card-paper'),
        cardDigits: this.cardDigitFrames.ink.size === 11 ? this.cardDigitFrames : undefined,
        room: s?.room, me: s?.me.id ?? '', now: this.net.now(),
        dailyProgress: daily,
        dailyStreak: stats.dailyStreak,
        onDailySubmit: digits => this.handleDailySubmit(digits),
        onDailyShare: () => {
          const latest = this.loadDaily();
          const st = this.loadCareerStats();
          void this.shareRecap(
            buildDailyShareText(latest, st.dailyStreak),
            `我用 ${latest.history.length} 步破译了今日《猜数字暗号》每日一题，来试试！`,
          );
        },
        redraw: () => this.render(),
        copy: (digits, message) => this.copyGuess(digits, message), completed: () => write('learning-complete-v1-'+s!.me.id,'1'),
      });
    }
    const modalKey = starting ? undefined : this.modalKey();
    this.modals.begin(this.modalArtReady ? modalKey : undefined, read('motion', '1') === '1');
    if (modalKey) this.artModal(modalKey);
    if (!starting && s && !this.net.online) {
      this.wasOfflineNotice = true;
      const refs = renderReconnectBanner({
        parent: this.noticeLayer,
        screenHeight: this.screenHeight,
        bottomSafe: bottomSafeInset(),
        reconnecting: this.reconnecting,
        createNode: (name, x, y, w, h, p) => this.n(name, x, y, w, h, p),
        createText: (val, x, y, sz, col, w, h, p) => this.text(val, x, y, sz, col, w, h, p),
        onRetry: () => { this.audio.unlock(); this.audio.play('tap'); void this.retryConnection(); },
      });
      this.reconnectBar = refs.bar;
      this.reconnectDot = refs.dot;
      this.reconnectText = refs.text;
    } else if (this.wasOfflineNotice && this.net.online) {
      this.wasOfflineNotice = false;
      this.setNotice('连接已恢复', 2200);
    }
    if (this.notice && Date.now() < this.noticeUntil) {
      const animateIn = this.noticeShownId !== this.noticeId;
      if (animateIn) this.noticeShownId = this.noticeId;
      const refs = renderNoticeToast({
        parent: this.noticeLayer,
        text: this.notice,
        screenHeight: this.screenHeight,
        layoutTop: this.layoutTop,
        animateIn,
        motion: read('motion', '1') === '1',
        createNode: (name, x, y, w, h, p) => this.n(name, x, y, w, h, p),
        createText: (val, x, y, sz, col, w, h, p) => this.text(val, x, y, sz, col, w, h, p),
        onDismiss: () => this.dismissNotice(true),
      });
      this.noticeNode = refs.node;
      this.toastLabel = refs.label;
    }
    this.updateTimer();
  }
  private startup() {
    const failed = this.loginFailed || this.startupAssets.failed || (!!this.net.state && !this.net.online);
    const status = this.startupAssets.failed ? '画面加载失败，点击这里重试'
      : failed ? '连接未完成，点击这里重试'
      : !this.net.state ? '正在连接牌桌…' : '正在准备首页…';
    if (this.startupFrame && this.startupScreen) {
      if (status !== this.startupStatus) {
        this.startupScreen.draw(0.9, status);
        this.startupTexture!.uploadData(this.startupScreen.surface);
        this.startupStatus = status;
      }
      const cover = this.n('Startup', 375, 667, 750, this.screenHeight);
      cover.setPosition(0, 0);
      const sprite = cover.addComponent(Sprite); sprite.spriteFrame = this.startupFrame;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      cover.getComponent(UITransform)!.setContentSize(750, this.screenHeight);
      cover.addComponent(BlockInputEvents);
      if (failed) {
        const rect = this.startupScreen.retryRect;
        const scale = 750 / this.startupScreen.surface.width;
        const retry = this.n('StartupRetry', 375, 667, rect.width * scale, rect.height * scale);
        retry.setPosition((rect.x + rect.width / 2) * scale - 375, this.screenHeight / 2 - (rect.y + rect.height / 2) * scale);
        retry.on(Node.EventType.TOUCH_END, () => this.retryStartup());
      }
    } else {
      // Web preview (or missing native splash): use the same startup state.
      this.header('猜数字暗号');
      this.text(status, 375, 540, 30);
    }
    if (failed && !this.startupScreen) {
      this.button('重新加载', 375, 960, 360, 84, () => this.retryStartup(), true, !this.reconnecting);
    }
  }
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
      this.bindPressEffect(n);
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
    if (!this.profileSprite('avatar-' + me.avatar, 80, 120, 108, 108, this.avatarFrame(me))) this.text(AVATARS[me.avatar] ?? '客', 80, 120, 38, C.cream, 80, 75);
    const avatarFrame = this.lobbySprite('avatar-frame', 80, 120, 124, 123);
    for (const node of [nameplate, avatarBase, avatarFrame]) node?.on(Node.EventType.TOUCH_END, () => { this.audio.unlock(); this.audio.play('tap'); openProfile(); });
    if (!this.lobbySprite('title', 375, 330, 635 * fit, 350 * fit)) this.text('猜数字暗号', 375, 355, 72, C.cream, 660, 110);
    this.text('— 选择位数，破解对手的暗号 —', 375, 535, 25, C.cream, 630, 48);
    if (this.lobbySprite('machine', 375, 695, 565 * fit, 281 * fit)) {
      if(this.lobbyDigitFrames.length)for(let i=0;i<4;i++) {
        const clip=this.n('LobbyReel-'+i,375+(i-1.5)*84*fit,703,66*fit,95*fit);
        clip.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        const make=(name:string)=>{const n=this.n(name,375,667,64*fit,80*fit,clip);n.setPosition(0,0);const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;return sprite;};
        this.lobbyReels.push({current:make('CurrentDigit'),next:make('NextDigit'),height:95*fit});
      }
      this.applyLobbyShuffle();
    } else this.cards('0123', 695, 88);
    this.lobbyButton('match-full', '在线匹配  ›', 375, 898, 610 * fit, 168 * fit, () => this.selectMode('public'), !this.busy);
    this.lobbyButton('friend-full', '好友对战  ›', 375, 1054, 610 * fit, 162 * fit, () => { this.page = 'join'; this.code = ''; this.render(); });
    // Daily Cipher entry pill tucked cleanly between Friend Match and the bottom wooden rim.
    const daily = this.loadDaily();
    const dailyStats = this.loadCareerStats();
    const dailyW = Math.round(476 * fit), dailyH = Math.round(58 * fit);
    const dailyBtn = this.n('LobbyDailyChallenge', 375, 1164, dailyW, dailyH);
    const dg = dailyBtn.addComponent(Graphics);
    const dr = Math.round(dailyH / 2);
    dg.fillColor = new Color(25, 19, 13, 218); dg.roundRect(-dailyW / 2, -dailyH / 2, dailyW, dailyH, dr); dg.fill();
    dg.strokeColor = new Color(daily.solved ? '#5EB87A' : '#D9AA58'); dg.lineWidth = 2;
    dg.roundRect(-dailyW / 2 + 1, -dailyH / 2 + 1, dailyW - 2, dailyH - 2, dr - 1); dg.stroke();
    const dotX = -dailyW / 2 + 28 * fit;
    dg.fillColor = new Color(daily.solved ? '#2D9B60' : '#D96A32');
    dg.circle(dotX, 0, 8 * fit); dg.fill();
    const dailyCopy = daily.solved
      ? `每日一题 · 今日 ${daily.history.length} 步已破${dailyStats.dailyStreak > 1 ? ` · 连卡 ${dailyStats.dailyStreak} 天` : ''} ›`
      : daily.history.length > 0
        ? `每日一题 · 进行中（已猜 ${daily.history.length} 步） ›`
        : '每日一题 · 今日 4 位暗号待挑战 ›';
    const dLbl = this.text(dailyCopy, 375, 667, Math.round(23 * fit), daily.solved ? '#CBEFD5' : '#FFE7B5', dailyW - 64 * fit, dailyH - 8, dailyBtn);
    dLbl.node.setPosition(12 * fit, 1); dLbl.isBold = true; dLbl.enableWrapText = false;
    dailyBtn.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') dailyBtn.setScale(0.97, 0.97, 1); });
    dailyBtn.on(Node.EventType.TOUCH_CANCEL, () => dailyBtn.setScale(1, 1, 1));
    dailyBtn.on(Node.EventType.TOUCH_END, () => { dailyBtn.setScale(1, 1, 1); this.audio.unlock(); this.audio.play('tap'); this.openLearning('daily'); });
    this.lobbyButton('settings-full', '设置', 115, 1250, 76 * fit, 76 * fit, () => { this.overlay = 'settings'; this.render(); });
    this.lobbyButton('help-full', '怎么玩', 375, 1250, 285 * fit, 121 * fit, () => this.openLearning('menu'));
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
  private finishMatchingMotion() {
    this.matchingMotion = false;
    if (this.matchingOutgoing?.isValid) {
      this.matchingOutgoing.removeFromParent(); this.matchingOutgoing.destroy();
    }
    this.matchingOutgoing = undefined;
    if (this.matchingIncoming?.isValid) {
      this.matchingIncoming.setPosition(0, 0); this.matchingIncoming.setScale(1, 1, 1);
      this.matchingIncoming.getComponent(UIOpacity)!.opacity = 255;
    }
  }
  private applyMatchingMotion() {
    const pose = matchingTransition(this.matchingMotionElapsed);
    if (this.matchingOutgoing?.isValid) {
      this.matchingOutgoing.setScale(pose.outgoingScale, pose.outgoingScale, 1);
      this.matchingOutgoing.getComponent(UIOpacity)!.opacity = Math.round(255 * pose.outgoingOpacity);
    }
    if (this.matchingIncoming?.isValid) {
      this.matchingIncoming.setPosition(0, pose.incomingY);
      this.matchingIncoming.setScale(pose.incomingScale, pose.incomingScale, 1);
      this.matchingIncoming.getComponent(UIOpacity)!.opacity = Math.round(255 * pose.incomingOpacity);
    }
  }
  private matching() {
    if (this.matchingArtReady) { this.matchingArtwork(); return; }
    this.header('在线匹配'); this.text('正在寻找对手', 375, 440, 44); this.text(modeLabel(this.net.state?.queuedDigitCount ?? 4), 375, 505, 23, C.gold);
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
    // Use the upright first cell only; matching hourglass is intentionally static.
    sprite('hourglass-sheet', [302.5,537,638.5,873]);
    this.timerLabel = this.text('',375,667,57,'#FFD978',225,72,group);
    this.timerLabel.fontFamily = UI_FONT; this.timerLabel.isBold = true;
    if (this.friendDigitFont) this.timerLabel.font = this.friendDigitFont;
    this.timerLabel.node.setPosition(0,-913);
    const mode=this.text(modeLabel(this.net.state?.queuedDigitCount ?? 4),375,667,29,C.cream,520,50,group);mode.node.setPosition(0,-995);
    const me=this.net.state!.me, portrait=this.avatarFrame(me)??this.profileArt.get('avatar-'+me.avatar);
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
      this.bindPressEffect(cancel);
      cancel.on(Node.EventType.TOUCH_START,()=>{if(read('motion','1')==='1')cancel.setScale(.97,.97,1);});
      cancel.on(Node.EventType.TOUCH_CANCEL,()=>cancel.setScale(1,1,1));
      cancel.on(Node.EventType.TOUCH_END,()=>{cancel.setScale(1,1,1);this.audio.unlock();this.audio.play('tap');this.act('cancelQueue');});
    }
  }
  private applyLobbyShuffle() {
    this.lobbyReels.forEach((reel,i)=>{
      if(!reel.current.isValid)return;
      const pose=this.lobbyShuffle.pose(i);
      reel.current.spriteFrame=this.lobbyDigitFrames[pose.digit];reel.next.spriteFrame=this.lobbyDigitFrames[pose.next];
      reel.current.node.setPosition(0,pose.offset*reel.height-pose.bounce*reel.height*.08);
      reel.current.node.setScale(1+pose.bounce*.035,1-pose.bounce*.07,1);
      reel.next.node.active=pose.active;
      reel.next.node.setPosition(0,(pose.offset-1)*reel.height);
    });
  }
  private join() {
    if (this.joinArtReady) { this.joinArtwork(); return; }
    this.header('好友对战', () => { this.page = 'lobby'; this.render(); });
    this.text('输入房间口令', 375, 340, 38); this.text('四位口令，加入好友的牌桌', 375, 402, 23, C.gold);
    this.cards(this.code, 520, 100); this.button('加入房间', 375, 680, 560, 85, () => this.act('join', { code: this.code }), true, this.code.length === 4 && !this.busy);
    this.button('自己创建房间', 375, 782, 560, 70, () => this.createFriendRoom(), false, !this.busy); this.keypad(925, 'join');
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
        this.bindPressEffect(node, () => name !== 'join' || this.code.length === 4 && !this.busy && this.net.online);
        node.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') node.setScale(.97, .97, 1); });
        node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
        node.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); if (name === 'join' && (this.code.length !== 4 || this.busy || !this.net.online)) return; this.audio.unlock(); if (!name.startsWith('key-')) this.audio.play('tap'); action(); });
      }
      return node;
    };
    art('back', [26, 46, 227, 122], () => { this.page = 'lobby'; this.render(); }, !this.busy);
    art('heading', [249, 65, 696, 256]);
    this.joinPaper = SpriteEffects.attach(art('paper', [120, 292, 823, 998]).getComponent(Sprite)!);
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
    art('create', [244, 849, 699, 949], () => this.createFriendRoom(), !this.busy && this.net.online);
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
      if (motion && enabled && previous.length < 4) {
        tween(button).to(.09, { scale: new Vec3(1.025, 1.025, 1) }).to(.11, { scale: Vec3.ONE }).start();
        SpriteEffects.attach(button.getComponent(Sprite)!).sweep();
        this.joinPaper?.sweep();
      }
    }
  }
  private stopPlayMotion() {
    for (const label of this.playDigits) {
      if (!label.isValid) continue;
      Tween.stopAllByTarget(label.node);
      const op = label.node.getComponent(UIOpacity);
      if (op) Tween.stopAllByTarget(op);
    }
    for (const glow of this.playSlotGlows) if (glow.isValid) Tween.stopAllByTarget(glow);
    for (const cur of this.playSlotCursors) if (cur.isValid) Tween.stopAllByTarget(cur);
    if (this.playActionButton?.isValid) Tween.stopAllByTarget(this.playActionButton);
  }
  private syncPlayInput(previous: string, next: string, wave = false) {
    const count = this.digitCount();
    const r = this.net.state?.room, me = this.net.state?.me;
    const editable = !!r && !!me && !this.busy && this.net.online && ['playing', 'reply'].includes(r.phase) && r.current === me.id && this.net.now() >= r.startAt;
    const motion = read('motion', '1') === '1';
    const activeSlot = editable ? (this.selected >= 0 ? this.selected : next.length < count ? next.length : -1) : -1;

    this.playDigits.forEach((label, i) => {
      if (!label.isValid) return;
      const node = label.node, op = node.getComponent(UIOpacity)!, glow = this.playSlotGlows[i], cursor = this.playSlotCursors[i];
      const slotX = count === 4 ? 470.25 + (i - 1.5) * 114.8 : 470.5 + (i - (count - 1) / 2) * 116;
      const restX = slotX - 470.5, restY = -838;
      if (cursor?.isValid) {
        Tween.stopAllByTarget(cursor);
        if (i === activeSlot) {
          cursor.opacity = 225;
          if (motion) tween(cursor).repeatForever(tween().to(0.55, { opacity: 95 }, { easing: 'sineInOut' }).to(0.55, { opacity: 235 }, { easing: 'sineInOut' })).start();
        } else {
          cursor.opacity = 0;
        }
      }
      if (previous[i] === next[i] && !wave) return;
      Tween.stopAllByTarget(node); Tween.stopAllByTarget(op); if (glow?.isValid) Tween.stopAllByTarget(glow);
      node.setPosition(restX, restY, 0); node.setScale(1, 1, 1); op.opacity = 255; if (glow?.isValid) glow.opacity = 0;
      if (!motion) { label.string = next[i] ?? ''; return; }
      const delay = wave ? i * 0.045 : 0;
      if (next[i] !== undefined) {
        label.string = next[i];
        node.setPosition(restX, restY + 12, 0); node.setScale(0.74, 0.74, 1); op.opacity = 0;
        tween(node).delay(delay)
          .to(0.11, { position: new Vec3(restX, restY, 0), scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' })
          .to(0.08, { scale: Vec3.ONE }).start();
        tween(op).delay(delay).to(0.09, { opacity: 255 }).start();
        if (glow?.isValid) tween(glow).delay(delay).to(0.06, { opacity: 210 }).to(0.2, { opacity: 0 }).start();
      } else {
        tween(node).to(0.1, { position: new Vec3(restX, restY + 8, 0), scale: new Vec3(0.8, 0.8, 1) }, { easing: 'quadIn' }).start();
        tween(op).to(0.1, { opacity: 0 }).call(() => { if (label.isValid) label.string = ''; }).start();
      }
    });

    const btn = this.playActionButton;
    if (btn?.isValid) {
      const enabled = editable && next.length === count;
      const sprite = btn.getComponent(Sprite)!;
      sprite.grayscale = !enabled;
      const op = btn.getComponent(UIOpacity) ?? btn.addComponent(UIOpacity);
      op.opacity = enabled ? 255 : 145;
      Tween.stopAllByTarget(btn); btn.setScale(1, 1, 1);
      if (motion && enabled && (previous.length < count || wave)) {
        tween(btn).to(0.09, { scale: new Vec3(1.045, 1.045, 1) }, { easing: 'quadOut' }).to(0.12, { scale: Vec3.ONE }).start();
        SpriteEffects.attach(sprite).sweep();
        this.playGuessPanel?.sweep();
      }
    }
  }
  private stopPrepMotion() {
    for (const item of this.prepCards) {
      if (item.card?.isValid) Tween.stopAllByTarget(item.card);
      if (item.digitNode?.isValid) Tween.stopAllByTarget(item.digitNode);
    }
    if (this.prepLockButton?.isValid) Tween.stopAllByTarget(this.prepLockButton);
  }
  private syncPrepInput(previous: string, next: string) {
    const count = this.digitCount();
    const r = this.net.state?.room;
    const editable = !!r && !this.busy && this.net.online && r.phase === 'preparing' && !r.ownSecret;
    const motion = read('motion', '1') === '1';
    const selected = editable ? (this.selected >= 0 ? this.selected : next.length < count ? next.length : -1) : -1;

    this.prepCards.forEach((slot, i) => {
      if (!slot.card?.isValid) return;
      const lifted = i === selected;
      const targetY = -(slot.baseY - (lifted ? 24 : 0));
      const targetPos = new Vec3(slot.x - 470.5, targetY, 0);
      Tween.stopAllByTarget(slot.card);
      if (motion) {
        tween(slot.card).to(0.14, { position: targetPos }, { easing: 'quadOut' }).start();
      } else {
        slot.card.setPosition(targetPos);
      }
      const ch = next[i] ?? '';
      if (slot.char !== ch) {
        slot.char = ch;
        if (slot.digitNode?.isValid) { slot.digitNode.removeFromParent(); slot.digitNode.destroy(); }
        slot.digitNode = undefined;
        if (ch) {
          const dn = this.addCardDigit(slot.card, ch, 0, 0, slot.digitH, 'ink');
          slot.digitNode = dn;
          if (motion) {
            dn.setScale(0.7, 0.7, 1);
            tween(dn).to(0.11, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' }).to(0.08, { scale: Vec3.ONE }).start();
          }
        }
      }
    });

    const lock = this.prepLockButton;
    if (lock?.isValid) {
      const enabled = editable && next.length === count;
      const sp = lock.getComponent(Sprite);
      if (sp) sp.grayscale = !enabled;
      const op = lock.getComponent(UIOpacity) ?? lock.addComponent(UIOpacity);
      op.opacity = enabled ? 255 : 145;
      Tween.stopAllByTarget(lock); lock.setScale(1, 1, 1);
      if (motion && enabled && previous.length < count) {
        tween(lock).to(0.09, { scale: new Vec3(1.04, 1.04, 1) }, { easing: 'quadOut' }).to(0.12, { scale: Vec3.ONE }).start();
        if (sp) SpriteEffects.attach(sp).sweep();
      }
    }
  }
  private keypad(top: number, context: 'join' | 'secret' | 'guess', enabled = true) {
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '删除', '0', context === 'secret' ? '随机' : '清空'];
    labels.forEach((label, i) => { if (context === 'guess' && i === 11) return; this.button(label, 165 + i % 3 * 210, top + Math.floor(i / 3) * 80, 194, 66, () => this.digit(label, context), false, enabled && !this.busy); });
  }
  private digit(value: string, context: 'join' | 'secret' | 'guess') {
    if (context === 'join' && (this.friendReturn.active || this.busy || !this.net.online)) return;
    this.audio.play('tap');
    if (context === 'guess' || context === 'secret') vibrate('light');
    let v = context === 'join' ? this.code : this.draft;
    const count = context === 'join' ? 4 : this.digitCount();
    if (value === '删除') {
      if (context !== 'join' && this.selected >= 0 && this.selected < v.length) {
        v = v.slice(0, this.selected) + v.slice(this.selected + 1);
        this.selected = -1;
      } else v = v.slice(0, -1);
    }
    else if (value === '清空') { v = ''; this.selected = -1; }
    else if (value === '随机') { v = String(Math.floor(Math.random() * 10 ** count)).padStart(count, '0'); this.selected = -1; }
    else if (this.selected >= 0 && context !== 'join' && this.selected < v.length) { v = v.slice(0, this.selected) + value + v.slice(this.selected + 1); this.selected = this.selected < count - 1 ? this.selected + 1 : -1; }
    else if (v.length < count) { v += value; this.selected = -1; }
    if (context === 'join') {
      const previous = this.code; this.code = v;
      if (this.joinDigits.length === 4 && this.joinDigits.every(label => label.isValid)) {
        this.animateJoinDigits(previous, v); return;
      }
    } else if (context === 'guess') {
      const previous = this.draft; this.draft = v;
      if (this.playDigits.length === count && this.playDigits.every(label => label.isValid)) {
        this.syncPlayInput(previous, v); return;
      }
    } else {
      const previous = this.draft; this.draft = v;
      if (this.prepCards.length === count && this.prepCards.every(c => c.card.isValid)) {
        this.syncPrepInput(previous, v); return;
      }
    }
    this.render();
  }
  private onKey(e: EventKeyboard) {
    this.audio.unlock();
    if (this.learning.visible) {
      if (this.modals.node.active || !this.net.online) return;
      if (e.keyCode >= KeyCode.DIGIT_0 && e.keyCode <= KeyCode.DIGIT_9) this.learning.input(String(e.keyCode - KeyCode.DIGIT_0));
      else if (e.keyCode === KeyCode.BACKSPACE) this.learning.input('delete');
      else if (e.keyCode === KeyCode.ENTER) this.learning.input('submit');
      return;
    }
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
    if ((r.phase === 'finished' && this.finishHoldingRoomId !== r.id) || r.phase === 'cancelled') { this.result(r); return; }
    if (this.battleArtReady) { this.battleArtwork(r); return; }
    const opponent = r.players.find(p => p.id !== this.net.state!.me.id)!;
    this.header(r.phase === 'preparing' ? '设置底牌' : `第 ${r.round} 轮 / ${r.roundLimit ?? STANDARD_ROUNDS}`, () => {
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
    this.text('等待好友入座', 375, 390, 36); this.text(`1 / 2 · ${modeLabel(r.digitCount ?? 4)}`, 375, 455, 24, C.gold);
    this.box(375, 685, 650, 350, C.dark); this.text('房间口令', 375, 555, 28); this.cards(r.code!, 660, 100, false, false, 4);
    this.button('复制口令', 375, 800, 340, 62, () => { this.copyRoomCode(r.code!); }, true);
    this.timerLabel = this.text('', 375, 930, 24); this.button('关闭房间', 375, 1120, 520, 88, () => this.ask('close', () => this.act('leave')));
  }
  /** Source-space composition: one uniform transform also scales fonts and hit targets. */
  private friendWaiting(r: RoomView) {
    const scale = Math.min(750 / 941, (this.screenHeight - this.layoutTop - bottomSafeInset() - 24) / 1463);
    const group = this.n('FriendRoom', 375, 667, 941, 1672);
    group.setPosition(0, this.screenHeight / 2 - this.layoutTop + 32 * scale);
    group.setScale(scale, scale, 1);
    // Keep navigation fixed and use only a small share of surplus height above the content.
    const bodyBottom = this.layoutTop + (1495 - 32) * scale;
    const targetBottom = this.screenHeight - bottomSafeInset() - Math.min(120, this.screenHeight * .09);
    const bodyShift = Math.max(0, targetBottom - bodyBottom) / scale * .25;
    const place = (node: Node, x: number, y: number) => { node.setPosition(x - 470.5, -y - (y > 128 ? bodyShift : 0)); return node; };
    const art = (name: string, x: number, y: number, w: number, h: number, action?: () => void) => {
      const node = place(this.n('Friend-' + name, 375, 667, w, h, group), x, y);
      const sprite = node.addComponent(Sprite); sprite.spriteFrame = this.friendArt.get(name)!;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM; node.getComponent(UITransform)!.setContentSize(w, h);
      if (action) {
        if (this.busy) node.addComponent(UIOpacity).opacity = 150;
        else {
          this.bindPressEffect(node);
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
    label(modeLabel(r.digitCount ?? 4),471,430,29,C.cream,540,50);
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
    const canShare = !!wechat() && this.net.state?.wechatSharingEnabled === true;
    art('copy', canShare ? 302 : 470.5, 872.5, canShare ? 316 : 397, canShare ? 84 : 105, () => { if (r.code) { this.copyRoomCode(r.code); } });
    if (canShare) {
      const inviteBtn = art('invite', 642, 872.5, 316, 84, () => { try { this.wxFlow.share(); } catch (e) { this.toast((e as Error).message); } });
      inviteBtn.name = 'WechatInvite';
      const inviteLbl = this.text('邀请微信好友', 375, 667, 28, '#FFF6DE', 206, 50, inviteBtn);
      inviteLbl.node.setPosition(34, 2);
      inviteLbl.isBold = true; inviteLbl.enableWrapText = false;
    }
    this.timerLabel = label('', 569, 1024, 27, C.ink, 88, 40);
    const me = this.net.state!.me;
    // Actual player portrait, followed by the existing hollow decorative rim.
    for (const [key, size] of [['portrait-background', 178], ['avatar-' + me.avatar, 178], ['portrait-frame', 198]] as const) {
      const frame = key.startsWith('avatar-')?(this.avatarFrame(me)??this.profileArt.get(key)):this.profileArt.get(key);
      if (!frame) { if (size === 178) label(AVATARS[me.avatar] ?? '客', 471, 1195, 60, C.ink, 150, 160); continue; }
      const node = place(this.n('Friend-' + key, 375, 667, size, size, group), 471, 1195);
      let target=node;
      if(key.startsWith('avatar-')){node.addComponent(Mask).type=Mask.Type.GRAPHICS_ELLIPSE;target=this.n('FriendAvatarImage',375,667,size,size,node);target.setPosition(0,0);}
      const sprite = target.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      target.getComponent(UITransform)!.setContentSize(size, size);
    }
    art('nameplate', 471, 1278.5, 210, 51);
    label(me.name, 471, 1278, 26, C.cream, 174, 38);
    art('seated', 471.5, 1318, 163, 36);
    art('close', 470.5, 1439.5, 447, 111, close);
  }
  /** Keep the sleeve cut beyond the viewport; only the knitted midsection stretches. */
  private battleHands(parent: Node, count: number, preparing: boolean, sceneScale: number, selected = -1) {
    const frame = this.battleArt.get('grip-sleeve')!;
    const sourceWidth = frame.originalSize.width, sourceHeight = frame.originalSize.height;
    const handScale = preparing ? .34 : .24;
    const center = preparing ? 471.5 : 463.5, spacing = preparing ? 149 : 105;
    const thumbX = sourceWidth * (1470 / 1536), thumbY = sourceHeight * (400 / 1024);
    for (const side of [-1, 1]) {
      const index = side < 0 ? 0 : count - 1;
      const gripX = center + side * ((count - 1) * spacing / 2 + (preparing ? 55 : 35));
      const gripY = (preparing ? 752 + 25 + 45 : 1018 + 14 + 26) - (preparing && selected === index ? 24 : 0);
      const edge = 470.5 + side * (375 / sceneScale + 40);
      const tail = (sourceWidth - thumbX) * handScale;
      const width = Math.max(sourceWidth, (Math.abs(edge - gripX) + tail) / handScale);
      const node = this.n(side < 0 ? 'BattleGripLeft' : 'BattleGripRight',375,667,width,sourceHeight,parent);
      const transform = node.getComponent(UITransform)!; transform.setAnchorPoint(1,.5);
      node.setPosition(gripX - side * tail - 470.5, -gripY + (thumbY - sourceHeight / 2) * handScale);
      node.setScale(-side * handScale, handScale, 1);
      const sprite = node.addComponent(Sprite); sprite.spriteFrame = frame;
      sprite.type = Sprite.Type.SLICED; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      transform.setContentSize(width,sourceHeight);
    }
  }
  /** Both battle screens use the reference coordinate system and one safe-area transform. */
  private battleArtwork(r: RoomView) {
    const prep = r.phase === 'preparing', me = this.net.state!.me, count = r.digitCount ?? 4;
    const opponent = r.players.find(p => p.id !== me.id)!;
    const scale = Math.min(750 / 941, (this.screenHeight - this.layoutTop - bottomSafeInset() - 16) / (prep ? 1590 : 1750));
    const group = this.n('BattleRoom', 375, 667, 941, 1672);
    group.setPosition(0, this.screenHeight / 2 - this.layoutTop + 20 * scale); group.setScale(scale, scale, 1);
    const place = (node: Node, x: number, y: number) => { node.setPosition(x - 470.5, -y); return node; };
    const touch = (node: Node, action: () => void, enabled = true) => {
      if (!enabled) { const sprite = node.getComponent(Sprite); if (sprite) sprite.grayscale = true; node.addComponent(UIOpacity).opacity = 145; return; }
      this.bindPressEffect(node);
      node.on(Node.EventType.TOUCH_START, () => { if (read('motion', '1') === '1') node.setScale(.98, .98, 1); });
      node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
      node.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); this.audio.unlock(); action(); });
    };
    const art = (name: string, rect = BATTLE_RECTS[name], frame = this.battleArt.get(name)!, parent = group) => {
      const [l,t,r,b] = rect;
      const node = place(this.n('Battle-' + name,375,667,r-l,b-t,parent),(l+r)/2,(t+b)/2);
      const sprite = node.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      node.getComponent(UITransform)!.setContentSize(r-l,b-t); return node;
    };
    const label = (value: string, x: number, y: number, size: number, w: number, color = C.ink, h = size * 1.5, parent = group) => {
      const l = this.text(value,375,667,size,color,w,h,parent); place(l.node,x,y); l.enableWrapText = false; return l;
    };
    const number = (value: string, x: number, y: number, size: number, w: number, h = size * 1.5, parent = group) => {
      const l = label(value,x,y,size,w,C.ink,h,parent);
      if (this.friendDigitFont && /^[0-9—]+$/.test(value)) { l.font=this.friendDigitFont; l.lineHeight=size*1.1; }
      else l.isBold=true;
      return l;
    };
    const shortName = (name: string, limit: number) => Array.from(name).length > limit ? Array.from(name).slice(0,limit-1).join('')+'…' : name;
    // The tray is below all controls and hands; each key remains independently clickable.
    // Extend the gameplay keyboard down from its top; keep keys and artwork in one transform.
    const keyboardY=(y:number)=>1190+(y-1190)*1.28;
    art(prep ? 'tray' : 'play-tray',prep?BATTLE_RECTS.tray:BATTLE_RECTS['play-tray'].map((v,i)=>i%2?keyboardY(v):v));
    if (!prep && r.current !== me.id && ['playing', 'reply'].includes(r.phase)) {
      const ring = this.n('OpponentPulseRing', 375, 667, 160, 160, group);
      ring.setPosition(0, -65);
      const rg = ring.addComponent(Graphics);
      rg.strokeColor = new Color('#FFD978'); rg.lineWidth = 4.5;
      rg.circle(0, 0, 72); rg.stroke();
      this.opponentPulseRing = ring.addComponent(UIOpacity);
      this.opponentPulseRing.opacity = 160;
    }
    this.playerPortrait(group, opponent, 0, -65, 126);
    const nameplate=art('nameplate',[355,134,586,179]);
    touch(nameplate,()=>this.toast(opponent.name+(opponent.online?'':' · 连接中')));
    label(shortName(opponent.name,7),472,150,29,208,C.cream,38).node.name='OpponentNickname';
    if (count === 4) this.opponentBacksNode = art('card-backs');
    else {
      if (!this.opponentCard) { this.opponentCard = new SpriteFrame(); this.opponentCard.texture = this.battleArt.get('card-backs')!.texture; this.opponentCard.rect = new Rect(214,0,94,128); }
      const backs=this.n('Battle-card-backs',375,667,1,1,group);backs.setPosition(0,0);
      for(let i=0;i<count;i++){const x=470+(i-(count-1)/2)*77;art('mode-back',[x-47,175,x+47,303],this.opponentCard,backs);}
      this.opponentBacksNode = backs;
    }
    if (!prep) {
      const progress = opponentProgress(r.history, me.id, count);
      const badge = place(this.n('OpponentProgress', 375, 667, 250, 56, group), 768, 238);
      const bg = badge.addComponent(Graphics);
      bg.fillColor = new Color(progress.urgent || progress.cracked ? '#8F1E16' : '#251B14');
      bg.roundRect(-125, -26, 250, 52, 26); bg.fill();
      bg.strokeColor = new Color(progress.urgent || progress.cracked ? '#FFD36B' : '#B98C4B');
      bg.lineWidth = progress.urgent || progress.cracked ? 2.6 : 1.8;
      bg.roundRect(-124, -25, 248, 50, 25); bg.stroke();
      const pl = this.text(progress.label, 375, 667, 22, progress.urgent || progress.cracked ? '#FFF5D6' : '#EED9AE', 230, 40, badge);
      pl.node.setPosition(0, 0); pl.enableWrapText = false;
      if (progress.urgent || progress.cracked) pl.isBold = true;
      badge.on(Node.EventType.TOUCH_END, () => { this.audio.unlock(); this.audio.play('tap'); this.recordsOpponent = true; this.overlay = 'guessRecords'; this.render(); });
    }
    const nav = art('round');
    const navText = (value: string, x: number, width: number, parent = nav) => {
      const item = this.text(value,375,667,30,C.cream,width,44,parent);
      item.node.setPosition(x, parent === nav ? 6 : 0);item.lineHeight=36;item.enableWrapText=false;
      return item;
    };
    navText('‹',105,22);
    if (prep) {
      this.roundRoll.sync(r.id,0,false,true);
      navText(`${count}位·设置底牌`,-9,190);
    } else {
      label(`${count} 位密码`,150,139,25,240,C.cream,42);
      navText('第',-78,32);navText(`轮 / ${r.roundLimit ?? STANDARD_ROUNDS}`,32,94);
      const clip = this.n('RoundDigitViewport',375,667,50,42,nav);clip.setPosition(-40,4.5);
      clip.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
      this.roundRoll.sync(r.id,r.round,read('motion','1')==='1');
      const oldDigit=navText(String(this.roundRoll.previous),0,50,clip);
      const newDigit=navText(String(r.round),0,50,clip);
      if (this.friendDigitFont) { oldDigit.font = this.friendDigitFont; newDigit.font = this.friendDigitFont; }
      oldDigit.node.name='RoundPrevious';newDigit.node.name='RoundCurrent';
      this.roundOld=oldDigit.node;this.roundNew=newDigit.node;
      this.applyRoundRoll();
    }
    touch(nav, () => { if (prep) this.ask('leave',()=>this.act('leave')); else { this.overlay='gameMenu';this.render(); } });
    const editable = !this.busy && this.net.online && (prep ? !r.ownSecret : ['playing', 'reply'].includes(r.phase) && r.current === me.id && this.net.now() >= r.startAt);
    if (prep) {
      art('status',[355,299,586,344]); label(opponent.ready ? '对手已准备' : '对手正在设置',470,316,28,215,C.cream);
      if(count===4)art('heading');
      else {
        const plaque = place(this.n('PrepModeHeading', 375, 667, 586, 98, group), 470.5, 412);
        const pg = plaque.addComponent(Graphics);
        const pw = 586, ph = 98, c = 12;
        const drawPlaque = (shrink: number) => {
          const hw = pw / 2 - shrink, hh = ph / 2 - shrink;
          pg.moveTo(-hw + c, hh); pg.lineTo(hw - c, hh); pg.lineTo(hw, hh - c);
          pg.lineTo(hw, -hh + c); pg.lineTo(hw - c, -hh); pg.lineTo(-hw + c, -hh);
          pg.lineTo(-hw, -hh + c); pg.lineTo(-hw, hh - c); pg.close();
        };
        pg.fillColor = new Color('#F6E8CC'); drawPlaque(0); pg.fill();
        pg.strokeColor = new Color('#6D431E'); pg.lineWidth = 4; drawPlaque(2); pg.stroke();
        pg.strokeColor = new Color('#D7A44E'); pg.lineWidth = 1.8; drawPlaque(8); pg.stroke();
        const hl = label(`设置你的 ${count} 位密码`, 470.5, 411, 40, 520, C.ink, 64);
        hl.isBold = true;
      }
      this.timerEffects = SpriteEffects.attach(art('timer').getComponent(Sprite)!);
      this.timerLabel=label('',488,492,38,84,'#FFD978',52);
      this.timerLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;
      if (this.friendDigitFont) this.timerLabel.font = this.friendDigitFont; else this.timerLabel.isBold = true;
      this.timerLabel.lineHeight=44;
      const unit = label('s',544,496,27,22,'#FFD978',38);
      unit.horizontalAlign = Label.HorizontalAlign.LEFT; unit.isBold = true;
      const rules=art('rules',[243,523,699,589]); touch(rules,()=>this.openLearning('rules'));
      const value=r.ownSecret ?? this.draft;
      // Draw the fan first; the complete grip silhouettes overlap its outer corners.
      const selected=editable ? (this.selected>=0 ? this.selected : value.length<count ? value.length : -1) : -1;
      const order=Array.from({length:count},(_,i)=>i).sort((a,b)=>Number(a===selected)-Number(b===selected));
      const paper=this.battleArt.get('card-paper')!,ratio=paper.originalSize.height/paper.originalSize.width;
      const digitH = Math.round(192 * ratio * 0.65);
      this.prepCards = Array.from({ length: count });
      for(const i of order) {
        const active=i===selected,x=471.5+(i-(count-1)/2)*149,baseY=752+(i===0||i===count-1?25:0),y=baseY-(active?24:0);
        const cardGroup=this.n('SecretCard-'+i,375,667,202,202*ratio,group);cardGroup.setPosition(0,0);
        const card=art('card-paper',[x-96,y-96*ratio,x+96,y+96*ratio],paper,cardGroup);card.angle=count===4?[14,5,-5,-14][i]:((count-1)/2-i)*10;
        const ch = value[i] ?? '';
        const digitNode = ch ? this.addCardDigit(card, ch, 0, 0, digitH, 'ink') : undefined;
        this.prepCards[i] = { card, x, baseY, digitH, digitNode, char: ch };
        if(editable){
          touch(card,()=>{
            this.selected = this.selected === i ? -1 : i;
            this.syncPrepInput(this.draft, this.draft);
          });
        }
      }
      this.battleHands(group, count, true, scale, selected);
      const lock=art('lock');
      this.prepLockButton = lock;
      const lockReady = editable && this.draft.length === count;
      if (!lockReady) { lock.getComponent(Sprite)!.grayscale = true; lock.addComponent(UIOpacity).opacity = 145; }
      if (editable) {
        this.bindPressEffect(lock, () => this.draft.length === count && !this.busy && this.net.online);
        lock.on(Node.EventType.TOUCH_START, () => { if (this.draft.length === count && !this.busy && read('motion', '1') === '1') lock.setScale(.98, .98, 1); });
        lock.on(Node.EventType.TOUCH_CANCEL, () => lock.setScale(1, 1, 1));
        lock.on(Node.EventType.TOUCH_END, () => { lock.setScale(1, 1, 1); if (this.draft.length === count && !this.busy && this.net.online) { this.audio.unlock(); this.lockSecret(); } });
      }
      art('status',[230,1546,711,1603]);
      label(r.ownSecret ? '底牌已锁定，等待对手' : 'ⓘ 锁定后本局不可修改',470,1568,29,650,C.gold);
    } else {
      art('records');
      const records=art('all-records');touch(records,()=>{this.recordsOpponent=false;this.overlay='guessRecords';this.render();});
      // Symmetrical top-left entry inside the ledger header: zero overlap with borders or guess box.
      const hintButton=art('hint-button',[134,338,308,385],this.modalArt.get('tab-off'));
      label('推理提示',221,362,25,160,C.ink,40);
      touch(hintButton,()=>this.openLearning('clues'));
      const rows=r.history.filter(h=>h.playerId===me.id),rowHeight=90,height=270,width=680;
      const viewport=place(this.n('BattleRecordsViewport',375,667,width,height,group),470.5,396+height/2);
      viewport.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
      const content=this.n('BattleRecordsContent',375,667,width,Math.max(height,rows.length*rowHeight),viewport);
      content.getComponent(UITransform)!.setAnchorPoint(.5,1);content.setPosition(0,height/2);
      const scroll=viewport.addComponent(ScrollView);scroll.content=content;scroll.horizontal=false;scroll.vertical=true;scroll.inertia=true;scroll.elastic=false;scroll.cancelInnerEvents=true;
      if(!rows.length)label(`暂无记录，输入 ${count} 位数字开始猜测`,470,530,27,620);
      const motion = read('motion', '1') === '1';
      rows.forEach((h,i)=>{
        const y=i*rowHeight+44;
        const latest = i === rows.length - 1;
        const rowWrap = this.n('RecordRowWrap-' + i, 375, 667, 660, 86, content);
        rowWrap.setPosition(0, -y);
        const rowNode=art('record-row',[149,y-43,805,y+43],count===4?undefined:this.modalArt.get('record-row'),content);
        rowNode.parent = rowWrap; rowNode.setPosition(6.5, 0);
        // Never gray out records during opponent's turn; keep them crisp and readable for deduction!
        rowNode.on(Node.EventType.TOUCH_START, () => { if (editable && h.digits && motion) rowWrap.setScale(0.985, 0.985, 1); });
        rowNode.on(Node.EventType.TOUCH_CANCEL, () => rowWrap.setScale(1, 1, 1));
        rowNode.on(Node.EventType.TOUCH_END, () => { rowWrap.setScale(1, 1, 1); this.audio.unlock(); if (h.digits) this.copyGuess(h.digits); });
        if (latest) {
          const hl = this.n('LatestRowHighlight', 375, 667, 656, 86, rowWrap); hl.setPosition(6.5, 0);
          const hg = hl.addComponent(Graphics);
          hg.strokeColor = new Color('#D99B38'); hg.lineWidth = 2.6;
          hg.roundRect(-326, -41, 652, 82, 12); hg.stroke();
        }
        const roundLbl = label(`第${Math.floor(h.turn/2)+1}轮`,231,y,29,145,C.ink,44,content);
        roundLbl.node.parent = rowWrap; roundLbl.node.setPosition(231 - 470.5, 0);
        if(h.digits)for(let j=0;j<count;j++){
          const dx = count === 4 ? 480 + (j - 1.5) * 87 : 480 + (j - (count - 1) / 2) * 88;
          const dLbl = number(h.digits[j],dx,y,43,66,64,content);
          dLbl.node.parent = rowWrap; dLbl.node.setPosition(dx - 470.5, 0);
        } else {
          const tLbl = label('本次超时',481,y,29,350,C.ink,44,content);
          tLbl.node.parent = rowWrap; tLbl.node.setPosition(481 - 470.5, 0);
        }
        // Color-escalated hit badge pill for instant scan of progress & match points!
        const palette = hitBadgePalette(h.hits, count);
        const pill = this.n('HitBadge-' + i, 375, 667, 108, 52, rowWrap);
        pill.setPosition(727 - 470.5, 0);
        const pg = pill.addComponent(Graphics);
        pg.fillColor = new Color(palette.bg);
        pg.roundRect(-52, -25, 104, 50, 25); pg.fill();
        pg.strokeColor = new Color(palette.border); pg.lineWidth = 2.2;
        pg.roundRect(-51, -24, 102, 48, 24); pg.stroke();
        const hitLbl = this.text(h.hits===null?'—':`${h.hits}/${count}`, 375, 667, 30, palette.text, 100, 46, pill);
        hitLbl.node.setPosition(0, 0); hitLbl.enableWrapText = false;
        if (this.friendDigitFont) { hitLbl.font = this.friendDigitFont; hitLbl.lineHeight = 36; } else hitLbl.isBold = true;
        if (latest && h.turn > this.lastAnimatedRecordTurn) {
          this.lastAnimatedRecordTurn = h.turn;
          if (motion) {
            const rop = rowWrap.addComponent(UIOpacity);
            rop.opacity = 0; rowWrap.setPosition(-26, -y);
            tween(rop).to(0.22, { opacity: 255 }).start();
            tween(rowWrap).to(0.26, { position: new Vec3(0, -y, 0) }, { easing: 'quadOut' }).start();
          }
        }
      });
      const scrollKey=`battle:${r.id}:${me.id}`,position=this.recordPositions.get(scrollKey),max=Math.max(0,rows.length*rowHeight-height);
      scroll.scrollToOffset(new Vec2(0,position&&!position.bottom?Math.min(max,position.offset):max));
      this.recordScrolls.push({view:scroll,key:scrollKey});
      if(rows.length)label(`共 ${rows.length} 条 · 点击记录可复用${max>0?' · 可滑动':''}`,470,683,20,580,'#6B4E31',26);
      if(max>0&&this.modalArtReady){
        art('record-track',[816,396,828,396+height],this.modalArt.get('record-track'));
        const thumbHeight=Math.max(32,height*height/(rows.length*rowHeight));
        const thumb=art('record-thumb',[816,396,828,396+thumbHeight],this.modalArt.get('record-thumb'));
        const update=()=>place(thumb,822,396+thumbHeight/2+Math.max(0,Math.min(1,scroll.getScrollOffset().y/max))*(height-thumbHeight));
        viewport.on(ScrollView.EventType.SCROLLING,update);update();
      }
      if(count===4) this.playGuessPanel = SpriteEffects.attach(art('guess').getComponent(Sprite)!);
      else {
        const gw = count === 2 ? 430 : 540, gh = 196;
        const board = place(this.n('PlayModeGuessPanel', 375, 667, gw, gh, group), 470.5, 822);
        const bg = board.addComponent(Graphics);
        bg.fillColor = new Color('#5A381D'); bg.roundRect(-gw / 2, -gh / 2, gw, gh, 18); bg.fill();
        bg.fillColor = new Color('#F2DFBE'); bg.roundRect(-gw / 2 + 8, -gh / 2 + 8, gw - 16, gh - 16, 13); bg.fill();
        bg.strokeColor = new Color('#C99A52'); bg.lineWidth = 2; bg.roundRect(-gw / 2 + 12, -gh / 2 + 12, gw - 24, gh - 24, 10); bg.stroke();
        const titleLbl = label('本次猜测', 470.5, 754, 29, 320, C.ink, 42);
        titleLbl.isBold = true;
      }
      for(let i=0;i<count;i++) {
        const x = count === 4 ? 470.25 + (i - 1.5) * 114.8 : 470.5 + (i - (count - 1) / 2) * 116;
        if(count!==4)art('mode-slot',[x-49,773,x+49,907],this.battleArt.get('card-paper'));
        // Active slot cursor highlight fitted tightly to guess.png's 94x104 inner slot frame.
        const cursorNode = place(this.n('PlaySlotCursor-' + i, 375, 667, 100, 108, group), x, 838);
        const cg = cursorNode.addComponent(Graphics);
        cg.strokeColor = new Color('#E6A230'); cg.lineWidth = 3.8;
        cg.roundRect(-48, -51, 96, 102, 10); cg.stroke();
        cg.fillColor = new Color('#D97228');
        cg.roundRect(-20, -44, 40, 4.5, 2.2); cg.fill();
        const cursorOp = cursorNode.addComponent(UIOpacity); cursorOp.opacity = 0;
        this.playSlotCursors.push(cursorOp);
        // Flash glow border on digit entry
        const glowNode = place(this.n('PlaySlotGlow-' + i, 375, 667, 104, 112, group), x, 838);
        const gg = glowNode.addComponent(Graphics);
        gg.strokeColor = new Color('#FFE38A'); gg.lineWidth = 4.5;
        gg.roundRect(-50, -53, 100, 106, 11); gg.stroke();
        const glowOp = glowNode.addComponent(UIOpacity); glowOp.opacity = 0;
        this.playSlotGlows.push(glowOp);
        const digit=number(this.draft[i] ?? '',x,838,66,90,96);
        digit.node.addComponent(UIOpacity);
        this.playDigits.push(digit);
        // Full-slot clickable hit target with instant local selection (no page rebuild)
        const hitSlot = place(this.n('PlaySlotHit-' + i, 375, 667, 104, 114, group), x, 838);
        if (editable) {
          hitSlot.on(Node.EventType.TOUCH_END, () => {
            this.audio.unlock(); this.audio.play('tap');
            this.selected = this.selected === i ? -1 : i;
            this.syncPlayInput(this.draft, this.draft);
          });
        }
      }

      for(let i=0;i<count;i++) {
        const x=463.5+(i-(count-1)/2)*105,y=1022+(i===0||i===count-1?14:0);
        const card=art('card-paper',[x-69,y-95,x+69,y+95]);card.angle=count===4?[16,6,-6,-16][i]:((count-1)/2-i)*12;
        const ch = this.hideSecret ? '?' : (r.ownSecret?.[i] ?? '');
        if (ch) this.addCardDigit(card, ch, 0, 0, 124, 'ink');
        touch(card,()=>{this.hideSecret=!this.hideSecret;this.render();});
      }
      this.battleHands(group, count, false, scale);
      // Positioned neatly in the lower-left pocket, clearing the left hand & sleeve cleanly.
      const portraitRect=[42,1060,164,1182];
      const portrait=this.avatarFrame(me)??this.profileArt.get('avatar-'+me.avatar);
      const portraitBg=this.profileArt.get('portrait-background');
      const portraitClip=place(this.n('BattlePortraitClip',375,667,122,122,group),103,1121);
      portraitClip.addComponent(Mask).type=Mask.Type.GRAPHICS_ELLIPSE;
      const clipPortrait=(node:Node)=>{node.parent=portraitClip;node.setPosition(0,0);};
      if(portraitBg) clipPortrait(art('portrait-background',portraitRect,portraitBg));
      if(portrait) clipPortrait(art('portrait',portraitRect,portrait));
      else label(AVATARS[me.avatar] ?? '客',103,1121,48,100,C.ink,90);
      const rim=this.profileArt.get('portrait-frame');
      if(rim) art('portrait-frame',[37,1055,169,1187],rim);
      art('nameplate',[16,1162,190,1194]);
      label(shortName(me.name,6),103,1173,24,162,C.cream);
      const secretStatus=art('status',[295,1096,646,1148]);
      touch(secretStatus,()=>{this.hideSecret=!this.hideSecret;this.render();});
      label(this.hideSecret?'底牌已隐藏 · 点击查看':'我的底牌 · 已锁定',470,1116,26,340,C.cream);
      if (r.phase === 'reply' && r.current === me.id) {
        const aura = place(this.n('ReplyAura', 375, 667, 424, 92, group), 470, 1190);
        const ag = aura.addComponent(Graphics);
        ag.strokeColor = new Color('#FF6A3D'); ag.lineWidth = 5;
        ag.roundRect(-206, -42, 412, 84, 42); ag.stroke();
        this.replyAura = aura.addComponent(UIOpacity); this.replyAura.opacity = 180;
      }
      this.timerEffects = SpriteEffects.attach(art('turn').getComponent(Sprite)!);
      this.timerLabel=label('',470,1187,28,330,r.phase==='reply'&&r.current===me.id?'#FFD87A':C.cream,48);
    }
    if(this.opponentFeedbackActive)this.setOpponentSeatVisible(false);
    const prefix=prep?'prep-':'play-';
    for(const key of ['1','2','3','4','5','6','7','8','9','delete','0','action']) {
      // Keep gameplay keys inside the leather inset, clear of the tray's metal rim.
      const rect=BATTLE_RECTS[prefix+key];
      const keyRect=prep?rect:rect.map((v,i)=>i%2===0?470.5+(v-470.5)*.88:keyboardY(1425+(v-1425)*.84));
      const node=art(prefix+key,keyRect);
      if (!prep && key === 'action') {
        this.playActionButton = node;
        if (editable) {
          this.bindPressEffect(node, () => this.draft.length === count && !this.busy && this.net.online);
          node.on(Node.EventType.TOUCH_START, () => { if (this.draft.length === count && !this.busy && read('motion', '1') === '1') node.setScale(.98, .98, 1); });
          node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
          node.on(Node.EventType.TOUCH_END, () => { node.setScale(1, 1, 1); this.audio.unlock(); if (this.draft.length === count && !this.busy && this.net.online) this.submitGuess(); });
        } else {
          node.getComponent(Sprite)!.grayscale = true; node.addComponent(UIOpacity).opacity = 145;
        }
      } else {
        touch(node,()=>{if(key==='action') {if(prep)this.digit('随机','secret');else this.submitGuess();}
          else this.digit(key==='delete'?'删除':key,prep?'secret':'guess');}, editable && (key!=='action'||prep||this.draft.length===count));
      }
    }
    if (!prep) this.syncPlayInput(this.draft, this.draft);
  }
  private preparation(r: RoomView) {
    this.text(r.players.find(p => p.id !== this.net.state!.me.id)?.ready ? '对手已准备' : '对手正在设置', 375, 365, 22, C.gold);
    this.timerLabel = this.text('', 375, 425, 28); this.text(r.ownSecret ? '底牌已锁定，等待对手' : `设置你的 ${r.digitCount ?? 4} 位密码`, 375, 485, 34);
    this.cards(r.ownSecret ?? this.draft, 625, 112, false, !r.ownSecret); this.text('允许重复，允许 0 开头', 375, 730, 22, C.gold);
    this.keypad(835, 'secret', !r.ownSecret && this.net.online);
    this.button(r.ownSecret ? '已准备' : '锁定并准备', 375, 1195, 610, 84, () => this.lockSecret(), true, !r.ownSecret && this.draft.length === this.digitCount() && !this.busy);
  }
  private lockSecret() { const digits = this.draft; if (digits.length === this.digitCount()) this.ask('lock', () => this.act('lock', { digits })); }
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
      this.text(h.hits === null ? '—' : `${h.hits}/${r.digitCount ?? 4}`, 610, y, 26, h.hits === (r.digitCount ?? 4) ? C.teal : C.orange, 90, rowHeight - 8, content);
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
    this.button('提示', 625, 405, 100, 46, () => this.openLearning('clues'));
    this.recordList(r, 443, 210, false, 'table');
    this.text('本次猜测', 115, 775, 22, C.cream, 180); this.cards(this.draft, 790, 66, false, mine);
    this.text('我的底牌\n已锁定', 140, 882, 19, C.gold, 190, 60); this.cards(r.ownSecret ?? '', 882, 42, this.hideSecret);
    this.button(this.hideSecret ? '查看' : '盖牌', 650, 885, 95, 44, () => { this.hideSecret = !this.hideSecret; this.render(); });
    this.timerLabel = this.text('', 375, 942, 25, C.gold);
    this.keypad(1004, 'guess', mine && this.net.online && this.net.now() >= r.startAt);
    // The last keypad key becomes submit; keeps a complete 0–9 keyboard on one screen.
    this.button(this.submitting ? '验证中…' : '确认猜测', 585, 1244, 194, 66, () => this.submitGuess(), true, mine && this.draft.length === this.digitCount() && this.net.online && !this.busy && this.net.now() >= r.startAt);
  }
  private submitGuess() {
    const r = this.net.state?.room; if (!r || this.draft.length !== (r.digitCount ?? 4) || r.current !== this.net.state?.me.id) return;
    const digits = this.draft; const submit = () => this.act('guess', { digits, turn: r.turn });
    if (r.history.some(h => h.playerId === this.net.state!.me.id && h.digits === this.draft)) this.ask('repeat', submit); else submit();
  }
  private artResult(r: RoomView) {
    const me = this.net.state!.me;
    const motion = read('motion', '1') === '1';
    const shouldAnimate = motion && this.resultAnimatedRoomId !== r.id;
    if (shouldAnimate) this.resultAnimatedRoomId = r.id;
    renderResultView({
      root: this.root,
      effects: this.effects,
      room: r,
      me,
      screenHeight: this.screenHeight,
      layoutTop: this.layoutTop,
      bottomSafe: bottomSafeInset(),
      busy: this.busy,
      shouldAnimate,
      feedbackArt: this.feedbackArt,
      cardPaper: this.battleArt.get('card-paper') ?? this.joinArt.get('digit-slot') ?? null,
      friendDigitFont: this.friendDigitFont,
      inkColor: C.ink,
      bindPressEffect: node => this.bindPressEffect(node),
      addCardDigit: (parent, char, x, y, height, tone) => this.addCardDigit(parent, char, x, y, height, tone),
      playerPortrait: (parent, profile, x, y, size) => this.playerPortrait(parent, profile, x, y, size),
      playTap: () => this.audio.play('tap'),
      onUnlockAudio: () => this.audio.unlock(),
      onRecords: () => { this.overlay = 'resultRecords'; this.render(); },
      onShare: () => {
        const shareText = buildBattleShareText(r, me.id);
        void this.shareRecap(shareText, shareText);
      },
      onReturnToRoom: () => { void this.act('returnToRoom'); },
      onRematch: () => { this.selectMode('public'); },
      onHome: () => { this.page = 'lobby'; void this.act('leave'); },
    });
  }
  private result(r: RoomView) {
    if (this.feedbackArt.ready) { this.artResult(r); return; }
    const me = this.net.state!.me.id, win = r.result?.winner === me;
    this.header('本局结果'); this.text(r.phase === 'cancelled' ? '对局取消' : !r.result?.winner ? '平局' : win ? '胜利' : '再接再厉', 375, 375, 68, C.gold);
    this.text(reasons[r.result?.reason ?? ''] ?? '对局结束', 375, 465, 26);
    if (r.revealed) { const other = r.players.find(p => p.id !== me)!; this.text('对手密码 · ' + other.name, 375, 550, 24); this.cards(r.revealed[other.id], 650, 92); this.text('我的底牌  ' + r.ownSecret, 375, 765, 28); }
    const own = r.history.filter(h => h.playerId === me && h.digits !== null).length;
    this.text(`有效猜测 ${own} 次`, 375, 845, 25);
    if (r.phase === 'finished' && r.mode === 'friend') {
      this.button('确认 · 返回房间', 375, 1100, 610, 82, () => this.act('returnToRoom'), true, !this.busy);
    } else {
      if (r.phase === 'finished') this.button('重新匹配', 375, 1055, 610, 82, () => this.selectMode('public'), false, !this.busy);
      this.button('返回大厅', 375, 1160, 610, 82, () => { this.page = 'lobby'; this.act('leave'); });
    }
    this.button('查看本局记录', 375, 1245, 300, 48, () => { this.overlay = 'resultRecords'; this.render(); });
  }
  private offerWechatProfile() {
    const wx=wechat(),s=this.net.state;if(this.learning.visible||!wx||!s||s.room||s.queuedAt!==null||this.page!=='lobby'||read('profile-choice-'+s.me.id)==='1')return;
    write('profile-choice-'+s.me.id,'1');
    wx.showModal?.({title:'完善游戏资料',content:'可以使用微信头像昵称，也可以保留默认资料直接开始游戏。',confirmText:'完善资料',cancelText:'先用默认',success:(result:any)=>{
      if(result.confirm&&this.isValid&&!this.net.state?.room&&this.net.state?.queuedAt===null)this.openProfile();
    }});
  }
  private avatarFrame(profile: { avatarUrl?: string; avatar?: number }): SpriteFrame | undefined {
    const fallback = this.profileArt.get('avatar-' + (((profile.avatar ?? 0) % 4 + 4) % 4));
    const url=avatarUrl(profile.avatarUrl);if(!url)return fallback;
    if (!this.remoteAvatars.has(url) && !this.avatarLoads.has(url)) {
      void this.loadAvatar(url).then(frame => { if (frame && this.isValid) this.render(); });
    }
    return this.remoteAvatars.get(url) ?? fallback;
  }
  private loadAvatar(url: string): Promise<SpriteFrame | null> {
    const cached = this.remoteAvatars.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = this.avatarLoads.get(url);
    if (pending) return pending;
    const image = new Promise<ImageAsset>((resolve, reject) => {
      const platform = wechat();
      if (platform?.createImage) {
        const portrait = platform.createImage();
        const timeout = setTimeout(() => reject(Error('头像加载超时')), 12000);
        portrait.onload = () => {
          clearTimeout(timeout);
          try {
            // Native WeChat images need the same pixel format Cocos assigns in its image importer.
            portrait.format = Texture2D.PixelFormat.RGBA8888;
            resolve(new ImageAsset(portrait));
          } catch (error) { reject(error); }
        };
        portrait.onerror = () => { clearTimeout(timeout); reject(Error('头像加载失败')); };
        portrait.src = url;
      } else {
        assetManager.loadRemote<ImageAsset>(url, { ext: '.png' }, (error, asset) => error ? reject(error) : resolve(asset));
      }
    });
    const load = image.then(asset => {
      if (!this.isValid || !asset.width || !asset.height) return null;
      const texture = new Texture2D();
      texture.image = asset;
      const frame = new SpriteFrame();
      frame.texture = texture;
      return frame;
    }).catch(() => null).then(frame => {
      this.avatarLoads.delete(url);
      this.remoteAvatars.set(url, frame);
      return frame;
    });
    this.avatarLoads.set(url, load);
    return load;
  }
  /** Reuse the same circular identity in the opponent seat and transient feedback. */
  private playerPortrait(parent: Node, profile: { avatar: number; avatarUrl?: string }, x: number, y: number, size: number, showRim = true) {
    const clip = this.n('PlayerPortrait',375,667,size,size,parent);clip.setPosition(x,y);
    clip.addComponent(Mask).type = Mask.Type.GRAPHICS_ELLIPSE;
    const face = this.n('PlayerPortraitImage',375,667,size,size,clip);face.setPosition(0,0);
    const sprite = face.addComponent(Sprite);sprite.spriteFrame = this.avatarFrame(profile) ?? null;sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    face.getComponent(UITransform)!.setContentSize(size,size);
    if(!showRim)return;
    const rim = this.n('PlayerPortraitRim',375,667,size*1.1,size*1.1,parent);rim.setPosition(x,y);
    const frame = rim.addComponent(Sprite);frame.spriteFrame=this.profileArt.get('portrait-frame')??null;frame.sizeMode=Sprite.SizeMode.CUSTOM;
    rim.getComponent(UITransform)!.setContentSize(size*1.1,size*1.1);
  }
  private async authorizeProfile() {
    if(this.busy||this.profileMotion)return;
    if(!wechat()){this.toast('请在微信中获取头像昵称，本地可手动设置资料');return;}
    this.pendingProfileAvatar = undefined;
    this.finishNicknameEditing();
    const node=this.wechatProfileNode;if(!node)return;
    const rect=node.getComponent(UITransform)!.getBoundingBoxToWorld();
    const window=wechat().getWindowInfo?.()??wechat().getSystemInfoSync();
    const visible=view.getVisibleSize();
    try { await this.wxFlow.authorize({left:rect.x/visible.width*window.windowWidth,top:(visible.height-rect.y-rect.height)/visible.height*window.windowHeight,width:rect.width/visible.width*window.windowWidth,height:rect.height/visible.height*window.windowHeight},(profile,message)=>{
      if(!this.isValid||this.page!=='profile')return;
      if(profile){
        // Show the returned name immediately, including an overlong draft the player can edit.
        if (profile.name) {
          this.nickname = profile.name;
          if (this.nicknameEditBox?.isValid) this.nicknameEditBox.string = profile.name;
        }
        const issue = profile.name ? nicknameError(profile.name) : '微信未返回真实昵称，可手动填写';
        if (!profile.avatarUrl) {
          this.toast(issue ?? '微信昵称已填入，点击保存修改后生效');
          return;
        }
        const request = { url: profile.avatarUrl };
        this.pendingProfileAvatar = request;
        this.toast('正在加载微信头像…');
        void this.loadAvatar(request.url).then(frame => {
          if (!this.isValid || this.pendingProfileAvatar !== request) return;
          this.pendingProfileAvatar = undefined;
          if (this.page !== 'profile' || this.profileMotion === 'out' || this.net.state?.room) return;
          if (!frame) {
            this.toast('微信头像加载失败，可重新获取或选择下方头像');
            return;
          }
          this.draftAvatarUrl = request.url;
          this.toast(issue ?? '微信资料已填入，点击保存修改后生效');
        });
      }else this.toast(message!);
    }); }catch(e){this.toast((e as Error).message);}
  }
  private consumeInvitation() {
    const invite=this.pendingInvitation,s=this.net.state;
    if(!invite||!s||!this.net.online||this.joiningInvitation)return;
    if (s.wechatSharingEnabled !== true) { this.pendingInvitation = undefined; this.wxFlow.allowInvitationAgain(); return; }
    if(s.room?.id===invite.roomId){this.pendingInvitation=undefined;return;}
    if(s.room||s.queuedAt!==null){this.pendingInvitation=undefined;this.wxFlow.allowInvitationAgain();this.toast('已收到好友邀请，请先结束当前对局或匹配，再打开邀请');return;}
    this.pendingInvitation=undefined;this.joiningInvitation=true;
    this.net.command('join',{code:invite.code,inviteRoomId:invite.roomId}).catch(error=>{
      this.wxFlow.allowInvitationAgain();this.page='join';this.code=invite.code;this.toast((error as Error).message);
    }).finally(()=>{this.joiningInvitation=false;});
  }
  private async copyRoomCode(code: string) {try{await copy(code);this.toast('口令已复制：'+code);}catch(e){this.toast((e as Error).message);}}
  private openProfile() {
    const me = this.net.state?.me; if (!me || this.profileMotion) return;
    this.pendingProfileAvatar = undefined;
    this.nickname = me.name; this.avatar = ((me.avatar % 4) + 4) % 4; this.draftAvatarUrl=me.avatarUrl??''; this.page = 'profile'; this.profileMotionFrom = undefined; this.profileMotionTo = undefined;
    this.profileMotion = read('motion', '1') === '1' ? 'in' : '';
    this.profileMotionElapsed = 0; this.profileMotionFrames = 0; this.render();
  }
  private closeProfile() {
    if (this.busy || this.profileMotion) return;
    this.pendingProfileAvatar = undefined;
    this.finishNicknameEditing();
    if (read('motion', '1') !== '1') { this.page = 'lobby'; this.render(); return; }
    this.profileMotion = 'out'; this.profileMotionElapsed = 0; this.profileMotionFrames = 0;
    this.profileMotionFrom = undefined; this.profileMotionTo = undefined; this.render();
  }
  private async saveProfile() {
    if (this.busy || this.profileMotion) return;
    this.finishNicknameEditing();
    if (this.pendingProfileAvatar) { this.toast('微信头像加载中，请稍后保存'); return; }
    const name = this.nickname.trim();
    const issue = nicknameError(name);
    if (issue) { this.toast(issue); return; }
    this.busy = true; this.render();
    try {
      await this.net.command('profile', { name, avatar: this.avatar, avatarUrl: this.draftAvatarUrl });
      write('profile-choice-'+this.net.state!.me.id,'1');this.busy = false; this.closeProfile();
    } catch (error) { this.busy = false; this.toast((error as Error).message); }
  }
  private profileSprite(name: string, x: number, y: number, w: number, h: number, override?: SpriteFrame) {
    const frame = override??this.profileArt.get(name); if (!frame) return null;
    const n = this.n('Profile-' + name, x, y, w, h);
    let target=n;
    if(override){n.addComponent(Mask).type=Mask.Type.GRAPHICS_ELLIPSE;target=this.n('WechatAvatar',375,667,w,h,n);target.setPosition(0,0);}
    const sp = target.addComponent(Sprite); sp.spriteFrame = frame; sp.sizeMode = Sprite.SizeMode.CUSTOM;
    target.getComponent(UITransform)!.setContentSize(w, h); return n;
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
    this.bindPressEffect(n);
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
      this.nicknameEditingBegan = false;
      const refs = renderProfileSheet({
        nickname: this.nickname,
        avatar: this.avatar,
        draftAvatarUrl: this.draftAvatarUrl,
        stats: this.loadCareerStats(),
        busy: this.busy,
        inMotion: !!this.profileMotion,
        inkColor: C.ink,
        creamColor: C.cream,
        blueColor: C.blue,
        hasAvatarArt: i => this.profileArt.has('avatar-' + i),
        avatarOverride: this.avatarFrame({ avatarUrl: this.draftAvatarUrl, avatar: this.avatar }),
        createNode: (name, x, y, w, h) => this.n(name, x, y, w, h),
        createBox: (x, y, w, h, color, radius) => this.box(x, y, w, h, color, radius),
        createText: (val, x, y, sz, col, w, h) => this.text(val, x, y, sz, col, w, h),
        profileSprite: (name, x, y, w, h, ov) => this.profileSprite(name, x, y, w, h, ov),
        profileButton: (art, lbl, x, y, w, h, fn) => this.profileButton(art, lbl, x, y, w, h, fn),
        onClose: () => this.closeProfile(),
        onCycleAvatar: () => { this.pendingProfileAvatar = undefined; this.draftAvatarUrl = ''; this.avatar = (this.avatar + 1) % 4; this.render(); },
        onSelectAvatar: i => { this.finishNicknameEditing(); this.audio.play('tap'); this.pendingProfileAvatar = undefined; this.draftAvatarUrl = ''; this.avatar = i; this.render(); },
        onAuthorizeWechat: () => { void this.authorizeProfile(); },
        onOpenPrivacy: () => { try { this.wxFlow.openPrivacy(); } catch (e) { this.toast((e as Error).message); } },
        onSave: () => { void this.saveProfile(); },
        onBeginEdit: () => this.nicknameSession.begin(),
        onCancelEdit: edit => { if (!this.nicknameEditingBegan) this.nicknameEditingEnded(edit); },
        onDidBeginEdit: () => { this.nicknameEditingBegan = true; this.nicknameSession.begin(); },
        onTextChanged: value => { this.nickname = value; },
        onDidEndEdit: edit => this.nicknameEditingEnded(edit),
      });
      this.profilePaper = refs.paper;
      this.profileBack = refs.back;
      this.nicknameEditBox = refs.editBox;
      this.wechatProfileNode = refs.wechatNode;
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
    this.profilePaper?.reveal(exiting ? 1 - eased : eased);
    sheet.angle = from.angle + (to.angle - from.angle) * eased;
    sheet.setScale(this.profileFit * pose.bodyScale, this.profileFit * pose.bodyScale, 1);
    const paperProgress = exiting ? 1 - eased : eased;
    sheet.getComponent(UIOpacity)!.opacity = Math.round(255 * pose.bodyOpacity * Math.min(1, paperProgress / .35));
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
    this.audio?.update(dt);
    const motion = read('motion', '1') === '1';
    const urgency = countdownUrgency(this.net.state?.room ?? undefined, this.net.state?.me.id, this.net.now());
    this.timerEffects?.pulse(urgency);
    if (motion) {
      const t = game.totalTime / 1000;
      if (this.opponentPulseRing?.isValid) this.opponentPulseRing.opacity = Math.round(95 + 125 * (0.5 + 0.5 * Math.sin(t * 3.4)));
      if (this.opponentBacksNode?.isValid && this.opponentPulseRing?.isValid) {
        const s = 1 + 0.015 * Math.sin(t * 2.8);
        this.opponentBacksNode.setScale(s, s, 1);
      }
      if (this.replyAura?.isValid) this.replyAura.opacity = Math.round(95 + 150 * (0.5 + 0.5 * Math.sin(t * 6.5)));
      if (this.reconnectDot?.isValid) this.reconnectDot.opacity = Math.round(110 + 145 * (0.5 + 0.5 * Math.sin(t * 4.5)));
      if (this.timerLabel?.isValid && urgency > 0) {
        const beat = 1 + 0.075 * urgency * (0.5 + 0.5 * Math.sin(t * 8));
        this.timerLabel.node.setScale(beat, beat, 1);
      } else if (this.timerLabel?.isValid && this.timerLabel.node.scale.x !== 1) {
        this.timerLabel.node.setScale(1, 1, 1);
      }
    }
    if (this.matchingMotion) {
      if (read('motion', '1') !== '1') this.finishMatchingMotion();
      else if (++this.matchingMotionFrames > 2) {
        this.matchingMotionElapsed += Math.min(Math.max(dt, 0), .05);
        this.applyMatchingMotion();
        if (matchingTransition(this.matchingMotionElapsed).complete) this.finishMatchingMotion();
      }
    }
    const reelStops=this.lobbyShuffle.advance(dt,read('motion','1')==='1');
    if(reelStops.length && !this.overlay && this.net.online)this.audio.play('tap');
    this.applyLobbyShuffle();
    this.roundRoll.advance(dt,read('motion','1')==='1');this.applyRoundRoll();
    this.scenery?.update(dt);
    this.learning.update(this.net.now());
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
    this.confirmAction = action;
    if (this.digitCount() !== 4 && (kind === 'lock' || kind === 'repeat')) {
      this.overlay='';this.learning.openConfirmation(kind,this.draft,this.acceptModal,this.closeModal);
    } else this.overlay = 'confirm';
    this.render();
  }
  private closeModal = () => { this.learning.close(); this.overlay = ''; this.confirmation = undefined; this.confirmAction = undefined; this.render(); };
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
  private createFriendRoom() {
    const state = this.net.state;
    if (!state || !this.net.online || this.busy) return;
    if (!this.code) { this.selectMode('friend'); return; }
    if (!/^\d{4}$/.test(this.code)) { this.toast('请输入完整的四位房间口令'); return; }
    const digitCount = rememberedDigitCount(read(modePreferenceKey(state.me.id, 'friend'), ''));
    void this.act('createOrJoin', { code: this.code, digitCount });
  }
  private selectMode(mode: MatchMode) {
    const state=this.net.state;if(!state||!this.net.online||this.busy)return;
    const key=modePreferenceKey(state.me.id,mode);
    this.overlay='';
    this.learning.openMode(mode,rememberedDigitCount(read(key,'')),size=>{
      if(this.busy||!this.net.online)return;
      // Legacy services ignore digitCount and silently create four-digit rooms.
      if(size!==4&&!this.net.state?.supportedDigitCounts?.includes(size)) {
        this.toast('当前服务尚未支持该位数，请稍后重试');return;
      }
      write(key,String(size));this.learning.close();
      void this.act(mode==='public'?'queue':'create',{digitCount:size});
    });
    this.render();
  }
  private openLearning(page: 'menu' | 'rules' | 'clues' | 'daily') {
    this.overlay = ''; this.learning.open(page); this.render();
  }
  private copyGuess(digits: string, message?: string) {
    const state = this.net.state, room = state?.room;
    if (!room || !state || !this.net.online || this.busy || !['playing','reply'].includes(room.phase) || room.current !== state.me.id || this.net.now() < room.startAt || this.net.now() >= room.deadline) {
      this.toast('轮到你时可填入或修改猜测'); return;
    }
    const previous = this.draft;
    this.draft = digits; this.selected = -1;
    this.audio.play('tap'); vibrate('light');
    const inline = !this.learning.visible && !this.overlay && this.playDigits.length >= digits.length && this.playDigits.every(l => l.isValid);
    if (inline) {
      this.syncPlayInput(previous, digits, true);
      this.toast(message ?? '已填入记录，点数字槽可单改一位');
      return;
    }
    this.learning.close(); this.overlay = '';
    if (message) this.setNotice(message);
    this.render();
    if (this.playDigits.length >= digits.length && digits.length > 0) this.syncPlayInput('', digits, true);
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
        this.bindPressEffect(n, () => this.modals.interactive);
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
      // The music-note artwork is baked into settings-body; overlay only its hit target.
      const credits = place(this.n('MusicCredits', 375, 667, 140, 140, group), 233, 584);
      credits.on(Node.EventType.TOUCH_END, () => {
        if (!this.modals.interactive) return;
        const content = 'Local Forecast - Elevator\nSneaky Snitch\n作者：Kevin MacLeod (incompetech.com)\n许可：Creative Commons Attribution 4.0\nhttps://creativecommons.org/licenses/by/4.0/\n来源：https://incompetech.com/music/royalty-free/\n已截取、循环交叉淡化、响度调整并转为单声道。';
        if (wechat()) wechat().showModal({ title: '音乐署名与授权', content, showCancel: false, confirmText: '知道了' });
        else globalThis.alert(content);
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
          this.addCardDigit(group, this.confirmation?.digits[i] ?? '—', x - 470.5, -(key === 'lock' ? 822 : 794), 132, 'ink');
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
      if (live) {
        art('live-latest', () => scroll.scrollToBottom(.2));
        art('tab-off', () => this.openLearning('clues'), [144, 1243, 590, 1307]);
        label('我的推理提示 / 逐位排除',367,1275,25,425,55);
      }
    }
    this.modals.attach(group, scale);
  }
  private updateTimer = () => {
    const s = this.net.state, r = s?.room, now = this.net.now();
    this.audio.setDucked(!!(r && s && ['playing', 'reply'].includes(r.phase)
      && r.current === s.me.id && now >= r.startAt && r.deadline - now <= 5000 && r.deadline > now));
    if (r && r.phase === 'playing' && !this.openingRendered && now >= r.startAt) { this.openingRendered = true; this.render(); return; }
    if (this.timerLabel && s) {
      if (s.queuedAt !== null) { const seconds = Math.floor((now - s.queuedAt) / 1000); this.timerLabel.string = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
      else if (r) {
        const remaining = Math.max(0, Math.ceil((r.deadline - now) / 1000));
        if (r.phase === 'waiting') this.timerLabel.string = `${this.friendArtReady ? '' : '房间有效期  '}${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
        else if (r.phase === 'preparing') this.timerLabel.string = this.battleArtReady ? String(remaining) : `准备倒计时 ${remaining}s`;
        else if (now < r.startAt) this.timerLabel.string = `即将开局 ${Math.ceil((r.startAt - now) / 1000)}s`;
        else {
          const dots = '.'.repeat((Math.floor(now / 500) % 3) + 1);
          this.timerLabel.string = r.phase === 'reply'
            ? (r.current === s.me.id ? `最后补猜！ ${remaining}s` : `对手补猜中${dots} ${remaining}s`)
            : (r.current === s.me.id ? `轮到你了  ${remaining}s` : `对手思考中${dots} ${remaining}s`);
        }
        if (['playing', 'reply'].includes(r.phase) && remaining <= 5 && r.current === s.me.id && this.warnedTurn !== r.turn) { this.warnedTurn = r.turn; vibrate('medium'); this.audio.play('warning'); }
      }
    }
    if (this.reconnectText?.isValid) {
      const dots = '.'.repeat((Math.floor(now / 450) % 3) + 1);
      this.reconnectText.string = this.reconnecting ? `正在重新连接${dots}` : `网络波动，自动重连中${dots}`;
    }
    if (this.toastLabel && Date.now() >= this.noticeUntil) this.dismissNotice(true);
  };
}
