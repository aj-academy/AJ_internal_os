export function assignerDisplayFromProfile(p: {
  full_name: string | null;
  email: string | null;
  role: string | null;
} | null | undefined): string | null {
  if (!p) return null;
  const role = (p.role || "").toLowerCase();
  if (role === "admin" || role === "super_admin") return "Admin";
  return p.full_name?.trim() || p.email?.trim() || null;
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildTaskAssignmentEmailHtml(input: {
  assignerDisplayName: string;
  assignerEmail: string;
  taskTitle: string;
  taskDescription: string | null;
  dueDate: string | null;
  appUrl: string;
}) {
  const desc = input.taskDescription?.trim();
  const due = input.dueDate?.trim();
  return `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
  <p><strong>${escapeHtml(input.assignerDisplayName)}</strong> assigned you a task in BB Internal OS.</p>
  <p style="font-size:1.1rem;margin:16px 0;"><strong>${escapeHtml(input.taskTitle)}</strong></p>
  ${desc ? `<p><strong>Details</strong><br/>${escapeHtml(desc).replace(/\n/g, "<br/>")}</p>` : ""}
  ${due ? `<p><strong>Due</strong>: ${escapeHtml(due)}</p>` : ""}
  <p style="margin-top:24px;font-size:0.9rem;color:#64748b;">
    Assigned by: ${escapeHtml(input.assignerDisplayName)}${input.assignerEmail && input.assignerEmail !== "—" ? ` &lt;${escapeHtml(input.assignerEmail)}&gt;` : ""}<br/>
    Reply to this email to reach them (if your mail client supports Reply-To).
  </p>
  <p style="margin-top:16px;"><a href="${escapeHtml(input.appUrl)}" style="color:#2563eb;">Open BB Internal OS</a></p>
</body>
</html>`.trim();
}
