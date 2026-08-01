/**
 * Phase 7 — transactional-ish portal student import (batched Auth + profile + enrolment).
 * Service-role only. Does not overwrite password / auth id / mentor allocations / grades.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateTempPassword,
  mapStatusToProfile,
  type ImportMode,
  type ValidatedImportRow,
} from "@/lib/students/importValidate";

export type ExecuteImportResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rowResults: {
    rowNumber: number;
    resultStatus: "created" | "updated" | "skipped" | "failed" | "blocked";
    profileId?: string | null;
    message?: string;
  }[];
};

const BATCH_SIZE = 10;

export async function executeStudentImport(args: {
  admin: SupabaseClient;
  actorId: string;
  mode: ImportMode;
  confirmUpdateExisting: boolean;
  rows: ValidatedImportRow[];
  catalog: {
    resolveIds: (mapped: Record<string, string>) => {
      department_id: string | null;
      course_id: string | null;
      batch_id: string | null;
    };
  };
}): Promise<ExecuteImportResult> {
  const { admin, actorId, mode, confirmUpdateExisting, rows, catalog } = args;
  const result: ExecuteImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    rowResults: [],
  };

  if (mode === "stop_on_error" && rows.some((r) => r.severity === "error")) {
    for (const r of rows) {
      result.rowResults.push({
        rowNumber: r.rowNumber,
        resultStatus: "blocked",
        message: "Import stopped because errors exist (stop_on_error mode).",
      });
      result.failed += 1;
    }
    return result;
  }

  const eligible = rows.filter((r) => {
    if (r.action === "blocked" || r.severity === "error") {
      if (mode === "import_valid_skip_invalid" || mode === "skip_duplicates" || mode === "create_only") {
        result.rowResults.push({
          rowNumber: r.rowNumber,
          resultStatus: "skipped",
          message: r.issues.find((i) => i.severity === "error")?.message || "Invalid row skipped.",
        });
        result.skipped += 1;
        return false;
      }
      result.rowResults.push({
        rowNumber: r.rowNumber,
        resultStatus: "blocked",
        message: "Row blocked due to validation errors.",
      });
      result.failed += 1;
      return false;
    }
    if (r.action === "skip") {
      result.rowResults.push({
        rowNumber: r.rowNumber,
        resultStatus: "skipped",
        message: "Skipped by import mode / duplicate policy.",
      });
      result.skipped += 1;
      return false;
    }
    if (r.action === "update" && !confirmUpdateExisting) {
      result.rowResults.push({
        rowNumber: r.rowNumber,
        resultStatus: "blocked",
        message: "Update existing students requires explicit confirmation.",
      });
      result.failed += 1;
      return false;
    }
    return true;
  });

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const chunk = eligible.slice(i, i + BATCH_SIZE);
    for (const row of chunk) {
      try {
        const m = row.mapped;
        const ids = catalog.resolveIds(m);
        if (!ids.department_id || !ids.course_id) {
          result.failed += 1;
          result.rowResults.push({
            rowNumber: row.rowNumber,
            resultStatus: "failed",
            message: "Could not resolve department/course IDs.",
          });
          continue;
        }

        const email = m["Email"].toLowerCase();
        const fullName = `${m["First Name"]} ${m["Last Name"]}`.trim();
        const profileStatus = mapStatusToProfile(m["Student Status"]);
        const profilePatch = {
          full_name: fullName,
          first_name: m["First Name"],
          last_name: m["Last Name"],
          email,
          role: "student" as const,
          department: m["Department"],
          course: m["Course"],
          phone: m["Mobile Number"].replace(/[\s\-()]/g, ""),
          alternate_phone: m["Alternate Mobile Number"] || null,
          registration_number: m["Registration Number"],
          roll_number: m["Roll Number"] || null,
          section: m["Section"] || null,
          academic_year: m["Academic Year"] || null,
          year_of_study: m["Year of Study"] || null,
          semester: m["Semester"] || null,
          admission_date: m["Admission Date"] || null,
          admission_type: m["Admission Type"] || null,
          scholarship_type: m["Scholarship Type"] || null,
          date_of_birth: m["Date of Birth"] || null,
          gender: m["Gender"] || null,
          parent_guardian_name: m["Parent/Guardian Name"] || null,
          parent_guardian_phone: m["Parent/Guardian Mobile"] || null,
          address_line: m["Address"] || null,
          city: m["City"] || null,
          state: m["State"] || null,
          postal_code: m["Postal Code"] || null,
          college_name: m["College Name"] || null,
          linkedin_url: m["LinkedIn URL"] || null,
          github_url: m["GitHub URL"] || null,
          portfolio_url: m["Portfolio URL"] || null,
          student_notes: m["Notes"] || null,
          status: profileStatus,
        };

        if (row.action === "update" && row.existingProfileId) {
          const { error: upErr } = await admin
            .from("profiles")
            .update(profilePatch)
            .eq("id", row.existingProfileId);
          if (upErr) throw new Error(upErr.message);

          await upsertEnrolment(admin, row.existingProfileId, ids, actorId);
          result.updated += 1;
          result.rowResults.push({
            rowNumber: row.rowNumber,
            resultStatus: "updated",
            profileId: row.existingProfileId,
          });
          continue;
        }

        // create
        const password = generateTempPassword();
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: "student", imported: true },
        });
        if (authError || !authData.user) {
          // Existing auth user — try link profile if present
          if (authError?.message?.toLowerCase().includes("already")) {
            const { data: existingProfile } = await admin
              .from("profiles")
              .select("id")
              .eq("email", email)
              .maybeSingle();
            if (existingProfile?.id) {
              if (!confirmUpdateExisting && mode !== "create_and_update") {
                result.skipped += 1;
                result.rowResults.push({
                  rowNumber: row.rowNumber,
                  resultStatus: "skipped",
                  profileId: existingProfile.id,
                  message: "Auth email already exists; skipped (no update confirmation).",
                });
                continue;
              }
              await admin.from("profiles").update(profilePatch).eq("id", existingProfile.id);
              await upsertEnrolment(admin, existingProfile.id, ids, actorId);
              result.updated += 1;
              result.rowResults.push({
                rowNumber: row.rowNumber,
                resultStatus: "updated",
                profileId: existingProfile.id,
                message: "Linked existing Auth email.",
              });
              continue;
            }
          }
          throw new Error(authError?.message || "Auth create failed.");
        }

        const userId = authData.user.id;
        const { error: profileError } = await admin.from("profiles").upsert({
          id: userId,
          ...profilePatch,
        });
        if (profileError) {
          // best-effort cleanup
          await admin.auth.admin.deleteUser(userId).catch(() => undefined);
          throw new Error(profileError.message);
        }

        await upsertEnrolment(admin, userId, ids, actorId);
        result.created += 1;
        result.rowResults.push({
          rowNumber: row.rowNumber,
          resultStatus: "created",
          profileId: userId,
        });
      } catch (e) {
        result.failed += 1;
        result.rowResults.push({
          rowNumber: row.rowNumber,
          resultStatus: "failed",
          message: e instanceof Error ? e.message : "Import failed for row.",
        });
      }
    }
  }

  return result;
}

async function upsertEnrolment(
  admin: SupabaseClient,
  studentId: string,
  ids: { department_id: string | null; course_id: string | null; batch_id: string | null },
  actorId: string,
) {
  if (!ids.department_id || !ids.course_id) return;

  const { data: existing } = await admin
    .from("student_enrolments")
    .select("id")
    .eq("student_id", studentId)
    .eq("course_id", ids.course_id)
    .eq("status", "active")
    .maybeSingle();

  if (existing?.id) {
    await admin
      .from("student_enrolments")
      .update({
        department_id: ids.department_id,
        batch_id: ids.batch_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await admin.from("student_enrolments").insert({
    student_id: studentId,
    department_id: ids.department_id,
    course_id: ids.course_id,
    batch_id: ids.batch_id,
    status: "active",
    created_by: actorId,
    updated_by: actorId,
  });
}
