import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const source = "assets-src/img/hero-living-room.png";
const out = "public/img";
const manifestPath = path.join(out, "manifest.json");
const widths = [640, 1024, 1600, 2400, 3840];

if (!fs.existsSync(source)) {
  throw new Error(`Hero master source not found: ${source}`);
}

fs.mkdirSync(out, { recursive: true });

const image = sharp(source);
const meta = await image.metadata();
const lqip = await image
  .resize({ width: 32, withoutEnlargement: true })
  .jpeg({ quality: 45 })
  .toBuffer();

const entry = {
  file: "hero-living-room",
  width: meta.width,
  height: meta.height,
  widths,
  lqip: `data:image/jpeg;base64,${lqip.toString("base64")}`,
};

for (const width of widths) {
  const base = path.join(out, `hero-living-room-${width}`);
  await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .avif({ quality: 50 })
    .toFile(`${base}.avif`);
  await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(`${base}.webp`);
}

const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};

manifest["hero-living-room"] = entry;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `Regenerated hero assets from ${source}: ${widths.join(", ")}px variants + LQIP.`,
);
