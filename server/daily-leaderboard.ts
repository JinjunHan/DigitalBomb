import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { countHits, type Clue, type DigitCount } from '../assets/scripts/shared/deduction';
import { previousDateKey } from '../assets/scripts/shared/career-stats';
import type { CareerRankEntry, DailyRankEntry, LeaderboardSnapshot, ServerDailySnapshot, ServerUserStats } from '../assets/scripts/shared/leaderboard';
import type { Match } from './game';

/** China Standard Time (UTC+8) calendar date key YYYY-MM-DD so all players reset together at 00:00 CST. */
export function serverDateKey(nowMs = Date.now()): string {
  const cst = new Date(nowMs + 8 * 3600 * 1000);
  return `${cst.getUTCFullYear()}-${String(cst.getUTCMonth() + 1).padStart(2, '0')}-${String(cst.getUTCDate()).padStart(2, '0')}`;
}

/** Server-only deterministic 4-digit daily cipher derived with SHA-256 + private salt (never sent until solved). */
export function serverDailyCipher(dateKey: string, salt: string): string {
  for (let attempt = 0; attempt < 32; attempt++) {
    const digest = createHash('sha256').update(`${salt}:daily-v1:${dateKey}:${attempt}`).digest();
    const num = digest.readUInt32BE(0) % 10000;
    const code = String(num).padStart(4, '0');
    if (new Set(code).size >= 2) return code;
  }
  return '4072';
}

interface StoredResultPayload {
  result?: { winner: string | null; reason: string };
  players?: { id: string; bot: boolean }[];
  digitCount?: number;
  guessesByPlayer?: Record<string, number>;
}

export class DailyLeaderboardStore {
  constructor(
    private db: DatabaseSync,
    private salt = process.env.DAILY_CIPHER_SALT || 'digital-bomb-server-daily-v1',
    private now = () => Date.now(),
  ) {
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_attempts (
        date_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        history TEXT NOT NULL,
        solved INTEGER NOT NULL DEFAULT 0,
        steps INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date_key, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_rank ON daily_attempts (date_key, solved, steps, duration_ms, ended_at);
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        total_games INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        draws INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        best_steps_2 INTEGER,
        best_steps_3 INTEGER,
        best_steps_4 INTEGER,
        daily_solved INTEGER NOT NULL DEFAULT 0,
        daily_streak INTEGER NOT NULL DEFAULT 0,
        last_daily_date TEXT NOT NULL DEFAULT ''
      );
    `);
    this.backfillStatsIfNeeded();
  }

  private backfillStatsIfNeeded() {
    const countRow = this.db.prepare('SELECT COUNT(*) AS c FROM user_stats').get() as { c: number } | undefined;
    if ((countRow?.c ?? 0) > 0) return;
    const rows = this.db.prepare('SELECT payload FROM results ORDER BY created ASC').all() as { payload: string }[];
    if (!rows.length) return;
    const map = new Map<string, { total: number; wins: number; losses: number; draws: number; cur: number; best: number; best2?: number; best3?: number; best4?: number }>();
    for (const row of rows) {
      let data: StoredResultPayload;
      try { data = JSON.parse(row.payload); } catch { continue; }
      if (!data?.result || !Array.isArray(data.players)) continue;
      for (const p of data.players) {
        if (!p?.id || p.bot) continue;
        const st = map.get(p.id) ?? { total: 0, wins: 0, losses: 0, draws: 0, cur: 0, best: 0 };
        const win = data.result.winner === p.id;
        const draw = !data.result.winner;
        st.total++;
        if (win) {
          st.wins++; st.cur++; st.best = Math.max(st.best, st.cur);
          const steps = data.guessesByPlayer?.[p.id];
          if (typeof steps === 'number' && steps > 0) {
            if (data.digitCount === 2) st.best2 = st.best2 ? Math.min(st.best2, steps) : steps;
            else if (data.digitCount === 3) st.best3 = st.best3 ? Math.min(st.best3, steps) : steps;
            else st.best4 = st.best4 ? Math.min(st.best4, steps) : steps;
          }
        } else if (draw) {
          st.draws++; st.cur = 0;
        } else {
          st.losses++; st.cur = 0;
        }
        map.set(p.id, st);
      }
    }
    const upsert = this.db.prepare(`
      INSERT OR IGNORE INTO user_stats (user_id, total_games, wins, losses, draws, current_streak, best_streak, best_steps_2, best_steps_3, best_steps_4)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [id, s] of map) {
      upsert.run(id, s.total, s.wins, s.losses, s.draws, s.cur, s.best, s.best2 ?? null, s.best3 ?? null, s.best4 ?? null);
    }
  }

  private ensureStatsRow(userId: string) {
    this.db.prepare('INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)').run(userId);
  }

  getUserStats(userId: string): ServerUserStats {
    const row = this.db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
    if (!row) {
      return {
        totalGames: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0,
        bestStepsByMode: {}, dailySolvedCount: 0, dailyStreak: 0, lastDailyDate: '',
      };
    }
    const bestStepsByMode: Partial<Record<DigitCount, number>> = {};
    if (typeof row.best_steps_2 === 'number' && row.best_steps_2 > 0) bestStepsByMode[2] = row.best_steps_2;
    if (typeof row.best_steps_3 === 'number' && row.best_steps_3 > 0) bestStepsByMode[3] = row.best_steps_3;
    if (typeof row.best_steps_4 === 'number' && row.best_steps_4 > 0) bestStepsByMode[4] = row.best_steps_4;
    return {
      totalGames: Number(row.total_games ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
      currentStreak: Number(row.current_streak ?? 0),
      bestStreak: Number(row.best_streak ?? 0),
      bestStepsByMode,
      dailySolvedCount: Number(row.daily_solved ?? 0),
      dailyStreak: Number(row.daily_streak ?? 0),
      lastDailyDate: String(row.last_daily_date ?? ''),
    };
  }

  recordMatch(room: Match) {
    if (room.phase !== 'finished' || !room.result) return;
    const digitCount = room.digitCount ?? 4;
    const col = digitCount === 2 ? 'best_steps_2' : digitCount === 3 ? 'best_steps_3' : 'best_steps_4';
    for (const seat of room.seats) {
      if (seat.bot) continue;
      const uid = seat.profile.id;
      this.ensureStatsRow(uid);
      const cur = this.getUserStats(uid);
      const win = room.result.winner === uid;
      const draw = !room.result.winner;
      const ownGuesses = room.history.filter(h => h.playerId === uid && h.digits !== null).length;
      const nextStreak = win ? cur.currentStreak + 1 : 0;
      const bestStreak = Math.max(cur.bestStreak, nextStreak);
      const prevBest = cur.bestStepsByMode[digitCount];
      const nextBest = win && ownGuesses > 0
        ? (prevBest !== undefined ? Math.min(prevBest, ownGuesses) : ownGuesses)
        : (prevBest ?? null);
      this.db.prepare(`
        UPDATE user_stats
        SET total_games = ?, wins = ?, losses = ?, draws = ?, current_streak = ?, best_streak = ?, ${col} = ?
        WHERE user_id = ?
      `).run(
        cur.totalGames + 1,
        cur.wins + (win ? 1 : 0),
        cur.losses + (!win && !draw ? 1 : 0),
        cur.draws + (draw ? 1 : 0),
        nextStreak,
        bestStreak,
        nextBest,
        uid,
      );
    }
  }

  getDaily(userId: string, dateKey = serverDateKey(this.now())): ServerDailySnapshot {
    const attempt = this.db.prepare('SELECT * FROM daily_attempts WHERE date_key = ? AND user_id = ?').get(dateKey, userId) as Record<string, unknown> | undefined;
    const history: Clue[] = attempt ? (() => { try { return JSON.parse(String(attempt.history)); } catch { return []; } })() : [];
    const solved = attempt ? Number(attempt.solved) === 1 : false;
    const startedAt = attempt ? Number(attempt.started_at) : this.now();
    const endedAt = solved && attempt ? Number(attempt.ended_at) || undefined : undefined;
    const solverRow = this.db.prepare('SELECT COUNT(*) AS c FROM daily_attempts WHERE date_key = ? AND solved = 1').get(dateKey) as { c: number } | undefined;
    const solverCount = Number(solverRow?.c ?? 0);
    const stats = this.getUserStats(userId);

    let rank: number | undefined;
    let beatPercent: number | undefined;
    if (solved && attempt) {
      const steps = Number(attempt.steps);
      const durationMs = Number(attempt.duration_ms);
      const endTs = Number(attempt.ended_at);
      const aheadRow = this.db.prepare(`
        SELECT COUNT(*) AS c FROM daily_attempts
        WHERE date_key = ? AND solved = 1 AND (
          steps < ? OR (steps = ? AND duration_ms < ?) OR (steps = ? AND duration_ms = ? AND ended_at < ?)
        )
      `).get(dateKey, steps, steps, durationMs, steps, durationMs, endTs) as { c: number } | undefined;
      rank = Number(aheadRow?.c ?? 0) + 1;
      beatPercent = solverCount <= 1 ? 100 : Math.max(1, Math.min(99, Math.round(((solverCount - rank) / (solverCount - 1)) * 100)));
    }

    return {
      dateKey,
      digitCount: 4,
      history,
      solved,
      answer: solved ? serverDailyCipher(dateKey, this.salt) : undefined,
      startedAt,
      endedAt,
      solverCount,
      rank,
      beatPercent,
      dailyStreak: stats.dailyStreak,
      dailySolvedCount: stats.dailySolvedCount,
    };
  }

  submitDailyGuess(userId: string, digits: string, dateKey = serverDateKey(this.now())): { snapshot: ServerDailySnapshot; hits: number } {
    if (!/^\d{4}$/.test(digits)) throw Error('请输入完整的 4 位数字');
    const now = this.now();
    const existing = this.db.prepare('SELECT * FROM daily_attempts WHERE date_key = ? AND user_id = ?').get(dateKey, userId) as Record<string, unknown> | undefined;
    if (existing && Number(existing.solved) === 1) throw Error('今日暗号已破译，明天再来挑战新题');

    const history: Clue[] = existing ? (() => { try { return JSON.parse(String(existing.history)); } catch { return []; } })() : [];
    if (history.some(h => h.digits === digits)) throw Error('这组数字已经猜过，换一组试试');

    const answer = serverDailyCipher(dateKey, this.salt);
    const hits = countHits(answer, digits);
    const nextHistory: Clue[] = [...history, { digits, hits }];
    const solved = hits === 4;
    const startedAt = existing && history.length > 0 ? Number(existing.started_at) : now;
    const endedAt = solved ? now : 0;
    const durationMs = solved ? Math.max(1000, now - startedAt) : 0;

    this.db.prepare(`
      INSERT INTO daily_attempts (date_key, user_id, history, solved, steps, duration_ms, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date_key, user_id) DO UPDATE SET
        history = excluded.history,
        solved = excluded.solved,
        steps = excluded.steps,
        duration_ms = excluded.duration_ms,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at
    `).run(dateKey, userId, JSON.stringify(nextHistory), solved ? 1 : 0, nextHistory.length, durationMs, startedAt, endedAt);

    if (solved) {
      this.ensureStatsRow(userId);
      const st = this.getUserStats(userId);
      if (st.lastDailyDate !== dateKey) {
        const consecutive = !!st.lastDailyDate && previousDateKey(dateKey) === st.lastDailyDate;
        this.db.prepare(`
          UPDATE user_stats SET daily_solved = ?, daily_streak = ?, last_daily_date = ? WHERE user_id = ?
        `).run(st.dailySolvedCount + 1, consecutive ? st.dailyStreak + 1 : 1, dateKey, userId);
      }
    }

    return { snapshot: this.getDaily(userId, dateKey), hits };
  }

  getLeaderboard(userId?: string, dateKey = serverDateKey(this.now()), limit = 20): LeaderboardSnapshot {
    const dailyRows = this.db.prepare(`
      SELECT a.user_id, a.steps, a.duration_ms, a.ended_at, u.name, u.avatar, u.avatar_url
      FROM daily_attempts a
      JOIN users u ON u.id = a.user_id
      WHERE a.date_key = ? AND a.solved = 1
      ORDER BY a.steps ASC, a.duration_ms ASC, a.ended_at ASC
      LIMIT ?
    `).all(dateKey, limit) as Record<string, unknown>[];

    const daily: DailyRankEntry[] = dailyRows.map((r, i) => ({
      rank: i + 1,
      userId: String(r.user_id),
      name: String(r.name),
      avatar: Number(r.avatar ?? 0),
      avatarUrl: r.avatar_url ? String(r.avatar_url) : undefined,
      steps: Number(r.steps),
      durationMs: Number(r.duration_ms),
      isMe: userId ? String(r.user_id) === userId : false,
    }));

    const solverRow = this.db.prepare('SELECT COUNT(*) AS c FROM daily_attempts WHERE date_key = ? AND solved = 1').get(dateKey) as { c: number } | undefined;
    const dailySolverCount = Number(solverRow?.c ?? 0);

    const careerRows = this.db.prepare(`
      SELECT s.user_id, s.total_games, s.wins, s.best_streak, s.best_steps_2, s.best_steps_3, s.best_steps_4, s.daily_solved,
             u.name, u.avatar, u.avatar_url
      FROM user_stats s
      JOIN users u ON u.id = s.user_id
      WHERE s.wins > 0 OR s.daily_solved > 0
      ORDER BY s.wins DESC, COALESCE(s.best_steps_4, 999) ASC, s.daily_solved DESC, s.total_games DESC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[];

    const pickBestSteps = (r: Record<string, unknown>): number | undefined => {
      if (typeof r.best_steps_4 === 'number' && r.best_steps_4 > 0) return r.best_steps_4;
      const vals = [r.best_steps_3, r.best_steps_2].filter((v): v is number => typeof v === 'number' && v > 0);
      return vals.length ? Math.min(...vals) : undefined;
    };

    const career: CareerRankEntry[] = careerRows.map((r, i) => {
      const totalGames = Number(r.total_games ?? 0);
      const wins = Number(r.wins ?? 0);
      return {
        rank: i + 1,
        userId: String(r.user_id),
        name: String(r.name),
        avatar: Number(r.avatar ?? 0),
        avatarUrl: r.avatar_url ? String(r.avatar_url) : undefined,
        wins,
        totalGames,
        winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
        bestStreak: Number(r.best_streak ?? 0),
        bestSteps: pickBestSteps(r),
        dailySolved: Number(r.daily_solved ?? 0),
        isMe: userId ? String(r.user_id) === userId : false,
      };
    });

    let myDaily: DailyRankEntry | undefined;
    let myCareer: CareerRankEntry | undefined;
    let myStats: ServerUserStats | undefined;

    if (userId) {
      myStats = this.getUserStats(userId);
      const meUser = this.db.prepare('SELECT id, name, avatar, avatar_url FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
      if (meUser) {
        const inDaily = daily.find(e => e.userId === userId);
        if (inDaily) {
          myDaily = inDaily;
        } else {
          const d = this.getDaily(userId, dateKey);
          if (d.solved && d.rank !== undefined) {
            myDaily = {
              rank: d.rank,
              userId,
              name: String(meUser.name),
              avatar: Number(meUser.avatar ?? 0),
              avatarUrl: meUser.avatar_url ? String(meUser.avatar_url) : undefined,
              steps: d.history.length,
              durationMs: d.endedAt ? Math.max(1000, d.endedAt - d.startedAt) : 0,
              isMe: true,
            };
          }
        }

        const inCareer = career.find(e => e.userId === userId);
        if (inCareer) {
          myCareer = inCareer;
        } else if (myStats.wins > 0 || myStats.dailySolvedCount > 0) {
          const best4 = myStats.bestStepsByMode[4] ?? 999;
          const ahead = this.db.prepare(`
            SELECT COUNT(*) AS c FROM user_stats
            WHERE (wins > 0 OR daily_solved > 0) AND (
              wins > ?
              OR (wins = ? AND COALESCE(best_steps_4, 999) < ?)
              OR (wins = ? AND COALESCE(best_steps_4, 999) = ? AND daily_solved > ?)
            )
          `).get(myStats.wins, myStats.wins, best4, myStats.wins, best4, myStats.dailySolvedCount) as { c: number } | undefined;
          myCareer = {
            rank: Number(ahead?.c ?? 0) + 1,
            userId,
            name: String(meUser.name),
            avatar: Number(meUser.avatar ?? 0),
            avatarUrl: meUser.avatar_url ? String(meUser.avatar_url) : undefined,
            wins: myStats.wins,
            totalGames: myStats.totalGames,
            winRate: myStats.totalGames > 0 ? Math.round((myStats.wins / myStats.totalGames) * 100) : 0,
            bestStreak: myStats.bestStreak,
            bestSteps: myStats.bestStepsByMode[4] ?? myStats.bestStepsByMode[3] ?? myStats.bestStepsByMode[2],
            dailySolved: myStats.dailySolvedCount,
            isMe: true,
          };
        }
      }
    }

    return { dateKey, dailySolverCount, daily, career, myDaily, myCareer, myStats };
  }
}
