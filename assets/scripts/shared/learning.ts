import { countHits, type Clue, type DigitCount } from './deduction';

export class Practice {
  readonly history: Clue[] = [];
  private readonly answer: string;
  solved = false;
  constructor(readonly size: DigitCount, random = Math.random) {
    this.answer = Array.from({ length: size }, () => String(Math.min(9, Math.max(0, Math.floor(random() * 10))))).join('');
  }
  submit(digits: string): string | undefined {
    if (this.solved) return '本局已破解，请开始新练习。';
    if (!new RegExp(`^\\d{${this.size}}$`).test(digits)) return `请输入 ${this.size} 位数字。`;
    if (this.history.some(h => h.digits === digits)) return '已经猜过这个组合，换一位再试试。';
    const hits = countHits(digits, this.answer);
    this.history.push({ digits, hits }); this.solved = hits === this.size;
  }
}

/** Scripted teaching state: wrong attempts explain the rule without advancing. */
export class Tutorial {
  step = 0;
  message = '';
  readonly history: Clue[] = [];
  submit(digits: string) {
    const expected = this.step === 0 ? '1234' : this.step === 1 ? '9234' : undefined;
    if (!expected) return;
    if (digits !== expected) { this.message = `这一步请${this.step === 1 ? '只改第一位，输入' : '输入'} ${expected}，方便比较结果。`; return; }
    this.history.push({ digits, hits: countHits(digits, '1256') });
    this.step++; this.message = '';
  }
  answer(value: string) {
    if (this.step === 2) {
      if (value !== '1') { this.message = '只有第一位改变，命中却减少 1，所以原来的 1 才正确。'; return; }
      this.step++; this.message = '';
    } else if (this.step === 3) {
      if (value !== 'position') { this.message = '0 命中只排除对应位置；这些数字仍可能出现在其他位置。'; return; }
      this.step++; this.message = '';
    }
  }
  get complete() { return this.step === 4; }
}
