export const GROWTH_DURATION = 160;

export const FRUIT_MATERIAL = {
  restitution: 0.18, friction: 0.035, frictionStatic: 0.08, frictionAir: 0.004,
  density: 0.0014, slop: 0.02, sleepThreshold: 180,
} as const;

export const PHYSICS_ENGINE = {
  gravity: { x: 0, y: 1.12 }, enableSleeping: true, positionIterations: 12, velocityIterations: 10,
};

export type SleepingAPI = { set(body: MatterJS.BodyType, sleeping: boolean): unknown };
type BodyAPI = {
  scale(body: MatterJS.BodyType, x: number, y: number): unknown;
  applyForce(body: MatterJS.BodyType, position: { x: number; y: number }, force: { x: number; y: number }): unknown;
};

export function wakePile(bodies: Iterable<MatterJS.BodyType>, sleeping: SleepingAPI): void {
  // Reset the counter for awake supports too, so they cannot fall asleep halfway through the wave.
  for (const body of bodies) if (!body.isStatic) sleeping.set(body, false);
}

export function growthScale(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return 0.84 + 0.16 * (1 - Math.pow(1 - t, 3));
}

export function growBody(body: MatterJS.BodyType, targetRadius: number, progress: number, api: BodyAPI): void {
  const current = body.plugin.gardenRadius ?? body.circleRadius;
  const next = targetRadius * growthScale(progress);
  if (current > 0 && Math.abs(next - current) > 0.00001) {
    const ratio = next / current;
    api.scale(body, ratio, ratio);
    if (body.parts.length > 1) {
      // Matter scales compound vertices, but only updates circleRadius on the root.
      for (const part of body.parts.slice(1)) if (part.circleRadius) part.circleRadius *= ratio;
      body.plugin.gardenRadius = next;
    }
  }
}

// A brief, local pressure pulse; movement beyond this neighborhood travels through real contacts.
export function applyMergePressure(merged: MatterJS.BodyType, radius: number, neighbors: Iterable<MatterJS.BodyType>, api: BodyAPI): void {
  for (const body of neighbors) {
    if (body.id === merged.id || body.isStatic) continue;
    const dx = body.position.x - merged.position.x, dy = body.position.y - merged.position.y;
    const distance = Math.hypot(dx, dy);
    const reach = radius * 1.8 + (body.plugin.gardenRadius ?? body.circleRadius ?? 0);
    if (distance < 1 || distance >= reach) continue;
    const weight = Math.min(1, (reach - distance) / Math.max(1, radius * 0.8));
    const pressure = (0.0015 + radius * 0.000009) * weight * body.mass;
    api.applyForce(body, body.position, { x: dx / distance * pressure, y: dy / distance * pressure });
  }
}
