import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FRUIT_MATERIAL, PHYSICS_ENGINE, GROWTH_DURATION, growthScale, growBody, wakePile, applyMergePressure } from '../src/physics.ts';
import { FIXED_STEP, BOARD, GardenRandom, fruitRadius, clampDropX, randomLevel, selectMerges, validateSession, type Contact } from '../src/rules.ts';
import { saveFruit, restoreFruit } from '../src/physics-state.ts';

const require = createRequire(import.meta.url);
const Engine = require('phaser/src/physics/matter-js/lib/core/Engine.js');
const Body = require('phaser/src/physics/matter-js/lib/body/Body.js');
const Bodies = require('phaser/src/physics/matter-js/lib/factory/Bodies.js');
const Composite = require('phaser/src/physics/matter-js/lib/body/Composite.js');
const Sleeping = require('phaser/src/physics/matter-js/lib/core/Sleeping.js');
const Events = require('phaser/src/physics/matter-js/lib/core/Events.js');
const circle = (x: number, y: number, r: number) => Bodies.circle(x, y, r, { ...FRUIT_MATERIAL });
const engine = () => Engine.create({ ...PHYSICS_ENGINE, gravity: { ...PHYSICS_ENGINE.gravity } });
const step = (world: ReturnType<typeof engine>, count: number) => { for (let i = 0; i < count; i++) Engine.update(world, FIXED_STEP); };

test('removing sleeping supports used to leave fruit floating; waking the pile makes it fall', () => {
  const fall = (wake: boolean) => {
    const world = engine();
    const left = circle(170, 516, 20), right = circle(230, 516, 20), top = circle(200, 470, 28);
    Composite.add(world.world, [Bodies.rectangle(200, 552, 400, 32, { isStatic: true }), left, right, top]);
    for (const body of [left, right, top]) Sleeping.set(body, true);
    Composite.remove(world.world, left); Composite.remove(world.world, right);
    if (wake) wakePile([top], Sleeping);
    step(world, 90);
    return top.position.y;
  };
  assert.equal(fall(false), 470, 'reproduces the old suspended-fruit bug');
  assert.ok(fall(true) > 500, 'actual gravity settles the fruit on the floor');
});

test('merge growth expands the actual collider and displaces touching fruit without teleporting it', () => {
  const world = engine();
  world.gravity.y = 0;
  const merged = circle(200, 250, 30 * growthScale(0));
  const neighbor = circle(200 + 30 * growthScale(0) + 20, 250, 20);
  Composite.add(world.world, [merged, neighbor]);
  const start = neighbor.position.x;
  for (let frame = 1; frame <= 30; frame++) {
    growBody(merged, 30, frame * FIXED_STEP / GROWTH_DURATION, Body);
    Engine.update(world, FIXED_STEP);
  }
  assert.ok(Math.abs(merged.circleRadius - 30) < .001);
  assert.ok(neighbor.position.x > start + 1);
  assert.ok(Number.isFinite(merged.velocity.x));
});

test('a local pressure pulse travels through a multi-layer contact stack to lower fruit', t => {
  const world = engine();
  const stack: MatterJS.BodyType[] = [];
  const radius = 22;
  for (let row = 0; row < 5; row++) for (let column = 0; column < 6; column++) {
    stack.push(circle(62 + column * 48 + (row % 2 ? 24 : 0), BOARD.floor - radius - row * 38, radius));
  }
  Composite.add(world.world, [
    Bodies.rectangle(200, 552, 400, 32, { isStatic: true, friction: .08 }),
    Bodies.rectangle(12, 300, 24, 650, { isStatic: true }), Bodies.rectangle(388, 300, 24, 650, { isStatic: true }), ...stack,
  ]);
  step(world, 600);
  for (const body of stack) Sleeping.set(body, true);
  const top = [...stack].sort((a, b) => a.position.y - b.position.y)[1];
  const source = circle(top.position.x, top.position.y - 45, 30 * growthScale(0));
  Composite.add(world.world, source);
  const lower = stack.filter(body => body.position.y > 470);
  const before = lower.map(body => ({ x: body.position.x, y: body.position.y }));
  wakePile(stack, Sleeping);
  applyMergePressure(source, 30, stack, Body);
  for (let frame = 1; frame <= 120; frame++) {
    growBody(source, 30, frame * FIXED_STEP / GROWTH_DURATION, Body);
    Engine.update(world, FIXED_STEP);
  }
  const movement = lower.map((body, i) => Math.hypot(body.position.x - before[i].x, body.position.y - before[i].y));
  t.diagnostic(JSON.stringify({ lowerFruit: lower.length, movedOverHalfPixel: movement.filter(value => value > .5).length, maxDisplacement: Math.max(...movement) }));
  assert.ok(lower.length >= 6);
  assert.ok(movement.filter(value => value > .5).length >= 2, 'movement reaches lower layers through contacts');
  assert.ok([...stack, source].every(body => Number.isFinite(body.position.x) && Number.isFinite(body.position.y) && body.speed < 25));
});

test('an isolated settled fruit sleeps again after the physical reaction ends', () => {
  const world = engine();
  const fruit = circle(200, 160, 25);
  Composite.add(world.world, [fruit, Bodies.rectangle(200, 552, 400, 32, { isStatic: true })]);
  step(world, 900);
  assert.equal(fruit.isSleeping, true);
  assert.ok(Math.abs(fruit.position.y - (BOARD.floor - 25)) < 1);
});

test('saving midway through physical growth resumes the same collider size and motion', () => {
  const original = engine();
  const fruit = circle(200, 140, 30 * growthScale(0));
  Composite.add(original.world, fruit);
  Body.setVelocity(fruit, { x: 1.2, y: 0 });
  for (let frame = 1; frame <= 4; frame++) { growBody(fruit, 30, frame * FIXED_STEP / GROWTH_DURATION, Body); Engine.update(original, FIXED_STEP); }
  const state = { ...saveFruit(fruit, 4, FIXED_STEP * 4), growth: FIXED_STEP * 4 / GROWTH_DURATION };
  const session = { difficulty: 'classic', score: 15, drops: 2, highest: 4, current: 0, next: 0, random: 123, fruits: [state] };
  assert.ok(validateSession(session));
  const floorY = BOARD.floor - 30 * growthScale(state.growth);
  const atFloor = validateSession({ ...session, fruits: [{ ...state, y: floorY }] });
  assert.equal(atFloor?.fruits[0].y, floorY, 'a growing fruit is clamped by its actual radius');
  assert.equal(validateSession({ ...session, fruits: [{ ...state, growth: 1.1 }] }), null);
  const resumed = engine(), restored = circle(state.x, state.y, 30 * growthScale(state.growth));
  Composite.add(resumed.world, restored);
  restoreFruit(restored, state, Body);
  for (let frame = 5; frame <= 35; frame++) {
    growBody(fruit, 30, frame * FIXED_STEP / GROWTH_DURATION, Body);
    growBody(restored, 30, frame * FIXED_STEP / GROWTH_DURATION, Body);
    Engine.update(original, FIXED_STEP); Engine.update(resumed, FIXED_STEP);
  }
  assert.ok(Math.abs(fruit.position.x - restored.position.x) < 1e-7);
  assert.ok(Math.abs(fruit.position.y - restored.position.y) < 1e-7);
  assert.equal(fruit.circleRadius, restored.circleRadius);
});

test('64 staggered drops with collision-driven merges stay finite and contained', t => {
  const world = engine(), rng = new GardenRandom(31232);
  Composite.add(world.world, [
    Bodies.rectangle(200, 552, 400, 32, { isStatic: true, friction: .08 }),
    Bodies.rectangle(12, 320, 24, 600, { isStatic: true }), Bodies.rectangle(388, 320, 24, 600, { isStatic: true }),
  ]);
  const fruits = new Map<number, { body: MatterJS.BodyType; level: number; born: number; growing: boolean }>();
  let contacts: Contact[] = [], merges = 0, maxSpeed = 0, peakFruit = 0;
  const collect = (event: { pairs: { bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }[] }) => {
    for (const pair of event.pairs) contacts.push([pair.bodyA.id, pair.bodyB.id]);
  };
  Events.on(world, 'collisionStart collisionActive', collect);
  for (let frame = 0; frame < 1800; frame++) {
    if (frame < 1280 && frame % 20 === 0) {
      const level = randomLevel(rng.next()), radius = fruitRadius(level);
      const body = circle(clampDropX(30 + rng.next() * 340, level), BOARD.spawnY, radius);
      Composite.add(world.world, body);
      wakePile([...fruits.values()].map(fruit => fruit.body), Sleeping);
      fruits.set(body.id, { body, level, born: frame, growing: false });
    }
    for (const fruit of fruits.values()) if (fruit.growing) growBody(fruit.body, fruitRadius(fruit.level), (frame - fruit.born) * FIXED_STEP / GROWTH_DURATION, Body);
    contacts = [];
    Engine.update(world, FIXED_STEP);
    for (const [a, b] of selectMerges(contacts, id => { const fruit = fruits.get(id); return fruit ? { id, level: fruit.level } : undefined; })) {
      const one = fruits.get(a)!, two = fruits.get(b)!;
      const x = (one.body.position.x + two.body.position.x) / 2, y = (one.body.position.y + two.body.position.y) / 2;
      wakePile([...fruits.values()].map(fruit => fruit.body), Sleeping);
      Composite.remove(world.world, one.body); Composite.remove(world.world, two.body);
      fruits.delete(a); fruits.delete(b); merges++;
      const level = one.level + 1;
      if (level > 10) continue;
      const radius = fruitRadius(level), body = circle(clampDropX(x, level), Math.min(y, BOARD.floor - radius), radius * growthScale(0));
      Body.setVelocity(body, { x: (one.body.velocity.x + two.body.velocity.x) * .35, y: Math.min(1, (one.body.velocity.y + two.body.velocity.y) * .3) });
      Composite.add(world.world, body);
      applyMergePressure(body, radius, [...fruits.values()].map(fruit => fruit.body), Body);
      fruits.set(body.id, { body, level, born: frame, growing: true });
    }
    peakFruit = Math.max(peakFruit, fruits.size);
    for (const { body } of fruits.values()) {
      maxSpeed = Math.max(maxSpeed, body.speed);
      assert.ok(Number.isFinite(body.position.x) && Number.isFinite(body.position.y));
      assert.ok(body.position.x > BOARD.left - 2 && body.position.x < BOARD.right + 2);
      assert.ok(body.position.y < BOARD.floor + 2);
    }
  }
  t.diagnostic(JSON.stringify({ drops: 64, merges, remaining: fruits.size, peakFruit, maxSpeed }));
  assert.ok(merges > 20);
  assert.ok(maxSpeed < 35);
});
