import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DailyLeaderboardStore, serverDailyCipher, serverDateKey } from '../server/daily-leaderboard';
import { Match } from '../server/game';

function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, token TEXT UNIQUE, name TEXT, avatar INTEGER, avatar_url TEXT);
    CREATE TABLE results (id TEXT PRIMARY KEY, payload TEXT, created INTEGER);
  `);
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('u1', 't1', '推理王', 0, null);
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('u2', 't2', '小猫', 2, null);
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run('u3', 't3', '晚风', 1, null);
  return db;
}

test('serverDailyCipher is secret until solved and ranks players by steps then duration', () => {
  let clock = Date.UTC(2026, 10, 27, 4, 0, 0); // 12:00 CST => 2026-11-27
  const dateKey = serverDateKey(clock);
  assert.equal(dateKey, '2026-11-27');

  const db = createDb();
  const store = new DailyLeaderboardStore(db, 'test-salt', () => clock);
  const answer = serverDailyCipher(dateKey, 'test-salt');
  assert.match(answer, /^\d{4}$/);

  // Before solving, answer is strictly hidden
  const initial = store.getDaily('u1', dateKey);
  assert.equal(initial.solved, false);
  assert.equal(initial.answer, undefined);

  // u1 solves in 2 steps (15s)
  const wrong = Array.from(answer, d => String((Number(d) + 1) % 10)).join('');
  const s1 = store.submitDailyGuess('u1', wrong, dateKey);
  assert.equal(s1.hits, 0);
  assert.equal(s1.snapshot.solved, false);
  assert.equal(s1.snapshot.answer, undefined);

  // Duplicate guess rejected
  assert.throws(() => store.submitDailyGuess('u1', wrong, dateKey), /已经猜过/);

  clock += 15000;
  const s2 = store.submitDailyGuess('u1', answer, dateKey);
  assert.equal(s2.hits, 4);
  assert.equal(s2.snapshot.solved, true);
  assert.equal(s2.snapshot.answer, answer);
  assert.equal(s2.snapshot.rank, 1);
  assert.equal(s2.snapshot.dailyStreak, 1);

  // u2 solves in 1 step (faster rank #1!)
  clock += 5000;
  store.submitDailyGuess('u2', answer, dateKey);

  // Leaderboard orders u2 (#1, 1 step) ahead of u1 (#2, 2 steps)
  const lb = store.getLeaderboard('u1', dateKey);
  assert.equal(lb.dailySolverCount, 2);
  assert.equal(lb.daily.length, 2);
  assert.equal(lb.daily[0].userId, 'u2');
  assert.equal(lb.daily[0].steps, 1);
  assert.equal(lb.daily[1].userId, 'u1');
  assert.equal(lb.daily[1].rank, 2);
  assert.equal(lb.daily[1].isMe, true);
  assert.equal(lb.myDaily?.rank, 2);
  db.close();
});

test('DailyLeaderboardStore records finished human matches and builds career leaderboard', () => {
  const db = createDb();
  const now = 1_700_000_000_000;
  const store = new DailyLeaderboardStore(db, 'test-salt', () => now);

  const match = new Match(
    'public',
    [
      { profile: { id: 'u1', name: '推理王', avatar: 0 }, online: true, misses: 0, bot: false },
      { profile: { id: 'bot-1', name: '人机', avatar: 3 }, online: true, misses: 0, bot: true },
    ],
    now,
  );
  match.lock('u1', '1234', now + 100);
  match.lock('bot-1', '5678', now + 200);
  const firstId = match.current;
  if (firstId === 'u1') {
    match.guess('u1', '5678', match.turn, match.startAt + 500);
    match.guess('bot-1', '0000', match.turn, match.startAt + 1000);
  } else {
    match.guess('bot-1', '0000', match.turn, match.startAt + 500);
    match.guess('u1', '5678', match.turn, match.startAt + 1000);
  }
  assert.equal(match.phase, 'finished');
  assert.equal(match.result?.winner, 'u1');

  store.recordMatch(match);
  const lb = store.getLeaderboard('u1', '2026-11-27');
  assert.equal(lb.career.length, 1);
  assert.equal(lb.career[0].userId, 'u1');
  assert.equal(lb.career[0].wins, 1);
  assert.equal(lb.career[0].winRate, 100);
  assert.equal(lb.career[0].bestSteps, 1);
  assert.equal(lb.myStats?.wins, 1);
  assert.equal(lb.myStats?.bestStepsByMode[4], 1);
  db.close();
});
