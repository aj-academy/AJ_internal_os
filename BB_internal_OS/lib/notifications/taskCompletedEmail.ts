import { escapeHtml } from "@/lib/notifications/taskAssignmentEmail";

export function buildTaskCompletedEmailHtml(input: {
  completerName: string;
  completerEmail: string;
  taskTitle: string;
  summary: string;
  appUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;">
  <p><strong>${escapeHtml(input.completerName)}</strong> marked a task as completed.</p>
  <p style="font-size:1.1rem;margin:16px 0;"><strong>${escapeHtml(input.taskTitle)}</strong></p>
  <p><strong>Summary</strong></p>
  <p style="white-space:pre-wrap;border-left:4px solid #2563eb;padding-left:12px;margin:8px 0;">${escapeHtml(input.summary).replace(/\n/g, "<br/>")}</p>
  <p style="margin-top:24px;font-size:0.9rem;color:#64748b;">
    Completed by: ${escapeHtml(input.completerName)} &lt;${escapeHtml(input.completerEmail)}&gt;
  </p>
  <p style="margin-top:16px;"><a href="${escapeHtml(input.appUrl)}" style="color:#2563eb;">Open BB Internal OS</a></p>
</body>
</html>`.trim();
}
