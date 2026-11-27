import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyShareText,
  dailyCipherForDate,
  dailyDateKey,
  loadDailyProgress,
  submitDailyGuess,
} from '../assets/scripts/shared/daily-challenge';

test('dailyCipherForDate is deterministic per calendar date and avoids trivial 4-same digits', () => {
  const c1 = dailyCipherForDate('2026-11-27');
  const c2 = dailyCipherForDate('2026-11-27');
  const c3 = dailyCipherForDate('2026-11-28');
  assert.equal(c1, c2);
  assert.match(c1, /^\d{4}$/);
  assert.notEqual(c1, c3);

  for (let day = 1; day <= 30; day++) {
    const key = `2026-11-${String(day).padStart(2, '0')}`;
    const cipher = dailyCipherForDate(key);
    assert.match(cipher, /^\d{4}$/);
    assert.ok(new Set(cipher).size >= 2, `Expected non-trivial cipher for ${key}, got ${cipher}`);
  }
});

test('submitDailyGuess validates input, scores accurately, persists state, and builds spoiler-free share card', () => {
  const key = dailyDateKey(new Date(2026, 10, 27, 12, 0, 0).getTime());
  assert.equal(key, '2026-11-27');
  const answer = dailyCipherForDate(key);
  let prog = loadDailyProgress('', key, 1000);

  // Invalid length
  assert.ok(submitDailyGuess(prog, '12', 1100).error);

  // Wrong guess (flip every digit by +1 mod 10 => guaranteed 0/4)
  const wrong = Array.from(answer, d => String((Number(d) + 1) % 10)).join('');
  const step1 = submitDailyGuess(prog, wrong, 2000);
  assert.equal(step1.error, undefined);
  assert.equal(step1.hits, 0);
  assert.equal(step1.progress.solved, false);
  prog = step1.progress;

  // Duplicate guess rejected
  assert.ok(submitDailyGuess(prog, wrong, 2500).error);

  // Exact answer solves the daily puzzle
  const step2 = submitDailyGuess(prog, answer, 5000);
  assert.equal(step2.hits, 4);
  assert.equal(step2.progress.solved, true);
  assert.equal(step2.progress.endedAt, 5000);
  prog = step2.progress;

  // Reloading same day restores progress; next day resets cleanly
  assert.equal(loadDailyProgress(JSON.stringify(prog), key, 6000).solved, true);
  assert.equal(loadDailyProgress(JSON.stringify(prog), '2026-11-28', 6000).history.length, 0);

  // Share text is spoiler-free (never leaks the actual 4-digit answer!)
  const share = buildDailyShareText(prog, 3);
  assert.match(share, /2026-11-27/);
  assert.match(share, /2 步破译/);
  assert.match(share, /连续打卡 3 天/);
  assert.match(share, /🟩🟩🟩🟩 4\/4/);
  assert.ok(!share.includes(answer), 'Share card must never leak the daily cipher');
});
