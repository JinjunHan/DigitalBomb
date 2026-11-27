import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hitTier,
  hitBadgePalette,
  guessInsight,
  opponentProgress,
  formatMatchDuration,
} from '../assets/scripts/shared/battle-feedback';
import type { Guess } from '../assets/scripts/shared/protocol';

test('hitTier classifies 2, 3, and 4 digit matches cleanly across all tiers', () => {
  assert.equal(hitTier(null, 4), 'timeout');
  assert.equal(hitTier(0, 4), 'zero');
  assert.equal(hitTier(1, 4), 'low');
  assert.equal(hitTier(2, 4), 'warm');
  assert.equal(hitTier(3, 4), 'hot');
  assert.equal(hitTier(4, 4), 'crack');
  assert.equal(hitTier(1, 2), 'hot');
  assert.equal(hitTier(2, 2), 'crack');
  assert.equal(hitTier(2, 3), 'hot');
  assert.notEqual(hitBadgePalette(0, 4).bg, hitBadgePalette(3, 4).bg);
  assert.notEqual(hitBadgePalette(2, 4).bg, hitBadgePalette(4, 4).bg);
});

test('guessInsight surfaces single-digit deduction breakthroughs and best-hit deltas from public history only', () => {
  const history: Guess[] = [
    { playerId: 'me', turn: 0, digits: '9999', hits: 0 },
    { playerId: 'peer', turn: 1, digits: '1234', hits: 1 },
    { playerId: 'me', turn: 2, digits: '0999', hits: 1 },
  ];
  const probeUp = guessInsight(history, 'me', 4)!;
  assert.equal(probeUp.deltaBest, 1);
  assert.equal(probeUp.deltaLabel, '+1 ↑');
  assert.equal(probeUp.deductionHighlight, true);
  assert.match(probeUp.caption, /第 1 位.*确认是 0/);

  const probeDown = guessInsight([
    ...history,
    { playerId: 'me', turn: 4, digits: '5999', hits: 0 },
  ], 'me', 4)!;
  assert.equal(probeDown.deductionHighlight, true);
  assert.match(probeDown.caption, /第 1 位.*0 正确/);

  const hot = guessInsight([
    { playerId: 'me', turn: 0, digits: '0000', hits: 1 },
    { playerId: 'me', turn: 2, digits: '0129', hits: 3 },
  ], 'me', 4)!;
  assert.equal(hot.tier, 'hot');
  assert.equal(hot.deltaBest, 2);
  assert.equal(hot.deltaLabel, '+2 ↑');
  assert.equal(hot.headline, '只差 1 位！');

  const crack = guessInsight([
    { playerId: 'me', turn: 0, digits: '0123', hits: 4 },
  ], 'me', 4)!;
  assert.equal(crack.tier, 'crack');
  assert.equal(crack.headline, '全部命中！');
});

test('opponentProgress tracks attempts, best hits, and match-point urgency', () => {
  assert.equal(opponentProgress([], 'me', 4).attempts, 0);
  const mid = opponentProgress([
    { playerId: 'me', turn: 0, digits: '0123', hits: 3 },
    { playerId: 'peer', turn: 1, digits: '9999', hits: 1 },
    { playerId: 'peer', turn: 3, digits: '1199', hits: 2 },
  ], 'me', 4);
  assert.equal(mid.attempts, 2);
  assert.equal(mid.bestHits, 2);
  assert.equal(mid.urgent, false);
  assert.match(mid.label, /最高 2\/4/);

  const urgent = opponentProgress([
    { playerId: 'peer', turn: 1, digits: '1129', hits: 3 },
  ], 'me', 4);
  assert.equal(urgent.urgent, true);
  assert.equal(urgent.cracked, false);
  assert.match(urgent.label, /逼近 3\/4/);

  const cracked = opponentProgress([
    { playerId: 'peer', turn: 1, digits: '1122', hits: 4 },
  ], 'me', 4);
  assert.equal(cracked.cracked, true);
});

test('formatMatchDuration formats valid elapsed intervals and rejects missing/invalid timestamps', () => {
  assert.equal(formatMatchDuration(undefined, 5000), undefined);
  assert.equal(formatMatchDuration(5000, undefined), undefined);
  assert.equal(formatMatchDuration(5000, 4000), undefined);
  assert.equal(formatMatchDuration(1000, 1000), '00:01');
  assert.equal(formatMatchDuration(1000, 1000 + 83000), '01:23');
  assert.equal(formatMatchDuration(1000, 1000 + 266000), '04:26');
});
