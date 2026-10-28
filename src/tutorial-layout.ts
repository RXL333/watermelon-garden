export type TutorialRect = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

// Keep the card clear of its highlighted control, including narrow phones and landscape.
export function tutorialLayout(target: TutorialRect, viewport: TutorialRect, card: { width: number; height: number }): { spotlight: TutorialRect; card: TutorialRect } {
  const inset = 12, gap = 14;
  const right = viewport.x + viewport.width, bottom = viewport.y + viewport.height;
  const left = clamp(target.x - 6, viewport.x + 6, right - 6);
  const top = clamp(target.y - 6, viewport.y + 6, bottom - 6);
  const spotlight = {
    x: left, y: top,
    width: Math.max(0, Math.min(right - 6, target.x + target.width + 6) - left),
    height: Math.max(0, Math.min(bottom - 6, target.y + target.height + 6) - top),
  };
  const width = Math.min(card.width, viewport.width - inset * 2);
  const height = Math.min(card.height, viewport.height - inset * 2);
  const centeredX = clamp(target.x + target.width / 2 - width / 2, viewport.x + inset, right - width - inset);
  const centeredY = clamp(target.y + target.height / 2 - height / 2, viewport.y + inset, bottom - height - inset);
  const candidates = [
    { x: centeredX, y: spotlight.y + spotlight.height + gap },
    { x: centeredX, y: spotlight.y - gap - height },
    { x: spotlight.x + spotlight.width + gap, y: centeredY },
    { x: spotlight.x - gap - width, y: centeredY },
  ];
  const position = candidates.find(rect => rect.x >= viewport.x + inset && rect.y >= viewport.y + inset
    && rect.x + width <= right - inset && rect.y + height <= bottom - inset)
    ?? { x: centeredX, y: bottom - inset - height };
  return { spotlight, card: { ...position, width, height } };
}
