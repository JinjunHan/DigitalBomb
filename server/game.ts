import { STANDARD_ROUNDS, STANDARD_TURN_MS } from '../assets/scripts/shared/deduction';
import { randomInt, randomUUID } from 'node:crypto';
import type { Phase, Profile, Guess, Result, RoomView } from '../assets/scripts/shared/protocol';

export const validDigits = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v);
export function hits(a: string, b: string): number { return [...a].filter((c, i) => c === b[i]).length; }
export function secret(): string { return String(randomInt(10000)).padStart(4, '0'); }
export interface Seat { profile: Profile; bot: boolean; secret?: string; online: boolean; disconnectedAt?: number; misses: number }
export interface Rules { prepareMs: number; turnMs: number; openingMs: number; rounds: number; reconnectMs: number }
export const DEFAULT_RULES: Rules = { prepareMs: 60000, turnMs: STANDARD_TURN_MS, openingMs: 3000, rounds: STANDARD_ROUNDS, reconnectMs: 30000 };

export class Match {
  id = randomUUID(); version = 1; phase: Phase; seats: Seat[];
  deadline: number; startAt = 0; turn = 0; first = ''; current = ''; history: Guess[] = [];
  result?: Result; endedAt = 0; rematch = new Set<string>(); rematchUntil = 0;
  nextBotAt = 0; saved = false;
  constructor(public mode: 'public' | 'friend', players: Seat[], now: number, public code?: string, public rules = DEFAULT_RULES, public nextFirst?: string) {
    this.seats = players; this.phase = players.length === 2 ? 'preparing' : 'waiting';
    this.deadline = now + (this.phase === 'waiting' ? 600000 : rules.prepareMs);
  }
  seat(id: string) { const s = this.seats.find(s => s.profile.id === id); if (!s) throw Error('你不在该房间'); return s; }
  other(id: string) { return this.seats.find(s => s.profile.id !== id)!; }
  join(s: Seat, now: number) {
    if (this.phase !== 'waiting' || this.seats.length !== 1 || now >= this.deadline) throw Error('房间暂不可加入');
    this.seats.push(s); this.phase = 'preparing'; this.deadline = now + this.rules.prepareMs; this.version++;
  }
  lock(id: string, digits: string, now: number) {
    if (this.phase !== 'preparing' || now >= this.deadline) throw Error('准备已结束');
    if (!validDigits(digits)) throw Error('请输入四位数字');
    const seat = this.seat(id); if (seat.secret) throw Error('底牌已锁定');
    seat.secret = digits; this.version++;
    if (this.seats.every(s => s.secret)) {
      this.first = this.nextFirst ?? this.seats[randomInt(2)].profile.id;
      this.current = this.first; this.phase = 'playing'; this.startAt = now + this.rules.openingMs;
      this.deadline = this.startAt + this.rules.turnMs; this.nextBotAt = this.startAt + randomInt(3000, 8001);
    }
  }
  guess(id: string, digits: string, turn: number, now: number) {
    if (!validDigits(digits)) throw Error('请输入四位数字');
    if (!['playing', 'reply'].includes(this.phase) || id !== this.current || turn !== this.turn) throw Error('回合已经变化，请查看最新状态');
    if (now < this.startAt) throw Error('即将开局');
    if (now >= this.deadline) throw Error('本次行动已超时');
    this.seat(id).misses = 0;
    const count = hits(digits, this.other(id).secret!);
    this.history.push({ playerId: id, turn: this.turn, digits, hits: count });
    if (this.phase === 'reply') this.finish(count === 4 ? null : this.first, count === 4 ? 'same_round' : 'reply_missed', now);
    else if (count === 4 && id !== this.first) this.finish(id, 'cracked', now);
    else if (count === 4) { this.phase = 'reply'; this.advance(now); }
    else this.advance(now);
    this.version++;
  }
  advance(now: number) {
    this.turn++;
    if (this.turn >= this.rules.rounds * 2) { this.finish(null, 'round_limit', now); return; }
    this.current = this.other(this.current).profile.id; this.deadline = now + this.rules.turnMs;
    this.nextBotAt = now + randomInt(3000, 8001);
  }
  finish(winner: string | null, reason: string, now: number, cancelled = false) {
    if (this.phase === 'finished' || this.phase === 'cancelled') return;
    this.phase = cancelled ? 'cancelled' : 'finished'; this.result = { winner, reason }; this.endedAt = now; this.version++;
  }
  tick(now: number) {
    if (this.phase === 'finished' || this.phase === 'cancelled') return;
    if (this.phase === 'waiting' || this.phase === 'preparing') {
      if (now >= this.deadline) this.finish(null, this.phase === 'waiting' ? 'room_expired' : 'prepare_timeout', now, true);
      return;
    }
    // Deadlines are authoritative even if the process was temporarily stalled.
    const offline = this.seats.filter(s => !s.online && s.disconnectedAt !== undefined);
    const expired = offline.find(s => now >= s.disconnectedAt! + this.rules.reconnectMs);
    if (expired && expired.disconnectedAt! + this.rules.reconnectMs <= this.deadline) {
      this.finish(offline.length === 2 ? null : this.other(expired.profile.id).profile.id, offline.length === 2 ? 'both_offline' : 'disconnect', now, offline.length === 2); return;
    }
    if (now >= this.deadline) {
      const seat = this.seat(this.current); seat.misses++;
      this.history.push({ playerId: this.current, turn: this.turn, digits: null, hits: null });
      if (this.phase === 'reply') this.finish(this.first, 'reply_timeout', now);
      else if (seat.misses >= 2) this.finish(this.other(this.current).profile.id, 'timeout', now);
      else this.advance(now);
      this.version++;
    }
    if (!['finished', 'cancelled'].includes(this.phase) && expired) this.finish(offline.length === 2 ? null : this.other(expired.profile.id).profile.id, offline.length === 2 ? 'both_offline' : 'disconnect', now, offline.length === 2);
  }
  view(id: string): RoomView {
    this.seat(id);
    return {
      id: this.id, mode: this.mode, code: this.code, phase: this.phase, version: this.version,
      players: this.seats.map(s => ({ ...s.profile, ready: !!s.secret, online: s.online })),
      round: Math.min(this.rules.rounds, Math.floor(this.turn / 2) + 1), turn: this.turn,
      roundLimit: this.rules.rounds, turnMs: this.rules.turnMs,
      first: this.first, current: this.current, deadline: this.deadline, startAt: this.startAt,
      history: this.history.map(h => ({ ...h })), ownSecret: this.seat(id).secret,
      revealed: this.phase === 'finished' ? Object.fromEntries(this.seats.map(s => [s.profile.id, s.secret!])) : undefined,
      result: this.result, rematch: [...this.rematch],
    };
  }
}

// Only the bot's own public feedback enters this strategy; never an opponent secret.
export function botGuess(history: Pick<Guess, 'digits' | 'hits'>[], random = Math.random): string {
  const candidates: string[] = [];
  const attempted = new Set(history.map(h => h.digits));
  for (let n = 0; n < 10000; n++) {
    const value = String(n).padStart(4, '0');
    if (!attempted.has(value) && history.every(h => h.digits === null || hits(value, h.digits) === h.hits)) candidates.push(value);
  }
  if (!candidates.length) throw Error('Inconsistent bot feedback');
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}
