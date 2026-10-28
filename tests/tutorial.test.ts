import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialLayout, type TutorialRect } from '../src/tutorial-layout.ts';
import { GardenStorage } from '../src/storage.ts';
import type { SessionSnapshot } from '../src/rules.ts';

const overlaps = (a: TutorialRect, b: TutorialRect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('tutorial cards remain visible and clear of mobile controls at the top and bottom', () => {
  for (const viewport of [{ x: 0, y: 0, width: 320, height: 568 }, { x: 0, y: 0, width: 390, height: 844 }]) {
    for (const target of [{ x: 18, y: 80, width: viewport.width - 36, height: 69 }, { x: 18, y: viewport.height - 105, width: 160, height: 44 }]) {
      const { spotlight, card } = tutorialLayout(target, viewport, { width: 350, height: 260 });
      assert.ok(!overlaps(spotlight, card));
      assert.ok(card.x >= 12 && card.y >= 12);
      assert.ok(card.x + card.width <= viewport.width - 12);
      assert.ok(card.y + card.height <= viewport.height - 12);
      assert.ok(spotlight.x <= target.x && spotlight.y <= target.y);
      assert.ok(spotlight.x + spotlight.width >= target.x + target.width);
    }
  }
});

test('tutorial can use the space beside a control on a landscape phone', () => {
  const target = { x: 15, y: 80, width: 180, height: 140 };
  const { spotlight, card } = tutorialLayout(target, { x: 0, y: 0, width: 844, height: 390 }, { width: 350, height: 265 });
  assert.ok(!overlaps(card, spotlight));
  assert.ok(card.x > target.x + target.width);
  assert.ok(card.y >= 12 && card.y + card.height <= 378);
});

test('small or shifted visible viewports clamp both the highlight and the card', () => {
  const viewport = { x: 10, y: 20, width: 260, height: 220 };
  const { spotlight, card } = tutorialLayout({ x: -10, y: -8, width: 320, height: 280 }, viewport, { width: 350, height: 500 });
  for (const rect of [spotlight, card]) {
    assert.ok(rect.x >= viewport.x && rect.y >= viewport.y);
    assert.ok(rect.x + rect.width <= viewport.x + viewport.width);
    assert.ok(rect.y + rect.height <= viewport.y + viewport.height);
  }
});

test('tutorial completion and skip can be remembered without changing a saved round', () => {
  let raw: string | null = null;
  const backend = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  const store = new GardenStorage(backend);
  assert.equal(store.tutorialSeen, false);
  const round: SessionSnapshot = { score: 36, drops: 7, highest: 4, difficulty: 'hard', current: 0, next: 1, random: 123, undosLeft: 2, fruits: [{ level: 4, x: 200, y: 490, angle: .2 }] };
  store.beginRound(false, 1000);
  store.save(round);
  const id = store.activeRound!.id;
  store.tutorialSeen = true;
  store.save();
  const restored = new GardenStorage(backend);
  assert.equal(restored.tutorialSeen, true);
  assert.deepEqual(restored.session, round);
  assert.equal(restored.activeRound!.id, id);
  assert.equal(restored.history.length, 0);
  assert.equal(restored.bestFor('hard'), 36);
});

test('older or malformed tutorial flags do not discard existing records', () => {
  for (const tutorialSeen of [undefined, null, 'true', 1, {}, false]) {
    const store = new GardenStorage({ getItem: () => JSON.stringify({ version: 1, best: 321, tutorialSeen }), setItem: () => {} });
    assert.equal(store.tutorialSeen, false);
    assert.equal(store.bestFor('classic'), 321);
  }
});
