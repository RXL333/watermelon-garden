import { growthScale } from './physics.ts';

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

export const DIFFICULTIES = {
  easy: { name: '轻松', subtitle: '慢慢种，慢慢长大', radiusScale: 0.88, dangerLimit: 3000, dropWeights: [38, 30, 22, 10] },
  classic: { name: '经典', subtitle: '刚刚好的小挑战', radiusScale: 1, dangerLimit: 2000, dropWeights: [35, 28, 20, 12, 5] },
  hard: { name: '挑战', subtitle: '给合成高手的花园', radiusScale: 1.08, dangerLimit: 1200, dropWeights: [33, 26, 19, 12, 7, 3] },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const DIFFICULTY_IDS: readonly Difficulty[] = ['easy', 'classic', 'hard'];
export const DEFAULT_DIFFICULTY: Difficulty = 'classic';
export const DROP_WEIGHTS = DIFFICULTIES.classic.dropWeights;
export const DANGER_LIMIT = DIFFICULTIES.classic.dangerLimit;
export const SPAWN_GRACE = 1400;
export const FIXED_STEP = 1000 / 60;
export const UNDO_LIMIT = 3;

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTIES, value);
}

export function fruitRadius(level: number, difficulty: Difficulty = DEFAULT_DIFFICULTY): number {
  return FRUITS[level].radius * DIFFICULTIES[difficulty].radiusScale;
}

export function randomLevel(value: number, difficulty: Difficulty = DEFAULT_DIFFICULTY): number {
  const weights = DIFFICULTIES[difficulty].dropWeights;
  const target = Math.max(0, Math.min(0.999999999, value)) * 100;
  let sum = 0;
  for (let level = 0; level < weights.length; level++) {
    sum += weights[level];
    if (target < sum) return level;
  }
  return weights.length - 1;
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

export function advanceDanger(previous: number, overflow: boolean, delta: number, difficulty: Difficulty = DEFAULT_DIFFICULTY): number {
  return overflow ? Math.min(DIFFICULTIES[difficulty].dangerLimit, previous + Math.max(0, delta)) : 0;
}

export function clampDropX(x: number, level: number, difficulty: Difficulty = DEFAULT_DIFFICULTY): number {
  const radius = fruitRadius(level, difficulty);
  return Math.max(BOARD.left + radius + 2, Math.min(BOARD.right - radius - 2, x));
}

export type FruitSnapshot = { level: number; x: number; y: number; angle: number; vx?: number; vy?: number; spin?: number; age?: number; growth?: number };
export type RoundSnapshot = {
  difficulty: Difficulty;
  score: number;
  current: number;
  next: number;
  random: number;
  drops: number;
  highest: number;
  fruits: FruitSnapshot[];
  dangerMs?: number;
};
export type SessionSnapshot = RoundSnapshot & { undosLeft?: number; previousTurn?: RoundSnapshot };

const copyRound = (round: RoundSnapshot): RoundSnapshot => ({ ...round, fruits: round.fruits.map(fruit => ({ ...fruit })) });

export class TurnHistory {
  remaining: number;
  previous?: RoundSnapshot;

  constructor(remaining = UNDO_LIMIT, previous?: RoundSnapshot) {
    this.remaining = remaining;
    this.previous = remaining > 0 && previous ? copyRound(previous) : undefined;
  }

  remember(round: RoundSnapshot): void { this.previous = this.remaining > 0 ? copyRound(round) : undefined; }

  take(): RoundSnapshot | undefined {
    if (this.remaining <= 0 || !this.previous) return undefined;
    const round = this.previous;
    this.previous = undefined;
    this.remaining--;
    return round;
  }
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown, min: number, max: number): value is number => finite(value) && Number.isInteger(value) && value >= min && value <= max;

function validateRound(value: unknown): RoundSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  // Saves made before difficulty selection belong to the original classic rules.
  const difficulty = s.difficulty === undefined ? DEFAULT_DIFFICULTY : s.difficulty;
  if (!isDifficulty(difficulty)) return null;
  const lastDropLevel = DIFFICULTIES[difficulty].dropWeights.length - 1;
  if (!integer(s.score, 0, 1e9) || !integer(s.current, 0, lastDropLevel) || !integer(s.next, 0, lastDropLevel)
    || !integer(s.random, 0, 0xffffffff) || !integer(s.drops, 0, 1e7) || !integer(s.highest, 0, 10)
    || !Array.isArray(s.fruits) || s.fruits.length > 240) return null;
  const fruits: FruitSnapshot[] = [];
  for (const raw of s.fruits) {
    if (!raw || typeof raw !== 'object') return null;
    const f = raw as Record<string, unknown>;
    if (!integer(f.level, 0, 10) || !finite(f.x) || !finite(f.y) || !finite(f.angle)
      || f.x < -80 || f.x > BOARD.width + 80 || f.y < -100 || f.y > BOARD.height + 80 || Math.abs(f.angle) > 1e5) return null;
    const fruit: FruitSnapshot = { level: f.level, x: clampDropX(f.x, f.level, difficulty), y: Math.min(f.y, BOARD.floor - fruitRadius(f.level, difficulty)), angle: f.angle };
    for (const field of ['vx', 'vy', 'spin', 'age'] as const) {
      const motion = f[field];
      if (motion === undefined) continue;
      const limit = field === 'age' ? SPAWN_GRACE + FIXED_STEP : field === 'spin' ? 10 : 100;
      if (!finite(motion) || Math.abs(motion) > limit || (field === 'age' && motion < 0)) return null;
      fruit[field] = motion;
    }
    if (f.growth !== undefined) {
      if (!finite(f.growth) || f.growth < 0 || f.growth > 1) return null;
      fruit.growth = f.growth;
      const radius = fruitRadius(f.level, difficulty) * growthScale(f.growth);
      fruit.x = Math.max(BOARD.left + radius + 2, Math.min(BOARD.right - radius - 2, f.x));
      fruit.y = Math.min(f.y, BOARD.floor - radius);
    }
    fruits.push(fruit);
  }
  const round: RoundSnapshot = { difficulty, score: s.score, current: s.current, next: s.next, random: s.random, drops: s.drops, highest: s.highest, fruits };
  if (s.dangerMs !== undefined) {
    if (!finite(s.dangerMs) || s.dangerMs < 0 || s.dangerMs >= DIFFICULTIES[difficulty].dangerLimit) return null;
    round.dangerMs = s.dangerMs;
  }
  return round;
}

export function validateSession(value: unknown): SessionSnapshot | null {
  const round = validateRound(value);
  if (!round) return null;
  const raw = value as Record<string, unknown>;
  const session: SessionSnapshot = { ...round };
  if (raw.undosLeft !== undefined) {
    if (!integer(raw.undosLeft, 0, UNDO_LIMIT)) return null;
    session.undosLeft = raw.undosLeft;
  }
  if ((session.undosLeft ?? UNDO_LIMIT) > 0 && raw.previousTurn !== undefined) {
    const previous = validateRound(raw.previousTurn);
    // A broken undo slot must not destroy an otherwise healthy saved game.
    if (previous && previous.difficulty === round.difficulty && previous.drops === round.drops - 1 && previous.score <= round.score) session.previousTurn = previous;
  }
  return session;
}
