"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LeadSummaryCard } from "@/components/ui/LeadSummaryCard";
import { TablePagination } from "@/components/ui/TablePagination";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { formatDisplayDate } from "@/lib/datetime";
import { usePagination } from "@/lib/usePagination";
import {
  FINAL_STATUSES,
  MOU_STATUSES,
  CV_PROPOSAL_STATUSES,
  VISIT_STATUSES,
  type CvProposalStatus,
} from "@/components/college-visits/collegeVisitsConfig";
import {
  daysSince,
  isFollowUpDue,
  todayISO,
  type CollegeVisitActivityRow,
  type CollegeVisitRow,
} from "@/components/college-visits/collegeVisitsHelpers";

function countBy(rows: CollegeVisitRow[], key: (r: CollegeVisitRow) => string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r) || "-";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function CollegeBarBlock({
  title,
  entries,
  accent = "gold",
}: {
  title: string;
  entries: { label: string; value: number }[];
  accent?: "gold" | "sky" | "rose";
}) {
  const max = Math.max(1, ...entries.map((e) => e.value));
  const bar =
    accent === "sky" ? "bg-sky-400" : accent === "rose" ? "bg-rose-400" : "bg-[#c9a227]";
  return (
    <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
      <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
      <div className="mt-3 space-y-2">
        {entries.length === 0 ? (
          <p className="text-xs text-[#64748b]">No data yet.</p>
        ) : (
          entries.slice(0, 8).map((e) => (
            <div key={e.label}>
              <div className="mb-1 flex justify-between text-xs text-[#475569]">
                <span className="truncate pr-2">{e.label}</span>
                <span className="font-semibold">{e.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div className={`h-full ${bar}`} style={{ width: `${(e.value / max) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CollegeOverviewPanel({
  visits,
  loading,
}: {
  visits: CollegeVisitRow[];
  loading: boolean;
}) {
  const due = visits.filter((v) => isFollowUpDue(v)).length;
  const visited = visits.filter((v) => v.visit_status === "Visited").length;
  const mouSigned = visits.filter((v) => v.mou_signed_status === "Signed").length;
  const converted = visits.filter((v) => v.final_status === "Converted").length;
  const lost = visits.filter((v) => v.final_status === "Lost" || v.final_status === "Closed - Rejected").length;
  const today = todayISO();
  const followToday = visits.filter((v) => (v.next_follow_up_date || "").slice(0, 10) === today).length;
  const scheduled = visits.filter((v) => v.visit_status === "Scheduled").length;
  const notVisited = visits.filter((v) => v.visit_status === "Not Visited").length;

  const byStatus = countBy(visits, (v) => v.visit_status);
  const byPriority = countBy(visits, (v) => v.priority);
  const byMonth = countBy(visits, (v) => (v.created_at || "").slice(0, 7) || "-");

  return (
    <div className="space-y-4">
      <div className="stat-cards-grid-5">
        <LeadSummaryCard title="Total Colleges" value={visits.length} loading={loading} />
        <LeadSummaryCard title="Not Visited" value={notVisited} loading={loading} />
        <LeadSummaryCard title="Scheduled" value={scheduled} loading={loading} />
        <LeadSummaryCard title="Visited" value={visited} loading={loading} />
        <LeadSummaryCard title="MOU Signed" value={mouSigned} loading={loading} />
        <LeadSummaryCard title="Converted" value={converted} loading={loading} />
        <LeadSummaryCard title="Lost / Rejected" value={lost} loading={loading} />
        <LeadSummaryCard title="Follow-ups Today" value={followToday} loading={loading} />
        <LeadSummaryCard title="Follow-up Due" value={due} loading={loading} accent="rose" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <CollegeBarBlock title="Visit status breakdown" entries={byStatus} />
        <CollegeBarBlock title="Priority mix" entries={byPriority} accent="sky" />
        <CollegeBarBlock title="Monthly creations" entries={byMonth} accent="rose" />
      </div>
    </div>
  );
}

export function CollegeFollowUpsPanel({
  visits,
  ownerNameMap,
  loading,
  onOpen,
}: {
  visits: CollegeVisitRow[];
  ownerNameMap: Record<string, string>;
  loading: boolean;
  onOpen: (row: CollegeVisitRow) => void;
}) {
  const today = todayISO();
  const withFollow = visits.filter((v) => v.next_follow_up_date);
  const todayRows = withFollow.filter((v) => (v.next_follow_up_date || "").slice(0, 10) === today);
  const overdue = withFollow.filter((v) => isFollowUpDue(v) && (v.next_follow_up_date || "").slice(0, 10) < today);
  const upcoming = withFollow.filter((v) => (v.next_follow_up_date || "").slice(0, 10) > today);

  const sorted = [...withFollow].sort((a, b) =>
    String(a.next_follow_up_date).localeCompare(String(b.next_follow_up_date)),
  );

  return (
    <div className="space-y-4">
      <div className="stat-cards-grid">
        <LeadSummaryCard title="Today" value={todayRows.length} loading={loading} />
        <LeadSummaryCard title="Overdue" value={overdue.length} loading={loading} accent="rose" />
        <LeadSummaryCard title="Upcoming" value={upcoming.length} loading={loading} />
        <LeadSummaryCard title="With next follow-up" value={withFollow.length} loading={loading} />
      </div>
      <ResponsiveDataView
        desktop={
          <div className="responsive-table-wrap rounded-2xl border border-[#dbe6f3]">
            <table className="min-w-[960px] w-full text-sm">
              <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
                <tr>
                  <th className="px-4 py-3 text-left">College</th>
                  <th className="px-4 py-3 text-left">Next follow-up</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-left">Visit status</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-left">Due?</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[#64748b]">
                      No follow-ups due. Add next dates from All Colleges {"->"} Edit.
                    </td>
                  </tr>
                ) : (
                  sorted.map((row) => {
                    const due = isFollowUpDue(row);
                    return (
                      <tr key={row.id} className="border-t border-[#eef2f7]">
                        <td className="px-4 py-3 font-medium text-[#0f172a]">{row.college_name}</td>
                        <td className="px-4 py-3">{formatDisplayDate(row.next_follow_up_date)}</td>
                        <td className="px-4 py-3">{row.follow_up_stage || "-"}</td>
                        <td className="px-4 py-3">{row.visit_status}</td>
                        <td className="px-4 py-3">{row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              due
                                ? "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
                                : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                            }
                          >
                            {due ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => onOpen(row)}>
                            Open
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        }
        mobile={
          sorted.length === 0 ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
              No follow-ups due. Add next dates from All Colleges → Edit.
            </p>
          ) : (
            sorted.map((row) => {
              const due = isFollowUpDue(row);
              const owner = row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-";
              return (
                <MobileRecordCard
                  key={row.id}
                  title={row.college_name}
                  subtitle={formatDisplayDate(row.next_follow_up_date) || undefined}
                  previewFields={[
                    { label: "Stage", value: row.follow_up_stage || "-" },
                    { label: "Visit status", value: row.visit_status },
                    { label: "Owner", value: owner },
                    { label: "Due?", value: due ? "Yes" : "No" },
                  ]}
                  detailFields={[
                    { label: "College", value: row.college_name },
                    { label: "Next follow-up", value: formatDisplayDate(row.next_follow_up_date) || "-" },
                    { label: "Stage", value: row.follow_up_stage || "-" },
                    { label: "Visit status", value: row.visit_status },
                    { label: "Owner", value: owner },
                    { label: "Due?", value: due ? "Yes" : "No" },
                  ]}
                  primaryActions={[{ label: "Open", onClick: () => onOpen(row) }]}
                />
              );
            })
          )
        }
      />
    </div>
  );
}

export function CollegePipelineBoard({
  visits,
  canEdit,
  onChangeStatus,
}: {
  visits: CollegeVisitRow[];
  canEdit: boolean;
  onChangeStatus: (row: CollegeVisitRow, status: string) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-h-[340px] min-w-[980px] gap-3">
        {VISIT_STATUSES.map((statusCol) => {
          const col = visits.filter((v) => v.visit_status === statusCol);
          return (
            <div key={statusCol} className="min-w-[240px] flex-1 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#475569]">
                {statusCol} | {col.length}
              </p>
              <div className="space-y-3">
                {col.map((card) => (
                  <div key={card.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
                    <p className="font-semibold text-slate-900">{card.college_name}</p>
                    <p className="text-xs text-slate-500">{card.location || ""}</p>
                    <div className="mt-2 space-y-1 text-xs text-slate-700">
                      <p>Priority {card.priority || "-"}</p>
                      <p>MOU {card.mou_signed_status || "-"}</p>
                      <p>Next FU {formatDisplayDate(card.next_follow_up_date)}</p>
                    </div>
                    {canEdit ? (
                      <select
                        className="mt-2 h-8 w-full rounded-lg border border-[#dbe6f3] px-2 text-xs"
                        value={card.visit_status}
                        onChange={(e) => onChangeStatus(card, e.target.value)}
                      >
                        {VISIT_STATUSES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CollegeConvertedTable({
  visits,
  ownerNameMap,
  onOpen,
}: {
  visits: CollegeVisitRow[];
  ownerNameMap: Record<string, string>;
  onOpen: (row: CollegeVisitRow) => void;
}) {
  const rows = visits.filter((v) => v.final_status === "Converted" || v.mou_signed_status === "Signed");
  return (
    <ResponsiveDataView
      desktop={
        <div className="responsive-table-wrap rounded-2xl border border-[#dbe6f3]">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
              <tr>
                <th className="px-4 py-3 text-left">College</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">MOU</th>
                <th className="px-4 py-3 text-left">Final status</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Visit date</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[#64748b]">
                    No converted / MOU-signed colleges yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-3 font-medium">{row.college_name}</td>
                    <td className="px-4 py-3">{row.location || "-"}</td>
                    <td className="px-4 py-3">{row.mou_signed_status}</td>
                    <td className="px-4 py-3">{row.final_status}</td>
                    <td className="px-4 py-3">{row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-"}</td>
                    <td className="px-4 py-3">{formatDisplayDate(row.visit_date)}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => onOpen(row)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      }
      mobile={
        rows.length === 0 ? (
          <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
            No converted / MOU-signed colleges yet.
          </p>
        ) : (
          rows.map((row) => {
            const owner = row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-";
            return (
              <MobileRecordCard
                key={row.id}
                title={row.college_name}
                subtitle={row.location || undefined}
                previewFields={[
                  { label: "MOU", value: row.mou_signed_status },
                  { label: "Final status", value: row.final_status },
                  { label: "Owner", value: owner },
                  { label: "Visit date", value: formatDisplayDate(row.visit_date) || "-" },
                ]}
                detailFields={[
                  { label: "College", value: row.college_name },
                  { label: "Location", value: row.location || "-" },
                  { label: "MOU", value: row.mou_signed_status },
                  { label: "Final status", value: row.final_status },
                  { label: "Owner", value: owner },
                  { label: "Visit date", value: formatDisplayDate(row.visit_date) || "-" },
                ]}
                primaryActions={[{ label: "Open", onClick: () => onOpen(row) }]}
              />
            );
          })
        )
      }
    />
  );
}

export function CollegeMouTrackerTable({
  visits,
  ownerNameMap,
  canEdit,
  onEdit,
}: {
  visits: CollegeVisitRow[];
  ownerNameMap: Record<string, string>;
  canEdit: boolean;
  onEdit: (row: CollegeVisitRow) => void;
}) {
  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(visits, 25);

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#64748b]">
        Track MOU progress on each college. Edits save to the college record and show in Activity Timeline.
      </p>
      <div className="overflow-hidden rounded-2xl border border-[#dbe6f3]">
        <ResponsiveDataView
          desktop={
            <div className="responsive-table-wrap">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
                  <tr>
                    <th className="px-4 py-3 text-left">College</th>
                    <th className="px-4 py-3 text-left">MOU status</th>
                    <th className="px-4 py-3 text-left">Follow-up stage</th>
                    <th className="px-4 py-3 text-left">Final status</th>
                    <th className="px-4 py-3 text-left">Priority</th>
                    <th className="px-4 py-3 text-left">Owner</th>
                    <th className="px-4 py-3 text-left">Last outcome</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {totalItems === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-[#64748b]">
                        No colleges to track.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr key={row.id} className="border-t border-[#eef2f7]">
                        <td className="px-4 py-3 font-medium">{row.college_name}</td>
                        <td className="px-4 py-3">{row.mou_signed_status}</td>
                        <td className="px-4 py-3">{row.follow_up_stage || "-"}</td>
                        <td className="px-4 py-3">{row.final_status}</td>
                        <td className="px-4 py-3">{row.priority}</td>
                        <td className="px-4 py-3">{row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-"}</td>
                        <td className="max-w-[14rem] truncate px-4 py-3" title={row.last_outcome_remarks ?? ""}>
                          {row.last_outcome_remarks || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-[11px]" onClick={() => onEdit(row)}>
                              Edit MOU
                            </Button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobile={
            totalItems === 0 ? (
              <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
                No colleges to track.
              </p>
            ) : (
              pageRows.map((row) => {
                const owner = row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-";
                return (
                  <MobileRecordCard
                    key={row.id}
                    title={row.college_name}
                    subtitle={row.mou_signed_status}
                    previewFields={[
                      { label: "Follow-up stage", value: row.follow_up_stage || "-" },
                      { label: "Final status", value: row.final_status },
                      { label: "Priority", value: row.priority },
                      { label: "Owner", value: owner },
                    ]}
                    detailFields={[
                      { label: "College", value: row.college_name },
                      { label: "MOU status", value: row.mou_signed_status },
                      { label: "Follow-up stage", value: row.follow_up_stage || "-" },
                      { label: "Final status", value: row.final_status },
                      { label: "Priority", value: row.priority },
                      { label: "Owner", value: owner },
                      { label: "Last outcome", value: row.last_outcome_remarks || "-", clamp: true },
                    ]}
                    primaryActions={canEdit ? [{ label: "Edit MOU", onClick: () => onEdit(row) }] : []}
                  />
                );
              })
            )
          }
        />
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

export type CollegeProposalDraft = {
  status: CvProposalStatus | string;
  amount: string;
  sent_date: string;
  proposal_link: string;
  proposal_pdf_url: string;
  proposal_pdf_name: string;
};

export function CollegeProposalTrackerTable({
  visits,
  ownerNameMap,
  canEdit,
  onEdit,
}: {
  visits: CollegeVisitRow[];
  ownerNameMap: Record<string, string>;
  canEdit: boolean;
  onEdit: (row: CollegeVisitRow) => void;
}) {
  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(visits, 25);

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#64748b]">
        Upload a proposal file (PDF/DOC/DOCX) per college, or view any legacy link. Updates appear in Activity Timeline.
      </p>
      <div className="overflow-hidden rounded-2xl border border-[#dbe6f3]">
        <ResponsiveDataView
          desktop={
            <div className="responsive-table-wrap">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
                  <tr>
                    <th className="px-4 py-3 text-left">College</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Amount</th>
                    <th className="px-4 py-3 text-left">Sent date</th>
                    <th className="px-4 py-3 text-left">Proposal</th>
                    <th className="px-4 py-3 text-left">Owner</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {totalItems === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-[#64748b]">
                        No colleges to track.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr key={row.id} className="border-t border-[#eef2f7]">
                        <td className="px-4 py-3 font-medium">{row.college_name}</td>
                        <td className="px-4 py-3">{row.proposal_status || "Not Sent"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.proposal_amount != null ? `Rs ${Number(row.proposal_amount).toLocaleString()}` : "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{row.proposal_sent_date?.slice(0, 10) || "-"}</td>
                        <td className="px-4 py-3">
                          <CollegeProposalFileCell row={row} />
                        </td>
                        <td className="px-4 py-3">{row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-"}</td>
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-full px-2 text-[11px]"
                              onClick={() => onEdit(row)}
                            >
                              Update proposal
                            </Button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobile={
            totalItems === 0 ? (
              <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
                No colleges to track.
              </p>
            ) : (
              pageRows.map((row) => {
                const owner = row.assigned_to ? ownerNameMap[row.assigned_to] || "-" : "-";
                const amount =
                  row.proposal_amount != null ? `Rs ${Number(row.proposal_amount).toLocaleString()}` : "-";
                return (
                  <MobileRecordCard
                    key={row.id}
                    title={row.college_name}
                    subtitle={row.proposal_status || "Not Sent"}
                    previewFields={[
                      { label: "Amount", value: amount },
                      { label: "Sent date", value: row.proposal_sent_date?.slice(0, 10) || "-" },
                      { label: "Owner", value: owner },
                      {
                        label: "Proposal",
                        value: row.proposal_file_path?.trim()
                          ? row.proposal_pdf_name || "File attached"
                          : row.proposal_link?.trim()
                            ? "Link available"
                            : "-",
                      },
                    ]}
                    detailFields={[
                      { label: "College", value: row.college_name },
                      { label: "Status", value: row.proposal_status || "Not Sent" },
                      { label: "Amount", value: amount },
                      { label: "Sent date", value: row.proposal_sent_date?.slice(0, 10) || "-" },
                      { label: "Owner", value: owner },
                    ]}
                    primaryActions={canEdit ? [{ label: "Update", onClick: () => onEdit(row) }] : []}
                  />
                );
              })
            )
          }
        />
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

function CollegeProposalFileCell({ row }: { row: CollegeVisitRow }) {
  const [busy, setBusy] = useState(false);
  if (row.proposal_file_path?.trim()) {
    return (
      <button
        type="button"
        disabled={busy}
        className="text-xs font-semibold text-[#a68b2e] hover:underline disabled:opacity-60"
        onClick={() => {
          void (async () => {
            setBusy(true);
            try {
              const res = await fetch("/api/proposals/signed-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entityType: "college", entityId: row.id, download: false }),
              });
              const json = (await res.json()) as { url?: string; error?: string };
              if (!res.ok || !json.url) throw new Error(json.error || "Could not open file.");
              window.open(json.url, "_blank", "noopener,noreferrer");
            } catch {
              /* ignore */
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "Opening…" : "View Proposal"}
      </button>
    );
  }
  const legacy = row.proposal_pdf_url?.trim() || row.proposal_link?.trim();
  if (legacy) {
    return (
      <a href={legacy} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#a68b2e] hover:underline">
        {row.proposal_pdf_name || "Open link"}
      </a>
    );
  }
  return <span className="text-xs text-[#94a3b8]">Not Uploaded</span>;
}

export function CollegeProposalEditModal({
  row,
  draft,
  setDraft,
  onClose,
  onSave,
  submitting,
  proposalUploadSlot,
}: {
  row: CollegeVisitRow;
  draft: CollegeProposalDraft;
  setDraft: (updater: (d: CollegeProposalDraft) => CollegeProposalDraft) => void;
  onClose: () => void;
  onSave: () => void;
  submitting: boolean;
  proposalUploadSlot?: ReactNode;
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed left-4 right-4 top-[8%] z-[61] mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-[20px] border border-[#e8dcc8] bg-white p-6 shadow-2xl sm:left-auto sm:right-10">
        <h4 className="text-lg font-semibold text-[#0f172a]">Update proposal</h4>
        <p className="mt-1 text-xs text-[#64748b]">
          {row.college_name} | {row.location || "No location"}
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Proposal status</span>
            <select
              className="rounded-lg border border-[#dbe6f3] bg-white px-3 py-2"
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            >
              {CV_PROPOSAL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Proposal amount</span>
            <input
              className="h-9 rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Sent date</span>
            <input
              type="date"
              className="h-9 rounded-lg border border-[#dbe6f3] bg-white px-3"
              value={draft.sent_date}
              onChange={(e) => setDraft((d) => ({ ...d, sent_date: e.target.value }))}
            />
          </label>
          {proposalUploadSlot}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full bg-[#c9a227] text-white"
            disabled={submitting}
            onClick={onSave}
          >
            {submitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}

export function CollegeActivityTimeline({
  activities,
  visitMap,
  ownerNameMap,
  loading,
}: {
  activities: CollegeVisitActivityRow[];
  visitMap: Record<string, CollegeVisitRow>;
  ownerNameMap: Record<string, string>;
  loading: boolean;
}) {
  if (loading) {
    return <p className="rounded-2xl border border-[#dbe6f3] bg-white px-4 py-10 text-center text-sm text-[#64748b]">Loading activity...</p>;
  }
  if (!activities.length) {
    return (
      <p className="rounded-2xl border border-[#dbe6f3] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
        No activity yet. Activities appear when colleges are created or updated.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {activities.map((a) => {
        const visit = visitMap[a.college_visit_id];
        return (
          <div key={a.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#0f172a]">{a.activity_type}</p>
              <p className="text-xs text-[#64748b]">{formatDisplayDate(a.created_at)}</p>
            </div>
            <p className="mt-1 text-xs text-[#64748b]">
              {visit?.college_name || a.college_visit_id.slice(0, 8)} | by{" "}
              {a.created_by ? ownerNameMap[a.created_by] || a.created_by.slice(0, 8) : "-"}
            </p>
            {a.notes ? <p className="mt-2 text-[#334155]">{a.notes}</p> : null}
            {a.old_value || a.new_value ? (
              <p className="mt-1 text-xs text-[#64748b]">
                {a.old_value || "-"} {"->"} {a.new_value || "-"}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function CollegeReportsPanel({
  visits,
  ownerNameMap,
}: {
  visits: CollegeVisitRow[];
  ownerNameMap: Record<string, string>;
}) {
  const byStatus = countBy(visits, (v) => v.visit_status);
  const byMou = countBy(visits, (v) => v.mou_signed_status);
  const byFinal = countBy(visits, (v) => v.final_status);
  const byOwner = countBy(visits, (v) =>
    v.assigned_to ? ownerNameMap[v.assigned_to] || v.assigned_to.slice(0, 8) : "Unassigned",
  );
  const due = visits.filter((v) => isFollowUpDue(v)).length;
  const avgScore =
    visits.length === 0 ? 0 : Math.round(visits.reduce((s, v) => s + Number(v.lead_score || 0), 0) / visits.length);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#64748b]">
        Metrics use colleges visible in this workspace (admin: all employees; employee: own rows).
      </p>
      <div className="stat-cards-grid">
        <LeadSummaryCard title="Total" value={visits.length} />
        <LeadSummaryCard title="Follow-up due" value={due} accent="rose" />
        <LeadSummaryCard title="Avg lead score" value={avgScore} />
        <LeadSummaryCard title="Converted" value={visits.filter((v) => v.final_status === "Converted").length} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <CollegeBarBlock title="By visit status" entries={byStatus} />
        <CollegeBarBlock title="By MOU status" entries={byMou} accent="sky" />
        <CollegeBarBlock title="By final status" entries={byFinal} />
        <CollegeBarBlock title="By owner" entries={byOwner.slice(0, 8)} accent="rose" />
      </div>
    </div>
  );
}

export function CollegeSettingsPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SettingList title="Visit statuses" items={[...VISIT_STATUSES]} />
      <SettingList title="MOU statuses" items={[...MOU_STATUSES]} />
      <SettingList title="Proposal statuses" items={[...CV_PROPOSAL_STATUSES]} />
      <SettingList title="Final statuses" items={[...FINAL_STATUSES]} />
      <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4 text-sm text-[#475569]">
        <p className="font-semibold text-[#0f172a]">Notes</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>Admin sees every employee&apos;s colleges for activity tracking; employees only see their own.</li>
          <li>Share outreach via <strong>Assign as College Visit task</strong> (My Tasks) without opening full CRM.</li>
          <li>Import / create always owns the row as the signed-in user.</li>
          <li>Proposal Tracker stores a URL link and/or a PDF in Storage.</li>
        </ul>
      </div>
    </div>
  );
}

function SettingList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[#dbe6f3] bg-white p-4">
      <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-[#e8dcc8] bg-[#faf3e3] px-2.5 py-1 text-xs text-[#475569]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Exported for potential reuse; daysSince kept available through helpers. */
export function collegeFollowAgeLabel(row: CollegeVisitRow) {
  const d = daysSince(row.last_follow_up_date);
  return d == null ? "-" : `${d}d`;
}
