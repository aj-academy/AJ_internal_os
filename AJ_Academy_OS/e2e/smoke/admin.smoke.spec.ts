import { test, expect } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { expectProtectedRoute, gotoAppRoute } from "../helpers/navigation";

/**
 * Admin smoke — uses storageState from auth.setup (no per-test login).
 */
test.describe("Admin smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("ADMIN"), "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");
  });

  test("admin session reaches admin area", async ({ page }) => {
    await gotoAppRoute(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\//);
  });

  test("admin dashboard opens", async ({ page }) => {
    await expectProtectedRoute(page, "/admin/dashboard", /\/admin\/dashboard/);
  });

  test("academic page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/admin/academic/overview", /\/admin\/academic\/overview/);
  });

  test("student management page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/admin/students/directory", /\/admin\/students\/directory/);
  });
});
