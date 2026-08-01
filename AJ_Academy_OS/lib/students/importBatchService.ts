import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDENT_IMPORTS_BUCKET } from "@/lib/students/importUpload";
import { loadStudentImportDataRows } from "@/lib/students/importLoadRows";
import {
  buildCatalogLookup,
  type ExistingStudentIndex,
  type ImportMode,
} from "@/lib/students/importValidate";

export async function downloadImportBatchFile(
  admin: SupabaseClient,
  storagePath: string,
): Promise<Buffer> {
  const { data, error } = await admin.storage.from(STUDENT_IMPORTS_BUCKET).download(storagePath);
  if (error || !data) throw new Error(error?.message || "Could not download import file.");
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function loadBatchSpreadsheet(
  admin: SupabaseClient,
  batch: { storage_path: string | null; file_name: string },
) {
  if (!batch.storage_path) throw new Error("Import batch has no stored file.");
  const buffer = await downloadImportBatchFile(admin, batch.storage_path);
  return loadStudentImportDataRows(buffer, batch.file_name);
}

export async function loadImportCatalog(admin: SupabaseClient) {
  const [departments, courses, batches] = await Promise.all([
    admin.from("academic_departments").select("id,name,status").limit(500),
    admin.from("academic_courses").select("id,name,department_id,status").limit(1000),
    admin.from("academic_batches").select("id,name,course_id,academic_year,status").limit(1000),
  ]);
  if (departments.error || courses.error || batches.error) {
    throw new Error(
      departments.error?.message ||
        courses.error?.message ||
        batches.error?.message ||
        "Catalog load failed.",
    );
  }
  const catalog = buildCatalogLookup({
    departments: departments.data ?? [],
    courses: courses.data ?? [],
    batches: batches.data ?? [],
  });
  return {
    catalog,
    resolveIds: (mapped: Record<string, string>) => {
      const dept = catalog.departmentsByName.get(mapped["Department"]?.trim().toLowerCase().replace(/\s+/g, " ") || "");
      const course = dept
        ? catalog.coursesByKey.get(`${dept.id}::${mapped["Course"]?.trim().toLowerCase().replace(/\s+/g, " ")}`)
        : undefined;
      const batch = course
        ? catalog.batchesByKey.get(`${course.id}::${mapped["Batch"]?.trim().toLowerCase().replace(/\s+/g, " ")}`)
        : undefined;
      return {
        department_id: dept?.id ?? null,
        course_id: course?.id ?? null,
        batch_id: batch?.id ?? null,
      };
    },
  };
}

export async function loadExistingStudentIndex(admin: SupabaseClient): Promise<ExistingStudentIndex> {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,phone,registration_number")
    .eq("role", "student")
    .limit(20000);
  if (error) throw new Error(error.message);
  const byEmail = new Map<string, { id: string; registration_number: string | null; phone: string | null }>();
  const byRegistration = new Map<string, { id: string; email: string | null }>();
  const byPhone = new Map<string, { id: string; email: string | null }>();
  for (const p of data ?? []) {
    if (p.email) {
      byEmail.set(String(p.email).toLowerCase(), {
        id: p.id,
        registration_number: p.registration_number,
        phone: p.phone,
      });
    }
    if (p.registration_number) {
      byRegistration.set(String(p.registration_number).trim().toLowerCase().replace(/\s+/g, " "), {
        id: p.id,
        email: p.email,
      });
    }
    if (p.phone) {
      const ph = String(p.phone).replace(/[\s\-()]/g, "");
      byPhone.set(ph, { id: p.id, email: p.email });
    }
  }
  return { byEmail, byRegistration, byPhone };
}

export function normalizeImportMode(raw: unknown): ImportMode {
  const allowed: ImportMode[] = [
    "create_only",
    "update_only",
    "create_and_update",
    "skip_duplicates",
    "stop_on_error",
    "import_valid_skip_invalid",
  ];
  if (typeof raw === "string" && (allowed as string[]).includes(raw)) return raw as ImportMode;
  return "skip_duplicates";
}
