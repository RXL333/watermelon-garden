import { FRUIT_STYLES, type FruitStyleId } from './fruit-art.ts';
import { FRUIT_MATERIAL } from './physics.ts';

export const PINEAPPLE_LEVEL = 8;
type Point = { x: number; y: number };
export type FruitBodyAPI = {
  circle(x: number, y: number, radius: number, options: MatterJS.IBodyDefinition, sides?: number): MatterJS.BodyType;
  create(options: MatterJS.IBodyDefinition): MatterJS.BodyType;
  setCentre(body: MatterJS.BodyType, centre: Point, relative: boolean): unknown;
};

// Convex leaf fans in each atlas crop. They overlap the flesh so there is no seam to fall through.
const CROWNS: Record<FruitStyleId, readonly (readonly [number, number])[]> = {
  original: [[55, 47], [77, 11], [131, 5], [162, 24], [170, 52], [144, 75], [120, 88], [79, 79]],
  realistic: [[49, 53], [65, 18], [132, 6], [184, 20], [212, 56], [199, 86], [161, 117], [103, 128], [58, 105]],
  cartoon: [[46, 43], [68, 15], [124, 6], [169, 23], [198, 62], [171, 98], [105, 112], [53, 88]],
  fluffy: [[42, 77], [65, 16], [109, 4], [166, 10], [212, 46], [225, 96], [171, 129], [85, 129]],
  clay: [[40, 50], [51, 23], [85, 7], [119, 5], [159, 15], [185, 53], [181, 87], [125, 111], [62, 103]],
};

function centroid(points: Point[]): Point {
  let area = 0, x = 0, y = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length], cross = a.x * b.y - b.x * a.y;
    area += cross; x += (a.x + b.x) * cross; y += (a.y + b.y) * cross;
  });
  return { x: x / (3 * area), y: y / (3 * area) };
}

export function createFruitBody(level: number, x: number, y: number, radius: number, style: FruitStyleId, api: FruitBodyAPI): MatterJS.BodyType {
  const flesh = api.circle(x, y, radius, { ...FRUIT_MATERIAL, label: `fruit-${level}` }, Math.max(18, Math.ceil(radius / 2)));
  if (level !== PINEAPPLE_LEVEL) return flesh;
  const [, , , ox, oy, diameter] = FRUIT_STYLES[style].sprites[level];
  const scale = radius * 2 / diameter;
  const vertices = CROWNS[style].map(([px, py]) => ({ x: x + (px - ox) * scale, y: y + (py - oy) * scale }));
  const crown = api.create({ ...FRUIT_MATERIAL, label: 'pineapple-crown', vertices, position: centroid(vertices) });
  const body = api.create({ ...FRUIT_MATERIAL, label: `fruit-${level}`, parts: [flesh, crown] });
  // The heavy flesh remains the rotation/save anchor, independent of the leaf illustration.
  api.setCentre(body, { x, y }, false);
  body.plugin.gardenRadius = radius;
  return body;
}

export function fruitBodyRadius(body: MatterJS.BodyType): number {
  return body.plugin.gardenRadius ?? body.circleRadius;
}

export function fruitParent(body: MatterJS.BodyType): MatterJS.BodyType { return body.parent ?? body; }

// First contact of a vertically falling circle with the actual, possibly rotated compound shape.
export function landingOnBody(body: MatterJS.BodyType, x: number, radius: number): number {
  let top = Infinity;
  const circle = (point: Point, r: number) => {
    const dx = x - point.x;
    if (Math.abs(dx) <= r) top = Math.min(top, point.y - Math.sqrt(Math.max(0, r * r - dx * dx)));
  };
  for (const part of body.parts.length > 1 ? body.parts.slice(1) : [body]) {
    if (part.circleRadius) { circle(part.position, part.circleRadius + radius); continue; }
    const vertices = part.vertices ?? [];
    vertices.forEach((a, i) => {
      circle(a, radius);
      const b = vertices[(i + 1) % vertices.length], dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (!length) return;
      let nx = dy / length, ny = -dx / length;
      if (nx * ((a.x + b.x) / 2 - part.position.x) + ny * ((a.y + b.y) / 2 - part.position.y) < 0) { nx *= -1; ny *= -1; }
      const start = a.x + nx * radius;
      if (Math.abs(dx) < 1e-8) return;
      const t = (x - start) / dx;
      if (t >= 0 && t <= 1) top = Math.min(top, a.y + ny * radius + t * dy);
    });
  }
  return top;
}
