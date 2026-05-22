/**
 * Generate raster PWA icons from the existing SVGs.
 *
 * iOS Safari does not honour SVG-only manifest icons for "Add to Home Screen",
 * and several PWA installability checks (Lighthouse, Chromium) require at
 * least one PNG at >= 192px. This script renders the source SVGs to PNG and
 * also produces a maskable 512px variant with a 10% safe-zone inset.
 *
 * Usage:
 *   npx tsx scripts/gen-icons.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ICONS_DIR = path.join(process.cwd(), 'public', 'icons');
const BRAND = '#0F766E';

async function read(name: string): Promise<Buffer> {
  return fs.readFile(path.join(ICONS_DIR, name));
}

async function write(name: string, data: Buffer): Promise<void> {
  await fs.writeFile(path.join(ICONS_DIR, name), data);
  // eslint-disable-next-line no-console
  console.log(`  wrote ${name} (${(data.length / 1024).toFixed(1)} kB)`);
}

async function rasterize(svgName: string, outName: string, size: number): Promise<void> {
  const svg = await read(svgName);
  const png = await sharp(svg, { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 15, g: 118, b: 110, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await write(outName, png);
}

async function maskable(svgName: string, outName: string, size: number): Promise<void> {
  // Maskable icons require a safe zone — the device may crop ~10% inwards.
  // We render the SVG into the central ~80% of a solid brand-coloured canvas.
  const svg = await read(svgName);
  const inner = Math.round(size * 0.8);
  const innerPng = await sharp(svg, { density: 512 })
    .resize(inner, inner, { fit: 'contain' })
    .png()
    .toBuffer();

  const out = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND,
    },
  })
    .composite([{ input: innerPng, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await write(outName, out);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('Generating raster PWA icons in', ICONS_DIR);
  await rasterize('icon-192.svg', 'icon-192.png', 192);
  await rasterize('icon-512.svg', 'icon-512.png', 512);
  await maskable('icon-512.svg', 'maskable-512.png', 512);
  // eslint-disable-next-line no-console
  console.log('Done.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
