import { validateSession, type SessionSnapshot } from './rules.ts';

const KEY = 'watermelon-garden:v1';
export type Preferences = { sound: boolean; gentle: boolean };

export class GardenStorage {
  best = 0;
  discovered = 0;
  session: SessionSnapshot | null = null;
  preferences: Preferences = { sound: true, gentle: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  available = true;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return;
      if (Number.isSafeInteger(data.best) && data.best >= 0 && data.best <= 1e9) this.best = data.best;
      if (Number.isInteger(data.discovered) && data.discovered >= 0 && data.discovered <= 10) this.discovered = data.discovered;
      if (typeof data.preferences?.sound === 'boolean') this.preferences.sound = data.preferences.sound;
      if (typeof data.preferences?.gentle === 'boolean') this.preferences.gentle = data.preferences.gentle;
      this.session = validateSession(data.session);
      if (this.session) {
        this.best = Math.max(this.best, this.session.score);
        this.discovered = Math.max(this.discovered, this.session.highest);
      }
    } catch { this.available = false; }
  }

  save(session = this.session): void {
    this.session = session;
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, best: this.best, discovered: this.discovered, preferences: this.preferences, session }));
    } catch { this.available = false; }
  }
}
