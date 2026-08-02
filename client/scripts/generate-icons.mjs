import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icons');
await mkdir(outDir, { recursive: true });

function svgForSize(size) {
  const radius = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.55);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, 'DM Sans', Sora, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="#ffffff">N</text>
</svg>`;
}

for (const size of [192, 512]) {
  const file = resolve(outDir, `icon-${size}.png`);
  await sharp(Buffer.from(svgForSize(size))).png().toFile(file);
  console.log('wrote', file);
}
