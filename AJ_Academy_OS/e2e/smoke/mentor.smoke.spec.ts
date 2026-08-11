import { test, expect } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { expectProtectedRoute, gotoAppRoute } from "../helpers/navigation";

/** Mentor smoke — uses storageState from auth.setup (no per-test login). */
test.describe("Mentor smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("MENTOR"), "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD");
  });

  test("mentor session reaches mentor area", async ({ page }) => {
    await gotoAppRoute(page, "/mentor/dashboard");
    await expect(page).toHaveURL(/\/mentor\//);
  });

  test("mentor dashboard opens", async ({ page }) => {
    await expectProtectedRoute(page, "/mentor/dashboard", /\/mentor\/dashboard/);
  });

  test("assigned students page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/mentor/students", /\/mentor\/students/);
  });

  test("assignment page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/mentor/learning/assignments", /\/mentor\/learning\/assignments/);
  });

  test("test page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/mentor/learning/tests", /\/mentor\/learning\/tests/);
  });
});
