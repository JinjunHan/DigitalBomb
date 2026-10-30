export type DigitCount = 2 | 3 | 4;
export interface Clue { digits: string | null; hits: number | null }
export const STANDARD_ROUNDS = 30;
export const STANDARD_TURN_MS = 60000;
export function countHits(a: string, b: string): number {
  return Array.from(a).filter((digit, index) => digit === b[index]).length;
}
/** Input is ONLY the viewer's submitted guesses and feedback, never either secret. */
export function deduce(history: readonly Clue[], size: DigitCount = 4) {
  const clues = history.filter(h => h.digits !== null);
  const possible = Array.from({ length: size }, () => new Set<string>());
  const valid = clues.every(h => new RegExp(`^\\d{${size}}$`).test(h.digits!) && Number.isInteger(h.hits) && h.hits! >= 0 && h.hits! <= size);
  let count = 0;
  if (valid) for (let n = 0; n < 10 ** size; n++) {
    const candidate = String(n).padStart(size, '0');
    if (!clues.every(h => countHits(candidate, h.digits!) === h.hits)) continue;
    count++;
    Array.from(candidate).forEach((digit, i) => possible[i].add(digit));
  }
  return {
    count, consistent: valid && count > 0,
    positions: possible.map(values => ({
      possible: Array.from(values).sort(),
      // Contradictory data must not present every digit as logically excluded.
      excluded: count ? Array.from('0123456789').filter(d => !values.has(d)) : [],
    })),
  };
}
export function compareClues(before: Clue, after: Clue): string {
  if (!before.digits || !after.digits || before.hits === null || after.hits === null) return '超时没有命中反馈，不能用于推理。';
  if (after.hits === after.digits.length) return '本次全部命中，所有位置均已确认。';
  const changed = Array.from(after.digits).flatMap((d, i) => d !== before.digits![i] ? [i] : []);
  if (!changed.length) return '数字与位置完全相同，重复提交不会增加线索。';
  if (changed.length !== 1) return `改动了第 ${changed.map(i => i + 1).join('、')} 位，不能单凭命中变化确定哪一位正确。`;
  const i = changed[0], prefix = `只改第 ${i + 1} 位：${before.digits[i]} → ${after.digits[i]}。`;
  const delta = after.hits - before.hits;
  if (delta === 1) return `${prefix}命中增加 1，确认该位是 ${after.digits[i]}。`;
  if (delta === -1) return `${prefix}命中减少 1，确认该位原来的 ${before.digits[i]} 正确。`;
  if (delta === 0) return `${prefix}命中不变，这两个数字在该位都不正确。`;
  return '反馈不一致，请等待同步后重试。';
}
export function clueCaption(clue: Clue): string {
  if (!clue.digits || clue.hits === null) return '超时不产生线索。';
  if (clue.hits === 0) return '可排除本次每一位所填的数字，不代表密码中没有这些数字。';
  if (clue.hits === clue.digits.length) return '所有数字与位置都正确，密码已破解。';
  return `有 ${clue.hits} 位数字与位置都正确，具体位置仍需结合记录判断。`;
}
