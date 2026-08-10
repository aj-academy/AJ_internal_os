import { test, expect } from "@playwright/test";
import { optionalCreds, requireE2eEnv } from "../helpers/env";

/**
 * Admin smoke stubs — prepared for Phase 5.
 * Not executed in Phase 4 install. When run: needs E2E_BASE_URL + optional admin creds.
 */
test.describe("Admin smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("incorrect login is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#login-email").fill("qa.invalid@example.com");
    await page.locator("#login-password").fill("definitely-wrong-password-000");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/login/i);
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("correct admin login reaches admin area", async ({ page }) => {
    const creds = optionalCreds("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin\//, { timeout: 45_000 });
  });

  test("admin dashboard opens", async ({ page }) => {
    const creds = optionalCreds("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\//, { timeout: 45_000 });
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("academic page opens", async ({ page }) => {
    const creds = optionalCreds("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\//, { timeout: 45_000 });
    await page.goto("/admin/academic/overview");
    await expect(page).toHaveURL(/\/admin\/academic\/overview/);
  });

  test("student management page opens", async ({ page }) => {
    const creds = optionalCreds("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\//, { timeout: 45_000 });
    await page.goto("/admin/students/directory");
    await expect(page).toHaveURL(/\/admin\/students\/directory/);
  });
});
