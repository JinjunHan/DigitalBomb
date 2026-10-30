import type { DigitCount } from './deduction';
export type MatchMode = 'public' | 'friend';
export const DEFAULT_DIGIT_COUNT: DigitCount = 4;
export function isDigitCount(value: unknown): value is DigitCount { return value === 2 || value === 3 || value === 4; }
/** Missing legacy requests retain four digits; explicitly invalid requests are rejected. */
export function requestedDigitCount(value: unknown): DigitCount {
  if (value === undefined) return DEFAULT_DIGIT_COUNT;
  if (!isDigitCount(value)) throw Error('请选择 2、3 或 4 位模式');
  return value;
}
export function rememberedDigitCount(value: string): DigitCount {
  return value === '2' ? 2 : value === '3' ? 3 : DEFAULT_DIGIT_COUNT;
}
export function modePreferenceKey(userId: string, mode: MatchMode): string { return `digit-count-v1:${userId}:${mode}`; }
export function modeLabel(size: DigitCount): string { return `${size} 位 · ${size === 2 ? '轻松局' : size === 3 ? '标准局' : '挑战局'}`; }
export function validCode(value: unknown, size: DigitCount): value is string {
  return typeof value === 'string' && new RegExp(`^\\d{${size}}$`).test(value);
}
