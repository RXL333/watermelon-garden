import test from 'node:test';
import assert from 'node:assert/strict';
import { FRUIT_STYLES, FRUIT_STYLE_IDS, DEFAULT_FRUIT_STYLE, isFruitStyle, fruitPaint } from '../src/fruit-art.ts';
import { GardenStorage } from '../src/storage.ts';
import type { SessionSnapshot } from '../src/rules.ts';

const round: SessionSnapshot = {
  difficulty: 'classic', score: 3, highest: 1, current: 0, next: 2,
  random: 1234, drops: 2, undosLeft: 2, dangerMs: 0,
  fruits: [{ level: 1, x: 200, y: 450, angle: .13, vx: .6, vy: 1.2, spin: .02, age: 300 }],
};

function backend(initial?: unknown) {
  let data = initial === undefined ? null : JSON.stringify(initial);
  return { getItem: () => data, setItem: (_key: string, value: string) => { data = value; } };
}

test('all five styles have independent assets, only the original has facial features', () => {
  assert.equal(new Set(FRUIT_STYLE_IDS.map(id => FRUIT_STYLES[id].atlas.file)).size, 5);
  assert.deepEqual(FRUIT_STYLE_IDS.filter(id => FRUIT_STYLES[id].hasFaces), ['original']);
  for (const invalid of [null, undefined, {}, '__proto__', 'constructor', 'plush', 1]) assert.equal(isFruitStyle(invalid), false);
  for (const id of FRUIT_STYLE_IDS) {
    assert.equal(isFruitStyle(id), true);
    // All UI crops resolve against the same subpath-safe atlas and coordinates as Phaser.
    for (let level = 0; level < 11; level++) {
      const css = fruitPaint(level, id);
      assert.ok(css.includes(`url('${FRUIT_STYLES[id].atlas.file}')`));
      assert.ok(!/NaN|Infinity|url\('\//.test(css));
    }
  }
});

test('style choice persists independently from the exact round, motion, RNG and undo state', () => {
  const memory = backend();
  const storage = new GardenStorage(memory);
  storage.save(round);
  for (const id of FRUIT_STYLE_IDS) {
    storage.preferences.fruitStyle = id;
    storage.save();
    const resumed = new GardenStorage(memory);
    assert.equal(resumed.preferences.fruitStyle, id);
    assert.deepEqual(resumed.session, round);
    assert.equal(resumed.bestFor('classic'), 3);
  }
});

test('UI texture URLs stay correct when consumed from a nested production stylesheet', () => {
  for (const base of ['https://example.test/', 'https://example.test/watermelon-garden/']) for (const id of FRUIT_STYLE_IDS) {
    const css = fruitPaint(8, id, base);
    const url = css.match(/url\('([^']+)'\)/)![1];
    const stylesheet = new URL('assets/app.css', base).href;
    assert.equal(new URL(url, stylesheet).href, new URL(FRUIT_STYLES[id].atlas.file, base).href);
    assert.ok(!url.includes('/assets/assets/'));
  }
});

test('old and invalid style preferences fall back without discarding a healthy saved game', () => {
  for (const fruitStyle of [undefined, null, 'unknown', '__proto__', 5, {}]) {
    const storage = new GardenStorage(backend({ version: 1, preferences: { fruitStyle }, best: 90, session: round }));
    assert.equal(storage.preferences.fruitStyle, DEFAULT_FRUIT_STYLE);
    assert.equal(storage.bestFor('classic'), 90);
    assert.deepEqual(storage.session, round);
  }
});
