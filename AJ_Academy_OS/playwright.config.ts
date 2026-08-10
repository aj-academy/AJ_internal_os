import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * AJ OS Playwright config — smoke / e2e preparation.
 * Does not hardcode production. Requires E2E_BASE_URL when tests are run.
 */
const rawBase = (process.env.E2E_BASE_URL || "").trim().replace(/\/$/, "");
const KNOWN_PRODUCTION_HOSTS = ["aj-academy.vercel.app"];

function assertSafeBaseUrl(url: string) {
  if (!url) {
    throw new Error(
      "E2E_BASE_URL is missing. Set it to a local or staging URL (e.g. http://localhost:3000). Refusing to start Playwright.",
    );
  }
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`E2E_BASE_URL is not a valid URL: ${url}`);
  }
  if (KNOWN_PRODUCTION_HOSTS.includes(host)) {
    throw new Error(
      `E2E_BASE_URL points at known production host (${host}). Refusing to run. Use localhost or a confirmed staging URL.`,
    );
  }
}

// Only enforce when a test run is actually starting (config load during `playwright test`).
// `playwright --help` / install do not need this; scripts that list tests may still load config.
if (process.env.PLAYWRIGHT_SKIP_BASE_URL_CHECK !== "1") {
  // Soft check at config load: allow `npx playwright test --list` only with skip flag.
  // Hard fail remains in e2e/helpers/env.ts when tests execute.
  if (rawBase) assertSafeBaseUrl(rawBase);
}

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: rawBase || "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  outputDir: "test-results",
});
