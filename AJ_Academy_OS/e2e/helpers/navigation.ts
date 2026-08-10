import { expect, type Page } from "@playwright/test";

const DEFAULT_TIMEOUT = 45_000;

function isAbortNavigationError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("ERR_ABORTED") ||
    msg.includes("NS_BINDING_ABORTED") ||
    msg.includes("Navigation failed because page was closed")
  );
}

async function pollUntil(
  page: Page,
  predicate: (url: string) => boolean,
  timeout = DEFAULT_TIMEOUT,
  label = "URL condition",
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url && url !== "about:blank" && predicate(url)) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} not met within ${timeout}ms. Last URL: ${page.url() || "(empty)"}`);
}

/**
 * Navigate without failing on intentional Next.js redirects (ERR_ABORTED).
 * Test harness only — does not change application routing.
 */
export async function gotoAppRoute(
  page: Page,
  path: string,
  opts?: { timeout?: number; waitUntil?: "domcontentloaded" | "load" | "commit" },
) {
  const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
  const waitUntil = opts?.waitUntil ?? "domcontentloaded";

  try {
    await page.goto(path, { waitUntil, timeout });
  } catch (err) {
    if (!isAbortNavigationError(err)) throw err;
  }

  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => undefined);
  await pollUntil(page, (url) => Boolean(url), Math.min(timeout, 15_000), "Routed URL");
}

/** Wait until the routed URL matches (post-redirect). */
export async function waitForRoutedUrl(page: Page, pattern: RegExp, timeout = DEFAULT_TIMEOUT) {
  await pollUntil(page, (url) => pattern.test(url), timeout, `URL matches ${pattern}`);
}

/**
 * Visit a protected route and assert the final URL after redirects settle.
 */
export async function expectProtectedRoute(page: Page, path: string, urlPattern: RegExp) {
  await gotoAppRoute(page, path);
  const settled = page.url();
  if (/\/login/i.test(settled)) {
    throw new Error(
      `Protected route ${path} redirected to login — session may be missing (possible application/auth issue).`,
    );
  }
  await expect(page).toHaveURL(urlPattern, { timeout: 30_000 });
  await expect(page.locator("body")).toBeVisible();
}

/**
 * Visit a route the user should not access; assert final URL is not the forbidden destination.
 * Redirect away from forbidden pages is expected and must not fail the test.
 */
export async function expectForbiddenRoute(
  page: Page,
  forbiddenPath: string,
  forbiddenPattern: RegExp,
) {
  await gotoAppRoute(page, forbiddenPath);
  await pollUntil(
    page,
    (url) => Boolean(url) && !forbiddenPattern.test(url),
    30_000,
    "Forbidden route redirect",
  );
  await expect(page).not.toHaveURL(forbiddenPattern, { timeout: 5_000 });
  await expect(page.locator("body")).toBeVisible();
}
