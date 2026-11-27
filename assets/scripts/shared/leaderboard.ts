import type { Clue, DigitCount } from './deduction';

export interface ServerDailySnapshot {
  dateKey: string;
  digitCount: DigitCount;
  history: Clue[];
  solved: boolean;
  answer?: string;
  startedAt: number;
  endedAt?: number;
  solverCount: number;
  rank?: number;
  beatPercent?: number;
  dailyStreak: number;
  dailySolvedCount: number;
}

export interface DailyRankEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: number;
  avatarUrl?: string;
  steps: number;
  durationMs: number;
  isMe?: boolean;
}

export interface CareerRankEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: number;
  avatarUrl?: string;
  wins: number;
  totalGames: number;
  winRate: number;
  bestStreak: number;
  bestSteps?: number;
  dailySolved: number;
  isMe?: boolean;
}

export interface ServerUserStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  bestStepsByMode: Partial<Record<DigitCount, number>>;
  dailySolvedCount: number;
  dailyStreak: number;
  lastDailyDate: string;
}

export interface LeaderboardSnapshot {
  dateKey: string;
  dailySolverCount: number;
  daily: DailyRankEntry[];
  career: CareerRankEntry[];
  myDaily?: DailyRankEntry;
  myCareer?: CareerRankEntry;
  myStats?: ServerUserStats;
}
