import type { DigitCount } from './deduction';
import type { RoomView } from './protocol';

export interface CareerStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  bestStepsByMode: Partial<Record<DigitCount, number>>;
  recordedRoomIds: string[];
  dailySolvedCount: number;
  dailyStreak: number;
  lastDailyDate: string;
}

export function emptyCareerStats(): CareerStats {
  return {
    totalGames: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
    bestStepsByMode: {},
    recordedRoomIds: [],
    dailySolvedCount: 0,
    dailyStreak: 0,
    lastDailyDate: '',
  };
}

export function parseCareerStats(raw: string): CareerStats {
  const base = emptyCareerStats();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<CareerStats>;
    if (!data || typeof data !== 'object') return base;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    const bestStepsByMode: Partial<Record<DigitCount, number>> = {};
    if (data.bestStepsByMode && typeof data.bestStepsByMode === 'object') {
      for (const size of [2, 3, 4] as const) {
        const val = (data.bestStepsByMode as Record<string, unknown>)[String(size)];
        if (typeof val === 'number' && Number.isFinite(val) && val >= 1) bestStepsByMode[size] = Math.floor(val);
      }
    }
    return {
      totalGames: num(data.totalGames),
      wins: num(data.wins),
      losses: num(data.losses),
      draws: num(data.draws),
      currentStreak: num(data.currentStreak),
      bestStreak: num(data.bestStreak),
      bestStepsByMode,
      recordedRoomIds: Array.isArray(data.recordedRoomIds)
        ? data.recordedRoomIds.filter((id): id is string => typeof id === 'string' && !!id).slice(-64)
        : [],
      dailySolvedCount: num(data.dailySolvedCount),
      dailyStreak: num(data.dailyStreak),
      lastDailyDate: typeof data.lastDailyDate === 'string' ? data.lastDailyDate : '',
    };
  } catch {
    return base;
  }
}

export function serializeCareerStats(stats: CareerStats): string {
  return JSON.stringify(stats);
}

/** Return the previous YYYY-MM-DD calendar date using pure UTC math (immune to DST shifts). */
export function previousDateKey(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function recordMatchOutcome(
  current: CareerStats,
  room: RoomView,
  meId: string,
): { stats: CareerStats; changed: boolean } {
  if (room.phase !== 'finished' || !room.result) return { stats: current, changed: false };
  if (current.recordedRoomIds.includes(room.id)) return { stats: current, changed: false };

  const winner = room.result.winner;
  const win = winner === meId;
  const draw = !winner;
  const count = (room.digitCount ?? 4) as DigitCount;
  const ownGuesses = room.history.filter(h => h.playerId === meId && h.digits !== null).length;

  const nextStreak = win ? current.currentStreak + 1 : 0;
  const bestStepsByMode = { ...current.bestStepsByMode };
  if (win && ownGuesses > 0) {
    const prev = bestStepsByMode[count];
    if (prev === undefined || ownGuesses < prev) bestStepsByMode[count] = ownGuesses;
  }

  return {
    changed: true,
    stats: {
      ...current,
      totalGames: current.totalGames + 1,
      wins: current.wins + (win ? 1 : 0),
      losses: current.losses + (!win && !draw ? 1 : 0),
      draws: current.draws + (draw ? 1 : 0),
      currentStreak: nextStreak,
      bestStreak: Math.max(current.bestStreak, nextStreak),
      bestStepsByMode,
      recordedRoomIds: [...current.recordedRoomIds, room.id].slice(-64),
    },
  };
}

export function recordDailySolved(
  current: CareerStats,
  dateKey: string,
): { stats: CareerStats; changed: boolean } {
  if (!dateKey || current.lastDailyDate === dateKey) return { stats: current, changed: false };
  const consecutive = !!current.lastDailyDate && previousDateKey(dateKey) === current.lastDailyDate;
  return {
    changed: true,
    stats: {
      ...current,
      dailySolvedCount: current.dailySolvedCount + 1,
      dailyStreak: consecutive ? current.dailyStreak + 1 : 1,
      lastDailyDate: dateKey,
    },
  };
}

export function winRateText(stats: CareerStats): string {
  if (stats.totalGames <= 0) return '—';
  return `${Math.round((stats.wins / stats.totalGames) * 100)}%`;
}

export function bestStepsText(stats: CareerStats): string {
  const best4 = stats.bestStepsByMode[4];
  if (best4 !== undefined) return `${best4}步`;
  const values = Object.values(stats.bestStepsByMode).filter((v): v is number => typeof v === 'number');
  if (!values.length) return '—';
  return `${Math.min(...values)}步`;
}

export function buildBattleShareText(room: RoomView, meId: string): string {
  const count = room.digitCount ?? 4;
  const ownGuesses = room.history.filter(h => h.playerId === meId && h.digits !== null).length;
  const winner = room.result?.winner;
  if (winner === meId) {
    return ownGuesses > 0
      ? `我在《猜数字暗号》仅用 ${ownGuesses} 步破译了对手的 ${count} 位暗号，敢来开局较量一下吗？`
      : `我在《猜数字暗号》赢得了一场 ${count} 位暗号对决，敢来挑战吗？`;
  }
  if (!winner) {
    return `我在《猜数字暗号》与对手激战 ${room.round} 轮战成平局，你也来试试 ${count} 位暗号推理！`;
  }
  return `刚在《猜数字暗号》完成一场烧脑 ${count} 位推理对局，来和我比比谁破译更快！`;
}
