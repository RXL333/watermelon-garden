import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { FRUIT_STYLES, FRUIT_STYLE_IDS } from '../src/fruit-art.ts';

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
  return { width, height, alpha: (x: number, y: number) => pixels[y * stride + x * 4 + 3] };
}

for (const id of FRUIT_STYLE_IDS) test(`${id}: every fruit, crown and stem stays in its own cell and fully inside its shared UI/game crop`, () => {
  const { atlas, sprites } = FRUIT_STYLES[id];
  const png = pngAlpha(new URL(`../public/${atlas.file}`, import.meta.url));
  assert.equal(png.width, atlas.width);
  assert.equal(png.height, atlas.height);
  assert.equal(sprites.length, 12);
  const cell = atlas.width / 4;
  assert.equal(atlas.height / 3, cell);
  assert.ok(atlas.gutter >= 8);
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
