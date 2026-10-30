import { BlockInputEvents, Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { clueCaption, compareClues, deduce, STANDARD_ROUNDS, STANDARD_TURN_MS, type Clue, type DigitCount } from './shared/deduction';
import { Practice, Tutorial } from './shared/learning';
import type { RoomView } from './shared/protocol';

interface Context {
  parent: Node; height: number; top: number; bottom: number;
  paper?: SpriteFrame; button?: SpriteFrame; card?: SpriteFrame;
  room?: RoomView | null; me: string; now: number;
  redraw: () => void; copy: (digits: string) => void; completed: () => void;
}
type Page = 'menu' | 'rules' | 'tutorial' | 'practice' | 'clues';
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

  open(page: 'menu' | 'rules' | 'clues' = 'menu') {
    this.visible = true; this.page = page; this.message = '';
    this.tab = 'positions'; this.selected = -1; this.baseline = -1; this.recordPage = 0;
  }
  close() { this.visible = false; this.timer = undefined; }
  private refresh() { this.context.redraw(); }
  private go(page: Page) { this.page = page; this.message = ''; this.refresh(); }
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
    } else if (key === 'delete') { this.draft = this.draft.slice(0, -1); this.slot = -1; }
    else if (/^\d$/.test(key)) {
      if (this.slot >= 0 && this.slot < this.draft.length) {
        this.draft = this.draft.slice(0, this.slot) + key + this.draft.slice(this.slot + 1); this.slot = -1;
      } else if (this.draft.length < size) this.draft += key;
    }
    this.refresh();
  }
  private node(name: string, x: number, y: number, w: number, h: number, parent = this.group) {
    const node = new Node(name); node.layer = Layers.Enum.UI_2D; parent.addChild(node);
    node.setPosition(x - 375, 450 - y); node.addComponent(UITransform).setContentSize(w, h); return node;
  }
  private art(frame: SpriteFrame, x: number, y: number, w: number, h: number) {
    const node = this.node('LearningArt', x, y, w, h);
    const sprite = node.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    node.getComponent(UITransform)!.setContentSize(w, h); return node;
  }
  private text(value: string, x: number, y: number, w = 600, h = 60, size = 25, color = '#352719') {
    const node = this.node('Learning-' + value.slice(0, 16), x, y, w, h);
    const label = node.addComponent(Label); label.string = value; label.fontSize = size; label.lineHeight = size * 1.35;
    label.color = new Color(color); label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK; label.fontFamily = 'Georgia, Songti SC, serif'; return label;
  }
  private button(value: string, x: number, y: number, w: number, action: () => void, enabled = true, h = 60) {
    const node = this.context.button ? this.art(this.context.button, x, y, w, h) : this.node('LearningButton', x, y, w, h);
    this.text(value, x, y, w - 20, h - 8, 24, enabled ? '#352719' : '#877C6C');
    if (!enabled) node.addComponent(UIOpacity).opacity = 120;
    else node.on(Node.EventType.TOUCH_END, action);
    return node;
  }
  render(context: Context) {
    this.context = context; this.timer = undefined; this.timerRoom = context.room ?? undefined;
    const blocker = new Node('LearningBlocker'); blocker.layer = Layers.Enum.UI_2D; context.parent.addChild(blocker);
    blocker.addComponent(UITransform).setContentSize(750, context.height); blocker.addComponent(BlockInputEvents);
    const shade = blocker.addComponent(Graphics); shade.fillColor = new Color(5, 17, 16, 195);
    shade.rect(-375, -context.height / 2, 750, context.height); shade.fill();
    this.group = new Node('LearningPanel'); this.group.layer = Layers.Enum.UI_2D; blocker.addChild(this.group);
    this.group.addComponent(UITransform).setContentSize(750, 900);
    const scale = Math.min(1, (context.height - context.top - context.bottom - 24) / 900);
    this.group.setScale(scale, scale, 1); this.group.setPosition(0, (context.bottom - context.top) / 2);
    if (context.paper) this.art(context.paper, 375, 450, 750, 750 * context.paper.originalSize.height / context.paper.originalSize.width);
    this.button('返回', 140, 106, 120, () => {
      if (this.page === 'clues' && this.practice && !context.room) this.go('practice');
      else if (this.page !== 'menu' && !context.room) this.go('menu');
      else { this.close(); this.refresh(); }
    });
    if (!context.paper || !context.button) {
      this.text('学习素材加载中，请稍候或返回重试', 375, 400, 600, 80, 28, '#FFFFFF'); return;
    }
    if (this.page === 'menu') this.menu();
    else if (this.page === 'rules') this.rules();
    else if (this.page === 'tutorial') this.teach();
    else if (this.page === 'practice') this.training();
    else this.clues();
    if (context.room && ['playing', 'reply', 'preparing'].includes(context.room.phase)) {
      this.timer = this.text('', 375, 795, 590, 36, 22, '#8E351D'); this.update(context.now);
    }
  }
  update(now: number) {
    if (!this.timer?.isValid || !this.timerRoom) return;
    const room = this.timerRoom, seconds = Math.max(0, Math.ceil((room.deadline - now) / 1000));
    const who = room.phase === 'preparing' ? '准备' : room.current === this.context.me ? '你的行动' : '对手行动';
    this.timer.string = `${who}剩余 ${seconds}s · 查看提示不暂停计时`;
  }
  private menu() {
    this.text('新手练习室', 410, 110, 370, 60, 36);
    this.text('先学会推理，再与对手较量', 375, 205, 600, 60, 28);
    this.button('互动教学 · 学会第一步推理', 375, 300, 530, () => this.startTutorial(), true, 84);
    this.text('自由练习 · 不限时 · 不计战绩', 375, 400);
    for (const [i, size] of ([2, 3, 4] as const).entries()) {
      this.button(`${size} 位 · ${['入门', '进阶', '标准'][i]}`, 190 + i * 185, 478, 175, () => this.startPractice(size));
    }
    this.text('每位均为 0～9，可重复、可 0 开头。\n2 位有 100 种组合，逐步挑战到四位。', 375, 578, 570, 90, 24);
    this.button('查看正式对战规则', 375, 680, 480, () => this.go('rules'));
    this.button('先去大厅', 375, 770, 300, () => { this.close(); this.refresh(); });
  }
  private rules() {
    const rounds = this.context.room?.roundLimit ?? STANDARD_ROUNDS;
    const seconds = (this.context.room?.turnMs ?? STANDARD_TURN_MS) / 1000;
    this.text('对战规则', 410, 110, 350, 60, 36);
    this.text('① 各自设置四位密码\n每位 0～9，可以重复、可以 0 开头。', 375, 240, 570, 100, 27);
    this.text('② 轮流猜测对方的密码\n只反馈数字与位置同时正确的数量。\n0 命中不代表这些数字不在密码中。', 375, 400, 570, 135, 27);
    this.text('③ 同一大轮，双方机会相同\n先手猜中，后手仍可补猜一次。\n双方本轮都猜中则平局。', 375, 570, 570, 130, 27);
    this.text(`每回合 ${seconds} 秒，最多 ${rounds} 大轮。\n连续两次自己的行动超时判负。\n低峰时可能匹配自动对手。`, 375, 700, 570, 110, 25);
  }
  private teach() {
    const lesson = this.tutorial;
    this.text(`互动教学 ${Math.min(4, lesson.step + 1)}/4`, 430, 110, 400, 60, 32);
    if (lesson.step < 2) {
      this.text(lesson.step === 0 ? '先输入 1234，看看命中了几位。' : '1234 命中 2 位。\n点击第一张牌改为 9，其余保持不变。', 375, 220, 570, 100, 27);
      this.keyboard(4);
      this.text(this.message || '教学不计时，可以放心尝试。', 375, 770, 570, 70, 23);
    } else if (lesson.step === 2) {
      this.text('1234 → 命中 2 位\n9234 → 命中 1 位', 375, 260, 550, 120, 32);
      this.text('只改第一位，命中减少了 1。\n第一位可以确认是什么？', 375, 420, 570, 100, 28);
      for (const [i, value] of ['1', '9', '还不能判断'].entries()) this.button(value, 190 + i * 185, 560, 175, () => { lesson.answer(value); this.refresh(); });
      this.text(lesson.message || '每次只改一位，可以读懂命中数的变化。', 375, 700, 570, 100);
    } else if (lesson.step === 3) {
      this.text('第一位的 1 已确认！\n再想一想：1234 → 命中 0 位', 375, 260, 570, 120, 29);
      this.text('这个结果告诉我们什么？', 375, 400, 570, 60, 28);
      this.button('密码中没有 1、2、3、4', 375, 500, 560, () => { lesson.answer('absent'); this.refresh(); });
      this.button('这些数字在各自对应位置不正确', 375, 595, 560, () => {
        lesson.answer('position'); if (lesson.complete) this.context.completed(); this.refresh();
      });
      this.text(lesson.message, 375, 730, 570, 100);
    } else {
      this.text('你已学会两种推理方法', 375, 260, 580, 80, 32);
      this.text('只改一位 → 比较两次命中数\n0 位命中 → 排除各自对应的位置\n\n真实对局不会直接标出正确位置，\n可以打开「推理提示」整理已有线索。', 375, 440, 570, 230, 27);
      this.button('从 2 位练习开始', 375, 660, 480, () => this.startPractice(2), true, 80);
      this.button('选择其他练习', 375, 770, 350, () => this.go('menu'));
    }
  }
  private keyboard(size: DigitCount) {
    for (let i = 0; i < size; i++) {
      const x = 375 + (i - (size - 1) / 2) * 100;
      if (this.context.card) this.art(this.context.card, x, 350, 76, 104);
      const digit = this.text(this.draft[i] ?? '—', x, 350, 70, 95, 45, this.slot === i ? '#A8401B' : '#352719');
      digit.node.on(Node.EventType.TOUCH_END, () => { this.slot = i; this.refresh(); });
    }
    for (const [i, key] of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'submit'].entries()) {
      this.button(key === 'delete' ? '删除' : key === 'submit' ? '提交' : key, 210 + i % 3 * 165, 460 + Math.floor(i / 3) * 68, 150, () => this.input(key), key !== 'submit' || this.draft.length === size);
    }
  }
  private training() {
    const practice = this.practice!;
    this.text(`${practice.size} 位自由练习`, 430, 110, 400, 60, 32);
    const last = practice.history[practice.history.length - 1];
    if (practice.solved) {
      this.text(`破解成功：${last.digits}\n用了 ${practice.history.length} 次猜测`, 375, 285, 570, 140, 35);
      this.text('试着回想：哪一次猜测帮你排除了最多可能？', 375, 440, 570, 100, 26);
      this.button('查看推理记录', 375, 560, 480, () => { this.tab = 'history'; this.go('clues'); });
      this.button('再练一次', 375, 660, 480, () => this.startPractice(practice.size));
      this.button(practice.size < 4 ? `挑战 ${practice.size + 1} 位` : '返回练习室', 375, 760, 480, () => practice.size < 4 ? this.startPractice((practice.size + 1) as DigitCount) : this.go('menu'));
      return;
    }
    this.text(last ? `上次 ${last.digits} → 命中 ${last.hits}/${practice.size}\n${clueCaption(last)}` : '不限时 · 每位 0～9 · 允许重复和 0 开头', 375, 225, 580, 100, 24);
    this.keyboard(practice.size);
    this.text(this.message || '点击数字卡可单独修改一位', 375, 720, 570, 42, 22);
    this.button(`推理提示 · ${practice.history.length} 条记录`, 375, 785, 500, () => this.go('clues'));
  }
  private clues() {
    const { room, me } = this.context;
    const history: Clue[] = room ? room.history.filter(h => h.playerId === me) : this.practice?.history ?? [];
    const size: DigitCount = room ? 4 : this.practice?.size ?? 4;
    this.text('我的推理笔记', 430, 110, 400, 60, 32);
    this.button('逐位排除', 235, 180, 260, () => { this.tab = 'positions'; this.refresh(); });
    this.button('记录与对比', 515, 180, 260, () => { this.tab = 'history'; this.refresh(); });
    if (this.tab === 'history') { this.history(history); return; }
    const key = JSON.stringify([size, history.map(h => [h.digits, h.hits])]);
    if (key !== this.cacheKey) { this.cacheKey = key; this.cache = deduce(history, size); }
    const result = this.cache;
    this.text(result.consistent ? `根据全部有效记录，还剩 ${result.count} 种组合` : '记录暂不一致，请等待同步后重试', 375, 250, 590, 65, 25);
    if (!result.consistent) return;
    result.positions.forEach((position, i) => {
      const y = 335 + i * 102;
      this.text(`第 ${i + 1} 位${position.possible.length === 1 ? ' · 已确定' : ''}`, 180, y, 200, 36, 25);
      this.text(`可能：${position.possible.join(' ')}`, 455, y, 390, 38, 24, '#173E3C');
      this.text(`排除：${position.excluded.join(' ') || '暂无'}`, 425, y + 40, 460, 36, 22, '#8E351D');
    });
    this.text('“可能”不代表正确，各位置的可能数字不能任意组合。\n仅根据你的猜测反馈推导，不读取对手密码。', 375, 730, 590, 72, 22);
  }
  private history(history: Clue[]) {
    const pages = Math.max(1, Math.ceil(history.length / 5));
    this.recordPage = Math.min(this.recordPage, pages - 1);
    const selected = this.selected < 0 ? history.length - 1 : Math.min(this.selected, history.length - 1);
    const baseline = this.baseline < 0 ? selected - 1 : Math.min(this.baseline, history.length - 1);
    if (!history.length) this.text('还没有记录，先提交一次猜测。', 375, 350);
    history.slice(this.recordPage * 5, this.recordPage * 5 + 5).forEach((h, i) => {
      const index = this.recordPage * 5 + i;
      this.button(`${index === selected ? '● ' : ''}${index + 1}.  ${h.digits ?? '超时'}    ${h.hits === null ? '无反馈' : `命中 ${h.hits}`} ${index === baseline ? '· 对照' : ''}`, 375, 260 + i * 57, 560, () => { this.selected = index; this.refresh(); }, true, 51);
    });
    this.button('上一页', 180, 555, 160, () => { this.recordPage--; this.refresh(); }, this.recordPage > 0);
    this.text(`${this.recordPage + 1}/${pages}`, 375, 555, 170, 45, 23);
    this.button('下一页', 570, 555, 160, () => { this.recordPage++; this.refresh(); }, this.recordPage + 1 < pages);
    const item = history[selected], before = history[baseline];
    const caption = item ? before && baseline !== selected ? `对照第 ${baseline + 1} 次 → 第 ${selected + 1} 次：${compareClues(before, item)}` : clueCaption(item) : '点击记录选择，再设为对照，可比较任意两次猜测。';
    this.text(caption, 375, 655, 580, 120, 24);
    this.button('设为对照', 230, 735, 240, () => { this.baseline = selected; this.refresh(); }, !!item?.digits);
    const room = this.context.room;
    const canCopy = !room ? !this.practice?.solved : ['playing', 'reply'].includes(room.phase) && room.current === this.context.me && this.context.now >= room.startAt && this.context.now < room.deadline;
    this.button('复制后修改', 515, 735, 260, () => {
      if (!item?.digits) return;
      if (room) this.context.copy(item.digits);
      else { this.draft = item.digits; this.slot = -1; this.go('practice'); }
    }, !!item?.digits && canCopy);
  }
}
