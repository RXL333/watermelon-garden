import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, FRUITS, DANGER_LIMIT, GardenRandom, selectMerges, advanceDanger, randomLevel, clampDropX, validateSession, type SessionSnapshot } from '../src/rules.ts';

test('a three-fruit contact cluster merges exactly one pair, even with duplicate events', () => {
  const fruits = new Map([1, 2, 3].map(id => [id, { id, level: 2 }]));
  const selected = selectMerges([[2, 3], [1, 3], [2, 1], [1, 2]], id => fruits.get(id));
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0], [2, 1]);
  assert.equal(new Set(selected.flat()).size, 2);
});

test('two independent pairs both merge; walls, stale bodies, and different fruit levels do not', () => {
  const fruits = new Map([[1, { id: 1, level: 0 }], [2, { id: 2, level: 0 }], [3, { id: 3, level: 4 }], [4, { id: 4, level: 4 }]]);
  const selected = selectMerges([[1, 99], [1, 3], [1, 2], [3, 4], [1, 1]], id => fruits.get(id));
  assert.deepEqual(selected, [[1, 2], [3, 4]]);
});

test('two final watermelons remain a legal pair for the space-clearing bonus', () => {
  assert.deepEqual(selectMerges([[1, 2]], id => ({ id, level: FRUITS.length - 1 })), [[1, 2]]);
});

test('a brief bounce above the line is recoverable; continuous overflow ends at two seconds', () => {
  assert.equal(advanceDanger(1700, false, 16), 0);
  assert.equal(advanceDanger(0, true, 16), 16);
  assert.equal(advanceDanger(1990, true, 16), DANGER_LIMIT);
  assert.equal(advanceDanger(1000, true, -20), 1000);
});

test('new drops are small fruits and weighted by the advertised configurable boundaries', () => {
  assert.deepEqual([0, .34999, .35, .62999, .63, .82999, .83, .94999, .95, 1].map(randomLevel), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  const rng = new GardenRandom(1234);
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) counts[randomLevel(rng.next())]++;
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2] && counts[2] > counts[3] && counts[3] > counts[4]);
});

test('resuming a saved random state continues the fruit queue rather than re-rolling it', () => {
  const rng = new GardenRandom(456);
  for (let i = 0; i < 17; i++) rng.next();
  const resumed = new GardenRandom(rng.state);
  assert.deepEqual(Array.from({ length: 30 }, () => resumed.next()), Array.from({ length: 30 }, () => rng.next()));
});

test('touches at either screen edge always produce a fruit entirely inside the glass', () => {
  for (let level = 0; level < FRUITS.length; level++) {
    const r = FRUITS[level].radius;
    assert.ok(clampDropX(-1000, level) - r >= BOARD.left);
    assert.ok(clampDropX(1000, level) + r <= BOARD.right);
  }
});

const saved: SessionSnapshot = { score: 135, current: 2, next: 4, random: 12345, drops: 20, highest: 5, fruits: [{ level: 5, x: 200, y: 490, angle: .2 }] };
test('valid mobile save survives round-trip; corrupt or future saves cannot crash the game', () => {
  assert.deepEqual(validateSession(JSON.parse(JSON.stringify(saved))), saved);
  for (const corrupt of [null, {}, { ...saved, current: 11 }, { ...saved, score: -1 }, { ...saved, random: NaN }, { ...saved, fruits: [{ level: 3, x: Infinity, y: 5, angle: 0 }] }, { ...saved, fruits: Array(241).fill(saved.fruits[0]) }]) {
    assert.equal(validateSession(corrupt), null);
  }
});
