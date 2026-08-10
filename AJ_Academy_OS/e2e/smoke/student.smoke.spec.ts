import { test, expect } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";
import { credsFor, loginAs } from "../helpers/login";
import { expectProtectedRoute, gotoAppRoute } from "../helpers/navigation";

test.describe("Student smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("login page loads", async ({ page }) => {
    await gotoAppRoute(page, "/login");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-role")).toBeVisible();
  });

  test("student login reaches student area", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expect(page).toHaveURL(/\/student\//);
  });

  test("student dashboard opens", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expectProtectedRoute(page, "/student/dashboard", /\/student\/dashboard/);
  });

  test("assignment page opens", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expectProtectedRoute(page, "/student/learning/assignments", /\/student\/learning\/assignments/);
  });

  test("test page opens", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expectProtectedRoute(page, "/student/learning/tests", /\/student\/learning\/tests/);
  });

  test("material page opens", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expectProtectedRoute(page, "/student/learning/materials", /\/student\/learning\/materials/);
  });

  test("queries page opens", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expectProtectedRoute(page, "/student/learning/queries", /\/student\/learning\/queries/);
  });
});
