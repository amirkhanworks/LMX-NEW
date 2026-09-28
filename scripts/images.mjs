import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Hero master source: assets-src/img/hero-living-room.png is the single source of truth.

const src = "assets-src/img";
const out = "public/img";
const widths = [640, 1024, 1600, 2400, 3840];
const supported = /\.(png|jpe?g|webp|avif)$/i;
fs.mkdirSync(out, { recursive: true });

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : supported.test(e.name) ? [p] : [];
  });
}

const masters = walk(src).filter((p) => !p.includes(`${path.sep}team${path.sep}`) && path.basename(p) !== "hero-living-room.png");
const manifest = {};
for (const file of masters) {
  const rel = path.relative(src, file);
  const name = rel.replace(/\.[^.]+$/, "").replaceAll(path.sep, "/");
  const meta = await sharp(file).metadata();
  const entry = { file: name, width: meta.width, height: meta.height, widths, lqip: "" };
  const lqip = await sharp(file).resize(32).jpeg({ quality: 45 }).toBuffer();
  entry.lqip = `data:image/jpeg;base64,${lqip.toString("base64")}`;
  for (const width of widths) {
    const base = path.join(out, `${name}-${width}`);
    fs.mkdirSync(path.dirname(base), { recursive: true });
    await sharp(file).resize({ width, withoutEnlargement: true }).avif({ quality: 50 }).toFile(`${base}.avif`);
    await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toFile(`${base}.webp`);
  }
  manifest[name] = entry;
}
if (masters.length) fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Processed ${masters.length} image masters.`);
