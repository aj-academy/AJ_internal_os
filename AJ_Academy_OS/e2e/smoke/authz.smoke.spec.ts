import { test } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";
import { credsFor, loginAs } from "../helpers/login";
import { expectForbiddenRoute } from "../helpers/navigation";

/**
 * Role isolation smoke — selects correct Role before login.
 * Redirect away from forbidden URLs is expected; navigation abort must not fail the test.
 */
test.describe("Authorization smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("student cannot open admin URL", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expectForbiddenRoute(page, "/admin/dashboard", /\/admin\/dashboard/);
  });

  test("student cannot open mentor URL", async ({ page }) => {
    const creds = credsFor("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await loginAs(page, "student", creds!);
    await expectForbiddenRoute(page, "/mentor/dashboard", /\/mentor\/dashboard/);
  });

  test("mentor cannot open unauthorized admin URL", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await expectForbiddenRoute(page, "/admin/dashboard", /\/admin\/dashboard/);
  });
});
