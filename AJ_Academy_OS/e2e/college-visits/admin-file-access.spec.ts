import { expect, test } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";

test.beforeAll(() => {
  requireE2eEnv();
});

test("Admin College Visits shows creator attribution", async ({ page }) => {
  await page.goto("/admin/college-visits", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "College Visits" })).toBeVisible();

  await page.getByRole("button", { name: "All Colleges" }).click();
  await expect(page.getByRole("button", { name: /import template/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^import$/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /export/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /open →/i })).toHaveCount(0);
  await expect(page.getByText("Created By", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Created At", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Filter by Created By")).toBeVisible();
  await expect(page.getByLabel("Filter by Location")).toBeVisible();
});

test("Admin receives uploader attribution and all visibility scopes", async ({ request }) => {
  const collegeId = process.env.E2E_ADMIN_ONLY_COLLEGE_ID?.trim();
  const fileId = process.env.E2E_ADMIN_ONLY_FILE_ID?.trim();
  test.skip(!collegeId || !fileId, "Set E2E_ADMIN_ONLY_COLLEGE_ID and E2E_ADMIN_ONLY_FILE_ID");

  const list = await request.post("/api/proposals/list", {
    data: { entityType: "college", entityId: collegeId },
  });
  expect(list.ok()).toBeTruthy();
  const payload = (await list.json()) as {
    files?: Array<{
      id: string;
      uploader_name?: string | null;
      uploader_role?: string | null;
      visibility_scope?: string;
    }>;
  };
  const file = payload.files?.find((item) => item.id === fileId);
  expect(file).toBeTruthy();
  expect(file?.visibility_scope).toBe("admin_only");
  expect(file?.uploader_name).toBeTruthy();
  expect(file?.uploader_role).toMatch(/^(admin|super_admin)$/);

  const signed = await request.post("/api/proposals/signed-url", {
    data: { entityType: "college", entityId: collegeId, fileId },
  });
  expect(signed.ok()).toBeTruthy();
  const signedPayload = (await signed.json()) as { url?: string };
  expect(signedPayload.url).toBeTruthy();
});

test("Admin import folders include uploader name", async ({ request }) => {
  const list = await request.get("/api/college-visits/import");
  expect(list.ok()).toBeTruthy();
  const payload = (await list.json()) as {
    batches?: Array<{
      uploaded_by?: string | null;
      uploaded_by_name?: string | null;
      uploaded_by_role?: string | null;
    }>;
  };
  const owned = (payload.batches ?? []).filter((batch) => batch.uploaded_by);
  test.skip(!owned.length, "No import folders with uploaded_by yet");
  expect(owned.every((batch) => Boolean(batch.uploaded_by_name))).toBeTruthy();
});
