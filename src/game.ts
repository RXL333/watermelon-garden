import Phaser from 'phaser';
import { BOARD, FRUITS, FIXED_STEP, SPAWN_GRACE, DIFFICULTIES, DEFAULT_DIFFICULTY, GardenRandom, TurnHistory, randomLevel, fruitRadius, selectMerges, advanceDanger, clampDropX, type Difficulty, type Contact, type RoundSnapshot, type SessionSnapshot } from './rules.ts';
import { saveFruit, restoreFruit } from './physics-state.ts';
import { createFruitBody, fruitBodyRadius, fruitParent, landingOnBody, PINEAPPLE_LEVEL } from './fruit-body.ts';
import { DEFAULT_FRUIT_STYLE, FRUIT_STYLES, type FruitStyleId } from './fruit-art.ts';
import { PHYSICS_ENGINE, GROWTH_DURATION, growthScale, growBody, applyMergePressure, wakePile, type SleepingAPI } from './physics.ts';
import type { GardenAudio } from './audio.ts';

export type Phase = 'loading' | 'intro' | 'playing' | 'paused' | 'over';
export type TurnState = { current: number; drops: number; canUndo: boolean; undosLeft: number };
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
// Sleeping is exported at runtime but omitted from Phaser's namespace declarations.
const sleeping = (Phaser.Physics.Matter as unknown as { Matter: { Sleeping: SleepingAPI } }).Matter.Sleeping;
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
  turn: (state: TurnState) => void;
};

export class GardenScene extends Phaser.Scene {
  phase: Phase = 'loading';
  gentle = false;
  difficulty: Difficulty = DEFAULT_DIFFICULTY;
  score = 0;
  highest = 0;
  drops = 0;
  current = 0;
  next = 0;
  fruitStyle: FruitStyleId;
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
  private pixelRatio: number;
  private history = new TurnHistory();
  private effects = new Set<Phaser.GameObjects.GameObject>();
  private lastWake = -1000;
  private styleLoads = new Map<FruitStyleId, Promise<void>>();
  private styleChangedShape = false;

  constructor(callbacks: GardenCallbacks, audio: GardenAudio, pixelRatio: number, style: FruitStyleId) {
    super('garden');
    this.callbacks = callbacks;
    this.audio = audio;
    this.pixelRatio = pixelRatio;
    this.fruitStyle = style;
  }

  preload(): void {
    this.load.image(this.artKey(), `${import.meta.env.BASE_URL}${FRUIT_STYLES[this.fruitStyle].atlas.file}`);
    this.load.on('loaderror', () => this.callbacks.error());
  }

  create(): void {
    if (!this.textures.exists(this.artKey())) return;
    this.cameras.main.setOrigin(0, 0).setZoom(this.pixelRatio);
    try { this.registerArt(this.fruitStyle); } catch { this.callbacks.error(); return; }

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
    this.matter.add.rectangle(BOARD.left - 12, 320, 24, 600, { isStatic: true, friction: 0.03, restitution: 0.06, label: 'wall' });
    this.matter.add.rectangle(BOARD.right + 12, 320, 24, 600, { isStatic: true, friction: 0.03, restitution: 0.06, label: 'wall' });
    this.matter.add.rectangle(200, BOARD.floor + 16, 400, 32, { isStatic: true, friction: 0.08, restitution: 0.06, label: 'floor' });
    this.drawGarden();
    this.guide = this.add.graphics().setDepth(2);
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
      this.aimX = clampDropX(this.cameras.main.getWorldPoint(pointer.x, pointer.y).x, this.current, this.difficulty);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.phase === 'playing' && (this.pointerId === pointer.id || (!pointer.wasTouch && this.pointerId === null))) this.aimX = clampDropX(this.cameras.main.getWorldPoint(pointer.x, pointer.y).x, this.current, this.difficulty);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.pointerId !== pointer.id) return;
      this.pointerId = null;
      this.aimX = clampDropX(this.cameras.main.getWorldPoint(pointer.x, pointer.y).x, this.current, this.difficulty);
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
    // Cancel an interrupted mobile gesture before Phaser translates it into pointerup.
    const cancelGesture = () => { this.pointerId = null; };
    canvas.addEventListener('touchcancel', cancelGesture, { capture: true });
    canvas.addEventListener('pointercancel', cancelGesture, { capture: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('touchcancel', cancelGesture, true);
      canvas.removeEventListener('pointercancel', cancelGesture, true);
    });
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

  private artKey(style = this.fruitStyle): string { return `fruit-style-${style}`; }

  private registerArt(style: FruitStyleId): void {
    const { atlas, sprites } = FRUIT_STYLES[style];
    const texture = this.textures.get(this.artKey(style));
    const source = texture.getSourceImage() as HTMLImageElement;
    if (source.width !== atlas.width || source.height !== atlas.height) throw new Error('Unexpected fruit atlas dimensions');
    sprites.forEach(([x, y, size], i) => { if (!texture.has(String(i))) texture.add(i, 0, x, y, size, size); });
  }

  // Loading is separate from applying: closing the picker can safely cancel a choice.
  prepareFruitStyle(style: FruitStyleId): Promise<void> {
    if (this.textures.exists(this.artKey(style))) return Promise.resolve();
    const existing = this.styleLoads.get(style);
    if (existing) return existing;
    const pending = new Promise<void>((resolve, reject) => {
      const image = new window.Image();
      const cleanup = () => { clearTimeout(timeout); image.onload = null; image.onerror = null; };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Fruit style loading timed out')); }, 20000);
      image.onload = () => {
        cleanup();
        try {
          this.textures.addImage(this.artKey(style), image);
          this.registerArt(style);
          resolve();
        } catch (error) {
          if (this.textures.exists(this.artKey(style))) this.textures.remove(this.artKey(style));
          reject(error);
        }
      };
      image.onerror = () => { cleanup(); reject(new Error('Fruit style unavailable')); };
      image.src = `${import.meta.env.BASE_URL}${FRUIT_STYLES[style].atlas.file}`;
    });
    this.styleLoads.set(style, pending);
    const forget = () => { this.styleLoads.delete(style); };
    void pending.then(forget, forget);
    return pending;
  }

  applyFruitStyle(style: FruitStyleId): void {
    if (style === this.fruitStyle) return;
    if (!this.textures.exists(this.artKey(style))) throw new Error('Fruit style not prepared');
    const previous = FRUIT_STYLES[this.fruitStyle];
    const next = FRUIT_STYLES[style];
    const images = new Set([...this.fruits.values()].map(fruit => fruit.image));
    if (this.preview) images.add(this.preview);
    for (const effect of this.effects) if (effect instanceof Phaser.GameObjects.Image && typeof effect.getData('fruitLevel') === 'number') images.add(effect);
    // Keep motion and the round intact; only the pineapple's leaf outline follows its artwork.
    for (const image of images) {
      const level = image.getData('fruitLevel') as number;
      const [, , size, ox, oy, diameter] = next.sprites[level];
      const ratio = previous.sprites[level][5] / diameter;
      const scaleX = image.scaleX * ratio, scaleY = image.scaleY * ratio;
      image.setTexture(this.artKey(style), level).setOrigin(ox / size, oy / size).setScale(scaleX, scaleY);
    }
    const replacements = new Map<number, number>();
    for (const [id, fruit] of this.fruits) if (fruit.level === PINEAPPLE_LEVEL) {
      const previousBody = fruit.body;
      const body = createFruitBody(fruit.level, previousBody.position.x, previousBody.position.y, fruitBodyRadius(previousBody), style, {
        circle: this.matter.bodies.circle, create: this.matter.body.create, setCentre: this.matter.body.setCentre,
      });
      restoreFruit(body, saveFruit(previousBody, fruit.level, this.clock - fruit.born), this.matter.body);
      body.force.x = previousBody.force.x; body.force.y = previousBody.force.y; body.torque = previousBody.torque;
      sleeping.set(body, previousBody.isSleeping);
      this.matter.world.remove(previousBody);
      this.matter.world.add(body);
      fruit.body = body;
      replacements.set(id, body.id);
      if (this.dropGate === id) this.dropGate = body.id;
    }
    if (replacements.size) this.fruits = new Map([...this.fruits].map(([id, fruit]) => [replacements.get(id) ?? id, fruit]));
    this.styleChangedShape = replacements.size > 0;
    this.contacts = [];
    this.fruitStyle = style;
    this.save();
  }

  private makeArt(x: number, y: number, frame: number, radius: number): Phaser.GameObjects.Image {
    const [, , size, ox, oy, diameter] = FRUIT_STYLES[this.fruitStyle].sprites[frame];
    return this.add.image(x, y, this.artKey(), frame).setData('fruitLevel', frame)
      .setOrigin(ox / size, oy / size)
      .setScale(radius * 2 / diameter);
  }

  private spawn(level: number, x: number, y: number, merged: boolean, growth = 0): Fruit {
    const radius = fruitRadius(level, this.difficulty) * (merged ? growthScale(growth) : 1);
    const body = createFruitBody(level, x, y, radius, this.fruitStyle, {
      circle: this.matter.bodies.circle, create: this.matter.body.create, setCentre: this.matter.body.setCentre,
    });
    this.matter.world.add(body);
    const image = this.makeArt(x, y, level, radius).setDepth(3);
    const shadow = this.add.image(x, y + radius * 0.76, 'fruit-shadow').setDisplaySize(radius * 2.4, radius * 0.7).setAlpha(0.6).setDepth(1);
    const fruit = { body, image, shadow, level, born: this.clock, impact: -1000, merged };
    this.fruits.set(body.id, fruit);
    return fruit;
  }

  start(snapshot?: SessionSnapshot, difficulty: Difficulty = DEFAULT_DIFFICULTY): void {
    if (this.phase === 'loading') return;
    this.tweens.killAll();
    this.tweens.resumeAll();
    for (const effect of this.effects) effect.destroy();
    this.effects.clear();
    this.particleCount = 0;
    this.clearFruits();
    this.difficulty = snapshot?.difficulty ?? difficulty;
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
    this.lastWake = -1000;
    this.styleChangedShape = false;
    this.combo = 0;
    this.dropGate = null;
    this.dangerMs = snapshot?.dangerMs ?? 0;
    this.dangerActive = false;
    this.pointerId = null;
    this.aimX = BOARD.width / 2;
    this.contacts = [];
    this.history = new TurnHistory(snapshot?.undosLeft, snapshot?.previousTurn);
    this.cameras.main.resetFX();
    if (snapshot) for (const f of snapshot.fruits) {
      const fruit = this.spawn(f.level, f.x, f.y, f.growth !== undefined, f.growth);
      restoreFruit(fruit.body, f, this.matter.body);
      fruit.born = -(f.growth !== undefined ? f.growth * GROWTH_DURATION : f.age ?? 0);
    }
    this.preview?.setVisible(true);
    this.emptyText?.setVisible(this.drops === 0);
    this.callbacks.next(this.next);
    this.callbacks.score(this.score, this.highest);
    this.callbacks.danger(false);
    this.emitTurn();
    this.audio.unlock();
    this.save();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.pointerId = null;
    this.phase = 'paused';
    this.accumulator = 0;
    this.tweens.pauseAll();
    this.emitTurn();
    this.save();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.accumulator = 0;
    this.pointerId = null;
    this.tweens.resumeAll();
    if (this.styleChangedShape) { this.wake(true); this.styleChangedShape = false; }
    this.emitTurn();
    this.audio.unlock();
  }

  moveAim(delta: number): void { this.aimX = clampDropX(this.aimX + delta, this.current, this.difficulty); }

  private canDrop(): boolean {
    if (this.phase !== 'playing' || this.clock - this.lastDrop < 330) return false;
    const previous = this.dropGate === null ? undefined : this.fruits.get(this.dropGate);
    return !(previous && previous.body.position.y < 108 && this.clock - this.lastDrop < 750);
  }

  private emitTurn(): void {
    this.callbacks.turn({ current: this.current, drops: this.drops, canUndo: this.phase === 'playing' && !!this.history.previous && this.history.remaining > 0, undosLeft: this.history.remaining });
  }

  private wake(force = false): void {
    if (!force && this.clock - this.lastWake < 150) return;
    wakePile([...this.fruits.values()].map(fruit => fruit.body), sleeping);
    this.lastWake = this.clock;
  }

  get undosLeft(): number { return this.history.remaining; }

  undoDrop(): boolean {
    if (this.phase !== 'playing') return false;
    const previous = this.history.take();
    if (!previous) return false;
    this.start({ ...previous, undosLeft: this.history.remaining });
    this.audio.undo();
    return true;
  }

  drop(): boolean {
    if (!this.canDrop()) return false;
    this.history.remember(this.snapshotRound());
    this.wake(true);
    const fruit = this.spawn(this.current, clampDropX(this.aimX, this.current, this.difficulty), BOARD.spawnY, false);
    if (this.current > this.highest) {
      this.highest = this.current;
      this.callbacks.score(this.score, this.highest);
    }
    this.dropGate = fruit.body.id;
    this.lastDrop = this.clock;
    this.drops++;
    this.current = this.next;
    this.next = randomLevel(this.random.next(), this.difficulty);
    this.aimX = clampDropX(this.aimX, this.current, this.difficulty);
    this.callbacks.next(this.next);
    this.emitTurn();
    this.emptyText?.setVisible(false);
    this.audio.drop();
    this.save();
    return true;
  }

  private collide(event: Collision, impact: boolean): void {
    if (this.phase !== 'playing' && this.phase !== 'intro') return;
    for (const pair of event.pairs) {
      const a = this.fruits.get(fruitParent(pair.bodyA).id);
      const b = this.fruits.get(fruitParent(pair.bodyB).id);
      if (this.phase === 'playing' && a && b && a.level === b.level) this.contacts.push([a.body.id, b.body.id]);
      if (impact) for (const f of [a, b]) {
        if (f && f.body.speed > 1.3 && this.clock - f.impact > 180) {
          this.wake();
          f.impact = this.clock;
          if (this.phase === 'playing') this.audio.impact();
        }
      }
    }
  }

  private merge(a: Fruit, b: Fruit): void {
    this.wake(true);
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
      const radius = fruitRadius(level, this.difficulty);
      const fruit = this.spawn(level, clampDropX(x, level, this.difficulty), Math.min(y, BOARD.floor - radius), true);
      this.matter.body.setVelocity(fruit.body, velocity);
      applyMergePressure(fruit.body, radius, [...this.fruits.values()].map(neighbor => neighbor.body), this.matter.body);
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
    this.effects.add(fruit.image);
    this.tweens.add({ targets: fruit.image, alpha: 0, scaleX: fruit.image.scaleX * 0.3, scaleY: fruit.image.scaleY * 0.3, duration: this.gentle ? 60 : 105, ease: 'Cubic.easeIn', onComplete: () => this.removeEffect(fruit.image) });
  }

  private removeEffect(effect: Phaser.GameObjects.GameObject): void { this.effects.delete(effect); effect.destroy(); }

  private floatScore(x: number, y: number, points: number): void {
    const text = this.add.text(x, y - 12, `+${points}`, { fontFamily: 'Georgia, serif', fontSize: points >= 55 ? '25px' : '20px', fontStyle: 'bold', color: '#5b8056', stroke: '#fffdf3', strokeThickness: 4 }).setOrigin(0.5).setDepth(9);
    this.effects.add(text);
    this.tweens.add({ targets: text, y: y - (this.gentle ? 25 : 65), alpha: 0, duration: this.gentle ? 450 : 850, ease: 'Cubic.easeOut', onComplete: () => this.removeEffect(text) });
  }

  private burst(x: number, y: number, color: number, radius: number, celebration: boolean): void {
    const count = this.gentle ? 3 : celebration ? 36 : 12;
    if (this.particleCount > 100) return;
    const ring = this.add.circle(x, y, radius * 0.3).setStrokeStyle(2, color, 0.6).setDepth(4);
    this.effects.add(ring);
    this.tweens.add({ targets: ring, scale: 3.5, alpha: 0, duration: this.gentle ? 180 : 420, ease: 'Cubic.easeOut', onComplete: () => this.removeEffect(ring) });
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.6 + Math.random() * (celebration ? 2.2 : 1));
      const p = this.add.ellipse(x, y, 3 + Math.random() * 4, 2 + Math.random() * 3, [color, 0xe8c77e, 0xffffff, 0xb0c49a][i % 4], 0.9).setDepth(8);
      this.effects.add(p);
      this.particleCount++;
      this.tweens.add({ targets: p, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance + 18, alpha: 0, angle: Math.random() * 300, scale: 0.3, duration: 380 + Math.random() * 440, ease: 'Cubic.easeOut', onComplete: () => { this.removeEffect(p); this.particleCount--; } });
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

  private snapshotRound(): RoundSnapshot {
    return {
      difficulty: this.difficulty, score: this.score, current: this.current, next: this.next, random: this.random.state,
      drops: this.drops, highest: this.highest, dangerMs: this.dangerMs,
      fruits: [...this.fruits.values()].map(f => {
        const state = saveFruit(f.body, f.level, this.clock - f.born);
        if (f.merged && this.clock - f.born < GROWTH_DURATION) state.growth = Math.max(0, (this.clock - f.born) / GROWTH_DURATION);
        return state;
      }),
    };
  }

  save(): void {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    this.callbacks.save({ ...this.snapshotRound(), undosLeft: this.history.remaining, previousTurn: this.history.previous });
  }

  private drawGuide(): void {
    if (!this.guide || !this.preview) return;
    this.guide.clear();
    if (this.phase !== 'playing' && this.phase !== 'paused') { this.preview.setVisible(false); return; }
    const radius = fruitRadius(this.current, this.difficulty);
    let landing = BOARD.floor - radius;
    let target: Fruit | undefined;
    for (const fruit of this.fruits.values()) {
      const surface = landingOnBody(fruit.body, this.aimX, radius);
      if (surface < landing) { landing = surface; target = fruit; }
    }
    const active = this.canDrop();
    const match = target?.level === this.current && active;
    if (landing > 100 && this.pointerId !== null) this.guide.fillStyle(0xaabf89, 0.08).fillRoundedRect(this.aimX - 4, 91, 8, landing - 94, 4);
    if (target && match) {
      const halo = fruitBodyRadius(target.body) + 5 + (this.gentle ? 0 : Math.sin(this.clock / 210) * 1.2);
      this.guide.fillStyle(0xc6d69d, 0.3).fillCircle(target.body.position.x, target.body.position.y, halo);
      this.guide.lineStyle(1.3, 0x8faa6d, 0.75).strokeCircle(target.body.position.x, target.body.position.y, halo);
    }
    this.guide.fillStyle(0x94a17a, active ? 0.32 : 0.12);
    for (let y = 88; y < Math.max(90, landing - 5); y += 12) this.guide.fillCircle(this.aimX, y, 1.2);
    if (landing > 100) this.guide.lineStyle(match ? 1.6 : 1, match ? 0x8faa6d : FRUITS[this.current].color, match ? 0.6 : 0.3).strokeCircle(this.aimX, landing, radius);
    const [, , size, ox, oy, diameter] = FRUIT_STYLES[this.fruitStyle].sprites[this.current];
    this.preview.setVisible(true).setFrame(this.current).setData('fruitLevel', this.current).setOrigin(ox / size, oy / size)
      .setPosition(this.aimX, BOARD.spawnY + (this.gentle ? 0 : Math.sin(this.clock / 600) * 2))
      .setScale(radius * 2 / diameter).setAlpha(active ? 1 : 0.35);
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
      this.warning.lineStyle(2, 0xcd8068, 0.55).lineBetween(37, BOARD.danger + 5, 37 + 328 * (1 - this.dangerMs / DIFFICULTIES[this.difficulty].dangerLimit), BOARD.danger + 5);
      this.warningText.setText(`留一点空间 · ${Math.max(0.1, (DIFFICULTIES[this.difficulty].dangerLimit - this.dangerMs) / 1000).toFixed(1)} 秒`).setAlpha(1);
    } else this.warningText.setText('');
  }

  update(_time: number, delta: number): void {
    if (this.phase === 'loading') return;
    if (this.phase === 'playing' || this.phase === 'intro') {
      this.accumulator += Math.min(delta, 80);
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 5) {
        this.clock += FIXED_STEP;
        for (const fruit of this.fruits.values()) if (fruit.merged && this.clock - fruit.born <= GROWTH_DURATION + FIXED_STEP) {
          growBody(fruit.body, fruitRadius(fruit.level, this.difficulty), (this.clock - fruit.born) / GROWTH_DURATION, this.matter.body);
        }
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
            if (this.clock - fruit.born > SPAWN_GRACE && fruit.body.vertices?.some(vertex => vertex.y < BOARD.danger)) overflowing = true;
          }
          this.dangerMs = advanceDanger(this.dangerMs, overflowing, FIXED_STEP, this.difficulty);
          if (this.dangerMs >= DIFFICULTIES[this.difficulty].dangerLimit) {
            this.phase = 'over';
            this.tweens.pauseAll();
            this.emitTurn();
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
      const diameter = FRUIT_STYLES[this.fruitStyle].sprites[fruit.level][5];
      const radius = fruitBodyRadius(fruit.body);
      const baseScale = radius * 2 / diameter;
      const popTime = Math.min(1, Math.max(0, (this.clock - fruit.born) / 240));
      const pop = fruit.merged && !this.gentle ? 1 + Math.sin(popTime * Math.PI) * 0.035 * (1 - popTime) : 1;
      const impactTime = (this.clock - fruit.impact) / 190;
      const squash = !this.gentle && impactTime >= 0 && impactTime < 1 ? Math.sin(impactTime * Math.PI) * 0.12 * (1 - impactTime) : 0;
      fruit.image.setPosition(x, y).setRotation(fruit.body.angle).setScale(baseScale * pop * (1 + squash), baseScale * pop * (1 - squash));
      fruit.shadow.setPosition(x, y + radius * 0.76).setScale(radius * 2.4 / 128, radius * 0.7 / 40).setAlpha(0.55 * Math.min(1, pop));
    }
    if (this.phase !== 'over') this.drawGuide();
    this.drawDanger();
  }
}

export function createGarden(parent: HTMLElement, callbacks: GardenCallbacks, audio: GardenAudio, pixelRatio = Math.min(window.devicePixelRatio || 1, 2), style: FruitStyleId = DEFAULT_FRUIT_STYLE): GardenScene {
  const scene = new GardenScene(callbacks, audio, pixelRatio, style);
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: BOARD.width * pixelRatio,
    height: BOARD.height * pixelRatio,
    transparent: true,
    antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: BOARD.width * pixelRatio, height: BOARD.height * pixelRatio },
    physics: { default: 'matter', matter: PHYSICS_ENGINE },
    render: { powerPreference: 'low-power', roundPixels: false },
    input: { activePointers: 2 },
    fps: { target: 60 },
    scene: [scene],
  });
  return scene;
}
