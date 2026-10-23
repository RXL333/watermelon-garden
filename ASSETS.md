# 水果美术

- 文件：`public/assets/fruit-atlas.png`
- 来源：本项目通过内置 Image Gen 工具原创生成，非素材站下载，未使用第三方游戏角色图片。
- 生成日期：2026-10-23。
- 实际尺寸：1448 × 1086，RGBA，透明背景。
- 排列：4 列 × 3 行，每格 362 × 362。
- 0—10 格依次为葡萄、樱桃、草莓、蜜橘、柠檬、猕猴桃、蜜桃、苹果、菠萝、蜜瓜、西瓜；第 11 格为西瓜切面备用插图。
- 原图保留，直接使用图集帧，不对图像做重绘或背景替换。游戏在代码中调整显示尺寸和原点，使圆形果实主体对齐物理碰撞体。
- 界面叶片和功能图标为项目内 SVG；音效通过 Web Audio 合成。

## 最终生成提示词

Use case: stylized-concept. Asset type: one production-ready transparent sprite atlas for an original premium mobile fruit merge game. Create ONE image, precisely 4 equal columns by 3 equal rows, 1536 pixels wide by 1152 pixels tall. Twelve separate characters on a genuinely transparent background. Each cell 384 by 384. Each fruit centered within its cell, its main round body diameter about 280 pixels; generous transparent padding, absolutely no overlap. Front view, almost round silhouettes, consistent scale, consistent soft upper-left lighting, exquisite painterly 2.5D gouache meets soft clay illustration, velvety tactile surfaces, rich natural fruit colors with delicate texture, soft warm edge shading, tiny glossy highlights, tiny friendly chocolate-brown eyes, subtle peach blush, small understated smiles. Charming, beautifully crafted, sophisticated casual game art. Order left to right: row 1: a purple grape berry with a tiny green leaf; a ruby red cherry with short curved stem; a red strawberry with little green crown; a golden orange mandarin with one leaf. Row 2: a buttery yellow round lemon; a round green kiwi cut face with fine black seeds around a cream center; a blushing pink peach with small green leaf; a coral red round apple with short stem. Row 3: a round golden pineapple with a compact green crown and fine diamond texture; a pale sage green round cantaloupe with subtle netted rind; a beautiful dark green round watermelon with lighter painterly stripes; a watermelon cut face with deep coral red flesh, dark teardrop seeds and a thick cream and green rind. All characters should be original and stylistically harmonious. NO text, NO grid lines, NO labels, NO logo, NO watermark, NO background blocks, NO ground plane, NO cast shadows outside the fruit silhouettes. Preserve real alpha transparency.
