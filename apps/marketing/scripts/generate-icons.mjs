/**
 * Generates ClearTask app icons at all required iOS sizes from brand SVG.
 * Run: node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");
const iconsDir = resolve(publicDir, "icons");

const BRAND_NAVY = "#1E3A5F";

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BRAND_NAVY}"/>
  <rect x="144" y="144" width="736" height="736" rx="168" fill="#FFFFFF" fill-opacity="0.1"/>
  <g transform="translate(512 512) scale(30) translate(-12 -12)">
    <path
      d="M9 12.5L11 14.5L15.5 10"
      fill="none"
      stroke="#FFFFFF"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
</svg>
`.trim();

const sizes = [
  { size: 1024, path: "icon-1024.png", dir: publicDir },
  { size: 180, path: "icon-180.png", dir: iconsDir },
  { size: 167, path: "icon-167.png", dir: iconsDir },
  { size: 152, path: "icon-152.png", dir: iconsDir },
  { size: 120, path: "icon-120.png", dir: iconsDir },
  { size: 87, path: "icon-87.png", dir: iconsDir },
  { size: 80, path: "icon-80.png", dir: iconsDir },
  { size: 76, path: "icon-76.png", dir: iconsDir },
  { size: 58, path: "icon-58.png", dir: iconsDir },
  { size: 40, path: "icon-40.png", dir: iconsDir },
  { size: 29, path: "icon-29.png", dir: iconsDir },
];

await mkdir(iconsDir, { recursive: true });

for (const { size, path, dir } of sizes) {
  const output = resolve(dir, path);
  const png = await sharp(Buffer.from(iconSvg)).resize(size, size).png().toBuffer();
  await writeFile(output, png);
  console.log(`[icons] wrote ${output}`);
}
