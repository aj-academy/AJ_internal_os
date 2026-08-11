import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * AJ OS Playwright config — smoke / e2e preparation.
 * Does not hardcode production. Requires E2E_BASE_URL when tests are run.
 * Loads `.env.e2e` into process.env when present (harness only).
 */

function loadEnvE2e() {
  const envPath = path.join(__dirname, ".env.e2e");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvE2e();

const rawBase = (process.env.E2E_BASE_URL || "").trim().replace(/\/$/, "");
const KNOWN_PRODUCTION_HOSTS = ["aj-academy.vercel.app"];
const authDir = path.join(__dirname, "e2e", ".auth");

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

if (process.env.PLAYWRIGHT_SKIP_BASE_URL_CHECK !== "1") {
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
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--disable-dev-shm-usage"] },
      },
    },
    {
      name: "smoke-login",
      testMatch: /smoke\/login\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--disable-dev-shm-usage"] },
      },
    },
    {
      name: "smoke-admin",
      dependencies: ["setup"],
      testMatch: /smoke\/admin\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "admin.json"),
        launchOptions: { args: ["--disable-dev-shm-usage"] },
      },
    },
    {
      name: "smoke-mentor",
      dependencies: ["setup"],
      testMatch: /smoke\/mentor\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "mentor.json"),
        launchOptions: { args: ["--disable-dev-shm-usage"] },
      },
    },
    {
      name: "smoke-student",
      dependencies: ["setup"],
      testMatch: /smoke\/student\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "student.json"),
        launchOptions: { args: ["--disable-dev-shm-usage"] },
      },
    },
    {
      name: "smoke-authz-student",
      dependencies: ["setup"],
      testMatch: /smoke\/authz\.student\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "student.json"),
        launchOptions: { args: ["--disable-dev-shm-usage"] },
      },
    },
    {
      name: "smoke-authz-mentor",
      dependencies: ["setup"],
      testMatch: /smoke\/authz\.mentor\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "mentor.json"),
        launchOptions: { args: ["--disable-dev-shm-usage"] },
      },
    },
  ],
  outputDir: "test-results",
});
