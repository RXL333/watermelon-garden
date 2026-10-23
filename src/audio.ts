export class GardenAudio {
  enabled = true;
  private context?: AudioContext;
  private lastImpact = 0;

  unlock(): void {
    if (!this.enabled) return;
    try {
      const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!this.context && Audio) this.context = new Audio();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional, including on browsers with restricted autoplay. */ }
  }

  private note(frequency: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'sine'): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const voice = ctx.createOscillator();
    const gain = ctx.createGain();
    voice.type = type;
    voice.frequency.setValueAtTime(frequency, start);
    voice.frequency.exponentialRampToValueAtTime(frequency * 0.75, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    voice.connect(gain);
    gain.connect(ctx.destination);
    voice.start(start);
    voice.stop(start + duration + 0.02);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); };
  }

  drop(): void { this.note(510, 0.12, 0.035, 0, 'triangle'); }
  undo(): void { this.note(660, 0.17, 0.025); this.note(440, 0.22, 0.025, 0.08); }
  impact(): void {
    if (performance.now() - this.lastImpact < 140) return;
    this.lastImpact = performance.now();
    this.note(170, 0.09, 0.014);
  }
  merge(level: number, combo: number): void {
    const scale = [0, 2, 4, 7, 9];
    const pitch = 440 * Math.pow(2, (scale[(level + combo) % 5] + (level > 6 ? 12 : 0)) / 12);
    this.note(pitch, 0.28, 0.055);
    this.note(pitch * 1.5, 0.22, 0.025, 0.055);
  }
  celebrate(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.note(n, 0.45, 0.05, i * 0.11));
  }
  end(): void { [392, 330, 262].forEach((n, i) => this.note(n, 0.32, 0.035, i * 0.12)); }
}
