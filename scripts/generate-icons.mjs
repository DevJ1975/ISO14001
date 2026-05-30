// Dependency-free PWA icon generator: renders a brand leaf mark on a teal
// gradient and encodes PNGs with node:zlib. Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Leaf coverage at normalised point (nx, ny in [-0.5, 0.5]), tilted lens shape.
function leafCoverage(nx, ny) {
  const a = -0.32; // tilt radians
  const x = nx * Math.cos(a) - ny * Math.sin(a);
  const y = nx * Math.sin(a) + ny * Math.cos(a);
  const r = 0.46;
  const d = 0.33;
  const inLens = Math.hypot(x + d, y) < r && Math.hypot(x - d, y) < r;
  const onVein = inLens && Math.abs(x) < 0.012 && y > -0.26 && y < 0.26;
  if (onVein) return -1; // carve the vein back to background
  return inLens ? 1 : 0;
}

function render(size, { maskable = false } = {}) {
  const SS = 4;
  const S = size * SS;
  const buf = Buffer.alloc(S * S * 4);
  const top = hex('#11756f');
  const bot = hex('#06302d');
  const radius = maskable ? 0 : S * 0.22;
  const white = [255, 255, 255];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // Rounded-rect alpha (full bleed for maskable)
      let bgA = 1;
      if (radius > 0) {
        const dx = Math.max(radius - x, x - (S - radius), 0);
        const dy = Math.max(radius - y, y - (S - radius), 0);
        const dist = Math.hypot(dx, dy);
        bgA = dist <= radius ? 1 : 0;
      }
      // Diagonal gradient background
      const t = (x / S) * 0.5 + (y / S) * 0.5;
      let r = lerp(top[0], bot[0], t);
      let g = lerp(top[1], bot[1], t);
      let b = lerp(top[2], bot[2], t);
      // Leaf mark, centred and scaled
      const nx = (x / S - 0.5) / 0.62;
      const ny = (y / S - 0.5) / 0.62;
      const cov = leafCoverage(nx, ny);
      if (cov > 0) {
        r = white[0];
        g = white[1];
        b = white[2];
      }
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = Math.round(bgA * 255);
    }
  }

  // Downsample (box filter) to target size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, out);
}

const targets = [
  ['icon-180.png', 180, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskable: true }],
];

for (const [name, size, opts] of targets) {
  writeFileSync(new URL(name, OUT), render(size, opts));
  console.log('wrote', name);
}

// Crisp SVG favicon
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#11756f"/><stop offset="1" stop-color="#06302d"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <path d="M32 14 C20 22 20 42 32 50 C44 42 44 22 32 14 Z" fill="#fff"/>
  <path d="M32 18 L32 46" stroke="#0b4d4a" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;
writeFileSync(new URL('favicon.svg', OUT), favicon);
console.log('wrote favicon.svg');
