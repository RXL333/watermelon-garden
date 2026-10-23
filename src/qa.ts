// Development-only scenes exercise the actual game and its normal dialogs.
// Vite removes this entry point and all these controls from production builds.
import { BOARD, DIFFICULTIES, SPAWN_GRACE, FIXED_STEP, fruitRadius, type SessionSnapshot } from './rules.ts';
import type { GardenScene } from './game.ts';
import { FRUIT_STYLES } from './fruit-art.ts';

export function mountQA(scene: GardenScene, start: (snapshot: SessionSnapshot) => void, inspect: () => SessionSnapshot | null): void {
  const panel = document.createElement('details');
  panel.open = true;
  panel.setAttribute('aria-label', '开发验收场景');
  panel.style.cssText = 'position:fixed;z-index:20;left:4px;bottom:5px;max-width:280px;padding:5px;background:#fffef7ee;border:1px solid #b8c7a8;border-radius:9px;font:10px sans-serif';
  panel.innerHTML = '<summary style="min-height:30px;line-height:30px;color:#527044;cursor:pointer">开发验收 · 点击展开/收起</summary><div style="display:flex;flex-wrap:wrap;gap:3px"></div>';
  const controls = panel.querySelector('div')!;
  const snapshot = (fruits: SessionSnapshot['fruits'], highest = 0): SessionSnapshot => ({ difficulty: scene.difficulty, score: 0, current: 0, next: 0, random: 1234, drops: 1, highest, fruits });
  const touching = (level: number, count: number) => {
    const r = fruitRadius(level, scene.difficulty);
    return Array.from({ length: count }, (_, i) => ({ level, x: 200 + (i - (count - 1) / 2) * r * 1.9, y: BOARD.floor - r, angle: 0 }));
  };
  const fullGarden = (): SessionSnapshot => {
    const fruits: SessionSnapshot['fruits'] = [];
    let top: number = BOARD.floor;
    for (const level of [10, 9, 8, 10]) {
      const r = fruitRadius(level, scene.difficulty);
      for (const x of [112, 288]) fruits.push({ level, x, y: top - r, angle: 0, age: SPAWN_GRACE + FIXED_STEP });
      top -= r * 2;
    }
    // Start near the end of an existing overflow interval; normal production logic ends it.
    return { ...snapshot(fruits, 10), dangerMs: DIFFICULTIES[scene.difficulty].dangerLimit - 250 };
  };
  const cases: [string, () => SessionSnapshot][] = [
    ['上下联动', () => ({ ...snapshot(Array.from({ length: 15 }, (_, i) => {
      const level = [3, 5, 4, 6, 2][(i % 3 + Math.floor(i / 3) * 2) % 5];
      return { level, x: 80 + i % 3 * 120, y: BOARD.floor - fruitRadius(level, scene.difficulty) - Math.floor(i / 3) * 70, angle: 0 };
    }), 6), current: 2, next: 2 })],
    ['撤回试种', () => snapshot(touching(0, 1))],
    ['柠檬与菠萝', () => snapshot([{ level: 4, x: 120, y: BOARD.floor - fruitRadius(4, scene.difficulty), angle: 0 }, { level: 8, x: 270, y: BOARD.floor - fruitRadius(8, scene.difficulty), angle: 0 }], 8)],
    ['三果碰撞', () => snapshot(touching(0, 3))],
    ['合出西瓜', () => snapshot(touching(9, 2), 9)],
    ['双瓜清空', () => snapshot(touching(10, 2), 10)],
    ['满箱结算', fullGarden],
  ];
  for (const [label, create] of cases) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = 'min-height:36px;padding:5px 7px;background:#edf0e2;border-radius:6px;font:10px sans-serif';
    button.addEventListener('click', () => start(create()));
    controls.append(button);
  }
  const status = document.createElement('output');
  status.style.cssText = 'display:block;width:100%;color:#6b795d';
  controls.append(status);
  const check = document.createElement('button');
  check.textContent = '暂停检查对局';
  check.style.cssText = 'min-height:36px;padding:5px 7px;background:#edf0e2;border-radius:6px;font:10px sans-serif';
  const result = document.createElement('output');
  result.id = 'qa-inspection';
  result.style.cssText = 'display:block;width:100%;color:#527044';
  check.addEventListener('click', () => {
    scene.pause();
    scene.save();
    const saved = inspect();
    if (!saved) { result.textContent = '没有进行中的对局'; return; }
    let hash = 2166136261;
    for (const char of JSON.stringify(saved)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    result.textContent = `${saved.score} 分 · 投放 ${saved.drops} · ${saved.fruits.length} 颗 · 对局指纹 ${(hash >>> 0).toString(16)}`;
  });
  controls.append(check, result);
  setInterval(() => { status.textContent = `${DIFFICULTIES[scene.difficulty].name} · 状态 ${scene.phase} · 分数 ${scene.score} · 最高 ${scene.highest + 1} 级 · 外观 ${FRUIT_STYLES[scene.fruitStyle].shortName}`; }, 200);
  document.body.append(panel);
}
