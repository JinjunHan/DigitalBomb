import { BlockInputEvents, Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UIOpacity, UITransform, resources, Texture2D } from 'cc';
import { clueCaption, compareClues, composeQuickDraft, consistentCandidate, deduce, STANDARD_ROUNDS, STANDARD_TURN_MS, type Clue, type DigitCount } from './shared/deduction';
import { Practice, Tutorial } from './shared/learning';
import type { RoomView } from './shared/protocol';
import { modeLabel, type MatchMode } from './shared/game-mode';

const LEARNING_ART = ["paper", "back", "title-online", "title-friend", "title-hub", "title-tutorial", "mode-2", "mode-3", "mode-4", "check", "match", "create", "start", "practice-2", "practice-3", "practice-4", "rules", "home", "hint", "key-1", "key-2", "key-3", "key-4", "key-5", "key-6", "key-7", "key-8", "key-9", "key-0", "key-delete", "key-submit", "tab-positions", "tab-positions-off", "tab-history", "tab-history-off", "baseline", "copy", "return", "card", "answer", "panel", "banner", "subtitle"];

interface Context {
  parent: Node; height: number; top: number; bottom: number;
  paper?: SpriteFrame; button?: SpriteFrame; card?: SpriteFrame;
  cardDigits?: Record<'ink' | 'crimson', Map<string, SpriteFrame>>;
  room?: RoomView | null; me: string; now: number;
  redraw: () => void; copy: (digits: string, message?: string) => void; completed: () => void;
}
type Page = 'menu' | 'rules' | 'tutorial' | 'practice' | 'clues' | 'mode' | 'confirmation';
/** Local teaching and practice never send guesses to the multiplayer service. */
export class LearningPanel {
  visible = false;
  private page: Page = 'menu';
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

  open(page: 'menu' | 'rules' | 'clues' = 'menu') {
    this.visible = true; this.page = page; this.message = '';
    this.tab = 'positions'; this.selected = -1; this.baseline = -1; this.recordPage = -1;
  }
  close() { this.visible = false; this.timer = undefined; }
  private refresh() { this.context.redraw(); }
  private go(page: Page) { if (page === 'clues') { this.recordPage = -1; this.selected = -1; } this.page = page; this.message = ''; this.refresh(); }
  private startPractice(size: DigitCount) {
    this.practice = new Practice(size); this.draft = ''; this.slot = -1;
    this.selected = -1; this.baseline = -1; this.recordPage = 0; this.go('practice');
  }
  private startTutorial() { this.tutorial = new Tutorial(); this.draft = ''; this.slot = -1; this.go('tutorial'); }
  input(key: string) {
    if (!this.visible || !['tutorial', 'practice'].includes(this.page)) return;
    if (this.page === 'tutorial' && this.tutorial.step >= 2 || this.page === 'practice' && this.practice?.solved) return;
    const size = this.page === 'tutorial' ? 4 : this.practice!.size;
    this.message = '';
    if (key === 'submit') {
      if (this.page === 'tutorial') {
        this.tutorial.submit(this.draft);
        this.message = this.tutorial.message;
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
      else textures.forEach((texture, i) => { const frame = new SpriteFrame(); frame.texture = texture; const name = LEARNING_ART[i]; if (name === 'paper') { frame.insetLeft=110; frame.insetRight=110; frame.insetTop=160; frame.insetBottom=130; } if (['answer','subtitle','banner','card'].includes(name)) { const x=name==='answer'?52:name==='card'?12:name==='banner'?56:30; const y=name==='answer'?38:name==='card'?12:22; frame.insetLeft=x; frame.insetRight=x; frame.insetTop=y; frame.insetBottom=name==='banner'?24:y; } this.frames.set(name, frame); });
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
    if (['paper','answer','subtitle','banner','card'].includes(name)) sprite.type = Sprite.Type.SLICED;
    node.getComponent(UITransform)!.setContentSize(w, h); return node;
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
    else if (this.page === 'mode') { this.close(); this.refresh(); }
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
    this.cards(pending.digits,470,690,140);
    this.text(pending.kind==='lock'?'锁定后本局不可修改。':'这组数字已经猜过，仍会消耗一次机会。',470,980,700,130,38);
    this.button('取消',285,1230,280,pending.cancel,true,130);
    this.button('确认',650,1230,280,pending.accept,true,130);
  }
  update(now: number) {
    if (!this.timer?.isValid || !this.timerRoom) return;
    const room=this.timerRoom, seconds=Math.max(0,Math.ceil((room.deadline-now)/1000));
    const who=room.phase==='preparing'?'准备':room.current===this.context.me?'你的回合':'对手回合';
    this.timer.string=`${who} ${seconds}s · 查看提示不暂停计时`;
  }
  private menu() {
    this.heading('','先学会推理，再与对手较量','hub');
    this.art('panel',471,680,722,550);
    this.text('只改一位，比较命中变化',470,465,650,70,38);
    for (const [i,digits] of ['1234','9234'].entries()) {
      Array.from(digits).forEach((digit,j)=>this.text(digit,211+j*104,618+i*165,86,110,76,j===0?'#9F3415':'#321502'));
      this.text(`命中 ${2-i} 位`,695,619+i*165,190,80,36,'#FFE5A9');
    }
    this.text('第一位改变，其他位相同',470,900,600,60,32);
    this.art('banner',470,1150,520,95);
    this.text('自由练习',470,1150,470,70,42,'#FFE5A9');
    this.text('不限时 · 不计战绩',470,1220,650,40,27);
    this.fixed('start','互动教学 · 学会第一步推理',472,1030,532,()=>this.startTutorial());
    for(const [i,size] of ([2,3,4] as const).entries()) this.fixed('practice-'+size,`${size} 位 · ${['入门','进阶','标准'][i]}`,225+i*249,1360,241,()=>this.startPractice(size));
    this.fixed('rules','查看正式对战规则',295,1513,311,()=>this.go('rules'));
    this.fixed('home','先去大厅',648,1513,311,()=>{this.close();this.refresh();});
  }
  private rules() {
    this.heading('对战规则','公平较量 · 逐步推理');
    const room=this.context.room;
    this.text(room?`① 各自设置 ${room.digitCount??4} 位密码`:'① 选择 2 / 3 / 4 位密码，默认 4 位',470,510,700,100,38);
    this.text('每位 0～9，可以重复、可以 0 开头。',470,620,700,90,33);
    this.text('② 轮流猜测对方的密码\n只反馈数字与位置同时正确的数量。\n0 命中不代表这些数字不在密码中。',470,815,700,220,36);
    this.text('③ 同一大轮，双方机会相同\n先手猜中，后手仍可补猜一次。\n双方本轮都猜中则平局。',470,1020,700,200,36);
    this.text(`每回合 ${(room?.turnMs??STANDARD_TURN_MS)/1000} 秒，最多 ${room?.roundLimit??STANDARD_ROUNDS} 大轮。\n连续两次自己的行动超时判负。\n低峰时可能匹配自动对手。`,470,1250,700,180,33);
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
  private keyboard(size: DigitCount, practice=false) {
    this.cards(this.draft,practice?395:470,practice?958:820,practice?105:110,true,size);
    for(const [i,key] of ['1','2','3','4','5','6','7','8','9','delete','0','submit'].entries()) {
      this.fixed('key-'+key,key==='delete'?'删除':key==='submit'?'提交':key,260+(i%3)*211,(practice?1154:1020)+Math.floor(i/3)*100,205,()=>this.input(key),key==='submit'?this.draft.length===size:key==='delete'?this.draft.length>0:true);
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
      this.cards(practice.history[practice.history.length-1].digits!,470,650,130);
      this.text(`用了 ${practice.history.length} 次猜测\n哪一次猜测帮你排除了最多可能？`,470,940,700,170,38);
      this.button('查看推理记录',470,1130,600,()=>{this.tab='history';this.go('clues');},true,100);
      this.button('再练一次',470,1270,600,()=>this.startPractice(practice.size),true,100);
      this.button(practice.size<4?`挑战 ${practice.size+1} 位`:'返回练习室',470,1410,600,()=>practice.size<4?this.startPractice((practice.size+1) as DigitCount):this.go('menu'),true,100);return;
    }
    this.art('banner',470,227,650,110);
    this.text(`${practice.size} 位自由练习`,470,227,490,100,58,'#FFE5A9');
    this.text('我的猜测 · 不限时 · 不计战绩',470,330,650,60,30);
    const recent=practice.history.slice(-2);
    if(!recent.length) this.text('先猜一组数字，收集第一条线索\n每位 0～9 · 可重复 · 可 0 开头',470,530,660,160,33);
    recent.forEach((h,i)=>{
      const y=460+i*145;
      this.text(`第 ${practice.history.length-recent.length+i+1} 次`,229,y,145,70,31);
      this.cards(h.digits!,470,y,practice.size===4?65:86);
      this.text(`${h.hits}/${practice.size}`,722,y,120,70,40);
      const index=practice.history.length-recent.length+i;
      const reuse=this.node('PracticeReuse',470,y,680,130);
      this.touch(reuse,'reuse-'+index,()=>{
        this.draft=h.digits!; this.slot=-1;
        this.message=`已复用第 ${index+1} 次猜测，点击一张卡牌修改。`; this.refresh();
      });
    });
    if(recent.length)this.text('点击上方记录复用 · 改一位再比较',470,710,650,32,24);
    const caption=recent.length>1?compareClues(recent[0],recent[1]):recent.length?clueCaption(recent[0]):'点击卡牌可单独修改一位';
    this.text(this.message||caption,470,760,670,90,30);
    this.keyboard(practice.size,true);
    this.text(this.slot>=0?(this.slot<this.draft.length?`正在修改第 ${this.slot+1} 位 · 点击键盘替换`:`接着填写第 ${this.slot+1} 位 · 点击键盘输入`):`已输入 ${this.draft.length}/${practice.size} 位 · 点击卡牌可修改`,470,1050,680,40,26);
    this.fixed('hint',`推理提示 · ${practice.history.length} 条记录`,747,970,215,()=>this.go('clues'));
  }
  private syncPicks(size: DigitCount, key: string, result: ReturnType<typeof deduce>) {
    if (this.picksKey === key && this.picks.length === size) return;
    this.picksKey = key;
    this.clueHint = '';
    this.picks = result.consistent
      ? result.positions.map(p => (p.possible.length === 1 ? p.possible[0] : ''))
      : Array.from({ length: size }, () => '');
  }
  private boxPanel(x: number, y: number, w: number, h: number, fill: string, stroke: string, radius = 14, lineWidth = 2) {
    const n = this.node('LearningBox', x, y, w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(fill); g.roundRect(-w / 2, -h / 2, w, h, radius); g.fill();
    g.strokeColor = new Color(stroke); g.lineWidth = lineWidth;
    g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, Math.max(2, radius - 1)); g.stroke();
    return n;
  }
  private clues() {
    const { room, me } = this.context;
    const history: Clue[] = room ? room.history.filter(h => h.playerId === me) : this.practice?.history ?? [];
    const size: DigitCount = room ? room.digitCount ?? 4 : this.practice?.size ?? 4;

    // 1. Clean header plaque + redesigned active/inactive twin ledger tabs
    this.art('banner', 470, 214, 590, 86);
    const titleLbl = this.text('我的推理笔记', 470, 211, 520, 68, 42, '#FFE5A9');
    titleLbl.isBold = true;

    const posActive = this.tab === 'positions';
    this.fixed(posActive ? 'tab-positions' : 'tab-positions-off', '逐位排除', 302, 314, 326, () => { this.tab = 'positions'; this.refresh(); });
    this.fixed(posActive ? 'tab-history-off' : 'tab-history', '记录与对比', 638, 314, 326, () => { this.tab = 'history'; this.refresh(); });
    if (!posActive) { this.history(history, size); return; }

    const key = JSON.stringify([size, history.map(h => [h.digits, h.hits])]);
    if (key !== this.cacheKey) { this.cacheKey = key; this.cache = deduce(history, size); }
    const result = this.cache;
    this.syncPicks(size, key, result);

    // 2. Compact unified summary strip: remaining count badge + recent 3 clues chips
    this.boxPanel(470, 404, 742, 78, '#F6E7C9', '#CFA562', 16, 1.8);
    this.boxPanel(228, 404, 240, 52, '#2B190E', '#C99848', 26, 2);
    const remLbl = this.text(result.consistent ? `剩余 ${result.count} 种可能` : '线索同步中', 228, 402, 226, 44, 24, '#FFE5A9');
    remLbl.isBold = true;

    const recent = history.slice(-3);
    if (!recent.length) {
      this.text('提交猜测后，这里会自动整理每轮线索', 595, 403, 460, 44, 23, '#7C5D3B');
    } else {
      const chipW = recent.length === 1 ? 230 : recent.length === 2 ? 214 : 150;
      const gap = 10;
      const startX = 360 + (472 - (recent.length * chipW + (recent.length - 1) * gap)) / 2 + chipW / 2;
      recent.forEach((h, i) => {
        const cx = startX + i * (chipW + gap);
        const hot = h.hits !== null && h.hits >= Math.max(1, size - 1);
        this.boxPanel(cx, 404, chipW, 50, hot ? '#F9E1B5' : '#EFE0BE', hot ? '#C97B2A' : '#CBB07F', 12, 1.6);
        const cl = this.text(`${h.digits ?? '超时'} · ${h.hits ?? '—'}/${size}`, cx, 402, chipW - 10, 42, recent.length === 3 ? 21 : 23, hot ? '#942812' : '#3B2311');
        cl.isBold = true;
      });
    }

    // 3. Interactive Position Elimination & Quick-Pick Matrix (cleanly spaced for 2/3/4 digits)
    const rowStep = size === 4 ? 108 : size === 3 ? 124 : 138;
    const rowH = size === 4 ? 98 : 108;
    const matrixTop = size === 4 ? 506 : size === 3 ? 544 : 590;

    if (result.consistent) {
      result.positions.forEach((position, i) => {
        const y = matrixTop + i * rowStep;
        const pickedDigit = this.picks[i] ?? '';
        const confirmedDigit = position.possible.length === 1 ? position.possible[0] : '';
        this.boxPanel(470, y, 742, rowH, '#F8ECD3', confirmedDigit ? '#4E9A5E' : pickedDigit ? '#D48A30' : '#D4B47E', 14, confirmedDigit || pickedDigit ? 2.2 : 1.6);

        // Left position badge
        this.boxPanel(164, y, 112, 74, '#2C1A0F', '#BE8E44', 12, 1.8);
        const posLbl = this.text(`第 ${i + 1} 位`, 164, confirmedDigit || pickedDigit ? y - 12 : y - 2, 102, 38, 26, '#FFE5A9');
        posLbl.isBold = true;
        if (confirmedDigit) {
          const st = this.text(`已定 ${confirmedDigit}`, 164, y + 18, 102, 26, 18, '#8EE69E');
          st.isBold = true;
        } else if (pickedDigit) {
          const st = this.text(`已选 ${pickedDigit}`, 164, y + 18, 102, 26, 18, '#FFD472');
          st.isBold = true;
        }

        // 10 interactive digit tiles (0..9)
        for (let d = 0; d < 10; d++) {
          const ch = String(d);
          const x = 259 + d * 60;
          const excluded = position.excluded.includes(ch);
          const confirmed = confirmedDigit === ch;
          const selected = !confirmed && pickedDigit === ch;
          const fill = confirmed ? '#D7F1D8' : selected ? '#FFE18A' : excluded ? '#EBD5C8' : '#FFF7E6';
          const border = confirmed ? '#2E8747' : selected ? '#C95A10' : excluded ? '#CFA796' : '#C9A46E';
          const tile = this.boxPanel(x, y, 53, 80, fill, border, 9, selected || confirmed ? 2.8 : 1.5);
          const dLbl = this.text(ch, x, excluded || confirmed || selected ? y - 12 : y - 2, 46, 46, 33, confirmed ? '#155427' : selected ? '#8E250B' : excluded ? '#9D7B6C' : '#311A0A');
          dLbl.isBold = true;
          if (confirmed) {
            const m = this.text('✓', x, y + 21, 46, 28, 22, '#17662E'); m.isBold = true;
          } else if (selected) {
            const m = this.text('●', x, y + 21, 46, 26, 16, '#C95A10'); m.isBold = true;
          } else if (excluded) {
            this.text('×', x, y + 21, 46, 28, 22, '#B34338');
          }

          this.touch(tile, `pick-${i}-${d}`, () => {
            if (excluded) {
              this.clueHint = `第 ${i + 1} 位的 ${ch} 已排除，可点击其余空白候选位快速组牌`;
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
      this.text('当前记录不一致，请等待同步后查看逐位排除', 470, 660, 680, 80, 30, '#7C5D3B');
    }

    // 4. Crisp 1-line legend
    const legendY = matrixTop + (size - 1) * rowStep + Math.round(rowH / 2) + 38;
    this.text('✓ 已确定   ·   ● 已选入组牌   ·   空白 点击可选   ·   × 已排除', 470, legendY, 740, 38, 22, '#6A4C2E');

    // 5. Quick-Input Composer Panel (click possible digits above -> instant fill into guess!)
    const composerY = 1106;
    const composed = composeQuickDraft(history, size, this.picks);
    const canInput = !room
      ? !!this.practice && !this.practice.solved
      : ['playing', 'reply'].includes(room.phase) && room.current === me && this.context.now >= room.startAt && this.context.now < room.deadline;

    this.boxPanel(470, composerY, 742, 168, '#F4E1BA', '#C69143', 18, 2.4);
    const compTitle = this.text('快速组牌', 176, composerY - 34, 124, 36, 26, '#3D200A');
    compTitle.isBold = true;

    // Mini action chip: Smart Fill (智能补全)
    const fillChip = this.boxPanel(176, composerY + 24, 108, 42, '#EFE0BE', '#B88944', 10, 1.5);
    const fillChipLbl = this.text('智能补全', 176, composerY + 22, 102, 34, 20, '#5A3514');
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

    // Live preview card slots
    const slotW = size === 4 ? 72 : size === 3 ? 82 : 92;
    const slotH = Math.round(slotW * 1.24);
    const slotGap = size === 4 ? 12 : 18;
    const slotsCenterX = 418;
    for (let i = 0; i < size; i++) {
      const sx = slotsCenterX + (i - (size - 1) / 2) * (slotW + slotGap);
      const ch = this.picks[i] ?? '';
      const confirmed = result.consistent && result.positions[i]?.possible.length === 1 && result.positions[i].possible[0] === ch;
      const slotNode = this.boxPanel(sx, composerY - 8, slotW, slotH, ch ? '#FFF8E8' : '#EED9B0', confirmed ? '#2E8747' : ch ? '#C96A1B' : '#C4A26F', 10, ch ? 2.4 : 1.5);
      if (ch) {
        const artFrame = this.context.cardDigits?.[confirmed ? 'ink' : 'crimson'].get(ch);
        if (artFrame) {
          const h = Math.round(slotH * 0.72);
          const dn = new Node('ComposerDigit-' + ch);
          dn.layer = Layers.Enum.UI_2D; slotNode.addChild(dn); dn.setPosition(0, 0);
          const sp = dn.addComponent(Sprite); sp.spriteFrame = artFrame; sp.sizeMode = Sprite.SizeMode.CUSTOM;
          dn.getComponent(UITransform)!.setContentSize(Math.round(h * (144 / 180)), h);
        } else {
          const l = this.text(ch, sx, composerY - 10, slotW - 8, slotH - 8, 44, confirmed ? '#155427' : '#8E250B');
          l.isBold = true;
        }
        if (!confirmed) {
          this.touch(slotNode, `clear-slot-${i}`, () => { this.picks[i] = ''; this.clueHint = ''; this.refresh(); });
        }
      } else {
        this.text(`第${i + 1}位`, sx, composerY - 10, slotW - 6, 36, 18, '#9A7D56');
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
      this.text('点上方数字即可填入对应位', slotsCenterX, composerY + 56, 320, 32, 19, '#7B5B38');
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
    const ctaBtn = this.boxPanel(722, composerY - 2, 190, 86, canFill ? '#C84218' : '#B9A389', canFill ? '#F0BE62' : '#9B8770', 14, 2.4);
    const ctaLbl = this.text(ctaText, 722, composerY - 4, 178, 54, composed.completed ? 26 : 27, canFill ? '#FFF6DF' : '#6A5B4B');
    ctaLbl.isBold = true;
    this.touch(ctaBtn, 'quick-fill', () => {
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
      } else if (this.practice) {
        this.draft = composed.digits;
        this.slot = -1;
        this.message = msg;
        this.go('practice');
      }
    }, canFill);

    // Inline feedback / note underneath composer
    const noteText = this.clueHint
      || (!composed.consistent && composed.pickedCount > 0
        ? '提示：当前自选组合与历史线索存在冲突，可点「智能补全」或微调'
        : '注：可能数字受多条线索联动约束，并非每位可任意组合');
    this.text(noteText, 470, 1244, 730, 52, 22, !composed.consistent && composed.pickedCount > 0 ? '#A22A16' : '#735434');

    // 6. Redesigned spotless bottom return button
    this.fixed('return', '返回猜测', 470, 1492, 472, () => this.back());
  }
  private history(history:Clue[],size:DigitCount) {
    const pages=Math.max(1,Math.ceil(history.length/3));this.recordPage=this.recordPage<0?pages-1:Math.min(this.recordPage,pages-1);
    const selected=this.selected<0?history.length-1:Math.min(this.selected,history.length-1);
    const baseline=this.baseline<0?selected-1:Math.min(this.baseline,history.length-1);
    this.text(`我的猜测 · 共 ${history.length} 条`,470,425,700,80,39);
    if(!history.length)this.text('还没有记录，先提交一次猜测。',470,650,700,100,34);
    history.slice(this.recordPage*3,this.recordPage*3+3).forEach((h,i)=>{
      const index=this.recordPage*3+i,y=535+i*122;
      const row=this.art('answer',475,y,735,112);
      if(index===selected)row.getComponent(Sprite)!.color=new Color('#FFE193');
      this.touch(row,'record-'+index,()=>{this.selected=index;this.refresh();});
      this.text(`第 ${index+1} 次`,208,y,160,70,32);
      if(h.digits)this.cards(h.digits,455,y,61);else this.text('超时',455,y,300,70,32);
      this.text(h.hits===null?'—':`${h.hits}/${size}`,690,y,110,70,38);
      this.text(index===selected?'已选':index===baseline?'对照':'',793,y,80,60,25);
    });
    if (pages > 1) {
      const move = (page: number, index = page * 3) => {
        this.recordPage = page; this.selected = index; this.refresh();
      };
      this.button('上一页',235,892,190,()=>move(this.recordPage-1),this.recordPage>0,80);
      this.button(`${this.recordPage+1}/${pages} · 回最新`,470,892,230,()=>move(pages-1,history.length-1),true,80).name='LearningControl-回到最新';
      this.button('下一页',705,892,190,()=>move(this.recordPage+1),this.recordPage+1<pages,80);
    } else this.text(history.length?'点击记录选择，再设为对照':'猜测后即可在这里查看和对比记录',470,892,700,65,29);
    const item=history[selected],before=history[baseline];
    const caption=item?baseline===selected&&this.baseline>=0?`已将第 ${selected+1} 次设为对照。\n再点击另一条记录，查看变化。`:before&&baseline!==selected?compareClues(before,item):clueCaption(item):'点击记录选择，再设为对照，可比较任意两次猜测。';
    this.art('answer',470,1110,735,320);
    if(item?.digits&&before?.digits&&baseline!==selected){
      const changed=Array.from(item.digits).map((digit,i)=>digit!==before.digits![i]?i:-1).filter(i=>i>=0);
      if(changed.length===1){
        const position=changed[0];
        this.art('banner',470,990,415,70);
        this.text(`只改了第 ${position+1} 位`,470,990,380,60,34,'#FFE5A9');
        this.text(`第 ${baseline+1} 次`,210,1090,130,60,26);
        this.cards(before.digits[position],320,1090,67);
        this.text('→',410,1090,70,70,42);
        this.cards(item.digits[position],500,1090,67);
        this.text(`命中数变化\n${before.hits} → ${item.hits}`,700,1090,225,110,34);
      }else{
        this.text(`第 ${baseline+1} 次  ${before.digits}    →    第 ${selected+1} 次  ${item.digits}`,470,1015,670,70,32);
        this.text(`命中数 ${before.hits} → ${item.hits}`,470,1090,650,70,37);
      }
    }
    this.text(caption,470,item?.digits&&before?.digits&&baseline!==selected?1200:1110,650,135,32);
    this.fixed('baseline','设为对照',285,1500,360,()=>{this.baseline=selected;this.refresh();},!!item?.digits);
    const room=this.context.room;
    const canCopy=!room?!this.practice?.solved:['playing','reply'].includes(room.phase)&&room.current===this.context.me&&this.context.now>=room.startAt&&this.context.now<room.deadline;
    const copyHint = !item?.digits ? (history.length?'超时记录没有数字，无法复制':'先提交一次猜测，再选择记录')
      : !canCopy ? (!room?'本局已破解，可返回开始新练习':'轮到你行动时可复制记录')
      : `已选第 ${selected+1} 次 · 复制后可修改任意一位`;
    this.text(copyHint,470,1302,700,50,28);
    this.fixed('copy','复制后修改',677,1500,383,()=>{
      if(!item?.digits)return;
      if(room)this.context.copy(item.digits);
      else {this.draft=item.digits;this.slot=-1;this.go('practice');}
    },!!item?.digits&&canCopy);
  }
}
