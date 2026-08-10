import { test, expect } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";
import { credsFor, loginAs } from "../helpers/login";
import { expectProtectedRoute, gotoAppRoute } from "../helpers/navigation";

test.describe("Mentor smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("login page loads", async ({ page }) => {
    await gotoAppRoute(page, "/login");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-role")).toBeVisible();
  });

  test("mentor login reaches mentor area", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await expect(page).toHaveURL(/\/mentor\//);
  });

  test("mentor dashboard opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await expectProtectedRoute(page, "/mentor/dashboard", /\/mentor\/dashboard/);
  });

  test("assigned students page opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await expectProtectedRoute(page, "/mentor/students", /\/mentor\/students/);
  });

  test("assignment page opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await expectProtectedRoute(page, "/mentor/learning/assignments", /\/mentor\/learning\/assignments/);
  });

  test("test page opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await expectProtectedRoute(page, "/mentor/learning/tests", /\/mentor\/learning\/tests/);
  });
});
