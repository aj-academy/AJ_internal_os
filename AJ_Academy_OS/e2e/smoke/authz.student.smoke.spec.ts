import { test } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { expectForbiddenRoute } from "../helpers/navigation";

/** Student authz — uses student storageState (no login in this file). */
test.describe("Authorization smoke (student)", () => {
  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("STUDENT"), "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD");
  });

  test("student cannot open admin URL", async ({ page }) => {
    await expectForbiddenRoute(page, "/admin/dashboard", /\/admin\/dashboard/);
  });

  test("student cannot open mentor URL", async ({ page }) => {
    await expectForbiddenRoute(page, "/mentor/dashboard", /\/mentor\/dashboard/);
  });
});
