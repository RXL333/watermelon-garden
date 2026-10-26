import { DEFAULT_DIFFICULTY, DIFFICULTY_IDS, isDifficulty, validateSession, type Difficulty, type SessionSnapshot } from './rules.ts';
import { DEFAULT_FRUIT_STYLE, isFruitStyle, type FruitStyleId } from './fruit-art.ts';
import { newActiveRound, validateActiveRound, validateHistory, type ActiveRound, type HistoryEntry, type RoundResult } from './round-history.ts';

const KEY = 'watermelon-garden:v1';
export type Preferences = { sound: boolean; gentle: boolean; difficulty: Difficulty; fruitStyle: FruitStyleId };

export class GardenStorage {
  bests: Record<Difficulty, number> = { easy: 0, classic: 0, hard: 0 };
  discovered = 0;
  session: SessionSnapshot | null = null;
  history: HistoryEntry[] = [];
  activeRound: ActiveRound | null = null;
  preferences: Preferences = { sound: true, gentle: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, difficulty: DEFAULT_DIFFICULTY, fruitStyle: DEFAULT_FRUIT_STYLE };
  available = true;
  private backend?: Pick<Storage, 'getItem' | 'setItem'>;

  constructor(backend?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      this.backend = backend ?? localStorage;
      const raw = this.backend.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return;
      if (Number.isSafeInteger(data.best) && data.best >= 0 && data.best <= 1e9) this.bests.classic = data.best;
      for (const difficulty of DIFFICULTY_IDS) {
        const score = data.bests?.[difficulty];
        if (Number.isSafeInteger(score) && score >= 0 && score <= 1e9) this.bests[difficulty] = Math.max(this.bests[difficulty], score);
      }
      if (Number.isInteger(data.discovered) && data.discovered >= 0 && data.discovered <= 10) this.discovered = data.discovered;
      if (typeof data.preferences?.sound === 'boolean') this.preferences.sound = data.preferences.sound;
      if (typeof data.preferences?.gentle === 'boolean') this.preferences.gentle = data.preferences.gentle;
      if (isDifficulty(data.preferences?.difficulty)) this.preferences.difficulty = data.preferences.difficulty;
      if (isFruitStyle(data.preferences?.fruitStyle)) this.preferences.fruitStyle = data.preferences.fruitStyle;
      this.session = validateSession(data.session);
      this.history = validateHistory(data.history);
      this.activeRound = this.session ? validateActiveRound(data.activeRound) : null;
      if (this.history.some(entry => entry.id === this.activeRound?.id)) this.activeRound = null;
      for (const entry of this.history) this.recordScore(entry.difficulty, entry.score);
      if (this.session) {
        this.recordScore(this.session.difficulty, this.session.score);
        this.discovered = Math.max(this.discovered, this.session.highest);
      }
    } catch { this.available = false; }
  }

  bestFor(difficulty: Difficulty): number { return this.bests[difficulty]; }

  recordScore(difficulty: Difficulty, score: number): void {
    this.bests[difficulty] = Math.max(this.bests[difficulty], score);
  }

  beginRound(resume: boolean, now = Date.now()): void {
    if (!resume || !this.activeRound) this.activeRound = newActiveRound(now);
  }

  finishRound(result: RoundResult, reason: HistoryEntry['reason'], now = Date.now()): void {
    if (!this.activeRound && !this.session) return;
    if (result.drops > 0) {
      this.activeRound ??= newActiveRound(now);
      if (!this.history.some(entry => entry.id === this.activeRound!.id)) {
        const { score, drops, highest, difficulty } = result;
        this.history.unshift({ ...this.activeRound, score, drops, highest, difficulty, endedAt: Math.max(now, this.activeRound.startedAt), reason });
        this.recordScore(result.difficulty, result.score);
      }
    }
    this.activeRound = null;
    this.save(null);
  }

  save(session = this.session): void {
    this.session = session;
    try {
      if (!this.backend) { this.available = false; return; }
      this.backend.setItem(KEY, JSON.stringify({ version: 1, best: this.bests.classic, bests: this.bests, discovered: this.discovered, preferences: this.preferences, session, history: this.history, activeRound: this.activeRound }));
    } catch { this.available = false; }
  }
}
