import { test, expect } from "@playwright/test";
import { optionalCreds, requireE2eEnv } from "../helpers/env";

/**
 * Role isolation smoke — student/mentor must not stay on unauthorized dashboards.
 */
test.describe("Authorization smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("student cannot open admin URL", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });

  test("student cannot open mentor URL", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/mentor/dashboard");
    await expect(page).not.toHaveURL(/\/mentor\/dashboard/);
  });

  test("mentor cannot open unauthorized admin URL", async ({ page }) => {
    const creds = optionalCreds("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/mentor\//, { timeout: 45_000 });
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });
});
