import Phaser from 'phaser';
import { BOARD, FRUITS, FIXED_STEP, SPAWN_GRACE, DANGER_LIMIT, GardenRandom, randomLevel, selectMerges, advanceDanger, clampDropX, type Contact, type SessionSnapshot } from './rules.ts';
import type { GardenAudio } from './audio.ts';

export type Phase = 'loading' | 'intro' | 'playing' | 'paused' | 'over';
type Fruit = {
  body: MatterJS.BodyType;
  image: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  level: number;
  born: number;
  impact: number;
  merged: boolean;
};
type Collision = { pairs: { bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }[] };
export type GardenCallbacks = {
  ready: () => void;
  error: () => void;
  score: (score: number, highest: number) => void;
  next: (level: number) => void;
  danger: (active: boolean) => void;
  merge: (combo: number, level: number) => void;
  victory: () => void;
  over: (score: number, highest: number) => void;
  save: (session: SessionSnapshot) => void;
};

// Atlas cells stay intact. Origins align each painted round body, rather than its leaf/stem, with its collider.
const METRICS = [
  [185, 213, 286], [192, 227, 282], [192, 215, 294], [186, 215, 304],
  [181, 219, 306], [184, 205, 318], [179, 214, 311], [182, 213, 309],
  [183, 224, 294], [180, 197, 326], [182, 194, 338], [181, 190, 338],
];

export class GardenScene extends Phaser.Scene {
  phase: Phase = 'loading';
  gentle = false;
  score = 0;
  highest = 0;
  drops = 0;
  current = 0;
  next = 0;
  private callbacks: GardenCallbacks;
  private audio: GardenAudio;
  private fruits = new Map<number, Fruit>();
  private contacts: Contact[] = [];
  private random = new GardenRandom();
  private clock = 0;
  private accumulator = 0;
  private dangerMs = 0;
  private dangerActive = false;
  private aimX = BOARD.width / 2;
  private pointerId: number | null = null;
  private lastDrop = -1000;
  private lastMerge = -5000;
  private lastSave = 0;
  private combo = 0;
  private dropGate: number | null = null;
  private preview?: Phaser.GameObjects.Image;
  private guide?: Phaser.GameObjects.Graphics;
  private warning?: Phaser.GameObjects.Graphics;
  private warningText?: Phaser.GameObjects.Text;
  private emptyText?: Phaser.GameObjects.Text;
  private particleCount = 0;
  private cell = 362;
  private pixelRatio: number;

  constructor(callbacks: GardenCallbacks, audio: GardenAudio, pixelRatio: number) {
    super('garden');
    this.callbacks = callbacks;
    this.audio = audio;
    this.pixelRatio = pixelRatio;
  }

  preload(): void {
    this.load.image('fruit-atlas', `${import.meta.env.BASE_URL}assets/fruit-atlas.png`);
    this.load.on('loaderror', () => this.callbacks.error());
  }

  create(): void {
    if (!this.textures.exists('fruit-atlas')) return;
    this.cameras.main.setOrigin(0, 0).setZoom(this.pixelRatio);
    const atlas = this.textures.get('fruit-atlas');
    const source = atlas.getSourceImage() as HTMLImageElement;
    this.cell = source.width / 4;
    for (let i = 0; i < 12; i++) atlas.add(i, 0, (i % 4) * this.cell, Math.floor(i / 4) * source.height / 3, this.cell, source.height / 3);

    const shadow = this.textures.createCanvas('fruit-shadow', 128, 40);
    if (shadow) {
      const ctx = shadow.getContext();
      const gradient = ctx.createRadialGradient(64, 20, 1, 64, 20, 62);
      gradient.addColorStop(0, 'rgba(67,83,47,0.3)');
      gradient.addColorStop(1, 'rgba(67,83,47,0)');
      ctx.save(); ctx.translate(0, 13); ctx.scale(1, 0.34); ctx.fillStyle = gradient; ctx.fillRect(0, -40, 128, 140); ctx.restore();
      shadow.refresh();
    }

    this.matter.world.autoUpdate = false;
    this.matter.world.setGravity(0, 1.12);
    this.matter.add.rectangle(BOARD.left - 12, 320, 24, 600, { isStatic: true, friction: 0.12, restitution: 0.05, label: 'wall' });
    this.matter.add.rectangle(BOARD.right + 12, 320, 24, 600, { isStatic: true, friction: 0.12, restitution: 0.05, label: 'wall' });
    this.matter.add.rectangle(200, BOARD.floor + 16, 400, 32, { isStatic: true, friction: 0.15, restitution: 0.04, label: 'floor' });
    this.drawGarden();
    this.guide = this.add.graphics().setDepth(0);
    this.warning = this.add.graphics().setDepth(7);
    this.warningText = this.add.text(200, 122, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#b36d56', fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
    this.emptyText = this.add.text(200, 445, '一颗一颗，慢慢长大', { fontFamily: 'sans-serif', fontSize: '13px', color: '#c8c7b2', letterSpacing: 3 }).setOrigin(0.5).setDepth(0);
    this.preview = this.makeArt(200, BOARD.spawnY, 0, 15).setDepth(6).setVisible(false);

    this.matter.world.on('collisionstart', (event: Collision) => this.collide(event, true));
    this.matter.world.on('collisionactive', (event: Collision) => this.collide(event, false));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.phase !== 'playing' || this.pointerId !== null) return;
      this.audio.unlock();
      this.pointerId = pointer.id;
      this.aimX = clampDropX(this.cameras.main.getWorldPoint(pointer.x, pointer.y).x, this.current);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.phase === 'playing' && (this.pointerId === pointer.id || (!pointer.wasTouch && this.pointerId === null))) this.aimX = clampDropX(this.cameras.main.getWorldPoint(pointer.x, pointer.y).x, this.current);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.pointerId !== pointer.id) return;
      this.pointerId = null;
      this.aimX = clampDropX(this.cameras.main.getWorldPoint(pointer.x, pointer.y).x, this.current);
      this.drop();
    });
    this.input.on('pointerupoutside', () => { this.pointerId = null; });
    this.input.on('gameout', () => { if (!this.input.activePointer.isDown) this.pointerId = null; });

    this.phase = 'intro';
    // The opening still life is a real, softly settled arrangement; starting a game clears it.
    this.spawn(3, 65, 494, false);
    this.spawn(6, 126, 477, false);
    this.spawn(10, 249, 453, false);
    this.spawn(2, 342, 512, false);
    this.spawn(0, 169, 517, false);
    this.emptyText.setVisible(false);
    this.callbacks.ready();
    const canvas = this.game.canvas;
    canvas.setAttribute('aria-label', '水果合成游戏。按住移动，松手落下；相同的水果碰到一起会合成。');
    canvas.setAttribute('role', 'img');
  }

  private drawGarden(): void {
    const g = this.add.graphics().setDepth(-2);
    g.fillStyle(0xa8b49a, 0.1).fillRoundedRect(14, 121, 372, 435, 32);
    g.fillStyle(0xfffdf5, 0.8).fillRoundedRect(19, 107, 362, 439, 27);
    g.fillStyle(0xe9edda, 0.24).fillRoundedRect(25, 117, 350, 420, 22);
    g.fillStyle(0xffffff, 0.55).fillRoundedRect(28, 118, 344, 416, 20);
    // Faint paper flecks, rendered once.
    for (let i = 0; i < 95; i++) {
      const x = 30 + ((i * 73.37) % 340);
      const y = 125 + ((i * 37.13) % 405);
      g.fillStyle(i % 2 ? 0xe6d9bb : 0xd9e1c9, 0.24).fillCircle(x, y, 0.7);
    }
    g.lineStyle(1.5, 0x9bac87, 0.7).strokeRoundedRect(18, 108, 364, 438, 28);
    g.lineStyle(1, 0xffffff, 0.95).strokeRoundedRect(22, 112, 356, 430, 24);
    g.lineStyle(4, 0xffffff, 0.7).lineBetween(30, 148, 30, 487);
    g.lineStyle(2, 0xffffff, 0.45).lineBetween(370, 151, 370, 494);
    g.fillStyle(0xf4f3e5, 1).fillRoundedRect(15, 104, 370, 10, 5);
    g.lineStyle(1.4, 0x9bac87, 0.72).strokeRoundedRect(15, 104, 370, 10, 5);
    g.fillStyle(0xffffff, 0.8).fillRoundedRect(23, 106, 352, 3, 1.5);
    g.fillStyle(0xc2cba6, 0.4).fillRoundedRect(28, 537, 344, 7, 3);
    g.lineStyle(1, 0xaeb992, 0.55).lineBetween(37, 537, 363, 537);

    // Tiny botanical details at the foot of the glass.
    const front = this.add.graphics().setDepth(5);
    front.lineStyle(1.4, 0x94a77c, 0.65);
    front.beginPath().moveTo(10, 550).lineTo(15, 531).lineTo(9, 519).strokePath();
    front.fillStyle(0xa5b88d, 0.8).fillEllipse(7, 531, 13, 6);
    front.fillStyle(0xb9c79b, 0.8).fillEllipse(17, 525, 12, 5);
    front.fillStyle(0xf0d6a6, 0.9);
    for (let i = 0; i < 5; i++) front.fillCircle(385 + Math.cos(i * 1.256) * 4, 538 + Math.sin(i * 1.256) * 4, 3);
    front.fillStyle(0xd5b77d, 1).fillCircle(385, 538, 2);
  }

  private makeArt(x: number, y: number, frame: number, radius: number): Phaser.GameObjects.Image {
    const metric = METRICS[frame];
    const size = this.cell;
    return this.add.image(x, y, 'fruit-atlas', frame)
      .setOrigin(metric[0] / 362, metric[1] / 362)
      .setScale(radius * 2 / (metric[2] / 362 * size));
  }

  private spawn(level: number, x: number, y: number, merged: boolean): Fruit {
    const radius = FRUITS[level].radius;
    const body = this.matter.add.circle(x, y, radius, {
      restitution: 0.13, friction: 0.09, frictionStatic: 0.22, frictionAir: 0.006,
      density: 0.0014, slop: 0.03, sleepThreshold: 75, label: `fruit-${level}`,
    }, Math.max(18, Math.ceil(radius / 2)));
    const image = this.makeArt(x, y, level, radius).setDepth(3);
    const shadow = this.add.image(x, y + radius * 0.76, 'fruit-shadow').setDisplaySize(radius * 2.4, radius * 0.7).setAlpha(0.6).setDepth(1);
    const fruit = { body, image, shadow, level, born: this.clock, impact: -1000, merged };
    this.fruits.set(body.id, fruit);
    return fruit;
  }

  start(snapshot?: SessionSnapshot): void {
    if (this.phase === 'loading') return;
    this.clearFruits();
    this.phase = 'playing';
    this.clock = 0;
    this.accumulator = 0;
    this.score = snapshot?.score ?? 0;
    this.highest = snapshot?.highest ?? 0;
    this.drops = snapshot?.drops ?? 0;
    this.random = new GardenRandom(snapshot?.random ?? Date.now());
    this.current = snapshot?.current ?? 0;
    this.next = snapshot?.next ?? 0;
    this.lastDrop = -1000;
    this.lastMerge = -5000;
    this.lastSave = 0;
    this.combo = 0;
    this.dropGate = null;
    this.dangerMs = 0;
    this.dangerActive = false;
    this.pointerId = null;
    this.aimX = BOARD.width / 2;
    this.contacts = [];
    this.cameras.main.resetFX();
    if (snapshot) for (const f of snapshot.fruits) {
      const fruit = this.spawn(f.level, f.x, f.y, false);
      this.matter.body.setAngle(fruit.body, f.angle);
    }
    this.preview?.setVisible(true);
    this.emptyText?.setVisible(this.drops === 0);
    this.callbacks.next(this.next);
    this.callbacks.score(this.score, this.highest);
    this.callbacks.danger(false);
    this.audio.unlock();
    this.save();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.pointerId = null;
    this.phase = 'paused';
    this.accumulator = 0;
    this.save();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.accumulator = 0;
    this.pointerId = null;
    this.audio.unlock();
  }

  moveAim(delta: number): void { this.aimX = clampDropX(this.aimX + delta, this.current); }

  drop(): boolean {
    if (this.phase !== 'playing' || this.clock - this.lastDrop < 330) return false;
    const previous = this.dropGate === null ? undefined : this.fruits.get(this.dropGate);
    if (previous && previous.body.position.y < 108 && this.clock - this.lastDrop < 750) return false;
    const fruit = this.spawn(this.current, clampDropX(this.aimX, this.current), BOARD.spawnY, false);
    this.dropGate = fruit.body.id;
    this.lastDrop = this.clock;
    this.drops++;
    this.current = this.next;
    this.next = randomLevel(this.random.next());
    this.aimX = clampDropX(this.aimX, this.current);
    this.callbacks.next(this.next);
    this.emptyText?.setVisible(false);
    this.audio.drop();
    this.save();
    return true;
  }

  private collide(event: Collision, impact: boolean): void {
    if (this.phase !== 'playing' && this.phase !== 'intro') return;
    for (const pair of event.pairs) {
      const a = this.fruits.get(pair.bodyA.id);
      const b = this.fruits.get(pair.bodyB.id);
      if (this.phase === 'playing' && a && b && a.level === b.level) this.contacts.push([a.body.id, b.body.id]);
      if (impact) for (const f of [a, b]) {
        if (f && f.body.speed > 1.3 && this.clock - f.impact > 180) {
          f.impact = this.clock;
          if (this.phase === 'playing') this.audio.impact();
        }
      }
    }
  }

  private merge(a: Fruit, b: Fruit): void {
    const x = (a.body.position.x + b.body.position.x) / 2;
    const y = (a.body.position.y + b.body.position.y) / 2;
    const velocity = { x: (a.body.velocity.x + b.body.velocity.x) * 0.35, y: Math.min(1, (a.body.velocity.y + b.body.velocity.y) * 0.3) };
    this.consume(a);
    this.consume(b);
    const level = a.level + 1;
    this.combo = this.clock - this.lastMerge < 1100 ? this.combo + 1 : 1;
    this.lastMerge = this.clock;
    let gained: number;
    if (level < FRUITS.length) {
      const radius = FRUITS[level].radius;
      const fruit = this.spawn(level, clampDropX(x, level), Math.min(y, BOARD.floor - radius), true);
      this.matter.body.setVelocity(fruit.body, velocity);
      this.highest = Math.max(this.highest, level);
      gained = FRUITS[level].points;
      this.burst(x, y, FRUITS[level].color, radius, false);
      this.audio.merge(level, this.combo);
    } else {
      gained = 500;
      this.burst(x, y, 0x83ac70, 90, true);
      this.audio.celebrate();
    }
    this.score += gained;
    this.floatScore(x, y, gained);
    this.callbacks.score(this.score, this.highest);
    this.callbacks.merge(this.combo, Math.min(level, 10));
    if (level === 10) {
      this.audio.celebrate();
      this.burst(x, y - 30, 0x9eb37a, 95, true);
      this.callbacks.victory();
    }
    if (!this.gentle && level >= 6) this.cameras.main.shake(100, level >= 10 ? 0.003 : 0.0012);
    this.save();
  }

  private consume(fruit: Fruit): void {
    this.fruits.delete(fruit.body.id);
    this.matter.world.remove(fruit.body);
    fruit.shadow.destroy();
    this.tweens.add({ targets: fruit.image, alpha: 0, scaleX: fruit.image.scaleX * 0.3, scaleY: fruit.image.scaleY * 0.3, duration: this.gentle ? 60 : 105, ease: 'Cubic.easeIn', onComplete: () => fruit.image.destroy() });
  }

  private floatScore(x: number, y: number, points: number): void {
    const text = this.add.text(x, y - 12, `+${points}`, { fontFamily: 'Georgia, serif', fontSize: points >= 55 ? '25px' : '20px', fontStyle: 'bold', color: '#5b8056', stroke: '#fffdf3', strokeThickness: 4 }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: text, y: y - (this.gentle ? 25 : 65), alpha: 0, duration: this.gentle ? 450 : 850, ease: 'Cubic.easeOut', onComplete: () => text.destroy() });
  }

  private burst(x: number, y: number, color: number, radius: number, celebration: boolean): void {
    const count = this.gentle ? 3 : celebration ? 36 : 12;
    if (this.particleCount > 100) return;
    const ring = this.add.circle(x, y, radius * 0.3).setStrokeStyle(2, color, 0.6).setDepth(4);
    this.tweens.add({ targets: ring, scale: 3.5, alpha: 0, duration: this.gentle ? 180 : 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.6 + Math.random() * (celebration ? 2.2 : 1));
      const p = this.add.ellipse(x, y, 3 + Math.random() * 4, 2 + Math.random() * 3, [color, 0xe8c77e, 0xffffff, 0xb0c49a][i % 4], 0.9).setDepth(8);
      this.particleCount++;
      this.tweens.add({ targets: p, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance + 18, alpha: 0, angle: Math.random() * 300, scale: 0.3, duration: 380 + Math.random() * 440, ease: 'Cubic.easeOut', onComplete: () => { p.destroy(); this.particleCount--; } });
    }
  }

  private clearFruits(): void {
    for (const fruit of this.fruits.values()) {
      this.matter.world.remove(fruit.body);
      fruit.image.destroy();
      fruit.shadow.destroy();
    }
    this.fruits.clear();
  }

  save(): void {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    this.callbacks.save({
      score: this.score, current: this.current, next: this.next, random: this.random.state,
      drops: this.drops, highest: this.highest,
      fruits: [...this.fruits.values()].map(f => ({ level: f.level, x: f.body.position.x, y: f.body.position.y, angle: f.body.angle })),
    });
  }

  private drawGuide(): void {
    if (!this.guide || !this.preview) return;
    this.guide.clear();
    if (this.phase !== 'playing' && this.phase !== 'paused') { this.preview.setVisible(false); return; }
    const radius = FRUITS[this.current].radius;
    let landing = BOARD.floor - radius;
    for (const fruit of this.fruits.values()) {
      const r = radius + FRUITS[fruit.level].radius;
      const dx = this.aimX - fruit.body.position.x;
      if (Math.abs(dx) < r) landing = Math.min(landing, fruit.body.position.y - Math.sqrt(r * r - dx * dx));
    }
    const active = this.clock - this.lastDrop > 330;
    this.guide.fillStyle(0x94a17a, active ? 0.32 : 0.12);
    for (let y = 88; y < Math.max(90, landing - 5); y += 12) this.guide.fillCircle(this.aimX, y, 1.2);
    if (landing > 100) this.guide.lineStyle(1, FRUITS[this.current].color, 0.2).strokeCircle(this.aimX, landing, radius);
    const metric = METRICS[this.current];
    this.preview.setVisible(true).setFrame(this.current).setOrigin(metric[0] / 362, metric[1] / 362)
      .setPosition(this.aimX, BOARD.spawnY + (this.gentle ? 0 : Math.sin(this.clock / 600) * 2))
      .setScale(radius * 2 / (metric[2] / 362 * this.cell)).setAlpha(active ? 1 : 0.35);
  }

  private drawDanger(): void {
    if (!this.warning || !this.warningText) return;
    this.warning.clear();
    const active = this.dangerMs > 0;
    if (active !== this.dangerActive) { this.dangerActive = active; this.callbacks.danger(active); }
    const alpha = active ? 0.6 + Math.sin(this.clock / 180) * 0.15 : 0.18;
    this.warning.lineStyle(active ? 1.8 : 1, active ? 0xcd8068 : 0xb0b696, alpha);
    for (let x = 37; x < 365; x += 12) this.warning.lineBetween(x, BOARD.danger, x + 6, BOARD.danger);
    if (active) {
      this.warningText.setText(`留一点空间 · ${Math.max(1, Math.ceil((DANGER_LIMIT - this.dangerMs) / 1000))}`).setAlpha(1);
    } else this.warningText.setText('');
  }

  update(_time: number, delta: number): void {
    if (this.phase === 'loading') return;
    if (this.phase === 'playing' || this.phase === 'intro') {
      this.accumulator += Math.min(delta, 80);
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 5) {
        this.clock += FIXED_STEP;
        this.contacts = [];
        this.matter.world.step(FIXED_STEP);
        if (this.phase === 'playing') {
          const merges = selectMerges(this.contacts, id => {
            const f = this.fruits.get(id);
            return f ? { id, level: f.level } : undefined;
          });
          for (const [a, b] of merges) {
            const one = this.fruits.get(a), two = this.fruits.get(b);
            if (one && two) this.merge(one, two);
          }
          let overflowing = false;
          for (const fruit of this.fruits.values()) {
            if (this.clock - fruit.born > SPAWN_GRACE && fruit.body.position.y - FRUITS[fruit.level].radius < BOARD.danger) overflowing = true;
          }
          this.dangerMs = advanceDanger(this.dangerMs, overflowing, FIXED_STEP);
          if (this.dangerMs >= DANGER_LIMIT) {
            this.phase = 'over';
            this.pointerId = null;
            this.preview?.setVisible(false);
            this.guide?.clear();
            this.audio.end();
            this.callbacks.over(this.score, this.highest);
            break;
          }
        }
        this.accumulator -= FIXED_STEP;
        steps++;
      }
      if (this.phase === 'playing' && this.clock - this.lastSave > 1500) { this.lastSave = this.clock; this.save(); }
    }

    for (const fruit of this.fruits.values()) {
      const { x, y } = fruit.body.position;
      const metric = METRICS[fruit.level];
      const radius = FRUITS[fruit.level].radius;
      const baseScale = radius * 2 / (metric[2] / 362 * this.cell);
      const popTime = Math.min(1, Math.max(0, (this.clock - fruit.born) / 240));
      const pop = fruit.merged && !this.gentle ? Phaser.Math.Easing.Back.Out(popTime) : 1;
      const impactTime = (this.clock - fruit.impact) / 190;
      const squash = !this.gentle && impactTime >= 0 && impactTime < 1 ? Math.sin(impactTime * Math.PI) * 0.12 * (1 - impactTime) : 0;
      fruit.image.setPosition(x, y).setRotation(fruit.body.angle).setScale(baseScale * pop * (1 + squash), baseScale * pop * (1 - squash));
      fruit.shadow.setPosition(x, y + radius * 0.76).setScale(radius * 2.4 / 128, radius * 0.7 / 40).setAlpha(0.55 * Math.min(1, pop));
    }
    if (this.phase !== 'over') this.drawGuide();
    this.drawDanger();
  }
}

export function createGarden(parent: HTMLElement, callbacks: GardenCallbacks, audio: GardenAudio, pixelRatio = Math.min(window.devicePixelRatio || 1, 2)): GardenScene {
  const scene = new GardenScene(callbacks, audio, pixelRatio);
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: BOARD.width * pixelRatio,
    height: BOARD.height * pixelRatio,
    transparent: true,
    antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: BOARD.width * pixelRatio, height: BOARD.height * pixelRatio },
    physics: { default: 'matter', matter: { gravity: { x: 0, y: 1.12 }, enableSleeping: true, positionIterations: 8, velocityIterations: 8 } },
    render: { powerPreference: 'low-power', roundPixels: false },
    input: { activePointers: 2 },
    fps: { target: 60 },
    scene: [scene],
  });
  return scene;
}
