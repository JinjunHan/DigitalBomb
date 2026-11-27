import { clueCaption, type DigitCount } from './deduction';
import type { Guess } from './protocol';

export type HitTier = 'timeout' | 'zero' | 'low' | 'warm' | 'hot' | 'crack';

export interface HitBadgePalette {
  bg: string;
  border: string;
  text: string;
}

export interface GuessInsight {
  tier: HitTier;
  hits: number | null;
  deltaBest: number;
  deltaLabel: string;
  headline: string;
  caption: string;
  deductionHighlight: boolean;
}

export interface OpponentProgress {
  attempts: number;
  bestHits: number;
  urgent: boolean;
  cracked: boolean;
  label: string;
}

export function hitTier(hits: number | null, digitCount: DigitCount = 4): HitTier {
  if (hits === null) return 'timeout';
  if (hits <= 0) return 'zero';
  if (hits >= digitCount) return 'crack';
  if (hits === digitCount - 1) return 'hot';
  if (hits >= Math.ceil(digitCount / 2)) return 'warm';
  return 'low';
}

const BADGE_PALETTES: Record<HitTier, HitBadgePalette> = {
  timeout: { bg: '#6E6256', border: '#9E9080', text: '#F4E9D6' },
  zero: { bg: '#32525E', border: '#75A3B2', text: '#E7F5F8' },
  low: { bg: '#7A4C23', border: '#BC8A4D', text: '#FFF1D2' },
  warm: { bg: '#BA6518', border: '#F2BC5E', text: '#FFF9E5' },
  hot: { bg: '#B42A1B', border: '#FFD36B', text: '#FFF8E1' },
  crack: { bg: '#D69416', border: '#FFF0A6', text: '#2C1304' },
};

export function hitBadgePalette(hits: number | null, digitCount: DigitCount = 4): HitBadgePalette {
  return BADGE_PALETTES[hitTier(hits, digitCount)];
}

/** Pure deduction insight using ONLY the player's own public guess history, never opponent secrets. */
export function guessInsight(history: readonly Guess[], meId: string, digitCount: DigitCount = 4): GuessInsight | undefined {
  const mine = history.filter(h => h.playerId === meId);
  if (!mine.length) return undefined;
  const latest = mine[mine.length - 1];
  const tier = hitTier(latest.hits, digitCount);
  if (latest.digits === null || latest.hits === null) {
    return { tier: 'timeout', hits: null, deltaBest: 0, deltaLabel: '', headline: '本回合超时', caption: '超时不产生线索', deductionHighlight: false };
  }

  const priorValid = mine.slice(0, -1).filter(h => h.digits !== null && h.hits !== null);
  const previousBest = priorValid.length ? Math.max(...priorValid.map(h => h.hits!)) : -1;
  const deltaBest = previousBest >= 0 && latest.hits > previousBest ? latest.hits - previousBest : 0;
  const deltaLabel = deltaBest > 0 ? `+${deltaBest} ↑` : latest.hits === digitCount ? '破解!' : '';

  let headline = '我的猜测';
  if (tier === 'crack') headline = '全部命中！';
  else if (tier === 'hot') headline = '只差 1 位！';
  else if (tier === 'zero') headline = '全位排除';
  else if (deltaBest > 0) headline = '命中提升！';

  // Detect a clean single-position probe against the immediately preceding valid guess.
  const prev = priorValid.length ? priorValid[priorValid.length - 1] : undefined;
  if (prev?.digits && prev.hits !== null && prev.digits.length === latest.digits.length && tier !== 'crack') {
    const changed = Array.from(latest.digits).flatMap((d, i) => d !== prev.digits![i] ? [i] : []);
    if (changed.length === 1) {
      const pos = changed[0];
      const delta = latest.hits - prev.hits;
      if (delta === 1) {
        return {
          tier, hits: latest.hits, deltaBest, deltaLabel, headline: tier === 'hot' ? '只差 1 位！' : '锁定 1 位！',
          caption: `只改第 ${pos + 1} 位命中 +1 → 确认是 ${latest.digits[pos]}`,
          deductionHighlight: true,
        };
      }
      if (delta === -1) {
        return {
          tier, hits: latest.hits, deltaBest, deltaLabel, headline: '锁定 1 位！',
          caption: `只改第 ${pos + 1} 位命中 -1 → 原数字 ${prev.digits[pos]} 正确`,
          deductionHighlight: true,
        };
      }
      if (delta === 0) {
        return {
          tier, hits: latest.hits, deltaBest, deltaLabel, headline,
          caption: `第 ${pos + 1} 位已排除 ${prev.digits[pos]} 与 ${latest.digits[pos]}`,
          deductionHighlight: true,
        };
      }
    }
  }

  let caption = clueCaption(latest);
  if (tier === 'crack') caption = '等待对手本轮补猜';
  else if (tier === 'hot') caption = '已逼近真相，再改 1 位即可破译！';
  else if (tier === 'zero') caption = `已一次性排除本组 ${digitCount} 个槽位数字`;
  else if (deltaBest > 0) caption = `较历史最佳提升 ${deltaBest} 位，继续逼近！`;

  return { tier, hits: latest.hits, deltaBest, deltaLabel, headline, caption, deductionHighlight: false };
}

/** Public summary of opponent's progress so the player feels the race tension without leaking secrets. */
export function opponentProgress(history: readonly Guess[], meId: string, digitCount: DigitCount = 4): OpponentProgress {
  const theirs = history.filter(h => h.playerId !== meId && h.digits !== null && h.hits !== null);
  const attempts = theirs.length;
  const bestHits = attempts ? Math.max(...theirs.map(h => h.hits!)) : 0;
  const cracked = attempts > 0 && bestHits >= digitCount;
  const urgent = attempts > 0 && bestHits >= digitCount - 1;
  const label = attempts === 0
    ? '等待出牌'
    : cracked
      ? `已破译 ${digitCount}/${digitCount}`
      : urgent
        ? `逼近 ${bestHits}/${digitCount} · 紧迫`
        : `最高 ${bestHits}/${digitCount} · ${attempts}次`;
  return { attempts, bestHits, urgent, cracked, label };
}

export function formatMatchDuration(startAt?: number, endedAt?: number): string | undefined {
  if (!startAt || !endedAt || !Number.isFinite(startAt) || !Number.isFinite(endedAt) || startAt <= 0 || endedAt < startAt) {
    return undefined;
  }
  const seconds = Math.min(5999, Math.max(1, Math.round((endedAt - startAt) / 1000)));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
