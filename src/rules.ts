export const BOARD = { width: 400, height: 560, left: 24, right: 376, floor: 536, danger: 142, spawnY: 64 } as const;
export const FRUITS = [
  { name: '葡萄', radius: 11, points: 1, color: 0x9873b6 },
  { name: '樱桃', radius: 15, points: 3, color: 0xd96b79 },
  { name: '草莓', radius: 20, points: 6, color: 0xed8a85 },
  { name: '蜜橘', radius: 25, points: 10, color: 0xf2ad54 },
  { name: '柠檬', radius: 30, points: 15, color: 0xe9cb66 },
  { name: '猕猴桃', radius: 36, points: 21, color: 0x9eae6c },
  { name: '蜜桃', radius: 43, points: 28, color: 0xefb0a4 },
  { name: '苹果', radius: 50, points: 36, color: 0xde8272 },
  { name: '菠萝', radius: 58, points: 45, color: 0xdec079 },
  { name: '蜜瓜', radius: 68, points: 55, color: 0xb0c495 },
  { name: '西瓜', radius: 80, points: 66, color: 0x6f9e71 },
] as const;

export const DROP_WEIGHTS = [35, 28, 20, 12, 5] as const;
export const DANGER_LIMIT = 2000;
export const SPAWN_GRACE = 1400;
export const FIXED_STEP = 1000 / 60;

export function randomLevel(value: number): number {
  const target = Math.max(0, Math.min(0.999999999, value)) * 100;
  let sum = 0;
  for (let level = 0; level < DROP_WEIGHTS.length; level++) {
    sum += DROP_WEIGHTS[level];
    if (target < sum) return level;
  }
  return 4;
}

export class GardenRandom {
  state: number;
  constructor(seed = Date.now()) { this.state = seed >>> 0; }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export type Mergeable = { id: number; level: number };
export type Contact = readonly [number, number];

// Reserve both bodies together. Three touching fruits must never consume the same body twice.
export function selectMerges(contacts: Contact[], lookup: (id: number) => Mergeable | undefined): Contact[] {
  const claimed = new Set<number>();
  const selected: Contact[] = [];
  const ordered = contacts.slice().sort((a, b) => Math.min(...a) - Math.min(...b) || Math.max(...a) - Math.max(...b));
  for (const [aId, bId] of ordered) {
    if (aId === bId || claimed.has(aId) || claimed.has(bId)) continue;
    const a = lookup(aId);
    const b = lookup(bId);
    if (!a || !b || a.level !== b.level) continue;
    claimed.add(aId);
    claimed.add(bId);
    selected.push([aId, bId]);
  }
  return selected;
}

export function advanceDanger(previous: number, overflow: boolean, delta: number): number {
  return overflow ? Math.min(DANGER_LIMIT, previous + Math.max(0, delta)) : 0;
}

export function clampDropX(x: number, level: number): number {
  const radius = FRUITS[level].radius;
  return Math.max(BOARD.left + radius + 2, Math.min(BOARD.right - radius - 2, x));
}

export type FruitSnapshot = { level: number; x: number; y: number; angle: number };
export type SessionSnapshot = {
  score: number;
  current: number;
  next: number;
  random: number;
  drops: number;
  highest: number;
  fruits: FruitSnapshot[];
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown, min: number, max: number): value is number => finite(value) && Number.isInteger(value) && value >= min && value <= max;

export function validateSession(value: unknown): SessionSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (!integer(s.score, 0, 1e9) || !integer(s.current, 0, 4) || !integer(s.next, 0, 4)
    || !integer(s.random, 0, 0xffffffff) || !integer(s.drops, 0, 1e7) || !integer(s.highest, 0, 10)
    || !Array.isArray(s.fruits) || s.fruits.length > 240) return null;
  const fruits: FruitSnapshot[] = [];
  for (const raw of s.fruits) {
    if (!raw || typeof raw !== 'object') return null;
    const f = raw as Record<string, unknown>;
    if (!integer(f.level, 0, 10) || !finite(f.x) || !finite(f.y) || !finite(f.angle)
      || f.x < -80 || f.x > BOARD.width + 80 || f.y < -100 || f.y > BOARD.height + 80 || Math.abs(f.angle) > 1e5) return null;
    fruits.push({ level: f.level, x: clampDropX(f.x, f.level), y: Math.min(f.y, BOARD.floor - FRUITS[f.level].radius), angle: f.angle });
  }
  return { score: s.score, current: s.current, next: s.next, random: s.random, drops: s.drops, highest: s.highest, fruits };
}
