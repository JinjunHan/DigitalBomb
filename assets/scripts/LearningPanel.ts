import { BlockInputEvents, Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UIOpacity, UITransform, resources, Texture2D } from 'cc';
import { clueCaption, compareClues, composeQuickDraft, consistentCandidate, deduce, STANDARD_ROUNDS, STANDARD_TURN_MS, type Clue, type DigitCount } from './shared/deduction';
import { formatMatchDuration } from './shared/battle-feedback';
import type { DailyProgress } from './shared/daily-challenge';
import type { LeaderboardSnapshot, ServerDailySnapshot } from './shared/leaderboard';
import { Practice, Tutorial } from './shared/learning';
import type { RoomView } from './shared/protocol';
import { modeLabel, type MatchMode } from './shared/game-mode';

const LEARNING_ART = ["paper", "back", "title-online", "title-friend", "title-hub", "title-tutorial", "mode-2", "mode-3", "mode-4", "check", "match", "create", "start", "practice-2", "practice-3", "practice-4", "rules", "home", "hint", "key-1", "key-2", "key-3", "key-4", "key-5", "key-6", "key-7", "key-8", "key-9", "key-0", "key-delete", "key-submit", "tab-positions", "tab-positions-off", "tab-history", "tab-history-off", "baseline", "copy", "return", "card", "answer", "panel", "banner", "subtitle", "btn-primary", "btn-secondary", "btn-emerald"];

interface Context {
  parent: Node; height: number; top: number; bottom: number;
  paper?: SpriteFrame; button?: SpriteFrame; card?: SpriteFrame;
  cardDigits?: Record<'ink' | 'crimson', Map<string, SpriteFrame>>;
  room?: RoomView | null; me: string; now: number;
  dailyProgress?: DailyProgress;
  dailyServer?: ServerDailySnapshot;
  dailyLoading?: boolean;
  dailySubmitting?: boolean;
  dailyStreak?: number;
  leaderboard?: LeaderboardSnapshot;
  leaderboardLoading?: boolean;
  onDailySubmit?: (digits: string) => Promise<{ error?: string }> | { error?: string };
  onDailyShare?: () => void;
  onOpenLeaderboard?: () => void;
  onRefreshLeaderboard?: () => void;
  onOpenDaily?: () => void;
  redraw: () => void; copy: (digits: string, message?: string) => void; completed: () => void;
}
type Page = 'menu' | 'rules' | 'tutorial' | 'practice' | 'daily' | 'leaderboard' | 'clues' | 'mode' | 'confirmation';
/** Local teaching and practice never send guesses to the multiplayer service. */
export class LearningPanel {
  visible = false;
  private page: Page = 'menu';
  private cluesSource: 'room' | 'practice' | 'daily' = 'room';
  private leaderboardTab: 'daily' | 'career' = 'daily';
  private leaderboardPage = 0;
  private tutorial = new Tutorial();
  private practice?: Practice;
  private draft = '';
  private slot = -1;
  private message = '';
  private tab: 'positions' | 'history' = 'positions';
  private recordPage = 0;
  private selected = -1;
  private baseline = -1;
  private cacheKey = '';
  private cache = deduce([]);
  private picks: string[] = [];
  private picksKey = '';
  private clueHint = '';
  private context!: Context;
  private group!: Node;
  private timer?: Label;
  private timerRoom?: RoomView;
  private matchMode: MatchMode = 'public';
  private selectedMode: DigitCount = 4;
  private chooseMode?: (size: DigitCount) => void;
  private confirmation?: { kind: 'lock' | 'repeat'; digits: string; accept: () => void; cancel: () => void };

  openMode(mode: MatchMode, previous: DigitCount, choose: (size: DigitCount) => void) {
    this.visible = true; this.page = 'mode'; this.matchMode = mode; this.selectedMode = previous; this.chooseMode = choose;
  }
  openConfirmation(kind: 'lock' | 'repeat', digits: string, accept: () => void, cancel: () => void) {
    this.visible = true; this.page = 'confirmation'; this.confirmation = { kind, digits, accept, cancel };
  }

  open(page: 'menu' | 'rules' | 'clues' | 'daily' | 'leaderboard' = 'menu') {
    this.visible = true; this.page = page; this.message = '';
    if (page === 'daily') { this.draft = ''; this.slot = -1; this.cluesSource = 'daily'; }
    else if (page === 'clues') { this.cluesSource = 'room'; }
    else if (page === 'leaderboard') { this.leaderboardPage = 0; }
    this.tab = 'positions'; this.selected = -1; this.baseline = -1; this.recordPage = -1;
  }
  close() { this.visible = false; this.timer = undefined; }
  private refresh() { this.context.redraw(); }
  private go(page: Page) { if (page === 'clues') { this.recordPage = -1; this.selected = -1; } this.page = page; this.message = ''; this.refresh(); }
  private startPractice(size: DigitCount) {
    this.practice = new Practice(size); this.cluesSource = 'practice'; this.draft = ''; this.slot = -1;
    this.selected = -1; this.baseline = -1; this.recordPage = 0; this.go('practice');
  }
  private startTutorial() { this.tutorial = new Tutorial(); this.draft = ''; this.slot = -1; this.go('tutorial'); }
  input(key: string) {
    if (!this.visible || !['tutorial', 'practice', 'daily'].includes(this.page)) return;
    if (this.page === 'tutorial' && this.tutorial.step >= 2) return;
    if (this.page === 'practice' && this.practice?.solved) return;
    const activeDaily = this.context.dailyServer ?? this.context.dailyProgress;
    if (this.page === 'daily' && (activeDaily?.solved || this.context.dailySubmitting)) return;
    const size = this.page === 'practice' ? this.practice!.size : 4;
    this.message = '';
    if (key === 'submit') {
      if (this.page === 'tutorial') {
        this.tutorial.submit(this.draft);
        this.message = this.tutorial.message;
      } else if (this.page === 'daily') {
        const pendingDigits = this.draft;
        const ret = this.context.onDailySubmit?.(pendingDigits);
        if (ret && typeof (ret as Promise<{ error?: string }>).then === 'function') {
          void (ret as Promise<{ error?: string }>).then(res => {
            this.message = res?.error ?? '';
            if (!this.message) { this.draft = ''; this.slot = -1; }
            if (this.visible && this.context.parent?.isValid) this.refresh();
          });
        } else {
          const syncRes = ret as { error?: string } | undefined;
          this.message = syncRes?.error ?? '';
          if (!this.message) { this.draft = ''; this.slot = -1; }
        }
      } else {
        this.message = this.practice!.submit(this.draft) ?? '';
        if (!this.message) { this.draft = ''; this.slot = -1; }
      }
    } else if (key === 'delete') {
      const index = this.slot >= 0 && this.slot < this.draft.length ? this.slot : this.draft.length - 1;
      this.draft = this.draft.slice(0, Math.max(0, index)) + this.draft.slice(index + 1); this.slot = -1;
    }
    else if (/^\d$/.test(key)) {
      if (this.slot >= 0 && this.slot < this.draft.length) {
        this.draft = this.draft.slice(0, this.slot) + key + this.draft.slice(this.slot + 1); this.slot = -1;
      } else if (this.draft.length < size) { this.draft += key; this.slot = -1; }
      else this.message = '数字已填满，点击要修改的卡牌再输入。';
    }
    this.refresh();
  }
  private frames = new Map<string, SpriteFrame>();
  private loading = false;
  private failed = false;
  private get ready() { return this.frames.size === LEARNING_ART.length; }
  private loadArt() {
    if (this.loading) return;
    this.loading = true;
    // Publish the whole batch atomically: network redraws never expose half a skin.
    resources.load(LEARNING_ART.map(name => name === 'paper' ? 'art/profile/paper/texture' : 'art/learning-v2/' + name + '/texture'), Texture2D, (error, textures) => {
      if (error) { this.failed = true; this.loading = false; }
      else textures.forEach((texture, i) => { const frame = new SpriteFrame(); frame.texture = texture; const name = LEARNING_ART[i]; if (name === 'paper') { frame.insetLeft=110; frame.insetRight=110; frame.insetTop=160; frame.insetBottom=130; } if (['answer','subtitle','banner','card'].includes(name)) { const x=name==='answer'?52:name==='card'?12:name==='banner'?56:30; const y=name==='answer'?38:name==='card'?12:22; frame.insetLeft=x; frame.insetRight=x; frame.insetTop=y; frame.insetBottom=name==='banner'?24:y; } if (name.startsWith('btn-')) { frame.insetLeft=64; frame.insetRight=64; frame.insetTop=24; frame.insetBottom=26; } this.frames.set(name, frame); });
      if (this.visible && this.context.parent.isValid) this.refresh();
    });
  }
  private node(name: string, x: number, y: number, w: number, h: number, parent = this.group) {
    const node = new Node(name); node.layer = Layers.Enum.UI_2D; parent.addChild(node);
    node.setPosition(x - 470.5, 836 - y); node.addComponent(UITransform).setContentSize(w, h); return node;
  }
  private art(name: string, x: number, y: number, w?: number, h?: number) {
    const frame = this.frames.get(name)!;
    w ??= frame.originalSize.width; h ??= w * frame.originalSize.height / frame.originalSize.width;
    const node = this.node('LearningArt-' + name, x, y, w, h);
    const sprite = node.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (['paper','answer','subtitle','banner','card','btn-primary','btn-secondary','btn-emerald'].includes(name)) sprite.type = Sprite.Type.SLICED;
    node.getComponent(UITransform)!.setContentSize(w, h); return node;
  }
  /** Render a real 9-sliced scalloped brass-beveled tabletop button (never flat Graphics rectangles). */
  private artButton(
    tone: 'primary' | 'secondary' | 'emerald',
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    action: () => void,
    enabled = true,
    fontSize = 27,
  ) {
    const node = this.art('btn-' + tone, x, y, w, h);
    const sp = node.getComponent(Sprite)!;
    if (!enabled) sp.grayscale = true;
    const textColor = !enabled
      ? (tone === 'secondary' ? '#4F4236' : '#F3E9D8')
      : (tone === 'secondary' ? '#3B1E08' : '#FFF6DF');
    const lbl = this.text(label, x, y, Math.max(80, w - 68), Math.max(28, h - 14), fontSize, textColor);
    lbl.isBold = true;
    lbl.node.setParent(node);
    lbl.node.setPosition(0, 3);
    const ctrl = this.touch(node, label, action, enabled);
    if (!enabled) {
      const op = ctrl.getComponent(UIOpacity);
      if (op) op.opacity = 165;
    }
    return ctrl;
  }
  private text(value: string, x: number, y: number, w = 700, h = 70, size = 34, color = '#3D1D08') {
    const node = this.node('Learning-' + value.slice(0, 24), x, y, w, h);
    const label = node.addComponent(Label); label.string = value; label.fontSize = size; label.lineHeight = size * 1.3;
    label.color = new Color(color); label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK; label.fontFamily = 'Helvetica Neue, Roboto, Arial, Songti SC, Noto Serif CJK SC, serif'; return label;
  }
  private touch(node: Node, name: string, action: () => void, enabled = true) {
    node.name = 'LearningControl-' + name;
    if (!enabled) node.addComponent(UIOpacity).opacity = 115;
    else {
      node.on(Node.EventType.TOUCH_START, () => node.setScale(.98,.98,1));
      node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1,1,1));
      node.on(Node.EventType.TOUCH_END, () => { node.setScale(1,1,1); action(); });
    }
    return node;
  }
  private fixed(asset: string, name: string, x: number, y: number, w: number, action: () => void, enabled = true) {
    return this.touch(this.art(asset,x,y,w), name, action, enabled);
  }
  private button(value: string, x: number, y: number, w: number, action: () => void, enabled = true, h = 95) {
    // Blank reconstructed answer artwork; 9-slicing preserves corners at variable text widths.
    const node = this.art('answer', x,y,w,h); const sprite = node.getComponent(Sprite)!;
    sprite.type = Sprite.Type.SLICED;
    const caption = this.text(value,x,y,w-30,h-16,/^[0-9]$/.test(value)?76:32,enabled ? '#3D1D08' : '#877C6C');
    caption.node.setParent(node); caption.node.setPosition(0,0);
    return this.touch(node,value,action,enabled);
  }
  private back() {
    if (this.page === 'confirmation') this.confirmation?.cancel();
    else if (this.page === 'mode' || this.page === 'daily' || this.page === 'leaderboard') { this.close(); this.refresh(); }
    else if (this.page === 'clues' && this.cluesSource === 'daily' && !this.context.room) this.go('daily');
    else if (this.page === 'clues' && this.practice && !this.context.room) this.go('practice');
    else if (this.page !== 'menu' && !this.context.room) this.go('menu');
    else { this.close(); this.refresh(); }
  }
  render(context: Context) {
    this.context = context; this.timer = undefined; this.timerRoom = context.room ?? undefined;
    const blocker = new Node('LearningBlocker'); blocker.layer = Layers.Enum.UI_2D; context.parent.addChild(blocker);
    blocker.addComponent(UITransform).setContentSize(750,context.height); blocker.addComponent(BlockInputEvents);
    const shade = blocker.addComponent(Graphics); shade.fillColor = new Color(17,44,41,55);
    shade.rect(-375,-context.height/2,750,context.height); shade.fill();
    this.group = new Node('LearningPanel'); this.group.layer = Layers.Enum.UI_2D; blocker.addChild(this.group);
    this.group.addComponent(UITransform).setContentSize(941,1672);
    // Fit the controls to the safe area; the persistent 2.5D scene stays outside this group.
    const scale = Math.min(750/941,(context.height-context.top-context.bottom-8)/1506);
    this.group.setScale(scale,scale,1);
    this.group.setPosition(0,context.height/2-context.top-(836-64)*scale);
    if (!this.ready) {
      this.text(this.failed ? '素材加载失败，点击重试' : '正在打开笔记…',470,760,700,100,38,'#F8DFAC');
      const retry = this.node('LearningRetry',470,760,700,110);
      retry.on(Node.EventType.TOUCH_END, () => { this.failed=false; this.loadArt(); });
      const back=this.text('返回',470,1000,300,100,38,'#F8DFAC');back.node.on(Node.EventType.TOUCH_END,()=>this.back());
      if (!this.failed) this.loadArt(); return;
    }
    this.art('paper',470.5,885,910,1450);
    this.fixed('back','返回',88,114,99,()=>this.back());
    if (this.page === 'mode') this.modeSelection();
    else if (this.page === 'confirmation') this.confirm();
    else if (this.page === 'menu') this.menu();
    else if (this.page === 'rules') this.rules();
    else if (this.page === 'tutorial') this.teach();
    else if (this.page === 'practice') this.training();
    else if (this.page === 'daily') this.daily();
    else if (this.page === 'leaderboard') this.leaderboard();
    else this.clues();
    if (context.room && ['playing','reply','preparing'].includes(context.room.phase)) {
      this.art('banner',470,1365,710,76);
      this.timer = this.text('',470,1362,650,58,27,'#FFE5A9'); this.update(context.now);
    }
  }
  private heading(value: string, subtitle: string, asset?: string) {
    if (asset) this.art('title-'+asset,474.5,asset==='friend'?285:276,513,asset==='friend'?90:108);
    else { this.art('banner',470,275,650,115); this.text(value,470,275,600,100,54,'#FFE5A9'); }
    this.text(subtitle,470,358,650,55,29);
  }
  private modeSelection() {
    const friend=this.matchMode==='friend';
    this.heading('',friend?'创建房间 · 选择位数':'选择密码位数',friend?'friend':'online');
    for (const [i,size] of ([2,3,4] as const).entries()) {
      const y=520+i*225;
      this.fixed('mode-'+size,`${modeLabel(size)} · ${10**size} 种组合`,470,y,724,()=>{this.selectedMode=size;this.refresh();});
      if(this.selectedMode===size) this.art('check',779,y,64);
    }
    this.text(`已选 ${modeLabel(this.selectedMode)} · 确认后记住`,470,1120,720,60,33);
    this.art('banner',470,1220,720,90);
    this.text(friend?'好友加入后使用相同规则':'每回合 60 秒  |  最多 30 轮',470,1217,650,65,33,'#FFE5A9');
    this.fixed(friend?'create':'match',friend?'创建房间':'开始匹配',470,1380,595,()=>this.chooseMode?.(this.selectedMode));
    this.text(friend?'房间口令仍为四位':'仅匹配相同位数的对手',470,1498,700,60,29);
  }
  private confirm() {
    const pending=this.confirmation!;
    this.heading(pending.kind==='lock'?'确认锁定底牌':'确认重复猜测',`本局 ${pending.digits.length} 位密码`);
    this.trapezoidPanel(470.5, 760, 420, 22, new Color(148, 92, 28, 22), new Color(182, 134, 66, 165), 1.8);
    this.cards(pending.digits,470,690,140);
    this.text(pending.kind==='lock'?'锁定后本局不可修改。':'这组数字已经猜过，仍会消耗一次机会。',470,895,620,100,34,'#4A2A10');
    this.artButton('secondary', '取消', 292, 1180, 290, 96, pending.cancel, true, 32);
    this.artButton('primary', '确认', 648, 1180, 290, 96, pending.accept, true, 32);
  }
  update(now: number) {
    if (!this.timer?.isValid || !this.timerRoom) return;
    const room=this.timerRoom, seconds=Math.max(0,Math.ceil((room.deadline-now)/1000));
    const who=room.phase==='preparing'?'准备':room.current===this.context.me?'你的回合':'对手回合';
    this.timer.string=`${who} ${seconds}s · 查看提示不暂停计时`;
  }
  private menu() {
    this.heading('','先学会推理，再与对手较量','hub');
    this.trapezoidPanel(470.5, 678, 494, 22, new Color(148, 92, 28, 22), new Color(184, 134, 64, 165), 1.8);
    const exTitle = this.text('只改一位，比较命中变化',470,480,610,60,34,'#3D200A');
    exTitle.isBold = true;
    for (const [i,digits] of ['1234','9234'].entries()) {
      const y = 612 + i * 144;
      this.trapezoidPanel(470.5, y, 124, 38, new Color(116, 70, 26, 18), new Color(172, 128, 70, 130), 1.4);
      Array.from(digits).forEach((digit,j)=>{
        const cx = 236 + j * 94;
        const card = this.art('card', cx, y, 76, 104);
        if (j === 0) card.getComponent(Sprite)!.color = new Color('#FFE18B');
        const artFrame = this.context.cardDigits?.[j === 0 ? 'crimson' : 'ink'].get(digit);
        if (artFrame) {
          const dn = new Node('MenuDigit-' + digit);
          dn.layer = Layers.Enum.UI_2D; card.addChild(dn); dn.setPosition(0, 0);
          const sp = dn.addComponent(Sprite); sp.spriteFrame = artFrame; sp.sizeMode = Sprite.SizeMode.CUSTOM;
          dn.getComponent(UITransform)!.setContentSize(56, 70);
        } else {
          this.text(digit, cx, y, 70, 96, 62, j === 0 ? '#9F3415' : '#321502');
        }
      });
      this.boxPanel(670, y, 160, 56, i === 0 ? new Color('#B95A18') : new Color(44, 26, 15, 232), new Color('#DFB362'), 28, 1.8);
      const hitLbl = this.text(`命中 ${2-i} 位`, 670, y - 2, 148, 46, 28, '#FFF2D2');
      hitLbl.isBold = true;
    }
    this.text('第一位改变，其他位相同 → 确认第一位是 1',470,874,620,52,26,'#5D3B18');
    this.fixed('start','互动教学 · 学会第一步推理',472,1022,526,()=>this.startTutorial());
    this.art('banner',470,1152,500,82);
    this.text('自由练习',470,1150,440,62,38,'#FFE5A9');
    this.text('不限时 · 不计战绩',470,1218,620,38,25,'#6F5030');
    for(const [i,size] of ([2,3,4] as const).entries()) this.fixed('practice-'+size,`${size} 位 · ${['入门','进阶','标准'][i]}`,225+i*249,1352,235,()=>this.startPractice(size));
    this.fixed('rules','查看正式对战规则',295,1508,308,()=>this.go('rules'));
    this.fixed('home','先去大厅',648,1508,308,()=>{this.close();this.refresh();});
  }
  private rules() {
    this.heading('对战规则','公平较量 · 逐步推理');
    const room=this.context.room;
    const sections: [number, number, string, string][] = [
      [538, 210, room ? `① 各自设置 ${room.digitCount ?? 4} 位密码` : '① 选择 2 / 3 / 4 位密码', '每位 0～9，可以重复、可以 0 开头。\n锁定后本局不可修改。'],
      [796, 240, '② 轮流猜测对方密码', '只反馈数字与位置同时正确的数量。\n0 命中仅排除各数字在对应位置，\n不代表这些数字不在密码中。'],
      [1086, 270, '③ 同轮公平补猜与计时', `先手猜中，后手仍可补猜一次；同轮均中平局。\n每回合 ${(room?.turnMs ?? STANDARD_TURN_MS) / 1000} 秒，最多 ${room?.roundLimit ?? STANDARD_ROUNDS} 大轮。\n连续两次己方超时判负，低峰可匹配自动对手。`],
    ];
    for (const [y, h, title, body] of sections) {
      this.trapezoidPanel(470.5, y, h, 22, new Color(118, 72, 26, 20), new Color(176, 130, 68, 155), 1.6);
      const t = this.text(title, 470, y - h / 2 + 44, 620, 48, 32, '#8F2910');
      t.isBold = true;
      this.text(body, 470, y + 20, 640, h - 78, 27, '#462810');
    }
  }
  private cards(digits: string, x: number, y: number, width: number, editable=false, size=digits.length) {
    for(let i=0;i<size;i++) {
      const cx=x+(i-(size-1)/2)*(width+12), selected=editable&&this.slot===i;
      const node=this.art('card',cx,y-(selected?12:0),width);
      if(selected) node.getComponent(Sprite)!.color=new Color('#FFE39A');
      const ch = digits[i] ?? '—';
      const artFrame = this.context.cardDigits?.[selected ? 'crimson' : 'ink'].get(ch);
      if (artFrame) {
        const h = Math.round(node.getComponent(UITransform)!.height * 0.68);
        const dn = new Node('LearningCardDigit-' + ch);
        dn.layer = Layers.Enum.UI_2D; node.addChild(dn); dn.setPosition(0, 0);
        const sp = dn.addComponent(Sprite); sp.spriteFrame = artFrame; sp.sizeMode = Sprite.SizeMode.CUSTOM;
        dn.getComponent(UITransform)!.setContentSize(Math.round(h * (144 / 180)), h);
      } else {
        const digit = this.text(ch,cx,y-(selected?12:0),width-8,width*1.2,width*.75,selected?'#A8401B':'#321502');
        digit.node.setParent(node); digit.node.setPosition(0,0);
      }
      if(editable) this.touch(node,'digit-'+i,()=>{
        const target = Math.min(i, this.draft.length);
        this.slot = this.slot === target ? -1 : target; this.message = ''; this.refresh();
      });
    }
  }
  private keyboard(size: DigitCount, practice=false, busy=false) {
    this.cards(this.draft,practice?374:470,practice?958:820,practice?98:110,true,size);
    for(const [i,key] of ['1','2','3','4','5','6','7','8','9','delete','0','submit'].entries()) {
      const enabled = !busy && (key==='submit'?this.draft.length===size:key==='delete'?this.draft.length>0:true);
      this.fixed('key-'+key,key==='delete'?'删除':key==='submit'?'提交':key,262+(i%3)*208,(practice?1148:1018)+Math.floor(i/3)*98,198,()=>this.input(key),enabled);
    }
  }
  private teach() {
    const lesson=this.tutorial;
    this.heading('',`第 ${Math.min(4,lesson.step+1)} 步 / 4`,'tutorial');
    if(lesson.step<2) {
      this.text(lesson.step===0?'先输入 1234，看看命中了几位。':'1234 命中 2 位。\n点击第一张牌改为 9，其余保持不变。',470,540,700,180,40);
      this.keyboard(4);
      this.text(this.message||'教学不计时，可以放心尝试。',470,1450,700,95,31);
    } else if(lesson.step===2) {
      this.art('panel',471,715,722,598);
      this.text('只改一位，看命中变化',470,485,650,95,48);
      for(const [i,h] of lesson.history.entries()) {
        // Positions match the blank reconstructed panel's original cards.
        Array.from(h.digits!).forEach((d,j)=>this.text(d,211+j*104,648+i*179,86,110,76,j===0?'#9F3415':'#321502'));
        this.text(`命中 ${h.hits} 位`,695,649+i*179,190,80,36,'#FFE5A9');
      }
      this.text('只改第一位，命中减少 1',470,955,600,60,34);
      this.text('原来的第一位是什么？',470,1080,700,90,48);
      for(const [i,value] of ['1','9','还不能判断'].entries()) this.button(value,225+i*247,1208,230,()=>{lesson.answer(value);this.refresh();},true,148);
      this.text(lesson.message||'比较两次记录，找到线索',470,1340,690,85,33);
      this.text('教学不计时，可以放心尝试',470,1440,700,60,29);
    } else if(lesson.step===3) {
      this.text('第一位的 1 已确认！\n换一个独立例子：1234 → 命中 0 位',470,570,710,180,39);
      this.text('这个结果告诉我们什么？',470,810,700,90,40);
      this.button('密码中没有 1、2、3、4',470,990,690,()=>{lesson.answer('absent');this.refresh();},true,115);
      this.button('这些数字在各自对应位置不正确',470,1140,690,()=>{lesson.answer('position');if(lesson.complete)this.context.completed();this.refresh();},true,115);
      this.text(lesson.message,470,1340,700,150,34);
    } else {
      this.text('你已学会两种推理方法',470,550,710,100,44);
      this.text('只改一位 → 比较两次命中数\n0 位命中 → 排除各自对应的位置\n\n真实对局不会直接标出正确位置，\n可以打开「推理提示」整理已有线索。',470,850,700,350,36);
      this.button('从 2 位练习开始',470,1200,620,()=>this.startPractice(2),true,125);
      this.button('选择其他练习',470,1360,540,()=>this.go('menu'),true,100);
    }
    this.text('跳过教学',470,1510,250,55,28).node.on(Node.EventType.TOUCH_END,()=>this.go('menu'));
  }
  private training() {
    const practice=this.practice!;
    if(practice.solved) {
      this.heading('破解成功',`${practice.size} 位自由练习`);
      this.trapezoidPanel(470.5, 760, 400, 22, new Color(148, 92, 28, 22), new Color(184, 134, 64, 165), 1.8);
      this.cards(practice.history[practice.history.length-1].digits!,470,670,130);
      this.text(`用了 ${practice.history.length} 次猜测\n哪一次猜测帮你排除了最多可能？`,470,875,620,130,34,'#4A2A10');
      this.button('查看推理记录',470,1115,580,()=>{this.tab='history';this.cluesSource='practice';this.go('clues');},true,96);
      this.button('再练一次',470,1245,580,()=>this.startPractice(practice.size),true,96);
      this.button(practice.size<4?`挑战 ${practice.size+1} 位`:'返回练习室',470,1375,580,()=>practice.size<4?this.startPractice((practice.size+1) as DigitCount):this.go('menu'),true,96);return;
    }
    this.art('banner',470,227,610,96);
    this.text(`${practice.size} 位自由练习`,470,225,490,88,50,'#FFE5A9');
    this.text('我的猜测 · 不限时 · 不计战绩',470,324,620,52,28,'#68492A');
    const recent=practice.history.slice(-2);
    if(!recent.length) {
      this.trapezoidPanel(470.5, 526, 200, 22, new Color(116, 70, 26, 16), new Color(172, 128, 70, 135), 1.5);
      this.text('先猜一组数字，收集第一条线索\n每位 0～9 · 可重复 · 可 0 开头',470,526,600,140,31,'#5A3C1E');
    }
    recent.forEach((h,i)=>{
      const y=456+i*138;
      const rowW=this.paperSafeWidth(y,22), rowLeft=470.5-rowW/2, rowRight=470.5+rowW/2;
      const row=this.trapezoidPanel(470.5, y, 120, 22, new Color(116, 70, 26, 18), new Color(172, 128, 70, 140), 1.5);
      const index=practice.history.length-recent.length+i;
      const turnL = this.text(`第 ${index+1} 次`, rowLeft+66, y-1, 114, 60, 27, '#3D210B');
      turnL.isBold = true;
      this.cards(h.digits!,455,y,practice.size===4?60:78);
      this.boxPanel(rowRight-68, y, 92, 46, new Color(44, 26, 15, 232), new Color('#D6A654'), 23, 1.5);
      const hitL = this.text(`${h.hits}/${practice.size}`, rowRight-68, y-2, 82, 40, 27, '#FFF2D2');
      hitL.isBold = true;
      this.touch(row,'reuse-'+index,()=>{
        this.draft=h.digits!; this.slot=-1;
        this.message=`已复用第 ${index+1} 次猜测，点击一张卡牌修改。`; this.refresh();
      });
    });
    if(recent.length)this.text('点击上方记录复用 · 改一位再比较',470,694,620,32,23,'#6E4F30');
    const caption=recent.length>1?compareClues(recent[0],recent[1]):recent.length?clueCaption(recent[0]):'点击卡牌可单独修改一位';
    this.text(this.message||caption,470,750,630,82,28,'#492B11');
    this.keyboard(practice.size,true);
    this.text(this.slot>=0?(this.slot<this.draft.length?`正在修改第 ${this.slot+1} 位 · 点击键盘替换`:`接着填写第 ${this.slot+1} 位 · 点击键盘输入`):`已输入 ${this.draft.length}/${practice.size} 位 · 点击卡牌可修改`,470,1046,660,38,25,'#6B4D2E');
    this.fixed('hint',`推理提示 · ${practice.history.length} 条记录`,716,962,188,()=>{this.cluesSource='practice';this.go('clues');});
  }
  private daily() {
    const server = this.context.dailyServer;
    const progress = server ?? this.context.dailyProgress;
    if (!progress) {
      this.art('banner', 470, 224, 590, 92);
      const title = this.text('每日一题', 470, 222, 480, 76, 46, '#FFE5A9'); title.isBold = true;
      this.trapezoidPanel(470.5, 620, 220, 22, new Color(116, 70, 26, 18), new Color(172, 128, 70, 140), 1.5);
      this.text(this.context.dailyLoading ? '正在从服务器获取今日暗号…' : '暂未连接到服务器，请稍后重试', 470, 620, 580, 90, 30, '#5A3C1E');
      return;
    }
    const streak = server?.dailyStreak ?? this.context.dailyStreak ?? 0;
    const solverCount = server?.solverCount ?? 0;
    this.art('banner', 470, 224, 590, 92);
    const title = this.text('每日一题', 470, 222, 480, 76, 46, '#FFE5A9');
    title.isBold = true;
    const subParts = [`${progress.dateKey} · 全服同题`];
    if (solverCount > 0) subParts.push(`今日已有 ${solverCount} 人破译`);
    else if (streak > 0) subParts.push(`已连卡 ${streak} 天`);
    else subParts.push('服务器实时验证');
    this.text(subParts.join(' · '), 470, 316, 620, 44, 24, '#68492A');

    if (progress.solved) {
      const answer = server?.answer ?? progress.history[progress.history.length - 1]?.digits ?? '0000';
      const dur = formatMatchDuration(progress.startedAt, progress.endedAt);
      this.trapezoidPanel(470.5, 578, 294, 22, new Color(56, 124, 68, 22), new Color(76, 152, 92, 165), 1.8);
      const okLbl = this.text('今日暗号已破译！', 470, 468, 560, 48, 34, '#1B6631');
      okLbl.isBold = true;
      this.cards(answer, 470, 586, 112);
      const statsLine = `共 ${progress.history.length} 步${dur ? ` · 用时 ${dur}` : ''}${streak > 1 ? ` · 连卡 ${streak} 天` : ''}`;
      this.text(statsLine, 470, 676, 610, 34, 24, '#3F230C');
      if (server?.rank !== undefined) {
        const rankText = server.solverCount > 1 && server.beatPercent !== undefined
          ? `今日第 ${server.rank} 名 · 击败 ${server.beatPercent}% 破译者`
          : `今日第 ${server.rank} 名 · 抢先登顶`;
        const rl = this.text(rankText, 470, 708, 600, 32, 22, '#1F6B35');
        rl.isBold = true;
      }

      // Visual spoiler-free inference trail
      const shown = progress.history.slice(-6);
      this.trapezoidPanel(470.5, 902, 268, 22, new Color(118, 72, 26, 18), new Color(176, 130, 68, 150), 1.5);
      const trailHdr = this.text('本次破译轨迹（分享不泄露答案）', 470, 798, 580, 34, 22, '#6E4E2E');
      trailHdr.isBold = true;
      shown.forEach((h, idx) => {
        const y = 840 + idx * 34;
        const hits = Math.max(0, Math.min(4, h.hits ?? 0));
        const stepNo = progress.history.length - shown.length + idx + 1;
        this.text(`第 ${stepNo} 步   ${'■'.repeat(hits)}${'□'.repeat(4 - hits)}   ${hits}/4`, 470, y, 560, 32, 24, hits === 4 ? '#1E7037' : '#4B2E14');
      });

      this.artButton('primary', '分享今日战绩', 316, 1142, 292, 88, () => this.context.onDailyShare?.(), true, 27);
      this.artButton('emerald', '查看今日排行', 624, 1142, 292, 88, () => { this.leaderboardTab = 'daily'; this.context.onOpenLeaderboard?.(); }, true, 27);
      this.artButton('secondary', '查看推理笔记', 316, 1264, 292, 82, () => { this.tab = 'history'; this.cluesSource = 'daily'; this.go('clues'); }, true, 25);
      this.artButton('secondary', '返回大厅', 624, 1264, 292, 82, () => { this.close(); this.refresh(); }, true, 25);
      return;
    }

    const recent = progress.history.slice(-2);
    if (!recent.length) {
      this.trapezoidPanel(470.5, 526, 200, 22, new Color(116, 70, 26, 16), new Color(172, 128, 70, 135), 1.5);
      this.text('每天 0 点服务器刷新一道 4 位暗号\n答案仅存服务端 · 猜中后登上今日排行', 470, 526, 600, 140, 29, '#5A3C1E');
    }
    recent.forEach((h, i) => {
      const y = 456 + i * 138;
      const rowW = this.paperSafeWidth(y, 22), rowLeft = 470.5 - rowW / 2, rowRight = 470.5 + rowW / 2;
      const row = this.trapezoidPanel(470.5, y, 120, 22, new Color(116, 70, 26, 18), new Color(172, 128, 70, 140), 1.5);
      const index = progress.history.length - recent.length + i;
      const turnL = this.text(`第 ${index + 1} 次`, rowLeft + 66, y - 1, 114, 60, 27, '#3D210B');
      turnL.isBold = true;
      this.cards(h.digits!, 455, y, 60);
      this.boxPanel(rowRight - 68, y, 92, 46, new Color(44, 26, 15, 232), new Color('#D6A654'), 23, 1.5);
      const hitL = this.text(`${h.hits}/4`, rowRight - 68, y - 2, 82, 40, 27, '#FFF2D2');
      hitL.isBold = true;
      this.touch(row, 'daily-reuse-' + index, () => {
        this.draft = h.digits!; this.slot = -1;
        this.message = `已复用第 ${index + 1} 次猜测，点击一张卡牌修改。`; this.refresh();
      });
    });
    if (recent.length) this.text('点击上方记录复用 · 改一位再比较', 470, 694, 620, 32, 23, '#6E4F30');
    const caption = recent.length > 1 ? compareClues(recent[0], recent[1]) : recent.length ? clueCaption(recent[0]) : '点击卡牌可单独修改一位';
    const statusLine = this.context.dailySubmitting ? '正在提交服务器验证…' : (this.message || caption);
    this.text(statusLine, 470, 750, 630, 82, 28, '#492B11');
    this.keyboard(4, true, !!this.context.dailySubmitting);
    this.text(this.slot >= 0 ? (this.slot < this.draft.length ? `正在修改第 ${this.slot + 1} 位 · 点击键盘替换` : `接着填写第 ${this.slot + 1} 位 · 点击键盘输入`) : `已输入 ${this.draft.length}/4 位 · 点击卡牌可修改`, 470, 1046, 660, 38, 25, '#6B4D2E');
    this.fixed('hint', `推理提示 · ${progress.history.length} 条记录`, 716, 962, 188, () => { this.cluesSource = 'daily'; this.go('clues'); });
  }
  private leaderboard() {
    this.art('banner', 470, 214, 576, 84);
    const titleLbl = this.text('全服排行榜', 470, 211, 510, 66, 41, '#FFE5A9');
    titleLbl.isBold = true;

    // Twin beveled vintage tabs: 今日排行 (Daily) vs 总胜排行 (Career)
    const isDaily = this.leaderboardTab === 'daily';
    this.artButton(isDaily ? 'primary' : 'secondary', '今日排行', 314, 312, 302, 74, () => { this.leaderboardTab = 'daily'; this.leaderboardPage = 0; this.refresh(); }, true, 28);
    this.artButton(!isDaily ? 'primary' : 'secondary', '总胜排行', 626, 312, 302, 74, () => { this.leaderboardTab = 'career'; this.leaderboardPage = 0; this.refresh(); }, true, 28);

    const lb = this.context.leaderboard;
    const sumY = 394, sumW = this.paperSafeWidth(sumY, 22), sumLeft = 470.5 - sumW / 2, sumRight = 470.5 + sumW / 2;
    this.trapezoidPanel(470.5, sumY, 64, 22, new Color(116, 70, 26, 20), new Color(172, 128, 70, 135), 1.4);
    const sumText = !lb
      ? (this.context.leaderboardLoading ? '正在同步最新榜单…' : '暂无榜单数据，点击刷新重试')
      : isDaily
        ? `${lb.dateKey} 每日一题 · 共 ${lb.dailySolverCount ?? lb.daily.length} 人破译`
        : '全服对战总胜榜 · 优先胜场与最快步数';
    const sumLbl = this.text(sumText, sumLeft + (sumW - 110) / 2, sumY - 1, sumW - 120, 40, 23, '#523214');
    sumLbl.isBold = true;

    const refreshBtn = this.boxPanel(sumRight - 56, sumY, 88, 38, new Color(44, 26, 15, 228), new Color('#D6A654'), 19, 1.4);
    const refLbl = this.text(this.context.leaderboardLoading ? '同步中' : '刷新', sumRight - 56, sumY - 1, 78, 30, 19, '#FFE5A9');
    refLbl.isBold = true;
    this.touch(refreshBtn, 'lb-refresh', () => this.context.onRefreshLeaderboard?.(), !this.context.leaderboardLoading);

    const entries = lb ? (isDaily ? lb.daily : lb.career) : [];
    const pageSize = 7;
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    this.leaderboardPage = Math.max(0, Math.min(this.leaderboardPage, totalPages - 1));
    const slice = entries.slice(this.leaderboardPage * pageSize, (this.leaderboardPage + 1) * pageSize);

    const formatDur = (ms: number) => {
      if (!ms || ms <= 0) return '—';
      const s = Math.max(1, Math.round(ms / 1000));
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    const short = (name: string) => Array.from(name).length > 8 ? Array.from(name).slice(0, 7).join('') + '…' : name;
    const rankColor = (rank: number) => rank === 1 ? '#D49218' : rank === 2 ? '#7D8E9E' : rank === 3 ? '#B46432' : '#3C2312';

    if (!slice.length) {
      this.trapezoidPanel(470.5, 680, 250, 22, new Color(116, 70, 26, 16), new Color(172, 128, 70, 130), 1.4);
      this.text(
        this.context.leaderboardLoading
          ? '榜单加载中，请稍候…'
          : isDaily
            ? '今日还没有玩家完成每日一题\n马上破译，抢占榜首！'
            : '暂无对战上榜记录\n完成在线或好友对局即可上榜！',
        470, 680, 580, 140, 29, '#6C4D2E',
      );
    } else {
      slice.forEach((item, idx) => {
        const y = 482 + idx * 92;
        const rowW = this.paperSafeWidth(y, 22), rowLeft = 470.5 - rowW / 2, rowRight = 470.5 + rowW / 2;
        const isMe = !!item.isMe;
        this.trapezoidPanel(
          470.5, y, 82, 22,
          isMe ? new Color(192, 120, 30, 30) : item.rank <= 3 ? new Color(156, 100, 34, 20) : new Color(116, 70, 26, 14),
          isMe ? new Color(200, 130, 40, 195) : item.rank <= 3 ? new Color(188, 138, 62, 165) : new Color(168, 126, 70, 115),
          isMe ? 2.0 : 1.3,
        );
        // Rank badge
        this.boxPanel(rowLeft + 46, y, 58, 44, new Color(rankColor(item.rank)), new Color('#F2CA78'), 12, 1.5);
        const rLbl = this.text(item.rank <= 3 ? `No.${item.rank}` : `#${item.rank}`, rowLeft + 46, y - 1, 54, 34, item.rank <= 3 ? 18 : 21, '#FFF6DF');
        rLbl.isBold = true;

        // Player name + optional "我" chip
        const nameLbl = this.text(short(item.name) + (isMe ? ' (我)' : ''), rowLeft + 216, y - 1, 256, 44, 26, isMe ? '#942812' : '#3A210C');
        nameLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
        nameLbl.isBold = isMe || item.rank <= 3;

        // Right metric pills
        if ('steps' in item) {
          this.boxPanel(rowRight - 144, y, 88, 42, new Color(44, 26, 15, 232), new Color('#D6A654'), 21, 1.4);
          const sLbl = this.text(`${item.steps} 步`, rowRight - 144, y - 1, 80, 34, 22, '#FFE5A9'); sLbl.isBold = true;
          const tLbl = this.text(formatDur(item.durationMs), rowRight - 52, y - 1, 86, 36, 22, '#5E3E1F'); tLbl.isBold = true;
        } else {
          this.boxPanel(rowRight - 186, y, 92, 42, new Color(44, 26, 15, 232), new Color('#D6A654'), 21, 1.4);
          const wLbl = this.text(`${item.wins} 胜`, rowRight - 186, y - 1, 84, 34, 22, '#FFE5A9'); wLbl.isBold = true;
          const subRight = item.bestSteps ? `${item.winRate}% · ${item.bestSteps}步` : `胜率 ${item.winRate}%`;
          const mLbl = this.text(subRight, rowRight - 72, y - 1, 128, 36, 21, '#5E3E1F'); mLbl.isBold = true;
        }
      });
    }

    if (totalPages > 1) {
      this.artButton('secondary', '上一页', 272, 1134, 200, 68, () => { this.leaderboardPage--; this.refresh(); }, this.leaderboardPage > 0, 23);
      this.text(`${this.leaderboardPage + 1} / ${totalPages}`, 470, 1133, 120, 36, 23, '#5E3E1F');
      this.artButton('secondary', '下一页', 668, 1134, 200, 68, () => { this.leaderboardPage++; this.refresh(); }, this.leaderboardPage + 1 < totalPages, 23);
    }

    // Sticky bottom "我的排名" 2.5D trapezoid strip
    const myY = 1244;
    this.trapezoidPanel(470.5, myY, 108, 22, new Color(148, 92, 28, 26), new Color(188, 136, 62, 185), 2.0);
    const myEntry = isDaily ? lb?.myDaily : lb?.myCareer;
    if (myEntry) {
      const myTitle = this.text(`我的排名：第 ${myEntry.rank} 名`, 470, myY - 22, 620, 40, 28, '#942812');
      myTitle.isBold = true;
      const detail = 'steps' in myEntry
        ? `${myEntry.name}  ·  ${myEntry.steps} 步破译  ·  用时 ${formatDur(myEntry.durationMs)}`
        : `${myEntry.name}  ·  ${myEntry.wins} 胜 / ${myEntry.totalGames} 局（${myEntry.winRate}%）${myEntry.bestSteps ? ` · 最快 ${myEntry.bestSteps} 步` : ''}`;
      this.text(detail, 470, myY + 20, 640, 36, 23, '#4B2D12');
    } else {
      const unranked = this.text(isDaily ? '我的排名：今日尚未破译' : '我的排名：暂未上榜', 470, myY - 18, 600, 38, 26, '#5D3C1C');
      unranked.isBold = true;
      this.text(isDaily ? '点击下方「挑战今日一题」，破译即自动上榜' : '赢下一场对局或完成每日一题即可登榜', 470, myY + 20, 620, 34, 22, '#7B5A38');
    }

    // Bottom twin beveled vintage actions (cleanly clear of bottom gold filigree diamond)
    if (isDaily) {
      this.artButton('primary', '挑战今日一题', 314, 1392, 304, 88, () => this.context.onOpenDaily?.(), true, 27);
      this.artButton('secondary', '返回大厅', 626, 1392, 286, 88, () => { this.close(); this.refresh(); }, true, 27);
    } else {
      this.artButton('secondary', '返回大厅', 470, 1392, 380, 88, () => { this.close(); this.refresh(); }, true, 29);
    }
  }
  private syncPicks(size: DigitCount, key: string, result: ReturnType<typeof deduce>) {
    if (this.picksKey === key && this.picks.length === size) return;
    this.picksKey = key;
    this.clueHint = '';
    this.picks = result.consistent
      ? result.positions.map(p => (p.possible.length === 1 ? p.possible[0] : ''))
      : Array.from({ length: size }, () => '');
  }
  /** Safe usable width strictly inside paper.png's sloping antique gold filigree borders at coordinate y. */
  private paperSafeWidth(y: number, inset = 22): number {
    // Measured directly from assets/resources/art/profile/paper.png (687.6px at y=314 -> 771.9px at y=1365).
    const filigreeW = 687.6 + ((y - 314) / 100) * 8.02;
    return Math.max(540, filigreeW - inset * 2);
  }
  /** Draw a 2.5D tabletop trapezoid panel whose left/right edges match paper.png's perspective slant. */
  private trapezoidPanel(
    x: number,
    y: number,
    h: number,
    inset: number,
    fill: Color,
    stroke: Color,
    lineWidth = 1.6,
    customTopW?: number,
    customBotW?: number,
  ) {
    const topW = customTopW ?? this.paperSafeWidth(y - h / 2, inset);
    const botW = customBotW ?? this.paperSafeWidth(y + h / 2, inset);
    const maxW = Math.max(topW, botW);
    const n = this.node('LearningTrapezoid', x, y, maxW, h);
    const g = n.addComponent(Graphics);
    const ht = topW / 2, hb = botW / 2, hh = h / 2;
    // Chamfered antique ledger corners (6px bevel) with exact trapezoidal side slopes.
    const c = 7;
    const drawPath = (shrink: number) => {
      const t = ht - shrink, b = hb - shrink, v = hh - shrink;
      g.moveTo(-t + c, v);
      g.lineTo(t - c, v);
      g.lineTo(t, v - c);
      g.lineTo(b, -v + c);
      g.lineTo(b - c, -v);
      g.lineTo(-b + c, -v);
      g.lineTo(-b, -v + c);
      g.lineTo(-t, v - c);
      g.close();
    };
    g.fillColor = fill;
    drawPath(0);
    g.fill();
    if (lineWidth > 0) {
      g.strokeColor = stroke;
      g.lineWidth = lineWidth;
      drawPath(1);
      g.stroke();
    }
    return n;
  }
  private boxPanel(x: number, y: number, w: number, h: number, fill: Color | string, stroke: Color | string, radius = 12, lineWidth = 1.8) {
    const n = this.node('LearningBox', x, y, w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = typeof fill === 'string' ? new Color(fill) : fill;
    g.roundRect(-w / 2, -h / 2, w, h, radius); g.fill();
    if (lineWidth > 0) {
      g.strokeColor = typeof stroke === 'string' ? new Color(stroke) : stroke;
      g.lineWidth = lineWidth;
      g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, Math.max(2, radius - 1)); g.stroke();
    }
    return n;
  }
  private clues() {
    const { room, me } = this.context;
    const isDaily = !room && this.cluesSource === 'daily';
    const history: Clue[] = room
      ? room.history.filter(h => h.playerId === me)
      : isDaily
        ? (this.context.dailyServer ?? this.context.dailyProgress)?.history ?? []
        : this.practice?.history ?? [];
    const size: DigitCount = room ? room.digitCount ?? 4 : isDaily ? 4 : this.practice?.size ?? 4;

    // 1. Clean header plaque + redesigned active/inactive twin ledger tabs (comfortably inside paper.png top width)
    this.art('banner', 470, 214, 576, 84);
    const titleLbl = this.text('我的推理笔记', 470, 211, 510, 66, 41, '#FFE5A9');
    titleLbl.isBold = true;

    const posActive = this.tab === 'positions';
    this.fixed(posActive ? 'tab-positions' : 'tab-positions-off', '逐位排除', 310, 314, 306, () => { this.tab = 'positions'; this.refresh(); });
    this.fixed(posActive ? 'tab-history-off' : 'tab-history', '记录与对比', 630, 314, 306, () => { this.tab = 'history'; this.refresh(); });
    if (!posActive) { this.history(history, size); return; }

    const key = JSON.stringify([size, history.map(h => [h.digits, h.hits])]);
    if (key !== this.cacheKey) { this.cacheKey = key; this.cache = deduce(history, size); }
    const result = this.cache;
    this.syncPicks(size, key, result);

    // 2. Compact 2.5D trapezoidal summary strip (translucent vintage wash letting paper.png grain breathe through!)
    const sumY = 404, sumH = 74, sumW = this.paperSafeWidth(sumY, 22);
    this.trapezoidPanel(470.5, sumY, sumH, 22, new Color(115, 68, 24, 20), new Color(172, 128, 70, 130), 1.5);
    const remX = 470.5 - sumW / 2 + 118;
    this.boxPanel(remX, sumY, 214, 48, new Color(43, 25, 14, 238), new Color('#C99848'), 24, 1.8);
    const remLbl = this.text(result.consistent ? `剩余 ${result.count} 种可能` : '线索同步中', remX, sumY - 2, 202, 42, 22, '#FFE5A9');
    remLbl.isBold = true;

    const recent = history.slice(-3);
    const chipsAreaL = remX + 114, chipsAreaR = 470.5 + sumW / 2 - 14, chipsAreaW = chipsAreaR - chipsAreaL;
    if (!recent.length) {
      this.text('提交猜测后自动整理线索', (chipsAreaL + chipsAreaR) / 2, sumY - 1, chipsAreaW, 42, 22, '#7A5B39');
    } else {
      const gap = 8;
      const chipW = Math.min(180, Math.floor((chipsAreaW - gap * (recent.length - 1)) / recent.length));
      const totalW = chipW * recent.length + gap * (recent.length - 1);
      const startX = chipsAreaL + (chipsAreaW - totalW) / 2 + chipW / 2;
      recent.forEach((h, i) => {
        const cx = startX + i * (chipW + gap);
        const hot = h.hits !== null && h.hits >= Math.max(1, size - 1);
        this.boxPanel(
          cx, sumY, chipW, 46,
          hot ? new Color(196, 108, 30, 34) : new Color(112, 68, 26, 18),
          hot ? new Color(194, 114, 38, 175) : new Color(168, 128, 76, 125),
          10, 1.4,
        );
        const cl = this.text(`${h.digits ?? '超时'} · ${h.hits ?? '—'}/${size}`, cx, sumY - 2, chipW - 8, 38, recent.length === 3 ? 19 : 22, hot ? '#942812' : '#3C2311');
        cl.isBold = true;
      });
    }

    // 3. 2.5D Trapezoid Position Matrix (progressively widens top->bottom strictly parallel to paper.png's slanted borders!)
    const rowStep = size === 4 ? 108 : size === 3 ? 124 : 138;
    const rowH = size === 4 ? 98 : 108;
    const matrixTop = size === 4 ? 506 : size === 3 ? 544 : 590;

    if (result.consistent) {
      result.positions.forEach((position, i) => {
        const y = matrixTop + i * rowStep;
        const rowW = this.paperSafeWidth(y, 22);
        const rowLeft = 470.5 - rowW / 2;
        const pickedDigit = this.picks[i] ?? '';
        const confirmedDigit = position.possible.length === 1 ? position.possible[0] : '';

        // Soft translucent vintage sepia wash + antique hairline trapezoid border (blends seamlessly into paper.png!)
        const rowFill = confirmedDigit
          ? new Color(56, 124, 68, 18)
          : pickedDigit
            ? new Color(184, 116, 30, 22)
            : new Color(116, 70, 26, 15);
        const rowStroke = confirmedDigit
          ? new Color(68, 146, 84, 160)
          : pickedDigit
            ? new Color(196, 128, 42, 175)
            : new Color(168, 126, 70, 115);
        this.trapezoidPanel(470.5, y, rowH, 22, rowFill, rowStroke, confirmedDigit || pickedDigit ? 1.8 : 1.3);

        // Left position badge (gently tapered trapezoid matching left paper slant!)
        const badgeW = 94;
        const badgeX = rowLeft + 14 + badgeW / 2;
        this.trapezoidPanel(badgeX, y, 72, 0, new Color(44, 26, 15, 232), new Color(192, 144, 70, 200), 1.6, badgeW - 3, badgeW + 3);
        const posLbl = this.text(`第 ${i + 1} 位`, badgeX, confirmedDigit || pickedDigit ? y - 12 : y - 2, badgeW - 8, 36, 23, '#FFE5A9');
        posLbl.isBold = true;
        if (confirmedDigit) {
          const st = this.text(`已定 ${confirmedDigit}`, badgeX, y + 17, badgeW - 8, 24, 17, '#8EE69E');
          st.isBold = true;
        } else if (pickedDigit) {
          const st = this.text(`已选 ${pickedDigit}`, badgeX, y + 17, badgeW - 8, 24, 17, '#FFD472');
          st.isBold = true;
        }

        // 10 interactive hand-painted miniature parchment cards (card.png) expanding naturally with perspective width!
        const tilesL = badgeX + badgeW / 2 + 12;
        const tilesR = 470.5 + rowW / 2 - 14;
        const tilesSpan = tilesR - tilesL;
        const step = tilesSpan / 10;
        const tileW = Math.min(50, Math.floor(step - 4));
        const tileH = Math.round(tileW * 1.56);

        for (let d = 0; d < 10; d++) {
          const ch = String(d);
          const x = tilesL + step * (d + 0.5);
          const excluded = position.excluded.includes(ch);
          const confirmed = confirmedDigit === ch;
          const selected = !confirmed && pickedDigit === ch;
          const tileY = selected ? y - 4 : y;

          // Real hand-painted parchment mini-card sprite matching paper.png's vintage ink aesthetic!
          const tile = this.art('card', x, tileY, tileW, tileH);
          const sp = tile.getComponent(Sprite)!;
          if (confirmed) {
            sp.color = new Color('#BFE3BE');
          } else if (selected) {
            sp.color = new Color('#FFE18B');
            const ring = this.node('SelectedRing', x, tileY, tileW + 4, tileH + 4);
            const rg = ring.addComponent(Graphics);
            rg.strokeColor = new Color('#C95A10'); rg.lineWidth = 2.6;
            rg.roundRect(-(tileW + 2) / 2, -(tileH + 2) / 2, tileW + 2, tileH + 2, 8); rg.stroke();
          } else if (excluded) {
            sp.color = new Color('#DFC4AE');
            tile.addComponent(UIOpacity).opacity = 165;
          } else {
            sp.color = new Color('#FFF6E3');
          }

          const dLbl = this.text(
            ch, x, excluded || confirmed || selected ? tileY - 12 : tileY - 2,
            tileW - 4, 42, 30,
            confirmed ? '#145526' : selected ? '#8E250B' : excluded ? '#8A6B58' : '#311A0A',
          );
          dLbl.isBold = true;
          if (confirmed) {
            const m = this.text('✓', x, tileY + 19, tileW - 4, 26, 20, '#16652D'); m.isBold = true;
          } else if (selected) {
            const m = this.text('●', x, tileY + 19, tileW - 4, 22, 14, '#C95A10'); m.isBold = true;
          } else if (excluded) {
            this.text('×', x, tileY + 19, tileW - 4, 26, 20, '#B34338');
          }

          this.touch(tile, `pick-${i}-${d}`, () => {
            if (excluded) {
              this.clueHint = `第 ${i + 1} 位的 ${ch} 已排除，可点击其余候选牌快速组牌`;
              this.refresh();
              return;
            }
            if (confirmed) {
              this.picks[i] = ch;
              this.clueHint = `第 ${i + 1} 位已确定为 ${ch}，已自动保留在组牌栏`;
              this.refresh();
              return;
            }
            this.picks[i] = this.picks[i] === ch ? '' : ch;
            this.clueHint = '';
            this.refresh();
          });
        }
      });
    } else {
      this.text('当前记录不一致，请等待同步后查看逐位排除', 470, 660, 640, 80, 29, '#7C5D3B');
    }

    // 4. Crisp 1-line legend
    const legendY = matrixTop + (size - 1) * rowStep + Math.round(rowH / 2) + 38;
    this.text('✓ 已确定   ·   ● 已选入组牌   ·   空白 点击可选   ·   × 已排除', 470, legendY, 680, 38, 22, '#6A4C2E');

    // 5. 2.5D Trapezoidal Quick-Input Composer Panel (widens naturally with bottom perspective!)
    const composerY = 1106, composerH = 166;
    const composerW = this.paperSafeWidth(composerY, 22);
    const compLeft = 470.5 - composerW / 2;
    const compRight = 470.5 + composerW / 2;
    const composed = composeQuickDraft(history, size, this.picks);
    const activeDaily = this.context.dailyServer ?? this.context.dailyProgress;
    const canInput = !room
      ? isDaily
        ? !!activeDaily && !activeDaily.solved
        : !!this.practice && !this.practice.solved
      : ['playing', 'reply'].includes(room.phase) && room.current === me && this.context.now >= room.startAt && this.context.now < room.deadline;

    this.trapezoidPanel(470.5, composerY, composerH, 22, new Color(148, 92, 28, 26), new Color(186, 134, 62, 185), 2.0);
    const leftColX = compLeft + 74;
    const compTitle = this.text('快速组牌', leftColX, composerY - 34, 118, 36, 25, '#3D200A');
    compTitle.isBold = true;

    // Mini action chip: Smart Fill (智能补全)
    const fillChip = this.boxPanel(leftColX, composerY + 24, 106, 40, new Color(122, 74, 24, 24), new Color(168, 122, 62, 165), 10, 1.4);
    const fillChipLbl = this.text('智能补全', leftColX, composerY + 22, 100, 32, 19, '#553112');
    fillChipLbl.isBold = true;
    this.touch(fillChip, 'quick-complete', () => {
      const candidate = consistentCandidate(history, size, this.picks);
      if (candidate) {
        this.picks = Array.from(candidate);
        this.clueHint = '已按当前已选位补全一组兼容候选，可直接填入猜测';
      } else {
        this.clueHint = '当前所选数字组合与历史线索冲突，请先点重置或调整某一位';
      }
      this.refresh();
    }, result.consistent);

    // Live preview painted card slots
    const slotW = size === 4 ? 68 : size === 3 ? 78 : 88;
    const slotH = Math.round(slotW * 1.28);
    const slotGap = size === 4 ? 11 : 16;
    const slotsCenterX = 424;
    for (let i = 0; i < size; i++) {
      const sx = slotsCenterX + (i - (size - 1) / 2) * (slotW + slotGap);
      const ch = this.picks[i] ?? '';
      const confirmed = result.consistent && result.positions[i]?.possible.length === 1 && result.positions[i].possible[0] === ch;
      const slotNode = this.art('card', sx, composerY - 8, slotW, slotH);
      const ssp = slotNode.getComponent(Sprite)!;
      if (ch) {
        ssp.color = confirmed ? new Color('#D5EDD3') : new Color('#FFF7E5');
        const ring = this.node('SlotRing', sx, composerY - 8, slotW + 2, slotH + 2);
        const rg = ring.addComponent(Graphics);
        rg.strokeColor = new Color(confirmed ? '#2E8747' : '#C96A1B'); rg.lineWidth = 2.2;
        rg.roundRect(-slotW / 2, -slotH / 2, slotW, slotH, 8); rg.stroke();
        const artFrame = this.context.cardDigits?.[confirmed ? 'ink' : 'crimson'].get(ch);
        if (artFrame) {
          const h = Math.round(slotH * 0.7);
          const dn = new Node('ComposerDigit-' + ch);
          dn.layer = Layers.Enum.UI_2D; slotNode.addChild(dn); dn.setPosition(0, 0);
          const sp = dn.addComponent(Sprite); sp.spriteFrame = artFrame; sp.sizeMode = Sprite.SizeMode.CUSTOM;
          dn.getComponent(UITransform)!.setContentSize(Math.round(h * (144 / 180)), h);
        } else {
          const l = this.text(ch, sx, composerY - 10, slotW - 8, slotH - 8, 42, confirmed ? '#155427' : '#8E250B');
          l.isBold = true;
        }
        if (!confirmed) {
          this.touch(slotNode, `clear-slot-${i}`, () => { this.picks[i] = ''; this.clueHint = ''; this.refresh(); });
        }
      } else {
        ssp.color = new Color('#E4CFA9');
        slotNode.addComponent(UIOpacity).opacity = 185;
        this.text(`第${i + 1}位`, sx, composerY - 10, slotW - 6, 36, 17, '#8A6B46');
      }
    }

    // Small reset link under slots when user has any non-confirmed pick
    const hasCustomPick = this.picks.some((ch, i) => !!ch && !(result.consistent && result.positions[i]?.possible.length === 1 && result.positions[i].possible[0] === ch));
    if (hasCustomPick) {
      const resetLbl = this.text('清空自选', slotsCenterX, composerY + 56, 160, 32, 20, '#8A5628');
      this.touch(resetLbl.node, 'quick-reset', () => {
        this.picks = result.consistent
          ? result.positions.map(p => (p.possible.length === 1 ? p.possible[0] : ''))
          : Array.from({ length: size }, () => '');
        this.clueHint = '';
        this.refresh();
      });
    } else {
      this.text('点上方数字即可填入对应位', slotsCenterX, composerY + 56, 310, 32, 19, '#7B5B38');
    }

    // Primary "Fill Guess" CTA right inside the composer
    const canFill = canInput && composed.pickedCount > 0;
    const ctaText = !canInput
      ? (room ? '等待你的回合' : '本局已结束')
      : composed.pickedCount === 0
        ? '请先选数字'
        : composed.completed
          ? '补全并填入'
          : composed.digits.length === size
            ? '填入猜测'
            : `填入前 ${composed.digits.length} 位`;
    const ctaW = 192;
    const ctaX = compRight - 14 - ctaW / 2;
    this.artButton('primary', ctaText, ctaX, composerY - 2, ctaW, 82, () => {
      if (!composed.digits) return;
      const msg = !composed.consistent
        ? '已填入当前组合（提示：与部分历史线索冲突，可点槽位微调）'
        : composed.completed
          ? '已保留所选位并补齐兼容候选，点数字槽可单改'
          : composed.digits.length === size
            ? '已从推理笔记填入，可直接提交或微调'
            : `已填入前 ${composed.digits.length} 位，继续输入剩余位`;
      if (room) {
        this.context.copy(composed.digits, msg);
      } else if (isDaily) {
        this.draft = composed.digits;
        this.slot = -1;
        this.message = msg;
        this.go('daily');
      } else if (this.practice) {
        this.draft = composed.digits;
        this.slot = -1;
        this.message = msg;
        this.go('practice');
      }
    }, canFill, composed.completed ? 23 : 24);

    // Inline feedback / note underneath composer
    const noteText = this.clueHint
      || (!composed.consistent && composed.pickedCount > 0
        ? '提示：当前自选组合与历史线索存在冲突，可点「智能补全」或微调'
        : '注：可能数字受多条线索联动约束，并非每位可任意组合');
    this.text(noteText, 470, 1244, 680, 52, 22, !composed.consistent && composed.pickedCount > 0 ? '#A22A16' : '#735434');

    // 6. Redesigned spotless bottom return button
    this.fixed('return', '返回猜测', 470, 1492, 472, () => this.back());
  }
  private history(history:Clue[],size:DigitCount) {
    const pages=Math.max(1,Math.ceil(history.length/3));this.recordPage=this.recordPage<0?pages-1:Math.min(this.recordPage,pages-1);
    const selected=this.selected<0?history.length-1:Math.min(this.selected,history.length-1);
    const baseline=this.baseline<0?selected-1:Math.min(this.baseline,history.length-1);
    const hdr = this.text(`我的猜测 · 共 ${history.length} 条`,470,418,620,66,34,'#3D220B');
    hdr.isBold = true;
    if(!history.length)this.text('还没有记录，先提交一次猜测。',470,650,620,100,32,'#735535');
    history.slice(this.recordPage*3,this.recordPage*3+3).forEach((h,i)=>{
      const index=this.recordPage*3+i,y=528+i*118;
      const rowW=this.paperSafeWidth(y,22), rowLeft=470.5-rowW/2, rowRight=470.5+rowW/2;
      const isSel=index===selected, isBase=index===baseline&&baseline!==selected;
      const row=this.trapezoidPanel(
        470.5, y, 106, 22,
        isSel ? new Color(192,120,30,28) : isBase ? new Color(68,128,84,18) : new Color(116,70,26,15),
        isSel ? new Color(198,128,38,185) : isBase ? new Color(82,146,96,155) : new Color(168,126,70,115),
        isSel || isBase ? 1.8 : 1.3,
      );
      this.touch(row,'record-'+index,()=>{this.selected=index;this.refresh();});
      const turnLbl = this.text(`第 ${index+1} 次`,rowLeft+66,y-1,112,56,26,'#3B210C');
      turnLbl.isBold = true;
      if(h.digits)this.cards(h.digits,438,y,55);else this.text('超时',438,y,240,60,28,'#7D5C3B');
      const hitX=rowRight-128;
      const hot=h.hits!==null&&h.hits>=Math.max(1,size-1);
      this.boxPanel(hitX,y,86,44,hot?new Color('#B95A18'):new Color(44,26,15,232),new Color('#D6A654'),22,1.5);
      const hitLbl=this.text(h.hits===null?'—':`${h.hits}/${size}`,hitX,y-1,78,38,25,'#FFF2D2');
      hitLbl.isBold=true;
      if(isSel||isBase){
        const tag=this.text(isSel?'已选':'对照',rowRight-46,y-1,64,40,22,isSel?'#A23012':'#286B3B');
        tag.isBold=true;
      }
    });
    if (pages > 1) {
      const move = (page: number, index = page * 3) => {
        this.recordPage = page; this.selected = index; this.refresh();
      };
      this.button('上一页',235,882,190,()=>move(this.recordPage-1),this.recordPage>0,76);
      this.button(`${this.recordPage+1}/${pages} · 回最新`,470,882,230,()=>move(pages-1,history.length-1),true,76).name='LearningControl-回到最新';
      this.button('下一页',705,882,190,()=>move(this.recordPage+1),this.recordPage+1<pages,76);
    } else this.text(history.length?'点击记录选择，再设为对照':'猜测后即可在这里查看和对比记录',470,882,640,56,26,'#6E4F30');
    const item=history[selected],before=history[baseline];
    const caption=item?baseline===selected&&this.baseline>=0?`已将第 ${selected+1} 次设为对照。\n再点击另一条记录，查看变化。`:before&&baseline!==selected?compareClues(before,item):clueCaption(item):'点击记录选择，再设为对照，可比较任意两次猜测。';
    this.trapezoidPanel(470.5,1104,306,22,new Color(148,92,28,22),new Color(184,134,64,170),1.8);
    if(item?.digits&&before?.digits&&baseline!==selected){
      const changed=Array.from(item.digits).map((digit,i)=>digit!==before.digits![i]?i:-1).filter(i=>i>=0);
      if(changed.length===1){
        const position=changed[0];
        this.art('banner',470,994,380,62);
        this.text(`只改了第 ${position+1} 位`,470,992,350,52,30,'#FFE5A9');
        this.text(`第 ${baseline+1} 次`,226,1084,120,54,24,'#4D3014');
        this.cards(before.digits[position],326,1084,60);
        this.text('→',408,1084,60,60,38,'#7D4B1D');
        this.cards(item.digits[position],490,1084,60);
        this.text(`命中数变化\n${before.hits} → ${item.hits}`,666,1084,210,100,30,'#3D200A');
      }else{
        this.text(`第 ${baseline+1} 次  ${before.digits}   →   第 ${selected+1} 次  ${item.digits}`,470,1014,620,60,29,'#3D200A');
        this.text(`命中数 ${before.hits} → ${item.hits}`,470,1084,600,60,34,'#942B14');
      }
    }
    this.text(caption,470,item?.digits&&before?.digits&&baseline!==selected?1194:1104,610,124,29,'#4B2D12');
    this.fixed('baseline','设为对照',285,1500,360,()=>{this.baseline=selected;this.refresh();},!!item?.digits);
    const room=this.context.room;
    const isDaily = !room && this.cluesSource === 'daily';
    const activeDaily = this.context.dailyServer ?? this.context.dailyProgress;
    const canCopy=!room
      ? isDaily ? !!activeDaily && !activeDaily.solved : !this.practice?.solved
      : ['playing','reply'].includes(room.phase)&&room.current===this.context.me&&this.context.now>=room.startAt&&this.context.now<room.deadline;
    const copyHint = !item?.digits ? (history.length?'超时记录没有数字，无法复制':'先提交一次猜测，再选择记录')
      : !canCopy ? (!room?(isDaily?'今日暗号已破译':'本局已破解，可返回开始新练习'):'轮到你行动时可复制记录')
      : `已选第 ${selected+1} 次 · 复制后可修改任意一位`;
    this.text(copyHint,470,1302,660,48,26,'#6D4E2E');
    this.fixed('copy','复制后修改',677,1500,383,()=>{
      if(!item?.digits)return;
      if(room)this.context.copy(item.digits);
      else {this.draft=item.digits;this.slot=-1;this.go(isDaily?'daily':'practice');}
    },!!item?.digits&&canCopy);
  }
}
