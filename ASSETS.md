# 水果美术

- 正式文件：`public/assets/fruit-atlas-v2.png`，787,531 字节。
- 来源：本项目通过内置 Image Gen 工具原创生成，非素材站下载，未使用第三方游戏角色图片。
- 生成日期：2026-10-23。
- 实际尺寸：1448 × 1086，RGBA，透明背景。
- 排列：4 列 × 3 行，每格 362 × 362；每格四边保留至少 24 像素的可见内容安全边距。
- 0—10 格依次为葡萄、樱桃、草莓、蜜橘、柠檬、猕猴桃、蜜桃、苹果、菠萝、蜜瓜、西瓜；第 11 格为西瓜切面备用插图。
- v2 使用内置 Image Gen，参考原图保留角色画风，缩小并重新安排整套水果，修复菠萝叶冠跨入柠檬格、叶子被截断的问题，同时检查其他果梗和轮廓。
- 界面和游戏共同使用 `src/fruit-art.ts` 中的 12 个裁切框、果肉原点及直径，避免两套显示方式出现不同的裁切。
- `tests/atlas.test.ts` 直接读取 PNG 的透明通道，逐像素验证 12 格的安全边距及全部可见轮廓都在实际裁切框内。
- 原始图本地保存在 `artifacts/fruit-atlas-original.png`，Git 历史 `1ea6ded` 中也保留初始素材；不将旧图加入正式离线缓存。
- 界面叶片和功能图标为项目内 SVG；音效通过 Web Audio 合成。

## v2 最终修整提示词

Create a corrected-layout version of this exact transparent 12-character fruit atlas. Preserve the character artwork identities and painterly clay style, but CHANGE SCALE AND POSITIONS SIGNIFICANTLY: every complete fruit must be MUCH SMALLER than in the reference, occupying ONLY THE CENTRAL 60 PERCENT of its cell. Output 1536x1152, exact 4 columns x 3 rows of 384x384 cells. Each complete subject INCLUDING ALL STEMS AND LEAVES must fit inside a 240x240 bounding square centered at its cell center, leaving AT LEAST 72 PIXELS of fully transparent space on EVERY side of EVERY cell. This large transparent spacing is the MAIN purpose. Fruit centers: row1 (192,192),(576,192),(960,192),(1344,192); row2 (192,576),(576,576),(960,576),(1344,576); row3 (192,960),(576,960),(960,960),(1344,960). No pixels of any fruit may be near the cell borders. Use huge transparent gutters, do not enlarge subjects to fill the canvas. Row1 grape, cherry, strawberry, mandarin. Row2 lemon, kiwi cut face, peach, apple. Row3 pineapple with its ENTIRE compact green crown, cantaloupe, whole watermelon, watermelon cut face. All adorable faces preserved. The lemon has NO leaves and NO green fragments. The pineapple INCLUDING its full crown and whole round golden body fits within its own centered 240x240 square; shrink the whole pineapple as much as needed. No parts of adjacent fruit, no colored fringe, no particles or shadows outside each isolated subject. Real alpha transparency, no background, no ground, no grid lines, no text. Do not preserve the old tightly packed layout. Preserve rich fine fruit textures, glossy tiny chocolate eyes, blush, smiles and soft upper-left lighting. The final atlas should look notably airy with much more blank transparent space than the reference.

请求尺寸与留白是生成目标；上方列出的实际尺寸、文件大小和像素检测结果为验收依据。

## 初始素材提示词

Use case: stylized-concept. Asset type: one production-ready transparent sprite atlas for an original premium mobile fruit merge game. Create ONE image, precisely 4 equal columns by 3 equal rows, 1536 pixels wide by 1152 pixels tall. Twelve separate characters on a genuinely transparent background. Each cell 384 by 384. Each fruit centered within its cell, its main round body diameter about 280 pixels; generous transparent padding, absolutely no overlap. Front view, almost round silhouettes, consistent scale, consistent soft upper-left lighting, exquisite painterly 2.5D gouache meets soft clay illustration, velvety tactile surfaces, rich natural fruit colors with delicate texture, soft warm edge shading, tiny glossy highlights, tiny friendly chocolate-brown eyes, subtle peach blush, small understated smiles. Charming, beautifully crafted, sophisticated casual game art. Order left to right: row 1: a purple grape berry with a tiny green leaf; a ruby red cherry with short curved stem; a red strawberry with little green crown; a golden orange mandarin with one leaf. Row 2: a buttery yellow round lemon; a round green kiwi cut face with fine black seeds around a cream center; a blushing pink peach with small green leaf; a coral red round apple with short stem. Row 3: a round golden pineapple with a compact green crown and fine diamond texture; a pale sage green round cantaloupe with subtle netted rind; a beautiful dark green round watermelon with lighter painterly stripes; a watermelon cut face with deep coral red flesh, dark teardrop seeds and a thick cream and green rind. All characters should be original and stylistically harmonious. NO text, NO grid lines, NO labels, NO logo, NO watermark, NO background blocks, NO ground plane, NO cast shadows outside the fruit silhouettes. Preserve real alpha transparency.
