import test from 'node:test';
import assert from 'node:assert/strict';
import { Service } from '../server/service';

function setup() {
  const service = new Service(() => 1000);
  const a = service.add({ id: 'a', name: '甲', avatar: 0 }, 'a');
  const b = service.add({ id: 'b', name: '乙', avatar: 1 }, 'b');
  let id = 0;
  const command = (user: typeof a, action: string, payload = {}) => service.command(user, {
    id: String(++id), action, payload: { roomId: user.roomId, ...payload },
  });
  command(a, 'create');
  command(b, 'join', { code: service.room(a)!.code });
  const old = service.room(a)!;
  old.first = 'a';
  old.seats[0].secret = '1122'; old.seats[1].secret = '0123';
  old.finish('a', 'cracked', 1000);
  return { service, a, b, command, old };
}

for (const guestFirst of [false, true]) test(`friend result returns independently, guest first: ${guestFirst}`, () => {
  const { service, a, b, command, old } = setup();
  let saves = 0; service.saveResult = () => { saves++; };
  service.tick();
  const first = guestFirst ? b : a, second = guestFirst ? a : b;
  assert.equal(command(first, 'returnToRoom').error, undefined);
  const next = service.room(first)!;
  assert.equal(next.phase, 'waiting');
  assert.equal(next.code, old.code);
  assert.equal(service.room(second), old);
  assert.equal(service.snapshot(second).room?.revealed?.a, '1122');
  assert.equal(command(second, 'returnToRoom').error, undefined);
  assert.equal(service.room(second), next);
  assert.equal(next.phase, 'preparing');
  assert.ok(next.seats.every(s => !s.secret && s.misses === 0));
  assert.deepEqual(next.history, []);
  assert.equal(next.nextFirst, 'b');
  service.tick();
  assert.equal(saves, 1);
  assert.equal(service.codes.get(next.code!), next.id);
});

test('removed rematch command cannot start a new match', () => {
  const { service, a, command, old } = setup();
  assert.equal(command(a, 'rematch').error, '不支持的操作');
  assert.equal(service.room(a), old);
});

test('public results cannot return to a friend room and still support queue', () => {
  const { service, a, command, old } = setup();
  old.mode = 'public';
  assert.ok(command(a, 'returnToRoom').error);
  assert.equal(command(a, 'queue').error, undefined);
  assert.ok(a.queue);
  assert.equal(service.room(a), undefined);
});

test('return remains available after the first returning player leaves', () => {
  const { service, a, b, command } = setup();
  command(a, 'returnToRoom');
  command(a, 'leave');
  assert.equal(command(b, 'returnToRoom').error, undefined);
  assert.equal(service.room(b)?.phase, 'waiting');
});

test('returning guest does not replace the original host; third players cannot steal a pending seat', () => {
  const { service, a, b, command, old } = setup();
  command(b, 'returnToRoom');
  const c = service.add({ id: 'c', name: '丙', avatar: 0 }, 'c');
  assert.ok(command(c, 'join', { code: old.code }).error);
  command(a, 'returnToRoom');
  assert.equal(service.room(a)?.seats[0].profile.id, a.profile.id);
});
