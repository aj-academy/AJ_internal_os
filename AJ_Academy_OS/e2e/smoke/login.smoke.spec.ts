import { test, expect } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";
import { gotoAppRoute } from "../helpers/navigation";

/**
 * Unauthenticated login UI checks — no storageState, no repeated valid logins.
 */
test.describe("Login smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("login page loads", async ({ page }) => {
    await gotoAppRoute(page, "/login");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.locator("#login-role")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("incorrect login is rejected", async ({ page }) => {
    await gotoAppRoute(page, "/login");
    await page.locator("#login-role").selectOption("admin");
    await page.locator("#login-email").fill("qa.invalid@example.com");
    await page.locator("#login-password").fill("definitely-wrong-password-000");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/login/i);
    await expect(page.locator("#login-email")).toBeVisible();
  });
});
