import { test, expect } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";
import { credsFor, loginAs } from "../helpers/login";
import { expectProtectedRoute, gotoAppRoute } from "../helpers/navigation";

/**
 * Admin smoke — selects Role = Admin before Sign in.
 */
test.describe("Admin smoke", () => {
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

  test("correct admin login reaches admin area", async ({ page }) => {
    const creds = credsFor("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await loginAs(page, "admin", creds!);
    await expect(page).toHaveURL(/\/admin\//);
  });

  test("admin dashboard opens", async ({ page }) => {
    const creds = credsFor("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await loginAs(page, "admin", creds!);
    await expectProtectedRoute(page, "/admin/dashboard", /\/admin\/dashboard/);
  });

  test("academic page opens", async ({ page }) => {
    const creds = credsFor("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await loginAs(page, "admin", creds!);
    await expectProtectedRoute(page, "/admin/academic/overview", /\/admin\/academic\/overview/);
  });

  test("student management page opens", async ({ page }) => {
    const creds = credsFor("ADMIN");
    test.skip(!creds, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test");
    await loginAs(page, "admin", creds!);
    await expectProtectedRoute(page, "/admin/students/directory", /\/admin\/students\/directory/);
  });
});
