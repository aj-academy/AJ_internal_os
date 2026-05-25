import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const input = path.join(root, "public", "AJ Academy logo.jpeg");
const iconsDir = path.join(root, "public", "icons");

/** AJ Academy gold — safe zone background for Android maskable icon */
const MASKABLE_BG = { r: 255, g: 253, b: 248, alpha: 1 };

await mkdir(iconsDir, { recursive: true });

const base = sharp(input).rotate();

await base.clone().resize(192, 192, { fit: "contain", background: MASKABLE_BG }).png().toFile(path.join(iconsDir, "icon-192x192.png"));
await base.clone().resize(512, 512, { fit: "contain", background: MASKABLE_BG }).png().toFile(path.join(iconsDir, "icon-512x512.png"));

await base
  .clone()
  .resize(410, 410, { fit: "contain", background: MASKABLE_BG })
  .extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: MASKABLE_BG,
  })
  .resize(512, 512)
  .png()
  .toFile(path.join(iconsDir, "maskable-icon-512x512.png"));

await base.clone().resize(180, 180, { fit: "contain", background: MASKABLE_BG }).png().toFile(path.join(root, "public", "apple-touch-icon.png"));
await base.clone().resize(32, 32, { fit: "contain", background: MASKABLE_BG }).png().toFile(path.join(root, "public", "favicon.ico"));

console.log("PWA icons generated from public/AJ Academy logo.jpeg");
