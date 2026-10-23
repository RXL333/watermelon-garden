import { FRUIT_ATLAS, FRUIT_SPRITES } from './fruit-art.ts';

const paths: Record<string, string> = {
  leaf: '<path d="M19 4C10 2 4 6 5 12c1 5 6 6 10 3 4-3 4-7 4-11Z"/><path d="M4 21 15 9"/>',
  sound: '<path d="m11 5-5 4H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 5-5 4H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.5"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm4 11v6m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  book: '<path d="M12 5C8 2 4 3 3 4v15c3-2 6-1 9 1 3-2 6-3 9-1V4c-3-2-6-1-9 1Zm0 0v15"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 9M4 4v6h6"/>',
  undo: '<path d="m9 5-6 6 6 6M3 11h10a7 7 0 0 1 7 7v1"/>',
  hand: '<path d="M9 13V5a2 2 0 0 1 4 0v6l2-1 5 3-1 6c-1 3-7 3-9 0l-4-5c-1-2 1-3 3-1Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
export const icon = (name: string, className = ''): string => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
export function fruitArt(level: number, className = ''): string {
  const [x, y, size] = FRUIT_SPRITES[level];
  return `<span class="fruit-art ${className}" style="--fruit-size:${FRUIT_ATLAS.width / size * 100}% ${FRUIT_ATLAS.height / size * 100}%;--fruit-x:${x / (FRUIT_ATLAS.width - size) * 100}%;--fruit-y:${y / (FRUIT_ATLAS.height - size) * 100}%" aria-hidden="true"></span>`;
}
