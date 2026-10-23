export const FRUIT_ATLAS = { file: 'assets/fruit-atlas-v2.png', width: 1448, height: 1086 } as const;

// Trim boxes include the WHOLE silhouette, especially crowns and stems.
// Body origins/diameters align the round flesh with the physics circle.
// [atlas x, atlas y, square size, body origin x, body origin y, body diameter]
export const FRUIT_SPRITES = [
  [106, 125, 210, 105, 125, 172], [448, 119, 212, 106, 135, 158],
  [803, 127, 208, 104, 128, 166], [1156, 134, 200, 100, 119, 177],
  [111, 462, 198, 99, 100, 178], [456, 464, 196, 98, 98, 184],
  [806, 458, 198, 99, 114, 180], [1156, 456, 198, 99, 114, 182],
  [99, 761, 224, 112, 148, 148], [457, 785, 194, 97, 104, 170],
  [802, 776, 206, 103, 110, 182], [1154, 787, 194, 97, 97, 178],
] as const;


export const FRUIT_STYLE_IDS = ['original', 'realistic', 'cartoon', 'fluffy', 'clay'] as const;
export type FruitStyleId = typeof FRUIT_STYLE_IDS[number];
export const DEFAULT_FRUIT_STYLE: FruitStyleId = 'original';
export type FruitSprite = readonly [number, number, number, number, number, number];
export type FruitStyle = {
  name: string; shortName: string; tagline: string; description: string; hasFaces: boolean;
  atlas: { file: string; width: number; height: number; gutter: number };
  sprites: readonly FruitSprite[];
};
export const FRUIT_STYLES: Record<FruitStyleId, FruitStyle> = {
  original: {
    name: '原版表情', shortName: '原版', tagline: '小院最初的模样',
    description: '温润插画和小小笑脸，陪你收获一颗大西瓜。', hasFaces: true,
    atlas: { ...FRUIT_ATLAS, gutter: 24 }, sprites: FRUIT_SPRITES,
  },
  realistic: {
    name: "写实鲜果", shortName: "写实", tagline: "清新果园",
    description: "还原果皮、籽粒与自然光泽，像刚摘下的新鲜水果。", hasFaces: false,
    atlas: {"file":"assets/fruit-realistic.png","width":1448,"height":1086,"gutter":8},
    sprites: [
      [101, 129, 226, 107, 133, 174],
      [449, 132, 215, 107, 113, 192],
      [800, 133, 218, 106, 124, 176],
      [1143, 144, 213, 115, 115, 174],
      [107, 452, 221, 95, 111, 172],
      [456, 463, 205, 102, 103, 190],
      [804, 462, 212, 98, 105, 184],
      [1148, 456, 210, 103, 112, 184],
      [84, 733, 258, 129, 186, 132],
      [445, 757, 225, 112, 126, 186],
      [792, 758, 227, 113, 114, 210],
      [1151, 764, 217, 109, 104, 200],
    ],
  },
  cartoon: {
    name: "圆润卡通", shortName: "卡通", tagline: "晶亮饱满",
    description: "圆润造型配上明亮色彩与柔和高光，轻快又清爽。", hasFaces: false,
    atlas: {"file":"assets/fruit-cartoon.png","width":1448,"height":1086,"gutter":8},
    sprites: [
      [75, 116, 226, 110, 134, 172],
      [459, 130, 194, 97, 98, 178],
      [818, 139, 198, 91, 110, 164],
      [1172, 141, 199, 95, 107, 170],
      [93, 463, 205, 88, 113, 164],
      [458, 474, 191, 96, 96, 178],
      [805, 458, 212, 106, 107, 184],
      [1168, 452, 210, 104, 119, 170],
      [67, 759, 242, 120, 162, 148],
      [445, 777, 211, 107, 114, 182],
      [796, 772, 219, 110, 113, 200],
      [1164, 779, 218, 109, 104, 200],
    ],
  },
  fluffy: {
    name: "毛绒软软", shortName: "毛绒", tagline: "摸得到的柔软",
    description: "细密绒毛、布艺叶片与缝绣纹理，像一篮柔软玩偶。", hasFaces: false,
    atlas: {"file":"assets/fruit-fluffy.png","width":1448,"height":1086,"gutter":8},
    sprites: [
      [71, 101, 240, 119, 148, 172],
      [440, 104, 231, 116, 121, 208],
      [800, 114, 232, 117, 138, 176],
      [1156, 127, 211, 106, 119, 172],
      [93, 438, 216, 98, 117, 182],
      [447, 446, 220, 109, 110, 200],
      [805, 434, 225, 111, 119, 194],
      [1161, 435, 221, 111, 117, 196],
      [54, 738, 267, 133, 177, 168],
      [438, 770, 231, 116, 129, 192],
      [797, 769, 234, 117, 128, 200],
      [1156, 778, 226, 114, 114, 200],
    ],
  },
  clay: {
    name: "手作黏土", shortName: "黏土", tagline: "手心里的小果园",
    description: "黏土质感与手工雕刻纹理，带着圆润朴实的温度。", hasFaces: false,
    atlas: {"file":"assets/fruit-clay.png","width":1448,"height":1086,"gutter":8},
    sprites: [
      [111, 125, 204, 101, 121, 154],
      [472, 135, 183, 91, 97, 160],
      [814, 135, 184, 91, 106, 144],
      [1166, 142, 176, 88, 99, 142],
      [115, 474, 178, 83, 93, 144],
      [464, 472, 185, 92, 93, 170],
      [814, 471, 184, 92, 98, 158],
      [1168, 465, 187, 94, 105, 152],
      [89, 779, 224, 112, 155, 126],
      [459, 800, 193, 97, 106, 162],
      [806, 795, 198, 99, 107, 170],
      [1177, 814, 179, 89, 90, 162],
    ],
  },
};

export function isFruitStyle(value: unknown): value is FruitStyleId {
  return typeof value === 'string' && (FRUIT_STYLE_IDS as readonly string[]).includes(value);
}

// CSS custom-property URLs resolve at the stylesheet that consumes them.
// Resolve against the document first, so /garden/assets/app.css cannot add /assets/ twice.
export function fruitPaint(level: number, style: FruitStyleId, baseURI?: string): string {
  const { atlas, sprites } = FRUIT_STYLES[style];
  const [x, y, size] = sprites[level];
  const url = baseURI ? new URL(atlas.file, baseURI).href : atlas.file;
  return `--fruit-atlas:url('${url}');--fruit-size:${atlas.width / size * 100}% ${atlas.height / size * 100}%;--fruit-x:${x / (atlas.width - size) * 100}%;--fruit-y:${y / (atlas.height - size) * 100}%`;
}
