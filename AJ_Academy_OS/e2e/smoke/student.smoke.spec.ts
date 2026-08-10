import { test, expect } from "@playwright/test";
import { optionalCreds, requireE2eEnv } from "../helpers/env";

test.describe("Student smoke", () => {
  test.beforeAll(() => {
    requireE2eEnv();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("student login reaches student area", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/student\//, { timeout: 45_000 });
  });

  test("student dashboard opens", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test("assignment page opens", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/student/learning/assignments");
    await expect(page).toHaveURL(/\/student\/learning\/assignments/);
  });

  test("test page opens", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/student/learning/tests");
    await expect(page).toHaveURL(/\/student\/learning\/tests/);
  });

  test("material page opens", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/student/learning/materials");
    await expect(page).toHaveURL(/\/student\/learning\/materials/);
  });

  test("queries page opens", async ({ page }) => {
    const creds = optionalCreds("STUDENT");
    test.skip(!creds, "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD to run this test");
    await page.goto("/login");
    await page.locator("#login-email").fill(creds!.email);
    await page.locator("#login-password").fill(creds!.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/student\//, { timeout: 45_000 });
    await page.goto("/student/learning/queries");
    await expect(page).toHaveURL(/\/student\/learning\/queries/);
  });
});
