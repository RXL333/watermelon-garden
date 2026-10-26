import { isDifficulty, type Difficulty } from './rules.ts';

export type RoundResult = { score: number; drops: number; highest: number; difficulty: Difficulty };
export type ActiveRound = { id: string; startedAt: number };
export type HistoryEntry = ActiveRound & RoundResult & { endedAt: number; reason: 'finished' | 'restarted' };

const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;

export function validateActiveRound(value: unknown): ActiveRound | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return typeof raw.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(raw.id) && integer(raw.startedAt, 1, 8640000000000000)
    ? { id: raw.id, startedAt: raw.startedAt } : null;
}

export function validateHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: HistoryEntry[] = [], ids = new Set<string>();
  for (const item of value) {
    const active = validateActiveRound(item);
    if (!active || ids.has(active.id) || !isDifficulty(item.difficulty) || !integer(item.score, 0, 1e9)
      || !integer(item.drops, 1, 1e7) || !integer(item.highest, 0, 10) || !integer(item.endedAt, active.startedAt, 8640000000000000)
      || (item.reason !== 'finished' && item.reason !== 'restarted')) continue;
    ids.add(active.id);
    entries.push({ ...active, score: item.score, drops: item.drops, highest: item.highest, difficulty: item.difficulty, endedAt: item.endedAt, reason: item.reason });
  }
  return entries.sort((a, b) => b.endedAt - a.endedAt);
}

export function newActiveRound(now = Date.now()): ActiveRound {
  return { id: globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`, startedAt: now };
}
