import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDefaultData, validateData, getPhase, countdown, vilniusToISO, localDateTime } from '../src/model.mjs';

test('six meetings, Lithuanian daylight saving and exact default times', () => {
  const data = validateData(makeDefaultData());
  assert.equal(data.meetings.length, 6);
  assert.equal(data.meetings[0].start, '2026-10-09T11:00:00.000Z');
  assert.equal(data.meetings[1].start, '2026-11-13T14:00:00.000Z');
  assert.equal(data.meetings[5].end, '2027-03-14T14:00:00.000Z');
  assert.equal(localDateTime(data.meetings[0].start), '2026-10-09T14:00');
});
test('arrival inclusive, departure exclusive, advances to next meeting', () => {
  const data = makeDefaultData();
  assert.equal(getPhase(data, Date.parse('2026-10-09T10:59:59Z')).mode, 'waiting');
  assert.equal(getPhase(data, Date.parse('2026-10-09T11:00:00Z')).mode, 'active');
  assert.equal(getPhase(data, Date.parse('2026-10-11T13:00:00Z')).meeting.id, 'm2');
  assert.equal(getPhase(data, Date.parse('2027-03-14T14:00:00Z')).mode, 'ended');
});
test('invalid and ambiguous Lithuania wall times rejected', () => {
  for (const value of ['2027-03-28T03:30', '2026-10-25T03:30', '2026-02-30T12:00', '', 'bad'])
    assert.throws(() => vilniusToISO(value));
  assert.equal(vilniusToISO('2027-03-28T04:00'), '2027-03-28T01:00:00.000Z');
});
test('countdown rounds up remaining partial second, never goes negative', () => {
  assert.deepEqual(countdown(90061000, 0), ['01', '01', '01', '01']);
  assert.deepEqual(countdown(999, 0), ['00','00','00','01']);
  assert.deepEqual(countdown(0, 1), ['00','00','00','00']);
});
test('attendance is separate for each meeting', () => {
  const data = makeDefaultData(); data.meetings[0].attendance.p1 = 'ready';
  assert.equal(data.meetings[1].attendance.p1, 'waiting');
});
test('reject overlapping meetings, reversed times, duplicate names and invalid statuses', () => {
  let data = makeDefaultData(); data.meetings[1].start = data.meetings[0].start; assert.throws(() => validateData(data));
  data = makeDefaultData(); data.meetings[0].end = data.meetings[0].start; assert.throws(() => validateData(data));
  data = makeDefaultData(); data.players[1].nick = 'gintux'; assert.throws(() => validateData(data));
  data = makeDefaultData(); data.meetings[0].attendance.p2 = '__proto__'; assert.throws(() => validateData(data));
  data = makeDefaultData(); data.players[0].nick = '<b>test</b>'; assert.equal(validateData(data), data);
});
