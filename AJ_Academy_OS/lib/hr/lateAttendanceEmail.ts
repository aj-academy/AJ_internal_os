/** Dedicated late-arrival attendance notice copy (email + in-app). */

export function buildLateAttendanceNotice(args: {
  name: string;
  attendanceDate: string;
  checkInLabel: string;
  officeStart: string;
  lateAfter: string;
  graceMinutes: number;
}) {
  const firstName = args.name.trim().split(/\s+/)[0] || "Team member";
  const subject = `AJ Academy Attendance Notice — Delayed arrival on ${args.attendanceDate}`;

  const text = [
    `Dear ${firstName},`,
    "",
    "This is an automated attendance notice from AJ Academy OS.",
    "",
    "Our records show that your check-in today was recorded after the allowed reporting time (including grace).",
    "",
    "Attendance details",
    `• Date: ${args.attendanceDate}`,
    `• Your check-in: ${args.checkInLabel}`,
    `• Expected reporting time: ${args.officeStart}`,
    `• Allowed until (with ${args.graceMinutes} min grace): ${args.lateAfter}`,
    "",
    "If your arrival was delayed for a valid reason, please inform your reporting manager and raise an attendance correction from AJ OS if required.",
    "",
    "Regular punctuality helps us keep operations and payroll accurate. Thank you for your attention.",
    "",
    "Warm regards,",
    "AJ Academy — HR & Attendance",
    "www.ajacademy.co.in",
    "",
    "This is an automated message. Please do not reply to this email for corrections — use AJ OS or contact your manager.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Segoe UI,Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#1e3a5f;padding:18px 24px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:600;">AJ Academy OS</p>
              <h1 style="margin:6px 0 0;font-size:18px;line-height:1.35;color:#ffffff;font-weight:600;">Attendance Notice — Delayed Arrival</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Dear ${escapeHtml(firstName)},</p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
                This is an automated attendance notice from AJ Academy OS.
                Our records show that your check-in today was recorded
                <strong>after the allowed reporting time</strong> (including grace).
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Attendance details</p>
                    <p style="margin:0 0 6px;font-size:14px;line-height:1.5;"><strong>Date:</strong> ${escapeHtml(args.attendanceDate)}</p>
                    <p style="margin:0 0 6px;font-size:14px;line-height:1.5;"><strong>Your check-in:</strong> ${escapeHtml(args.checkInLabel)}</p>
                    <p style="margin:0 0 6px;font-size:14px;line-height:1.5;"><strong>Expected reporting time:</strong> ${escapeHtml(args.officeStart)}</p>
                    <p style="margin:0;font-size:14px;line-height:1.5;"><strong>Allowed until (with ${args.graceMinutes} min grace):</strong> ${escapeHtml(args.lateAfter)}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
                If your arrival was delayed for a valid reason, please inform your reporting manager
                and raise an attendance correction from AJ OS if required.
              </p>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">
                Regular punctuality helps us keep operations and payroll accurate. Thank you for your attention.
              </p>
              <p style="margin:0;font-size:15px;line-height:1.55;">
                Warm regards,<br />
                <strong>AJ Academy — HR &amp; Attendance</strong><br />
                <a href="https://www.ajacademy.co.in" style="color:#1e3a5f;text-decoration:none;">www.ajacademy.co.in</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;line-height:1.45;color:#94a3b8;">
                This is an automated message from AJ Academy OS. Please do not reply for corrections —
                use AJ OS or contact your manager.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const pushTitle = "Attendance notice — delayed arrival";
  const pushMessage = `Your check-in on ${args.attendanceDate} at ${args.checkInLabel} was after the allowed reporting time. Please review your attendance in AJ OS.`;

  return { subject, text, html, pushTitle, pushMessage };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
