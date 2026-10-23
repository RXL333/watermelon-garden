import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TurnHistory, GardenRandom, FIXED_STEP, SPAWN_GRACE, validateSession, type SessionSnapshot } from '../src/rules.ts';
import { saveFruit, restoreFruit } from '../src/physics-state.ts';
import { GardenStorage } from '../src/storage.ts';

const saved: SessionSnapshot = { difficulty: 'classic', score: 12, current: 1, next: 3, random: 1234, drops: 8, highest: 3, dangerMs: 600, fruits: [{ level: 0, x: 200, y: 220, angle: .2, vx: 1.4, vy: 3.2, spin: .01, age: 450 }] };

test('undo restores the entire pre-drop state once and consumes one of three uses', () => {
  const history = new TurnHistory();
  assert.equal(history.take(), undefined);
  for (let use = 0; use < 3; use++) {
    history.remember(saved);
    assert.deepEqual(history.take(), saved);
    assert.equal(history.take(), undefined);
    assert.equal(history.remaining, 2 - use);
  }
  history.remember(saved);
  assert.equal(history.take(), undefined);
});

test('remembering a drop takes a value snapshot and cannot mutate with the live world', () => {
  const source = structuredClone(saved);
  const history = new TurnHistory();
  history.remember(source);
  source.fruits[0].x = 250;
  source.score = 99;
  assert.deepEqual(history.take(), saved);
});

test('the undo slot and budget survive saving and reloading without re-rolling the queue', () => {
  let data: string | null = null;
  const backend = { getItem: () => data, setItem: (_key: string, value: string) => { data = value; } };
  const store = new GardenStorage(backend);
  store.save({ ...saved, score: 18, drops: 9, undosLeft: 1, previousTurn: saved });
  const resumed = new GardenStorage(backend).session!;
  const history = new TurnHistory(resumed.undosLeft, resumed.previousTurn);
  const previous = history.take()!;
  assert.deepEqual(previous, saved);
  assert.equal(history.remaining, 0);
  assert.equal(previous.dangerMs, 600);
  const revertedRandom = new GardenRandom(previous.random), expectedRandom = new GardenRandom(saved.random);
  assert.deepEqual(Array.from({ length: 20 }, () => revertedRandom.next()), Array.from({ length: 20 }, () => expectedRandom.next()));
});

test('invalid undo slots are discarded without losing the current game; invalid motion is rejected', () => {
  for (const previousTurn of [{ ...saved, difficulty: 'hard' }, { ...saved, score: 1000 }, { ...saved, drops: 2 }, {}]) {
    const restored = validateSession({ ...saved, drops: 9, undosLeft: 2, previousTurn });
    assert.ok(restored);
    assert.equal(restored.previousTurn, undefined);
  }
  for (const invalid of [{ undosLeft: -1 }, { undosLeft: 4 }, { dangerMs: 2000 }, { fruits: [{ ...saved.fruits[0], vx: Infinity }] }, { fruits: [{ ...saved.fruits[0], age: -1 }] }]) assert.equal(validateSession({ ...saved, ...invalid }), null);
});

// Use the exact bundled Matter implementation used by Phaser, without a browser shim.
const require = createRequire(import.meta.url);
const Engine = require('phaser/src/physics/matter-js/lib/core/Engine.js');
const Body = require('phaser/src/physics/matter-js/lib/body/Body.js');
const Bodies = require('phaser/src/physics/matter-js/lib/factory/Bodies.js');
const Composite = require('phaser/src/physics/matter-js/lib/body/Composite.js');

test('a moving, rotating fruit follows the same trajectory after saving and restoring in real Matter', () => {
  const original = Engine.create({ gravity: { x: 0, y: 1.12 } });
  const fruit = Bodies.circle(200, 64, 20, { frictionAir: .006 });
  Composite.add(original.world, fruit);
  Body.setVelocity(fruit, { x: 1.3, y: 2.1 });
  Body.setAngularVelocity(fruit, .014);
  for (let i = 0; i < 12; i++) Engine.update(original, FIXED_STEP);
  const state = saveFruit(fruit, 2, 200);
  assert.ok(state.vy! > 2);
  const resumed = Engine.create({ gravity: { x: 0, y: 1.12 } });
  const restored = Bodies.circle(state.x, state.y, 20, { frictionAir: .006 });
  Composite.add(resumed.world, restored);
  restoreFruit(restored, state, Body);
  for (let i = 0; i < 24; i++) { Engine.update(original, FIXED_STEP); Engine.update(resumed, FIXED_STEP); }
  assert.ok(Math.abs(fruit.position.x - restored.position.x) < 1e-7);
  assert.ok(Math.abs(fruit.position.y - restored.position.y) < 1e-7);
  assert.ok(Math.abs(fruit.angle - restored.angle) < 1e-7);
});

test('snapshot preserves fruit entry age without granting settled fruit a fresh grace period', () => {
  const body = Bodies.circle(200, 200, 20);
  assert.equal(saveFruit(body, 2, 320).age, 320);
  const old = saveFruit(body, 2, 999999);
  assert.ok(old.age! > SPAWN_GRACE);
  assert.ok(validateSession({ ...saved, fruits: [old] }));
});
