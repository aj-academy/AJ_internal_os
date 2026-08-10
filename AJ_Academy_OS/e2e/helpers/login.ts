import type { Page } from "@playwright/test";
import { optionalCreds } from "./env";

export type E2eLoginRole = "admin" | "mentor" | "student";

/**
 * Fill login form including Role dropdown (defaults to Admin in the UI).
 * Test-only helper — does not change application code.
 */
export async function loginAs(
  page: Page,
  role: E2eLoginRole,
  creds: { email: string; password: string },
) {
  await page.goto("/login");
  await page.locator("#login-role").selectOption(role);
  await page.locator("#login-email").fill(creds.email);
  await page.locator("#login-password").fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

export function credsFor(role: "ADMIN" | "MENTOR" | "STUDENT") {
  return optionalCreds(role);
}
