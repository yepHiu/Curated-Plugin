/**
 * 从源图标生成 Chrome 插件所需的 16/48/128 PNG
 * 运行: npm run generate-icons
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const SOURCE_CANDIDATES = [
  'Curated-icon-nobg.png',
  'curated-icon-rg-dark-pink.png',
];
const SIZES = [16, 48, 128];

function resolveSource() {
  for (const name of SOURCE_CANDIDATES) {
    const filePath = path.join(ICONS_DIR, name);
    if (fs.existsSync(filePath)) return filePath;
  }
  throw new Error(
    `未找到源图标，请将图标放入 public/icons/（${SOURCE_CANDIDATES.join(' 或 ')}）`
  );
}

async function main() {
  const source = resolveSource();
  console.log(`Source: ${source}`);

  for (const size of SIZES) {
    const output = path.join(ICONS_DIR, `icon-${size}.png`);
    await sharp(source)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(output);
    console.log(`Created ${output}`);
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
