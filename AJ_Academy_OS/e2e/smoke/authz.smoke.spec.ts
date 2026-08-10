import { test, expect } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";
import { credsFor, loginAs } from "../helpers/login";

/**
 * Role isolation smoke — selects correct Role before login.
 */
test.describe("Authorization smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("student cannot open admin URL", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });

  test("student cannot open mentor URL", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/mentor/dashboard");
    await expect(page).not.toHaveURL(/\/mentor\/dashboard/);
  });

  test("mentor cannot open unauthorized admin URL", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await page.waitForURL(/\/mentor\//, { timeout: 45_000 });
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });
});
