import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestStepsText,
  buildBattleShareText,
  emptyCareerStats,
  parseCareerStats,
  recordDailySolved,
  recordMatchOutcome,
  serializeCareerStats,
  winRateText,
} from '../assets/scripts/shared/career-stats';
import type { RoomView } from '../assets/scripts/shared/protocol';

function finishedRoom(id: string, winner: string | null, guesses: number, digitCount: 2 | 3 | 4 = 4): RoomView {
  return {
    id,
    mode: 'public',
    phase: 'finished',
    players: [
      { id: 'me', name: '我', avatar: 0, ready: true, online: true },
      { id: 'opp', name: '对手', avatar: 1, ready: true, online: true },
    ],
    version: 10,
    round: guesses,
    turn: guesses * 2,
    current: 'me',
    first: 'me',
    digitCount,
    deadline: 0,
    startAt: 1000,
    endedAt: 61000,
    history: Array.from({ length: guesses }, (_, i) => ({
      playerId: 'me',
      turn: i * 2,
      digits: '1234'.slice(0, digitCount),
      hits: i === guesses - 1 && winner === 'me' ? digitCount : 1,
    })),
    result: { winner, reason: winner ? 'cracked' : 'same_round' },
    rematch: [],
  };
}

test('recordMatchOutcome tracks wins, streaks, best steps, and deduplicates by room id', () => {
  let stats = emptyCareerStats();
  assert.equal(winRateText(stats), '—');
  assert.equal(bestStepsText(stats), '—');

  const r1 = recordMatchOutcome(stats, finishedRoom('room-1', 'me', 6, 4), 'me');
  assert.equal(r1.changed, true);
  stats = r1.stats;
  assert.equal(stats.totalGames, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.bestStreak, 1);
  assert.equal(stats.bestStepsByMode[4], 6);

  // Re-recording the same room must be a no-op.
  const dup = recordMatchOutcome(stats, finishedRoom('room-1', 'me', 6, 4), 'me');
  assert.equal(dup.changed, false);
  assert.equal(dup.stats.totalGames, 1);

  // Second faster win improves best steps & extends streak.
  stats = recordMatchOutcome(stats, finishedRoom('room-2', 'me', 4, 4), 'me').stats;
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.bestStreak, 2);
  assert.equal(stats.bestStepsByMode[4], 4);
  assert.equal(bestStepsText(stats), '4步');
  assert.equal(winRateText(stats), '100%');

  // Loss resets currentStreak but preserves bestStreak.
  stats = recordMatchOutcome(stats, finishedRoom('room-3', 'opp', 5, 4), 'me').stats;
  assert.equal(stats.totalGames, 3);
  assert.equal(stats.losses, 1);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.bestStreak, 2);
  assert.equal(winRateText(stats), '67%');

  // Round-trip serialization preserves all fields cleanly.
  const restored = parseCareerStats(serializeCareerStats(stats));
  assert.deepEqual(restored, stats);
});

test('recordDailySolved increments consecutive day streaks and resets across gaps', () => {
  let stats = emptyCareerStats();
  const d1 = recordDailySolved(stats, '2026-11-26');
  assert.equal(d1.changed, true);
  stats = d1.stats;
  assert.equal(stats.dailySolvedCount, 1);
  assert.equal(stats.dailyStreak, 1);

  // Same day does not double-count.
  assert.equal(recordDailySolved(stats, '2026-11-26').changed, false);

  // Consecutive next day extends streak.
  stats = recordDailySolved(stats, '2026-11-27').stats;
  assert.equal(stats.dailySolvedCount, 2);
  assert.equal(stats.dailyStreak, 2);

  // Skipping a day resets dailyStreak back to 1.
  stats = recordDailySolved(stats, '2026-11-30').stats;
  assert.equal(stats.dailySolvedCount, 3);
  assert.equal(stats.dailyStreak, 1);
});

test('buildBattleShareText generates spoiler-free recaps for win, draw, and loss', () => {
  const winMsg = buildBattleShareText(finishedRoom('r1', 'me', 4, 4), 'me');
  assert.match(winMsg, /4 步/);
  assert.match(winMsg, /4 位/);

  const drawMsg = buildBattleShareText(finishedRoom('r2', null, 5, 3), 'me');
  assert.match(drawMsg, /平局/);
});
