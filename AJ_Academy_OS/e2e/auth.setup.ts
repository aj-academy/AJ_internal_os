import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { requireE2eEnv } from "./helpers/env";
import { credsFor, loginAs } from "./helpers/login";

/**
 * One real Supabase login per role. Saves Playwright storageState so smoke
 * specs reuse the session instead of signing in on every test (rate-limit risk).
 * Test harness only — no application changes.
 */
const authDir = path.join(__dirname, ".auth");

setup.describe.configure({ mode: "serial" });

setup.beforeAll(() => {
  requireE2eEnv();
  fs.mkdirSync(authDir, { recursive: true });
});

setup("authenticate as admin", async ({ page }) => {
  const creds = credsFor("ADMIN");
  setup.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");
  await loginAs(page, "admin", creds!);
  await expect(page).toHaveURL(/\/admin\//);
  await page.context().storageState({ path: path.join(authDir, "admin.json") });
});

setup("authenticate as mentor", async ({ page }) => {
  const creds = credsFor("MENTOR");
  setup.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD");
  // Brief pause between role logins to reduce auth throttling.
  await page.waitForTimeout(2_000);
  await loginAs(page, "mentor", creds!);
  await expect(page).toHaveURL(/\/mentor\//);
  await page.context().storageState({ path: path.join(authDir, "mentor.json") });
});

setup("authenticate as student", async ({ page }) => {
  const creds = credsFor("STUDENT");
  setup.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD");
  await page.waitForTimeout(2_000);
  await loginAs(page, "student", creds!);
  await expect(page).toHaveURL(/\/student\//);
  await page.context().storageState({ path: path.join(authDir, "student.json") });
});
