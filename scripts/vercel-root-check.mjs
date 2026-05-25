import { existsSync } from "node:fs";

const hasAppHere = existsSync("next.config.ts") || existsSync("next.config.js");
const hasAppInSubfolder =
  existsSync("AJ_Academy_OS/next.config.ts") || existsSync("AJ_Academy_OS/next.config.js");

if (!hasAppHere && hasAppInSubfolder) {
  console.error(`
Vercel build is running from the repository root, but the Next.js app is in AJ_Academy_OS.

Fix (required):
  1. Vercel → Project "aj-internal-os" → Settings → General
  2. Root Directory → Edit → set to: AJ_Academy_OS
  3. Save → Deployments → Redeploy (clear build cache)

Without this, deploy shows "Ready" but every URL returns 404.
`);
  process.exit(1);
}

if (!hasAppHere) {
  console.error("No Next.js app found. Set Vercel Root Directory to AJ_Academy_OS.");
  process.exit(1);
}

console.log("Vercel root check passed (Next.js app in build directory).");
