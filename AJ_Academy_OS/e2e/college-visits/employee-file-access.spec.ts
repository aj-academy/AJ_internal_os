import { expect, test } from "@playwright/test";
import { requireE2eEnv } from "../helpers/env";

test.beforeAll(() => {
  requireE2eEnv();
});

test("Employee uses shared College Visits UI", async ({ page }) => {
  await page.goto("/employee/college-visits", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "College Visits" })).toBeVisible();
  await expect(page.getByRole("button", { name: /add college/i }).first()).toBeVisible();

  await page.getByRole("button", { name: "All Colleges" }).click();
  await expect(page.getByRole("button", { name: /import template/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^import$/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /export/i }).first()).toBeVisible();
  await expect(page.getByText("Created By", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /open →/i })).toHaveCount(0);
  await expect(page.getByLabel("Filter by Location")).toBeVisible();
  await expect(page.getByLabel("Filter by Created By")).toBeVisible();
});

test("Employee cannot enumerate or sign files for an inaccessible College Visit", async ({ request }) => {
  const inaccessibleId = "00000000-0000-4000-8000-000000000001";

  const list = await request.post("/api/proposals/list", {
    data: { entityType: "college", entityId: inaccessibleId },
  });
  expect([403, 404]).toContain(list.status());

  const signed = await request.post("/api/proposals/signed-url", {
    data: {
      entityType: "college",
      entityId: inaccessibleId,
      fileId: "00000000-0000-4000-8000-000000000002",
    },
  });
  expect([403, 404]).toContain(signed.status());
});

test("Employee never receives Admin-only file metadata or a signed URL", async ({ request }) => {
  const collegeId = process.env.E2E_ADMIN_ONLY_COLLEGE_ID?.trim();
  const fileId = process.env.E2E_ADMIN_ONLY_FILE_ID?.trim();
  test.skip(!collegeId || !fileId, "Set E2E_ADMIN_ONLY_COLLEGE_ID and E2E_ADMIN_ONLY_FILE_ID");

  const list = await request.post("/api/proposals/list", {
    data: { entityType: "college", entityId: collegeId },
  });
  expect(list.ok()).toBeTruthy();
  const payload = (await list.json()) as {
    files?: Array<{ id: string; visibility_scope?: string; file_path?: string }>;
  };
  expect(payload.files?.some((file) => file.id === fileId)).toBeFalsy();
  expect(payload.files?.every((file) => file.visibility_scope === "admin_employee")).toBeTruthy();

  const signed = await request.post("/api/proposals/signed-url", {
    data: { entityType: "college", entityId: collegeId, fileId },
  });
  expect([403, 404]).toContain(signed.status());
  const signedPayload = (await signed.json()) as { url?: string };
  expect(signedPayload.url).toBeUndefined();
});

test("Employee can list own import folders but not an inaccessible Admin batch", async ({ request }) => {
  const list = await request.get("/api/college-visits/import");
  expect(list.ok()).toBeTruthy();
  const payload = (await list.json()) as { batches?: Array<{ uploaded_by?: string | null }> };
  expect(Array.isArray(payload.batches)).toBeTruthy();

  const hidden = await request.get("/api/college-visits/import/00000000-0000-4000-8000-000000000001");
  expect([403, 404]).toContain(hidden.status());

  const execute = await request.post(
    "/api/college-visits/import/00000000-0000-4000-8000-000000000001/execute",
  );
  expect([403, 404]).toContain(execute.status());
});
