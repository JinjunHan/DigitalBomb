import { avatarUrl } from '../assets/scripts/shared/wechat-flow';
import { randomInt, randomUUID } from 'node:crypto';
import { Match, botGuess, secret, type Seat } from './game';
import type { Profile, Command, Snapshot } from '../assets/scripts/shared/protocol';

export interface User { profile: Profile; token: string; roomId?: string; lastSeen: number; offlineAt?: number; queue?: { at: number; fallback: number }; notice?: string }
const prefixes = ['半杯', '晚风', '山间', '橘子', '薄荷', '雨后', '南山', '小岛', '凌晨', '云边', '青柠', '暮色', '风里', '夏日', '白桃', '海盐', '星河', '落日', '森林', '月下'];
const suffixes = ['乌龙', '来信', '漫步', '汽水', '小熊', '旅人', '微光', '晴天', '拿铁', '奶糖', '向晚', '松果', '听雨', '花园', '橙子'];
export const botProfiles = prefixes.flatMap(a => suffixes.map(b => a + b));
export class Service {
  users = new Map<string, User>(); rooms = new Map<string, Match>(); codes = new Map<string, string>(); cooldown = new Map<string, number>();
  receipts = new Map<string, Map<string, string | null>>(); attempts = new Map<string, number[]>();
  changed = () => {}; saveResult: (room: Match) => void = () => {}; saveProfile: (p: Profile) => void = () => {};
  constructor(public now = () => Date.now()) {}
  add(profile: Profile, token: string) { const user: User = { profile, token, lastSeen: this.now() }; this.users.set(profile.id, user); return user; }
  room(user: User) { return user.roomId ? this.rooms.get(user.roomId) : undefined; }
  seat(user: User): Seat { return { profile: { ...user.profile }, online: true, misses: 0, bot: false }; }
  snapshot(user: User): Snapshot { return { me: { ...user.profile }, room: this.room(user)?.view(user.profile.id) ?? null, queuedAt: user.queue?.at ?? null, serverNow: this.now(), notice: user.notice }; }
  heartbeat(user: User) {
    user.lastSeen = this.now(); user.offlineAt = undefined;
    const room = this.room(user); const seat = room?.seats.find(s => s.profile.id === user.profile.id);
    if (seat && !seat.online) { seat.online = true; seat.disconnectedAt = undefined; room!.version++; }
  }
  disconnect(user: User) { user.offlineAt ??= this.now(); }
  available(user: User) {
    const room = this.room(user);
    if (room && !['finished', 'cancelled'].includes(room.phase)) throw Error('请先离开当前房间');
    if (user.queue) throw Error('正在匹配中');
    if (room) { room.rematch.delete(user.profile.id); room.version++; }
    user.roomId = undefined;
  }
  bind(room: Match) { this.rooms.set(room.id, room); for (const s of room.seats) { const u = this.users.get(s.profile.id); if (u) { u.roomId = room.id; u.queue = undefined; } } }
  allocateCode() {
    const now = this.now(), start = randomInt(10000);
    for (let n = 0; n < 10000; n++) { const c = String((start + n) % 10000).padStart(4, '0'); if (!this.codes.has(c) && (this.cooldown.get(c) ?? 0) <= now) return c; }
    throw Error('房间较多，请稍后创建');
  }
  releaseCode(room: Match) { if (room.code && this.codes.get(room.code) === room.id) { this.codes.delete(room.code); this.cooldown.set(room.code, this.now() + 60000); } }
  command(user: User, cmd: Command): { error?: string } {
    if (!cmd || typeof cmd.id !== 'string' || cmd.id.length > 100 || typeof cmd.action !== 'string') return { error: '请求无效' };
    const ledger = this.receipts.get(user.profile.id) ?? new Map<string, string | null>(); this.receipts.set(user.profile.id, ledger);
    if (ledger.has(cmd.id)) return { error: ledger.get(cmd.id) ?? undefined };
    let error: string | undefined;
    try { this.perform(user, cmd.action, cmd.payload ?? {}); } catch (e) { error = e instanceof Error ? e.message : '操作失败'; }
    ledger.set(cmd.id, error ?? null); if (ledger.size > 256) ledger.delete(ledger.keys().next().value!);
    this.changed(); return { error };
  }
  perform(user: User, action: string, p: Record<string, unknown>) {
    const now = this.now(); this.heartbeat(user); user.notice = undefined;
    if (action === 'sync') return;
    if (action === 'profile') {
      if (typeof p.name !== 'string' || !/^[\p{L}\p{N} _·-]{2,12}$/u.test(p.name.trim())) throw Error('昵称需为 2–12 个中文、字母或数字');
      if (!Number.isInteger(p.avatar) || Number(p.avatar) < 0 || Number(p.avatar) > 7) throw Error('请选择头像');
      if (p.avatarUrl !== undefined && p.avatarUrl !== '' && !avatarUrl(p.avatarUrl)) throw Error('微信头像地址无效');
      user.profile = { ...user.profile, name: p.name.trim(), avatar: Number(p.avatar), avatarUrl: p.avatarUrl === undefined ? user.profile.avatarUrl : avatarUrl(p.avatarUrl) }; this.saveProfile(user.profile); return;
    }
    if (action === 'queue') {
      this.available(user); user.queue = { at: now, fallback: now + randomInt(3000, 8001) }; this.pair(); return;
    }
    if (action === 'cancelQueue') {
      if (!user.queue && this.room(user) && !['finished', 'cancelled'].includes(this.room(user)!.phase)) throw Error('已找到对手，可以在准备页退出');
      user.queue = undefined; return;
    }
    if (action === 'create') {
      this.available(user); const code = this.allocateCode(); const room = new Match('friend', [this.seat(user)], now, code); this.codes.set(code, room.id); this.bind(room); return;
    }
    if (action === 'join') {
      this.available(user);
      const recent = (this.attempts.get(user.profile.id) ?? []).filter(t => now - t < 60000);
      if (recent.length >= 10) throw Error('尝试太频繁，请稍后再试'); recent.push(now); this.attempts.set(user.profile.id, recent);
      if (typeof p.code !== 'string' || !/^\d{4}$/.test(p.code)) throw Error('请输入四位房间口令');
      const room = this.rooms.get(this.codes.get(p.code) ?? ''); if (!room) throw Error('口令无效或房间已关闭');
      if (p.inviteRoomId !== undefined && p.inviteRoomId !== room.id) throw Error('邀请已过期，请向好友索取新邀请');
      room.join(this.seat(user), now); user.roomId = room.id; return;
    }
    const room = this.room(user); if (!room) throw Error('房间已关闭');
    if (p.roomId !== room.id) throw Error('房间已经变化，请重试');
    room.tick(now);
    if (action === 'lock') { room.lock(user.profile.id, String(p.digits ?? ''), now); return; }
    if (action === 'guess') { room.guess(user.profile.id, String(p.digits ?? ''), Number(p.turn), now); return; }
    if (action === 'resign') {
      if (!['playing', 'reply'].includes(room.phase)) throw Error('当前不在对局中');
      room.finish(room.other(user.profile.id).profile.id, 'resigned', now); return;
    }
    if (action === 'leave') {
      if (['playing', 'reply'].includes(room.phase)) throw Error('进行中的对局请先认输');
      if (room.phase === 'preparing' && room.mode === 'friend' && room.seats[0].profile.id !== user.profile.id) {
        this.releaseCode(room); room.code = this.allocateCode(); this.codes.set(room.code, room.id);
        room.seats = [room.seats[0]]; room.seats[0].secret = undefined; room.phase = 'waiting'; room.deadline = now + 600000; room.version++;
      } else if (!['finished', 'cancelled'].includes(room.phase)) room.finish(null, 'player_left', now, true);
      room.rematch.delete(user.profile.id); room.version++; user.roomId = undefined; return;
    }
    if (action === 'rematch') {
      if (room.phase !== 'finished') throw Error('本局尚未结算');
      if (room.seats.some(s => !s.bot && this.users.get(s.profile.id)?.roomId !== room.id)) throw Error('对方已离开，请重新匹配');
      room.rematchUntil ||= now + 30000;
      if (now >= room.rematchUntil) throw Error('再战邀请已过期，请重新匹配');
      room.rematch.add(user.profile.id); room.version++;
      if (room.seats.every(s => s.bot || room.rematch.has(s.profile.id))) {
        this.releaseCode(room);
        const seats = room.seats.map(s => ({ ...s, profile: { ...s.profile }, secret: undefined, misses: 0 }));
        const next = new Match(room.mode, seats, now, room.code, room.rules, room.other(room.first).profile.id);
        if (next.code) this.codes.set(next.code, next.id); this.bind(next);
      } return;
    }
    throw Error('不支持的操作');
  }
  pair() {
    const waiting = [...this.users.values()].filter(u => u.queue && !u.offlineAt && this.now() - u.lastSeen < 15000).sort((a, b) => a.queue!.at - b.queue!.at);
    while (waiting.length >= 2) { const a = waiting.shift()!, b = waiting.shift()!; this.bind(new Match('public', [this.seat(a), this.seat(b)], this.now())); }
  }
  tick() {
    const now = this.now(); this.pair();
    for (const user of this.users.values()) {
      if (now - user.lastSeen > 15000 || (user.offlineAt && now - user.offlineAt > 15000)) {
        user.queue = undefined; const room = this.room(user), seat = room?.seats.find(s => s.profile.id === user.profile.id);
        if (seat?.online) { seat.online = false; seat.disconnectedAt = now; room!.version++; }
      }
      if (user.queue && now >= user.queue.fallback) {
        const bot: Seat = { profile: { id: 'bot-' + randomUUID(), name: botProfiles[randomInt(botProfiles.length)], avatar: randomInt(8) }, bot: true, online: true, misses: 0 };
        const room = new Match('public', [this.seat(user), bot], now); room.nextBotAt = now + randomInt(2000, 5001); this.bind(room);
      }
    }
    for (const room of this.rooms.values()) {
      room.tick(now);
      const bot = room.seats.find(s => s.bot);
      if (bot && room.phase === 'preparing' && !bot.secret && now >= (room.nextBotAt || room.deadline - 55000)) room.lock(bot.profile.id, secret(), now);
      if (bot && ['playing', 'reply'].includes(room.phase) && room.current === bot.profile.id && now >= room.nextBotAt && now >= room.startAt) {
        const history = room.history.filter(h => h.playerId === bot.profile.id);
        room.guess(bot.profile.id, botGuess(history), room.turn, now);
      }
      if (room.phase === 'waiting' && !room.seats[0].online && now >= (room.seats[0].disconnectedAt ?? now) + 30000) room.finish(null, 'room_expired', now, true);
      if (['finished', 'cancelled'].includes(room.phase)) {
        this.releaseCode(room);
        if (!room.saved) { this.saveResult(room); room.saved = true; }
        if (now - room.endedAt > 600000) { for (const s of room.seats) { const u = this.users.get(s.profile.id); if (u?.roomId === room.id) { u.roomId = undefined; u.notice = '上一局已结束'; } } this.rooms.delete(room.id); }
      }
    }
    for (const [code, until] of this.cooldown) if (now >= until) this.cooldown.delete(code);
    this.changed();
  }
}
