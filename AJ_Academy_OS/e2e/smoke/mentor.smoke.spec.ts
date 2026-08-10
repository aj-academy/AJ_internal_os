import { test, expect } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";
import { credsFor, loginAs } from "../helpers/login";

test.describe("Mentor smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-role")).toBeVisible();
  });

  test("mentor login reaches mentor area", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await expect(page).toHaveURL(/\/mentor\//, { timeout: 45_000 });
  });

  test("mentor dashboard opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await page.waitForURL(/\/mentor\//, { timeout: 45_000 });
    await page.goto("/mentor/dashboard");
    await expect(page).toHaveURL(/\/mentor\/dashboard/);
  });

  test("assigned students page opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await page.waitForURL(/\/mentor\//, { timeout: 45_000 });
    await page.goto("/mentor/students");
    await expect(page).toHaveURL(/\/mentor\/students/);
  });

  test("assignment page opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await page.waitForURL(/\/mentor\//, { timeout: 45_000 });
    await page.goto("/mentor/learning/assignments");
    await expect(page).toHaveURL(/\/mentor\/learning\/assignments/);
  });

  test("test page opens", async ({ page }) => {
    const creds = credsFor("MENTOR");
    test.skip(!creds, "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD to run this test");
    await loginAs(page, "mentor", creds!);
    await page.waitForURL(/\/mentor\//, { timeout: 45_000 });
    await page.goto("/mentor/learning/tests");
    await expect(page).toHaveURL(/\/mentor\/learning\/tests/);
  });
});
