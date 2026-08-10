import { expect, type Page } from "@playwright/test";
import { optionalCreds } from "./env";
import { waitForRoutedUrl } from "./navigation";

export type E2eLoginRole = "admin" | "mentor" | "student";

const ROLE_HOME: Record<E2eLoginRole, RegExp> = {
  admin: /\/admin\//,
  mentor: /\/mentor\//,
  student: /\/student\//,
};

const ROLE_LABEL: Record<E2eLoginRole, string> = {
  admin: "Admin",
  mentor: "Mentor",
  student: "Student",
};

/**
 * Fill login form including Role dropdown (defaults to Admin in the UI).
 * Test-only helper — does not change application code.
 */
export async function loginAs(
  page: Page,
  role: E2eLoginRole,
  creds: { email: string; password: string },
) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const roleSelect = page.locator("#login-role");
  await roleSelect.selectOption({ label: ROLE_LABEL[role] });
  await expect(roleSelect).toHaveValue(role);
  await page.locator("#login-email").fill(creds.email);
  await page.locator("#login-password").fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await waitForRoutedUrl(page, ROLE_HOME[role]);
}

export function credsFor(role: "ADMIN" | "MENTOR" | "STUDENT") {
  return optionalCreds(role);
}
