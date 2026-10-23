import { FIXED_STEP, SPAWN_GRACE, type FruitSnapshot } from './rules.ts';

type MotionAPI = {
  setAngle(body: MatterJS.BodyType, angle: number): unknown;
  setVelocity(body: MatterJS.BodyType, velocity: { x: number; y: number }): unknown;
  setAngularVelocity(body: MatterJS.BodyType, velocity: number): unknown;
};

export function saveFruit(body: MatterJS.BodyType, level: number, age: number): FruitSnapshot {
  return {
    level, x: body.position.x, y: body.position.y, angle: body.angle,
    vx: body.velocity.x, vy: body.velocity.y, spin: body.angularVelocity,
    age: Math.min(SPAWN_GRACE + FIXED_STEP, Math.max(0, age)),
  };
}

export function restoreFruit(body: MatterJS.BodyType, fruit: FruitSnapshot, api: MotionAPI): void {
  api.setAngle(body, fruit.angle);
  api.setVelocity(body, { x: fruit.vx ?? 0, y: fruit.vy ?? 0 });
  api.setAngularVelocity(body, fruit.spin ?? 0);
}
