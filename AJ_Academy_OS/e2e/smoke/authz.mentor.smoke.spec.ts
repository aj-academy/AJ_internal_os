import { test } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { expectForbiddenRoute } from "../helpers/navigation";

/** Mentor authz — uses mentor storageState (no login in this file). */
test.describe("Authorization smoke (mentor)", () => {
  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("MENTOR"), "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD");
  });

  test("mentor cannot open unauthorized admin URL", async ({ page }) => {
    await expectForbiddenRoute(page, "/admin/dashboard", /\/admin\/dashboard/);
  });
});
