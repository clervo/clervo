#!/usr/bin/env node

import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const value = (flag, fallback) => {
  const exact = process.argv.find((item) => item.startsWith(`${flag}=`));
  return exact === undefined ? fallback : exact.slice(flag.length + 1);
};

const captures = path.resolve(value('--captures', 'docs/evidence/site/B12-RECOVERY/phase-0/rejected-current-state/captures'));
const out = path.resolve(value('--out', 'docs/evidence/site/B12-RECOVERY/phase-0/rejected-current-state/contact-sheets'));
const widths = value('--widths', '1600,390,320').split(',').map((item) => item.trim()).filter(Boolean);
const columns = 4;
const gutter = 16;
const labelHeight = 32;
const headerHeight = 68;

const escapeXml = (text) => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

await mkdir(out, { recursive: true });
const allFiles = await readdir(captures);

for (const width of widths) {
  const files = allFiles.filter((file) => file.startsWith(`${width}--`) && file.endsWith('.png')).sort();
  if (files.length === 0) throw new Error(`No ${width}px captures found in ${captures}`);

  const first = sharp(path.join(captures, files[0]));
  const metadata = await first.metadata();
  const sourceWidth = metadata.width ?? Number(width);
  const sourceHeight = metadata.height ?? Math.round(sourceWidth * 0.5625);
  const tileWidth = Number(width) >= 1000 ? 384 : 195;
  const imageHeight = Math.round(tileWidth * sourceHeight / sourceWidth);
  const tileHeight = imageHeight + labelHeight;
  const rows = Math.ceil(files.length / columns);
  const sheetWidth = gutter + columns * (tileWidth + gutter);
  const sheetHeight = headerHeight + rows * (tileHeight + gutter);

  const title = Buffer.from(`<svg width="${sheetWidth}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#050505"/>
    <text x="${gutter}" y="30" fill="#f5f5f5" font-family="Arial, sans-serif" font-size="20" font-weight="700">B12 REJECTED STATE · ${escapeXml(width)}PX</text>
    <text x="${gutter}" y="52" fill="#9da2a8" font-family="Arial, sans-serif" font-size="12">Mechanical baseline only · not an approved visual baseline</text>
  </svg>`);
  const composites = [{ input: title, left: 0, top: 0 }];

  for (const [index, file] of files.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = gutter + column * (tileWidth + gutter);
    const top = headerHeight + row * (tileHeight + gutter);
    const label = file.replace(`${width}--`, '').replace('.png', '').replaceAll('-', ' ');
    const image = await sharp(path.join(captures, file))
      .resize(tileWidth, imageHeight, { fit: 'fill' })
      .png()
      .toBuffer();
    const caption = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111315"/>
      <text x="10" y="21" fill="#d7d9dc" font-family="Arial, sans-serif" font-size="12">${escapeXml(label)}</text>
    </svg>`);
    composites.push({ input: image, left, top });
    composites.push({ input: caption, left, top: top + imageHeight });
  }

  const destination = path.join(out, `whole-site-${width}.png`);
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: '#050505',
    },
  }).composite(composites).png({ compressionLevel: 9 }).toFile(destination);
  console.log(`${files.length} captures -> ${destination}`);
}
