import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createFruitBody, fruitBodyRadius, fruitParent, landingOnBody } from '../src/fruit-body.ts';
import { FRUIT_STYLE_IDS } from '../src/fruit-art.ts';
import { FRUIT_MATERIAL, PHYSICS_ENGINE, growthScale, growBody, GROWTH_DURATION } from '../src/physics.ts';
import { BOARD, FIXED_STEP, fruitRadius, selectMerges, type Contact } from '../src/rules.ts';
import { saveFruit, restoreFruit } from '../src/physics-state.ts';

const require = createRequire(import.meta.url);
const Engine = require('phaser/src/physics/matter-js/lib/core/Engine.js');
const Body = require('phaser/src/physics/matter-js/lib/body/Body.js');
const Bodies = require('phaser/src/physics/matter-js/lib/factory/Bodies.js');
const Composite = require('phaser/src/physics/matter-js/lib/body/Composite.js');
const Events = require('phaser/src/physics/matter-js/lib/core/Events.js');
const api = { circle: Bodies.circle, create: Body.create, setCentre: Body.setCentre };
const engine = () => Engine.create({ ...PHYSICS_ENGINE, gravity: { ...PHYSICS_ENGINE.gravity } });

for (const style of FRUIT_STYLE_IDS) test(`${style}: the pineapple crown physically supports falling fruit and is smaller than a watermelon`, () => {
  const world = engine(), radius = fruitRadius(8);
  const pineapple = createFruitBody(8, 200, 470, radius, style, api);
  assert.equal(pineapple.parts.length, 3);
  assert.equal(pineapple.position.x, 200); assert.equal(pineapple.position.y, 470);
  assert.ok(pineapple.bounds.max.y - pineapple.bounds.min.y < fruitRadius(10) * 2);
  Body.setStatic(pineapple, true);
  const grape = Bodies.circle(200, 180, 11, { ...FRUIT_MATERIAL });
  // Narrow vertical rails keep the fruit from rolling off the sloped leaves during this support check.
  Composite.add(world.world, [pineapple, grape, Bodies.rectangle(180, 320, 12, 400, { isStatic: true }), Bodies.rectangle(220, 320, 12, 400, { isStatic: true })]);
  let crownContacts = 0;
  Events.on(world, 'collisionStart collisionActive', (event: { pairs: { bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }[] }) => {
    for (const pair of event.pairs) if ([pair.bodyA, pair.bodyB].some(part => part.label === 'pineapple-crown') && [pair.bodyA, pair.bodyB].some(part => part.id === grape.id)) crownContacts++;
  });
  const landing = landingOnBody(pineapple, 200, 11);
  assert.ok(landing < pineapple.position.y - radius - 20, 'the aiming guide sees the leaves, above the flesh');
  for (let frame = 0; frame < 360; frame++) Engine.update(world, FIXED_STEP);
  assert.ok(crownContacts > 5, 'real leaf contacts persist; fruit does not pass through to the flesh');
  assert.ok(grape.position.y < pineapple.position.y - radius - 20);
  assert.ok(Math.abs(grape.position.y - landing) < 8);
});

test('leaf-to-flesh contacts resolve to one fruit pair for merging', () => {
  const world = engine(); world.gravity.y = 0;
  const radius = fruitRadius(8);
  const bottom = createFruitBody(8, 200, 440, radius, 'original', api);
  const top = createFruitBody(8, 200, 340, radius, 'original', api);
  assert.ok(bottom.position.y - top.position.y > radius * 2, 'the flesh circles do not touch');
  Composite.add(world.world, [bottom, top]);
  const contacts: Contact[] = [];
  Events.on(world, 'collisionStart', (event: { pairs: { bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }[] }) => {
    for (const pair of event.pairs) contacts.push([fruitParent(pair.bodyA).id, fruitParent(pair.bodyB).id]);
  });
  Engine.update(world, FIXED_STEP);
  const ids = new Set([bottom.id, top.id]);
  assert.equal(selectMerges(contacts, id => ids.has(id) ? { id, level: 8 } : undefined).length, 1);
});

test('growing and rotating compound fruit survives save/restore with the same crown and motion', () => {
  for (const style of FRUIT_STYLE_IDS) {
    const one = engine(), two = engine(), radius = fruitRadius(8);
    const fruit = createFruitBody(8, 200, 250, radius * growthScale(0), style, api);
    Body.setAngle(fruit, .7); Body.setVelocity(fruit, { x: .6, y: .4 }); Body.setAngularVelocity(fruit, .02);
    Composite.add(one.world, fruit);
    for (let frame = 1; frame <= 4; frame++) { growBody(fruit, radius, frame * FIXED_STEP / GROWTH_DURATION, Body); Engine.update(one, FIXED_STEP); }
    const state = saveFruit(fruit, 8, 4 * FIXED_STEP);
    const restored = createFruitBody(8, state.x, state.y, fruitBodyRadius(fruit), style, api);
    restoreFruit(restored, state, Body); Composite.add(two.world, restored);
    for (let frame = 5; frame <= 20; frame++) {
      growBody(fruit, radius, frame * FIXED_STEP / GROWTH_DURATION, Body);
      growBody(restored, radius, frame * FIXED_STEP / GROWTH_DURATION, Body);
      Engine.update(one, FIXED_STEP); Engine.update(two, FIXED_STEP);
    }
    assert.ok(Math.abs(fruit.position.x - restored.position.x) < 1e-7);
    assert.ok(Math.abs(fruit.position.y - restored.position.y) < 1e-7);
    assert.ok(Math.abs(fruit.angle - restored.angle) < 1e-7);
    assert.ok(Math.abs(fruitBodyRadius(fruit) - radius) < 1e-7);
    assert.ok(Math.abs(fruit.parts[1].circleRadius - radius) < 1e-7);
    assert.ok(Math.abs(fruit.bounds.min.y - restored.bounds.min.y) < 1e-7);
  }
});

test('all five tilted pineapples settle against the real walls and floor without tunneling', () => {
  for (const style of FRUIT_STYLE_IDS) for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    const world = engine(), fruit = createFruitBody(8, 80, 220, fruitRadius(8), style, api);
    Body.setAngle(fruit, angle); Body.setVelocity(fruit, { x: -1, y: 2 });
    Composite.add(world.world, [fruit, Bodies.rectangle(200, BOARD.floor + 16, 400, 32, { isStatic: true }), Bodies.rectangle(12, 320, 24, 600, { isStatic: true }), Bodies.rectangle(388, 320, 24, 600, { isStatic: true })]);
    for (let frame = 0; frame < 600; frame++) Engine.update(world, FIXED_STEP);
    assert.ok(Number.isFinite(fruit.angle) && Number.isFinite(fruit.position.x));
    const vertices = fruit.parts.slice(1).flatMap((part: MatterJS.BodyType) => part.vertices ?? []);
    assert.ok(Math.max(...vertices.map((v: { y: number }) => v.y)) <= BOARD.floor + 1);
    assert.ok(Math.min(...vertices.map((v: { x: number }) => v.x)) >= BOARD.left - 1);
    assert.ok(Math.max(...vertices.map((v: { x: number }) => v.x)) <= BOARD.right + 1);
    assert.ok(fruit.speed < .1);
  }
});
