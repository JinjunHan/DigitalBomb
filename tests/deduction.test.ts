import test from 'node:test';
import assert from 'node:assert/strict';
import { countHits, deduce, compareClues } from '../assets/scripts/shared/deduction';
import { Practice, Tutorial } from '../assets/scripts/shared/learning';
import { Match, DEFAULT_RULES, type Seat } from '../server/game';

test('zero excludes a digit only at its own position, not globally', () => {
  const result = deduce([{ digits: '1234', hits: 0 }]);
  assert.equal(result.count, 6561);
  result.positions.forEach((p, i) => assert.deepEqual(p.excluded, ['1234'[i]]));
  assert.ok(result.positions[0].possible.includes('2'));
});
test('all feedback combines to confirm a position, including reduced hit counts', () => {
  const result = deduce([{ digits: '1234', hits: 2 }, { digits: '9234', hits: 1 }]);
  assert.deepEqual(result.positions[0].possible, ['1']);
  assert.match(compareClues({ digits: '1234', hits: 2 }, { digits: '9234', hits: 1 }), /原来的 1 正确/);
  assert.match(compareClues({ digits: '9234', hits: 1 }, { digits: '1234', hits: 2 }), /确认该位是 1/);
  assert.match(compareClues({ digits: '1234', hits: 1 }, { digits: '9234', hits: 1 }), /都不正确/);
  assert.match(compareClues({ digits: '1234', hits: 1 }, { digits: '9874', hits: 2 }), /不能单凭/);
});
test('leading zero, repeated digits, timeout, duplicate and inconsistent feedback', () => {
  assert.deepEqual(deduce([{ digits: '0011', hits: 4 }]).positions.map(p => p.possible), [['0'], ['0'], ['1'], ['1']]);
  assert.equal(deduce([{ digits: null, hits: null }]).count, 10000);
  assert.equal(deduce([{ digits: '0000', hits: 0 }, { digits: '0000', hits: 0 }]).count, 6561);
  for (const clues of [[{ digits: '0000', hits: 0 }, { digits: '0000', hits: 4 }], [{ digits: '0123', hits: null }]]) {
    const result = deduce(clues); assert.equal(result.consistent, false);
    assert.ok(result.positions.every(p => p.excluded.length === 0));
  }
});
test('2/3/4-digit candidates never exclude the actual answer across varied histories', () => {
  for (const size of [2, 3, 4] as const) {
    for (const secret of ['0'.repeat(size), '1'.repeat(size), '0123'.slice(0, size)]) {
      const history = ['1234', '9234', '0011', '0000'].map(d => ({ digits: d.slice(0, size), hits: countHits(secret, d.slice(0, size)) }));
      const result = deduce(history, size); assert.ok(result.consistent);
      [...secret].forEach((digit, i) => assert.ok(result.positions[i].possible.includes(digit)));
    }
  }
});
test('tutorial requires actual input and correct deductions, and can be replayed', () => {
  const lesson = new Tutorial(); lesson.submit('1111'); assert.equal(lesson.step, 0);
  lesson.submit('1234'); lesson.submit('9234'); assert.equal(lesson.step, 2);
  lesson.answer('9'); assert.equal(lesson.step, 2); lesson.answer('1');
  lesson.answer('absent'); assert.equal(lesson.complete, false);
  lesson.answer('position'); assert.equal(lesson.complete, true);
  assert.equal(new Tutorial().step, 0);
});
test('practice keeps one answer, rejects duplicate/wrong length, and ends once solved', () => {
  for (const size of [2, 3, 4] as const) {
    const practice = new Practice(size, () => 0);
    assert.ok(practice.submit('1')); assert.equal(practice.history.length, 0);
    assert.equal(practice.submit('1'.repeat(size)), undefined);
    assert.ok(practice.submit('1'.repeat(size))); assert.equal(practice.history.length, 1);
    assert.equal(practice.submit('0'.repeat(size)), undefined); assert.ok(practice.solved);
    assert.ok(practice.submit('2'.repeat(size))); assert.equal(practice.history.length, 2);
  }
});
const seat = (id: string): Seat => ({ profile: { id, name: id, avatar: 0 }, bot: false, online: true, misses: 0 });
test('new default is 30 rounds and 60 seconds, including the final reply', () => {
  assert.equal(DEFAULT_RULES.rounds, 30); assert.equal(DEFAULT_RULES.turnMs, 60000);
  const match = new Match('public', [seat('a'), seat('b')], 0, undefined, { ...DEFAULT_RULES, openingMs: 0 }, 'a');
  match.lock('a', '1111', 1); match.lock('b', '2222', 2);
  assert.equal(match.deadline, 60002); assert.equal(match.view('a').roundLimit, 30);
  assert.equal(match.view('a').turnMs, 60000);
  for (let turn = 0; turn < 58; turn++) match.guess(turn % 2 ? 'b' : 'a', '9999', turn, turn + 3);
  match.guess('a', '2222', 58, 61); assert.equal(match.phase, 'reply');
  assert.equal(match.deadline, 60061); assert.equal(match.view('b').revealed, undefined);
  match.guess('b', '1111', 59, 62); assert.equal(match.result?.reason, 'same_round');
});
test('draw happens only after both players use their thirtieth opportunity', () => {
  const match = new Match('public', [seat('a'), seat('b')], 0, undefined, { ...DEFAULT_RULES, openingMs: 0 }, 'a');
  match.lock('a', '1111', 1); match.lock('b', '2222', 2);
  for (let turn = 0; turn < 59; turn++) match.guess(turn % 2 ? 'b' : 'a', '9999', turn, turn + 3);
  assert.equal(match.phase, 'playing');
  match.guess('b', '9999', 59, 62); assert.equal(match.result?.reason, 'round_limit');
});
