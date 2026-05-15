import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const input = path.join(root, "public", "Deep blure@2x-100.jpg");
const iconsDir = path.join(root, "public", "icons");

await mkdir(iconsDir, { recursive: true });

const base = sharp(input).rotate();

await base.clone().resize(192, 192, { fit: "cover" }).png().toFile(path.join(iconsDir, "icon-192x192.png"));
await base.clone().resize(512, 512, { fit: "cover" }).png().toFile(path.join(iconsDir, "icon-512x512.png"));

await base
  .clone()
  .resize(410, 410, { fit: "cover" })
  .extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: { r: 30, g: 79, b: 145, alpha: 1 },
  })
  .resize(512, 512)
  .png()
  .toFile(path.join(iconsDir, "maskable-icon-512x512.png"));

console.log("PWA icons generated in public/icons/");
