import test from 'node:test';
import assert from 'node:assert/strict';
import { GardenStorage } from '../src/storage.ts';
import { validateHistory } from '../src/round-history.ts';
import type { SessionSnapshot } from '../src/rules.ts';

const round: SessionSnapshot = { difficulty: 'classic', score: 36, drops: 7, highest: 4, current: 0, next: 1, random: 123, fruits: [{ level: 4, x: 200, y: 490, angle: 0 }] };
function backend(initial?: unknown) {
  let data = initial === undefined ? null : JSON.stringify(initial);
  return { getItem: () => data, setItem: (_key: string, value: string) => { data = value; } };
}

test('a finished round is saved once with its final score and survives refreshing', () => {
  const memory = backend(), store = new GardenStorage(memory);
  store.beginRound(false, 1000); store.save(round);
  store.finishRound({ ...round, score: 91, highest: 6, drops: 11 }, 'finished', 9000);
  store.finishRound({ ...round, score: 91 }, 'finished', 9001);
  const restored = new GardenStorage(memory);
  assert.equal(restored.history.length, 1);
  assert.deepEqual({ ...restored.history[0], id: 'ignored' }, { id: 'ignored', startedAt: 1000, endedAt: 9000, score: 91, highest: 6, drops: 11, difficulty: 'classic', reason: 'finished' });
  assert.equal(restored.bestFor('classic'), 91);
  assert.equal(restored.session, null);
  assert.equal(restored.activeRound, null);
});

test('refreshing, changing style, pausing and undoing belong to the same round', () => {
  const memory = backend(), store = new GardenStorage(memory);
  store.beginRound(false, 1000); store.save(round);
  const id = store.activeRound!.id;
  const continued = new GardenStorage(memory);
  continued.beginRound(true, 2000);
  continued.preferences.fruitStyle = 'fluffy'; continued.save({ ...round, score: 0, undosLeft: 2 });
  assert.equal(continued.activeRound!.id, id);
  assert.equal(continued.activeRound!.startedAt, 1000);
  assert.equal(continued.history.length, 0);
  continued.finishRound(continued.session!, 'restarted', 3000);
  continued.beginRound(false, 3100); continued.save({ ...round, difficulty: 'easy', score: 9 });
  continued.finishRound(continued.session!, 'finished', 5000);
  const history = new GardenStorage(memory).history;
  assert.equal(history.length, 2);
  assert.equal(history[1].id, id);
  assert.equal(history[1].score, 0);
  assert.equal(history[1].reason, 'restarted');
  assert.equal(history[0].difficulty, 'easy');
  assert.notEqual(history[0].id, id);
});

test('an unplayed round is omitted, but a played zero-score round is retained', () => {
  const store = new GardenStorage(backend());
  store.beginRound(false, 1000); store.save({ ...round, score: 0, drops: 0 });
  store.finishRound(store.session!, 'restarted', 2000);
  assert.equal(store.history.length, 0);
  store.beginRound(false, 3000); store.save({ ...round, score: 0, drops: 1 });
  store.finishRound(store.session!, 'finished', 4000);
  assert.equal(store.history.length, 1);
  assert.equal(store.history[0].score, 0);
});

test('legacy saves retain bests and their current game without inventing old scores', () => {
  const store = new GardenStorage(backend({ version: 1, best: 200, session: round }));
  assert.equal(store.history.length, 0);
  assert.equal(store.bestFor('classic'), 200);
  assert.deepEqual(store.session, round);
  store.beginRound(true, 1000); store.finishRound(round, 'restarted', 2000);
  assert.equal(store.history.length, 1);
  assert.equal(store.history[0].score, 36);
});

test('corrupt and duplicate history entries do not destroy a healthy session', () => {
  const entry = { id: 'round-1', startedAt: 1000, endedAt: 2000, difficulty: 'classic', score: 36, drops: 7, highest: 4, reason: 'finished' };
  const invalid = [null, {}, { ...entry, score: -1 }, { ...entry, difficulty: '__proto__' }, { ...entry, highest: 20 }, { ...entry, drops: 0 }, { ...entry, endedAt: 999 }, { ...entry, id: '<script>' }];
  const store = new GardenStorage(backend({ version: 1, history: [...invalid, entry, entry], session: round }));
  assert.deepEqual(store.history, [entry]);
  assert.deepEqual(store.session, round);
  assert.deepEqual(validateHistory(null), []);
});

test('storage write failure keeps history usable in memory and reports unavailable persistence', () => {
  const store = new GardenStorage({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
  store.beginRound(false, 1000); store.save(round); store.finishRound(round, 'finished', 2000);
  assert.equal(store.available, false);
  assert.equal(store.history.length, 1);
});

test('more than one page of history retains every round and reloads newest first', () => {
  const memory = backend(), store = new GardenStorage(memory);
  for (let i = 0; i < 43; i++) {
    store.beginRound(false, 1000 + i * 1000);
    store.save({ ...round, score: i * 3 });
    store.finishRound(store.session!, 'finished', 1500 + i * 1000);
  }
  const history = new GardenStorage(memory).history;
  assert.equal(history.length, 43);
  assert.equal(new Set(history.map(entry => entry.id)).size, 43);
  assert.deepEqual(history.map(entry => entry.score), Array.from({ length: 43 }, (_, i) => (42 - i) * 3));
  assert.ok(history.every(entry => Object.keys(entry).length === 8), 'records contain results only, without the live fruit pile or undo data');
});
