import { test, expect } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { expectProtectedRoute, gotoAppRoute } from "../helpers/navigation";

/** Student smoke — uses storageState from auth.setup (no per-test login). */
test.describe("Student smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("STUDENT"), "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD");
  });

  test("student session reaches student area", async ({ page }) => {
    await gotoAppRoute(page, "/student/dashboard");
    await expect(page).toHaveURL(/\/student\//);
  });

  test("student dashboard opens", async ({ page }) => {
    await expectProtectedRoute(page, "/student/dashboard", /\/student\/dashboard/);
  });

  test("assignment page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/student/learning/assignments", /\/student\/learning\/assignments/);
  });

  test("test page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/student/learning/tests", /\/student\/learning\/tests/);
  });

  test("material page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/student/learning/materials", /\/student\/learning\/materials/);
  });

  test("queries page opens", async ({ page }) => {
    await expectProtectedRoute(page, "/student/learning/queries", /\/student\/learning\/queries/);
  });
});
