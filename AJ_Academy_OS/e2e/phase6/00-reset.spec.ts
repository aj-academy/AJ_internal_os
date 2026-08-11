import { test } from "@playwright/test";
import { resetFindings } from "./helpers/findings";

/** Clears prior Phase 6 findings JSON before this run. */
test("phase6 reset findings", async () => {
  resetFindings();
});
