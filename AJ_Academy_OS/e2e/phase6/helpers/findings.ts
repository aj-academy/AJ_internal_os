import fs from "node:fs";
import path from "node:path";

export type Phase6Status = "Pass" | "Fail" | "Blocked" | "Skipped";
export type Phase6Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;

export type Phase6Finding = {
  id: string;
  role: "student" | "mentor" | "admin" | "system";
  layer: "UI" | "API" | "RLS" | "Storage";
  routeOrResource: string;
  expected: string;
  actual: string;
  status: Phase6Status;
  severity: Phase6Severity;
  evidence: string;
  likelyCause?: string;
  proposedFix?: string;
  qaDataNeeded?: string;
};

const OUT = path.join(process.cwd(), "test-results", "phase6-findings.json");

export function recordFinding(finding: Phase6Finding) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  let list: Phase6Finding[] = [];
  if (fs.existsSync(OUT)) {
    try {
      list = JSON.parse(fs.readFileSync(OUT, "utf8")) as Phase6Finding[];
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
  }
  list = list.filter((f) => f.id !== finding.id);
  list.push(finding);
  fs.writeFileSync(OUT, JSON.stringify(list, null, 2), "utf8");
}

export function resetFindings() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "[]", "utf8");
}

export function findingsPath() {
  return OUT;
}
