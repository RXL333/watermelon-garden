// Development-only scenes exercise the actual game and its normal dialogs.
// Vite removes this entry point and all these controls from production builds.
import { BOARD, DIFFICULTIES, fruitRadius, type SessionSnapshot } from './rules.ts';
import type { GardenScene } from './game.ts';

export function mountQA(scene: GardenScene, start: (snapshot: SessionSnapshot) => void): void {
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', '开发验收场景');
  panel.style.cssText = 'position:fixed;z-index:20;left:4px;bottom:5px;display:flex;flex-wrap:wrap;gap:3px;max-width:280px;padding:5px;background:#fffef7ee;border:1px solid #b8c7a8;border-radius:9px;font:10px sans-serif';
  panel.innerHTML = '<span style="width:100%;color:#527044">开发验收 · 正式版本不包含此面板</span>';
  const snapshot = (fruits: SessionSnapshot['fruits'], highest = 0): SessionSnapshot => ({ difficulty: scene.difficulty, score: 0, current: 0, next: 0, random: 1234, drops: 1, highest, fruits });
  const touching = (level: number, count: number) => {
    const r = fruitRadius(level, scene.difficulty);
    return Array.from({ length: count }, (_, i) => ({ level, x: 200 + (i - (count - 1) / 2) * r * 1.9, y: BOARD.floor - r, angle: 0 }));
  };
  const cases: [string, () => SessionSnapshot][] = [
    ['三果碰撞', () => snapshot(touching(0, 3))],
    ['合出西瓜', () => snapshot(touching(9, 2), 9)],
    ['双瓜清空', () => snapshot(touching(10, 2), 10)],
    ['满箱结算', () => snapshot(Array.from({ length: 15 }, (_, i) => ({ level: (i % 3 + Math.floor(i / 3)) % 2 ? 8 : 9, x: 86 + i % 3 * 114, y: 468 - Math.floor(i / 3) * 118, angle: 0 })), 9)],
  ];
  for (const [label, create] of cases) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = 'min-height:36px;padding:5px 7px;background:#edf0e2;border-radius:6px;font:10px sans-serif';
    button.addEventListener('click', () => start(create()));
    panel.append(button);
  }
  const status = document.createElement('output');
  status.style.cssText = 'display:block;width:100%;color:#6b795d';
  panel.append(status);
  setInterval(() => { status.textContent = `${DIFFICULTIES[scene.difficulty].name} · 状态 ${scene.phase} · 分数 ${scene.score} · 最高 ${scene.highest + 1} 级`; }, 200);
  document.body.append(panel);
}
