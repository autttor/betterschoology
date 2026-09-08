/**
 * Generates Better Schoology's icon PNGs.
 *
 * Hand-rolled rather than pulled from an image library: the mark is a few
 * rectangles, and this keeps a build-time image dependency out of the project.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [10, 110, 209]; // accent blue
const FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Rounded square with three stacked bars: a compact "list" mark. */
function pixel(x, y, size) {
  const r = size * 0.22;
  const inset = size * 0.06;
  const min = inset;
  const max = size - inset;

  // Rounded-corner test against the card bounds.
  const cx = Math.min(Math.max(x, min + r), max - r);
  const cy = Math.min(Math.max(y, min + r), max - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;

  const barX0 = size * 0.26;
  const barX1 = size * 0.74;
  const barH = size * 0.1;
  for (const top of [size * 0.28, size * 0.45, size * 0.62]) {
    const width = top === size * 0.62 ? (barX1 - barX0) * 0.6 : barX1 - barX0;
    if (y >= top && y < top + barH && x >= barX0 && x < barX0 + width) return FG;
  }
  return BG;
}

function render(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const color = pixel(x + 0.5, y + 0.5, size);
      if (color) {
        raw[offset++] = color[0];
        raw[offset++] = color[1];
        raw[offset++] = color[2];
        raw[offset++] = 255;
      } else {
        offset += 4; // transparent
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 96, 128]) {
  writeFileSync(new URL(`../public/icon/${size}.png`, import.meta.url), render(size));
  console.log('wrote public/icon/' + size + '.png');
}
