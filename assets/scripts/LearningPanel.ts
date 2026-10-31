import { BlockInputEvents, Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UIOpacity, UITransform, resources, Texture2D } from 'cc';
import { clueCaption, compareClues, deduce, STANDARD_ROUNDS, STANDARD_TURN_MS, type Clue, type DigitCount } from './shared/deduction';
import { Practice, Tutorial } from './shared/learning';
import type { RoomView } from './shared/protocol';
import { modeLabel, type MatchMode } from './shared/game-mode';

const LEARNING_ART = ["bg-mode", "bg-hub", "bg-practice", "bg-notebook", "back", "title-online", "title-friend", "title-hub", "title-tutorial", "mode-2", "mode-3", "mode-4", "check", "match", "create", "start", "practice-2", "practice-3", "practice-4", "rules", "home", "hint", "key-1", "key-2", "key-3", "key-4", "key-5", "key-6", "key-7", "key-8", "key-9", "key-0", "key-delete", "key-submit", "tab-positions", "tab-history", "baseline", "copy", "return", "card", "answer", "panel", "banner", "subtitle"];

interface Context {
  parent: Node; height: number; top: number; bottom: number;
  paper?: SpriteFrame; button?: SpriteFrame; card?: SpriteFrame;
  room?: RoomView | null; me: string; now: number;
  redraw: () => void; copy: (digits: string) => void; completed: () => void;
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
    resources.load(LEARNING_ART.map(name => 'art/learning-v2/' + name + '/texture'), Texture2D, (error, textures) => {
      if (error) { this.failed = true; this.loading = false; }
      else textures.forEach((texture, i) => { const frame = new SpriteFrame(); frame.texture = texture; if (['answer','subtitle','banner','card'].includes(LEARNING_ART[i])) { const name=LEARNING_ART[i]; const x=name==='answer'?52:name==='card'?12:30; const y=name==='answer'?38:name==='card'?12:22; frame.insetLeft=x; frame.insetRight=x; frame.insetTop=y; frame.insetBottom=y; } this.frames.set(LEARNING_ART[i], frame); });
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
    if (['answer','subtitle','banner','card'].includes(name)) sprite.type = Sprite.Type.SLICED;
    node.getComponent(UITransform)!.setContentSize(w, h); return node;
  }
  private text(value: string, x: number, y: number, w = 700, h = 70, size = 34, color = '#3D1D08') {
    const node = this.node('Learning-' + value.slice(0, 24), x, y, w, h);
    const label = node.addComponent(Label); label.string = value; label.fontSize = size; label.lineHeight = size * 1.3;
    label.color = new Color(color); label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK; label.fontFamily = 'Georgia, Songti SC, serif'; return label;
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
    const shade = blocker.addComponent(Graphics); shade.fillColor = new Color('#112C29');
    shade.rect(-375,-context.height/2,750,context.height); shade.fill();
    this.group = new Node('LearningPanel'); this.group.layer = Layers.Enum.UI_2D; blocker.addChild(this.group);
    this.group.addComponent(UITransform).setContentSize(941,1672);
    // Only the interactive range y=64..1570 must fit the safe area. Decorative
    // scene margins can extend beyond it, retaining the original full-width composition.
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
    const background = this.page === 'menu' ? 'hub' : this.page === 'clues' ? 'notebook' : this.page === 'practice' && !this.practice?.solved ? 'practice' : 'mode';
    const backdrop = this.art('bg-mode',470.5,836,941,1672);
    backdrop.setParent(blocker); backdrop.setPosition(0,0); backdrop.setSiblingIndex(0);
    const cover = Math.max(750/941,context.height/1672); backdrop.setScale(cover,cover,1);
    backdrop.getComponent(Sprite)!.color = new Color('#887C69');
    this.art('bg-'+background,470.5,836,941,1672);
    this.fixed('back','返回',88,114,99,()=>this.back());
    if (this.page === 'mode') this.modeSelection();
    else if (this.page === 'confirmation') this.confirm();
    else if (this.page === 'menu') this.menu();
    else if (this.page === 'rules') this.rules();
    else if (this.page === 'tutorial') this.teach();
    else if (this.page === 'practice') this.training();
    else this.clues();
    if (context.room && ['playing','reply','preparing'].includes(context.room.phase)) {
      this.art('banner',470,1390,720,95);
      this.timer = this.text('',470,1390,670,70,29,'#FFE5A9'); this.update(context.now);
    }
  }
  private heading(value: string, subtitle: string, asset?: string) {
    if (asset) this.art('title-'+asset,474.5,asset==='friend'?285:276,513,asset==='friend'?90:108);
    else this.text(value,470,275,480,100,60,'#FFE5A9');
    this.text(subtitle,470,358,350,55,29,'#FFE5A9');
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
    this.text(friend?'好友加入后使用相同规则':'每回合 60 秒  |  最多 30 轮',470,1220,650,65,33,'#FFE5A9');
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
    this.fixed('start','互动教学 · 学会第一步推理',472,951,532,()=>this.startTutorial());
    for(const [i,size] of ([2,3,4] as const).entries()) this.fixed('practice-'+size,`${size} 位 · ${['入门','进阶','标准'][i]}`,225+i*249,1309,241,()=>this.startPractice(size));
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
      const digit = this.text(digits[i]??'—',cx,y-(selected?12:0),width-8,width*1.2,width*.75,selected?'#A8401B':'#321502');
      digit.node.setParent(node); digit.node.setPosition(0,0);
      if(editable) this.touch(node,'digit-'+i,()=>{
        const target = Math.min(i, this.draft.length);
        this.slot = this.slot === target ? -1 : target; this.message = ''; this.refresh();
      });
    }
  }
  private keyboard(size: DigitCount, practice=false) {
    this.cards(this.draft,practice?395:470,practice?958:820,practice?105:110,true,size);
    for(const [i,key] of ['1','2','3','4','5','6','7','8','9','delete','0','submit'].entries()) {
      this.fixed('key-'+key,key==='delete'?'删除':key==='submit'?'提交':key,260+(i%3)*211,(practice?1154:1020)+Math.floor(i/3)*100,205,()=>this.input(key),key!=='submit'||this.draft.length===size);
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
    this.text(`${practice.size} 位自由练习`,470,227,490,100,58,'#FFE5A9');
    const recent=practice.history.slice(-2);
    if(!recent.length) this.text('先猜一组数字，收集第一条线索\n每位 0～9 · 可重复 · 可 0 开头',470,530,660,160,33);
    recent.forEach((h,i)=>{
      const y=460+i*145;
      this.text(`第 ${practice.history.length-recent.length+i+1} 次`,229,y,145,70,31);
      this.cards(h.digits!,470,y,practice.size===4?65:86);
      this.text(`${h.hits}/${practice.size}`,722,y,120,70,40);
    });
    const caption=recent.length>1?compareClues(recent[0],recent[1]):recent.length?clueCaption(recent[0]):'点击卡牌可单独修改一位';
    this.text(this.message||caption,470,744,670,106,30);
    this.keyboard(practice.size,true);
    this.text(this.slot>=0?(this.slot<this.draft.length?`正在修改第 ${this.slot+1} 位 · 点击键盘替换`:`接着填写第 ${this.slot+1} 位 · 点击键盘输入`):`已输入 ${this.draft.length}/${practice.size} 位 · 点击卡牌可修改`,470,1050,680,40,26);
    this.fixed('hint',`推理提示 · ${practice.history.length} 条记录`,747,970,215,()=>this.go('clues'));
  }
  private clues() {
    const {room,me}=this.context;
    const history:Clue[]=room?room.history.filter(h=>h.playerId===me):this.practice?.history??[];
    const size:DigitCount=room?room.digitCount??4:this.practice?.size??4;
    const left=this.fixed('tab-positions','逐位排除',310,317,350,()=>{this.tab='positions';this.refresh();});
    const right=this.fixed('tab-history','记录与对比',660,317,330,()=>{this.tab='history';this.refresh();});
    (this.tab==='positions'?right:left).getComponent(Sprite)!.color=new Color('#B5A18B');
    if(this.tab==='history') {this.history(history,size);return;}
    const key=JSON.stringify([size,history.map(h=>[h.digits,h.hits])]);
    if(key!==this.cacheKey){this.cacheKey=key;this.cache=deduce(history,size);}
    const result=this.cache;
    const recent=history.slice(-3);
    if(!recent.length)this.text('提交猜测后，这里会自动整理线索',470,435,720,80,33);
    recent.forEach((h,i)=>{this.art('answer',245+i*230,435,215,100);this.text(`${h.digits??'超时'} → ${h.hits??'—'}/${size}`,245+i*230,435,200,75,29);});
    this.art('banner',470,552,580,88);
    this.text(result.consistent?`剩余 ${result.count} 种可能`:'记录不一致，请等待同步',470,552,540,70,40,'#FFE5A9');
    if(result.consistent)result.positions.forEach((position,i)=>{
      const y=680+i*143;
      this.art('answer',477,y,745,127);
      this.art('banner',181,y,145,90);
      this.text(`第 ${i+1} 位`,181,y,135,60,33,'#FFE5A9');
      for(let d=0;d<10;d++){
        const x=290+d*58, excluded=position.excluded.includes(String(d)), confirmed=position.possible.length===1&&!excluded;
        const card=this.art('card',x,y,52,94);card.getComponent(Sprite)!.color=new Color(confirmed?'#75B87B':excluded?'#E6B3A0':'#FFFFFF');
        this.text(String(d),x,y-12,48,55,37,confirmed?'#174A27':'#321502');
        if(excluded||confirmed)this.text(confirmed?'✓':'×',x,y+25,48,40,32,confirmed?'#145526':'#A51D16');
      }
    });
    this.text('✓ 已确定     空白 仍可能     × 已排除',470,1215,730,65,31);
    this.text('可能数字不能任意组合\n仅根据你的猜测反馈推导',470,1290,720,95,29);
    this.fixed('return','返回猜测',474,1500,518,()=>this.back());
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
