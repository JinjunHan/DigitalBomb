import { countHits, type Clue } from './deduction';

export interface DailyProgress {
  dateKey: string;
  history: Clue[];
  solved: boolean;
  startedAt: number;
  endedAt?: number;
}

/** Local calendar date key YYYY-MM-DD so players share one daily puzzle per day. */
export function dailyDateKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Deterministic 4-digit cipher from a calendar date key (avoids trivial 4-identical-digit puzzles). */
export function dailyCipherForDate(dateKey: string): string {
  let h = 2166136261 >>> 0;
  const seed = `digital-bomb-daily-v1:${dateKey}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const next = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(Math.floor(next() * 10000)).padStart(4, '0');
    if (new Set(code).size >= 2) return code;
  }
  return '4072';
}

export function loadDailyProgress(raw: string, dateKey: string, nowMs: number): DailyProgress {
  const fresh: DailyProgress = { dateKey, history: [], solved: false, startedAt: nowMs };
  if (!raw) return fresh;
  try {
    const parsed = JSON.parse(raw) as Partial<DailyProgress>;
    if (!parsed || parsed.dateKey !== dateKey || !Array.isArray(parsed.history)) return fresh;
    const history: Clue[] = parsed.history
      .filter((item): item is Clue => !!item && typeof item.digits === 'string' && /^\d{4}$/.test(item.digits) && typeof item.hits === 'number')
      .map(item => ({ digits: item.digits, hits: item.hits }));
    return {
      dateKey,
      history,
      solved: parsed.solved === true || history.some(h => h.hits === 4),
      startedAt: typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt) ? parsed.startedAt : nowMs,
      endedAt: typeof parsed.endedAt === 'number' && Number.isFinite(parsed.endedAt) ? parsed.endedAt : undefined,
    };
  } catch {
    return fresh;
  }
}

export function submitDailyGuess(
  current: DailyProgress,
  digits: string,
  nowMs: number,
): { progress: DailyProgress; hits?: number; error?: string } {
  if (current.solved) return { progress: current, error: '今日暗号已破译，明天再来挑战新题' };
  if (!/^\d{4}$/.test(digits)) return { progress: current, error: '请输入完整的 4 位数字' };
  if (current.history.some(h => h.digits === digits)) {
    return { progress: current, error: '这组数字已经猜过，换一组试试' };
  }
  const answer = dailyCipherForDate(current.dateKey);
  const hits = countHits(answer, digits);
  const solved = hits === 4;
  const startedAt = current.history.length === 0 ? nowMs : current.startedAt;
  const progress: DailyProgress = {
    dateKey: current.dateKey,
    history: [...current.history, { digits, hits }],
    solved,
    startedAt,
    endedAt: solved ? nowMs : current.endedAt,
  };
  return { progress, hits };
}

export function buildDailyShareText(progress: DailyProgress, streak: number): string {
  const rows = progress.history.slice(-8).map(h => {
    const hits = Math.max(0, Math.min(4, h.hits ?? 0));
    return `${'🟩'.repeat(hits)}${'⬜'.repeat(4 - hits)} ${hits}/4`;
  });
  const head = `🔐 猜数字暗号 · 每日一题 ${progress.dateKey}`;
  const summary = progress.solved
    ? `${progress.history.length} 步破译${streak > 1 ? ` · 连续打卡 ${streak} 天` : ''}`
    : `已推理 ${progress.history.length} 步，挑战进行中`;
  return [head, summary, ...rows, '来试试今天的 4 位暗号！'].join('\n');
}
