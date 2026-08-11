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

function harnessError(detail: string): Error {
  return new Error(`Harness error: ${detail}`);
}

/**
 * Fill login form and verify values before Sign in.
 * Test-only helper — does not change application code.
 * Never logs password, tokens, or storage-state contents.
 */
export async function loginAs(
  page: Page,
  role: E2eLoginRole,
  creds: { email: string; password: string },
) {
  const expectedEmail = (creds.email || "").trim();
  const expectedPassword = creds.password || "";

  if (!expectedEmail) {
    throw harnessError("expected email is empty — check E2E_*_EMAIL env (value not logged).");
  }
  if (!expectedPassword) {
    throw harnessError("expected password is empty — check E2E_*_PASSWORD env (value not logged).");
  }

  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const roleSelect = page.getByLabel("Role", { exact: true });
  const emailInput = page.getByLabel("Email", { exact: true });
  const passwordInput = page.getByLabel("Password", { exact: true });
  const signInButton = page.getByRole("button", { name: /^sign in$/i });

  await expect(roleSelect).toBeVisible();
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(signInButton).toBeVisible();

  // Explicit fill order: email → password → role
  await emailInput.click();
  await emailInput.fill("");
  await emailInput.fill(expectedEmail);

  await passwordInput.click();
  await passwordInput.fill("");
  await passwordInput.fill(expectedPassword);

  await roleSelect.selectOption({ label: ROLE_LABEL[role] });

  // Pre-submit harness checks (no password / token logging)
  const actualEmail = (await emailInput.inputValue()).trim();
  const actualPassword = await passwordInput.inputValue();
  const actualRole = await roleSelect.inputValue();

  if (actualEmail !== expectedEmail) {
    throw harnessError(
      `email input value mismatch before Sign in (expected length ${expectedEmail.length}, got length ${actualEmail.length}, equal=${actualEmail === expectedEmail}).`,
    );
  }
  if (!actualPassword) {
    throw harnessError("password field is empty before Sign in (value not logged).");
  }
  if (actualRole !== role) {
    throw harnessError(
      `selected role mismatch before Sign in (expected "${role}", got "${actualRole || "(empty)"}").`,
    );
  }

  await signInButton.click();
  await waitForRoutedUrl(page, ROLE_HOME[role]);
}

export function credsFor(role: "ADMIN" | "MENTOR" | "STUDENT") {
  return optionalCreds(role);
}
