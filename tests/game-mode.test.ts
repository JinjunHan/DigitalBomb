import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, DEFAULT_RULES, botGuess, secret, hits, type Seat } from '../server/game';
import { Service } from '../server/service';
import { requestedDigitCount, rememberedDigitCount, modePreferenceKey } from '../assets/scripts/shared/game-mode';
import { confirmationValid } from '../assets/scripts/shared/modal-state';
import { feedbackEvent } from '../assets/scripts/shared/feedback-state';

const seat = (id: string): Seat => ({ profile: { id, name: id, avatar: 0 }, online: true, bot: false, misses: 0 });
test('server advertises the digit modes implemented by room creation', () => {
  const service = new Service(() => 1000);
  const user = service.add({ id: 'capability-test', name: '测试玩家', avatar: 0 }, 'local-test');
  assert.deepEqual(service.snapshot(user).supportedDigitCounts, [2, 3, 4]);
  for (const digitCount of service.snapshot(user).supportedDigitCounts!) {
    assert.equal(service.command(user, { id: `create-${digitCount}`, action: 'create', payload: { digitCount } }).error, undefined);
    const room = service.snapshot(user).room!;
    assert.equal(room.digitCount, digitCount);
    assert.equal(room.turnMs, 60000);
    assert.equal(room.roundLimit, 30);
    assert.equal(service.command(user, { id: `leave-${digitCount}`, action: 'leave', payload: { roomId: room.id } }).error, undefined);
  }
});
test('four is the default; explicit invalid modes fail without silently coercing', () => {
  assert.equal(requestedDigitCount(undefined), 4);
  for (const value of [null, '2', 1, 5, 2.5, {}, NaN]) assert.throws(() => requestedDigitCount(value));
  for (const value of ['', 'bad', '0', '5']) assert.equal(rememberedDigitCount(value), 4);
  assert.equal(rememberedDigitCount('2'), 2); assert.equal(rememberedDigitCount('3'), 3);
  assert.notEqual(modePreferenceKey('a', 'friend'), modePreferenceKey('a', 'public'));
  assert.notEqual(modePreferenceKey('a', 'public'), modePreferenceKey('b', 'public'));
});
for (const size of [2, 3, 4] as const) {
  test(`${size} digits: validation, leading zeros, equal-round reply, confirmation and feedback`, () => {
    const rules = { ...DEFAULT_RULES, digitCount: size, openingMs: 0 };
    const match = new Match('friend', [seat('a'), seat('b')], 0, '0123', rules, 'a');
    rules.digitCount = 4; // A room owns its rule snapshot.
    assert.equal(match.digitCount, size);
    const a = '1'.repeat(size), b = '0'.repeat(size);
    assert.throws(() => match.lock('a', '1'.repeat(size + 1), 1));
    const pending = { kind: 'lock' as const, roomId: match.id, turn: 0, digits: a };
    assert.ok(confirmationValid(pending, match.view('a'), 'a'));
    assert.equal(confirmationValid({ ...pending, digits: a + '1' }, match.view('a'), 'a'), false);
    match.lock('a', a, 1); match.lock('b', b, 2);
    assert.equal(match.view('b').digitCount, size); assert.equal(match.view('b').code, '0123');
    assert.throws(() => match.guess('a', b + '0', 0, 3)); assert.equal(match.turn, 0);
    match.guess('a', b, 0, 3); assert.equal(match.phase, 'reply'); assert.equal(match.view('b').revealed, undefined);
    const previous = { roomId: match.id, phase: 'playing', guesses: 0 };
    assert.equal(feedbackEvent(match.view('a'), 'a', previous)?.art, 'own-gold');
    assert.equal(feedbackEvent(match.view('b'), 'b', previous)?.art, 'opponent-4');
    match.guess('b', a, 1, 4); assert.equal(match.result?.reason, 'same_round');
  });
  test(`${size} digits: bot candidates and generated secrets respect the selected rule`, () => {
    const answer = '0'.repeat(size), first = '1'.repeat(size);
    const history = [{ digits: first, hits: hits(answer, first) }];
    const guess = botGuess(history, () => 0, size);
    assert.equal(guess.length, size); assert.equal(hits(guess, first), 0);
    assert.match(secret(size), new RegExp(`^\\d{${size}}$`));
  });
}
function harness() {
  let now = 1000, id = 0; const service = new Service(() => now);
  const add = (name: string) => service.add({ id: name, name, avatar: 0 }, name);
  const a = add('a'), b = add('b'), c = add('c'), d = add('d');
  const cmd = (user: typeof a, action: string, payload = {}) => service.command(user, { id: String(++id), action, payload });
  return { service, a, b, c, d, cmd, advance: (ms: number) => { now += ms; } };
}
test('matchmaking isolates modes without blocking later compatible pairs', () => {
  const { service, a, b, c, d, cmd } = harness();
  cmd(a, 'queue', { digitCount: 2 }); cmd(b, 'queue', { digitCount: 3 });
  assert.equal(a.roomId, undefined); assert.equal(b.roomId, undefined);
  cmd(c, 'queue', { digitCount: 3 }); assert.equal(c.roomId, b.roomId);
  assert.equal(service.room(b)!.digitCount, 3); assert.ok(a.queue);
  cmd(d, 'queue', { digitCount: 2 }); assert.equal(d.roomId, a.roomId);
  assert.equal(service.room(a)!.digitCount, 2);
});
test('fallback and reconnect retain queue mode; cancelling permits a new mode', () => {
  const { service, a, cmd, advance } = harness();
  cmd(a, 'queue', { digitCount: 3 }); const deadline = a.queue!.fallback;
  cmd(a, 'sync'); assert.equal(service.snapshot(a).queuedDigitCount, 3); assert.equal(a.queue!.fallback, deadline);
  cmd(a, 'cancelQueue'); cmd(a, 'queue', { digitCount: 2 });
  advance(a.queue!.fallback - service.now()); service.tick();
  const room = service.room(a)!; assert.equal(room.digitCount, 2);
  advance(5001); service.heartbeat(a); service.tick();
  const bot = room.seats.find(s => s.bot)!;
  assert.equal(bot.secret?.length, 2);
  room.nextFirst = bot.profile.id; cmd(a, 'lock', { roomId: room.id, digits: '00' });
  advance(11001); service.heartbeat(a); service.tick();
  assert.equal(room.history[0]?.playerId, bot.profile.id);
  assert.equal(room.history[0]?.digits?.length, 2);
});
test('invalid selection cannot clear a room or replace an existing queue', () => {
  const { service, a, cmd } = harness();
  cmd(a, 'queue', { digitCount: 2 }); const queue = a.queue;
  assert.ok(cmd(a, 'queue', { digitCount: 5 }).error); assert.equal(a.queue, queue);
  cmd(a, 'cancelQueue'); cmd(a, 'create', { digitCount: 3 }); const room = service.room(a)!;
  assert.ok(cmd(a, 'create', { digitCount: '2' }).error); assert.equal(service.room(a), room);
});
test('friend joins and return-to-room preserve the host rule and four-digit room code', () => {
  const { service, a, b, cmd } = harness();
  cmd(a, 'create', { digitCount: 2 }); const room = service.room(a)!;
  assert.match(room.code!, /^\d{4}$/); cmd(b, 'join', { code: room.code, digitCount: 4 });
  assert.equal(service.room(b)!.digitCount, 2);
  room.rules.openingMs = 0; room.nextFirst = 'a';
  cmd(a, 'lock', { roomId: room.id, digits: '01' }); cmd(b, 'lock', { roomId: room.id, digits: '22' });
  cmd(a, 'guess', { roomId: room.id, turn: 0, digits: '22' });
  cmd(b, 'guess', { roomId: room.id, turn: 1, digits: '01' });
  assert.equal(room.result?.reason, 'same_round');
  cmd(b, 'returnToRoom', { roomId: room.id }); cmd(a, 'returnToRoom', { roomId: room.id });
  const next = service.room(a)!; assert.equal(next.digitCount, 2); assert.equal(next.code, room.code);
  assert.equal(next.seats[0].profile.id, a.profile.id); assert.equal(next.history.length, 0);
});

test('自定义好友口令按顺序建房、入房、提示满员，并保留原房间规则', () => {
  const service = new Service(() => 1000);
  const players = ['甲', '乙', '丙', '丁'].map(id => service.add({ id, name: id, avatar: 0 }, id));
  const [host, guest, extra, other] = players;
  for (const code of ['1', '12345', 'abcd', 12]) {
    assert.throws(() => service.perform(host, 'createOrJoin', { code }), /四位/);
  }
  const command = { id: 'clicked', action: 'createOrJoin', payload: { code: '0012', digitCount: 3 } };
  assert.equal(service.command(host, command).error, undefined);
  assert.equal(service.command(host, command).error, undefined);
  const room = service.room(host)!;
  assert.equal(room.code, '0012');
  assert.equal(room.digitCount, 3);
  service.perform(guest, 'createOrJoin', { code: '0012', digitCount: 2 });
  assert.equal(service.room(guest), room);
  assert.equal(room.phase, 'preparing');
  for (const action of ['createOrJoin', 'join']) {
    assert.throws(() => service.perform(extra, action, { code: '0012' }), /房间已满/);
  }
  assert.equal(service.rooms.size, 1);
  assert.equal(service.room(extra), undefined);
  assert.throws(() => service.perform(other, 'join', { code: '0000' }), /无效/);
  service.perform(other, 'createOrJoin', { code: '0000' });
  service.perform(other, 'leave', { roomId: other.roomId });
  service.tick();
  assert.throws(() => service.perform(extra, 'createOrJoin', { code: '0000' }), /刚刚关闭/);
});
