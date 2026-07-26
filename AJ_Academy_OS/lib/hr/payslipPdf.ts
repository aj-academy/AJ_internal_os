import { amountInWordsInr, maskAccountNumber, MONTH_NAMES } from "@/lib/hr/payslipFormat";

export type PayslipPdfInput = {
  payslipNumber: string;
  year: number;
  month: number;
  generatedAt: string;
  company: {
    name: string;
    address: string | null;
    logoUrl: string | null;
  };
  employee: {
    name: string;
    employeeId: string;
    department: string | null;
    designation: string | null;
    joinedAt: string | null;
    employmentType: string | null;
    bankName: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    pan: string | null;
    uan: string | null;
    esi: string | null;
  };
  attendance: {
    calendarDays: number;
    workingDays: number;
    presentDays: number;
    paidLeave: number;
    unpaidLeave: number;
    weeklyOffs: number;
    holidays: number;
    absentDays: number;
    halfDays: number;
    payableDays: number;
  };
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  paymentStatus: string;
  paymentDate: string | null;
  paymentReference: string | null;
  currency: string;
};

function money(n: number, currency: string) {
  return `${currency} ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build a professional A4 payslip PDF as a Buffer (server-side).
 */
export async function buildPayslipPdfBuffer(input: PayslipPdfInput): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  // Header
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(input.company.name || "Company", margin, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  if (input.company.address) {
    const lines = pdf.splitTextToSize(input.company.address, pageW - margin * 2);
    pdf.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(`Payslip — ${MONTH_NAMES[input.month]} ${input.year}`, margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Payslip No: ${input.payslipNumber}`, margin, y);
  pdf.text(`Generated: ${new Date(input.generatedAt).toLocaleString()}`, pageW - margin, y, { align: "right" });
  y += 4;
  pdf.setDrawColor(200, 162, 39);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, pageW - margin, y);
  y += 8;

  // Employee section
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Employee", margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const empLeft = [
    `Name: ${input.employee.name}`,
    `Employee ID: ${input.employee.employeeId}`,
    `Department: ${input.employee.department ?? "—"}`,
    `Designation: ${input.employee.designation ?? "—"}`,
  ];
  const empRight = [
    `Date of joining: ${input.employee.joinedAt ?? "—"}`,
    `Employment type: ${input.employee.employmentType ?? "—"}`,
    `Bank: ${input.employee.bankName ?? "—"} / ${maskAccountNumber(input.employee.accountNumber)}`,
    `IFSC: ${input.employee.ifsc ?? "—"} · PAN: ${input.employee.pan ?? "—"}`,
    `UAN: ${input.employee.uan ?? "—"} · ESI: ${input.employee.esi ?? "—"}`,
  ];
  for (let i = 0; i < Math.max(empLeft.length, empRight.length); i++) {
    if (empLeft[i]) pdf.text(empLeft[i], margin, y);
    if (empRight[i]) pdf.text(empRight[i], pageW / 2, y);
    y += 4.5;
  }
  y += 3;

  // Attendance
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Attendance", margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const att = input.attendance;
  const attLine = `Calendar ${att.calendarDays} · Working ${att.workingDays} · Present ${att.presentDays} · Paid leave ${att.paidLeave} · Unpaid ${att.unpaidLeave} · WO ${att.weeklyOffs} · Holiday ${att.holidays} · Absent ${att.absentDays} · Half ${att.halfDays} · Payable ${att.payableDays}`;
  const attLines = pdf.splitTextToSize(attLine, pageW - margin * 2);
  pdf.text(attLines, margin, y);
  y += attLines.length * 4.5 + 3;

  // Earnings / Deductions tables (manual for control)
  const col1 = margin;
  const col2 = pageW / 2 + 2;
  const boxTop = y;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Earnings", col1, y);
  pdf.text("Deductions", col2, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  const earnRows = input.earnings.filter((e) => e.amount > 0);
  const dedRows = input.deductions.filter((d) => d.amount > 0);
  const rowCount = Math.max(earnRows.length, dedRows.length, 1);
  for (let i = 0; i < rowCount; i++) {
    if (earnRows[i]) {
      pdf.text(earnRows[i].label, col1, y);
      pdf.text(money(earnRows[i].amount, input.currency), col2 - 4, y, { align: "right" });
    }
    if (dedRows[i]) {
      pdf.text(dedRows[i].label, col2, y);
      pdf.text(money(dedRows[i].amount, input.currency), pageW - margin, y, { align: "right" });
    }
    y += 4.5;
  }
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.text("Gross earnings", col1, y);
  pdf.text(money(input.gross, input.currency), col2 - 4, y, { align: "right" });
  pdf.text("Total deductions", col2, y);
  pdf.text(money(input.totalDeductions, input.currency), pageW - margin, y, { align: "right" });
  y += 2;
  pdf.setDrawColor(232, 220, 200);
  pdf.rect(margin - 1, boxTop - 4, pageW - margin * 2 + 2, y - boxTop + 6);
  y += 10;

  // Net
  pdf.setFillColor(250, 243, 227);
  pdf.rect(margin, y - 5, pageW - margin * 2, 18, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Net salary", margin + 2, y);
  pdf.text(money(input.net, input.currency), pageW - margin - 2, y, { align: "right" });
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  const words = pdf.splitTextToSize(`In words: ${amountInWordsInr(input.net)}`, pageW - margin * 2 - 4);
  pdf.text(words, margin + 2, y);
  y += words.length * 4 + 6;

  pdf.setFontSize(9);
  pdf.text(`Payment status: ${input.paymentStatus}`, margin, y);
  y += 4.5;
  pdf.text(`Payment date: ${input.paymentDate ?? "—"}`, margin, y);
  y += 4.5;
  pdf.text(`Payment reference: ${input.paymentReference ?? "—"}`, margin, y);
  y += 10;

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  const disclaimer = pdf.splitTextToSize(
    "This is a system-generated payslip from AJ OS. No signature is required. For discrepancies, raise a salary query in My HR & Payroll. Statutory deductions, if any, follow company-configured verified rules.",
    pageW - margin * 2,
  );
  pdf.text(disclaimer, margin, y);
  y += disclaimer.length * 3.5 + 12;
  pdf.setTextColor(0);
  pdf.setFont("helvetica", "normal");
  pdf.text("Authorized signatory", pageW - margin - 50, y);
  pdf.line(pageW - margin - 50, y + 8, pageW - margin, y + 8);

  const arrayBuffer = pdf.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
