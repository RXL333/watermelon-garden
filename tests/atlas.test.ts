import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { createFruitBody } from '../src/fruit-body.ts';
import { FRUIT_STYLES, FRUIT_STYLE_IDS } from '../src/fruit-art.ts';
import { fruitRadius } from '../src/rules.ts';

// Read PNG alpha directly, so the source-art boundary check also runs in CI.
function pngAlpha(path: URL) {
  const png = readFileSync(path);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8, '8-bit atlas');
  assert.equal(png[25], 6, 'RGBA atlas');
  assert.equal(png[28], 0, 'non-interlaced atlas');
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, corner);
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, alpha: (x: number, y: number) => pixels[y * stride + x * 4 + 3], rgba: (x: number, y: number) => pixels.subarray(y * stride + x * 4, y * stride + x * 4 + 4) };
}

const require = createRequire(import.meta.url);
const Body = require('phaser/src/physics/matter-js/lib/body/Body.js');
const Bodies = require('phaser/src/physics/matter-js/lib/factory/Bodies.js');
const Query = require('phaser/src/physics/matter-js/lib/collision/Query.js');

for (const id of FRUIT_STYLE_IDS) test(`${id}: every fruit, crown and stem stays in its own cell and fully inside its shared UI/game crop`, () => {
  const { atlas, sprites } = FRUIT_STYLES[id];
  const png = pngAlpha(new URL(`../public/${atlas.file}`, import.meta.url));
  assert.equal(png.width, atlas.width);
  assert.equal(png.height, atlas.height);
  assert.equal(sprites.length, 12);
  const cell = atlas.width / 4;
  assert.equal(atlas.height / 3, cell);
  assert.ok(atlas.gutter >= 8);
  const visibleHeight = (level: number) => {
    const [x, y, size, , , diameter] = sprites[level];
    let top = y + size, bottom = y;
    for (let py = y; py < y + size; py++) for (let px = x; px < x + size; px++) if (png.alpha(px, py) > 32) { top = Math.min(top, py); bottom = Math.max(bottom, py); }
    return (bottom - top + 1) * fruitRadius(level) * 2 / diameter;
  };
  assert.ok(visibleHeight(8) < visibleHeight(10), 'the WHOLE pineapple, including leaves, is shorter than the watermelon');
  const pineapple = createFruitBody(8, 0, 0, fruitRadius(8), id, { circle: Bodies.circle, create: Body.create, setCentre: Body.setCentre });
  const [pineX, pineY, pineSize, originX, originY, pineDiameter] = sprites[8];
  const pineScale = fruitRadius(8) * 2 / pineDiameter;
  let leafPixels = 0, coveredLeaves = 0;
  for (let y = pineY; y < pineY + originY - pineDiameter * .2; y += 2) for (let x = pineX; x < pineX + pineSize; x += 2) {
    const [r, g, b, alpha] = png.rgba(x, y);
    if (alpha < 160 || g < r * 1.04 || g < b * 1.15) continue;
    leafPixels++;
    const point = { x: (x - pineX - originX) * pineScale, y: (y - pineY - originY) * pineScale };
    if (Query.point([pineapple], point).length) coveredLeaves++;
  }
  assert.ok(leafPixels > 100, 'visible green crown pixels were sampled');
  assert.ok(coveredLeaves / leafPixels > .98, `leaf collider covers the actual crown: ${coveredLeaves}/${leafPixels}`);
  sprites.forEach(([x, y, size, ox, oy, diameter], i) => {
    const left = i % 4 * cell, top = Math.floor(i / 4) * cell;
    assert.ok(x >= left && x + size <= left + cell && y >= top && y + size <= top + cell, `crop ${i} stays in cell`);
    assert.ok(ox > 0 && ox < size && oy > 0 && oy < size && diameter > 0 && diameter <= size);
    let visible = 0;
    for (let py = top; py < top + cell; py++) for (let px = left; px < left + cell; px++) {
      const alpha = png.alpha(px, py);
      if (px < left + atlas.gutter || px >= left + cell - atlas.gutter || py < top + atlas.gutter || py >= top + cell - atlas.gutter) assert.ok(alpha <= 8, `fruit ${i} crossed its ${atlas.gutter}px gutter at ${px},${py}`);
      if (alpha > 32) {
        visible++;
        assert.ok(px >= x + 3 && px < x + size - 3 && py >= y + 3 && py < y + size - 3, `fruit ${i} silhouette cropped at ${px},${py}`);
      }
    }
    assert.ok(visible > 10000, `fruit ${i} has visible artwork`);
  });
});
