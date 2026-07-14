"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type MobileRecordField = {
  label: string;
  value: ReactNode;
  /** Clamp long text to 3 lines with Show more */
  clamp?: boolean;
};

export type MobileRecordAction = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
};

type MobileRecordCardProps = {
  title: string;
  subtitle?: string;
  previewFields: MobileRecordField[];
  detailFields: MobileRecordField[];
  showSelect?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  selectAriaLabel?: string;
  primaryActions?: MobileRecordAction[];
  moreActions?: MobileRecordAction[];
  className?: string;
};

function FieldValue({ field }: { field: MobileRecordField }) {
  const [expanded, setExpanded] = useState(false);
  const raw = field.value;
  const isEmpty =
    raw == null ||
    raw === "" ||
    (typeof raw === "string" && !raw.trim()) ||
    raw === "—";

  if (isEmpty) {
    return <p className="break-words whitespace-normal text-sm text-[#94a3b8]">—</p>;
  }

  if (!field.clamp) {
    return <div className="break-words whitespace-normal text-sm font-medium text-[#0f172a]">{raw}</div>;
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "break-words whitespace-normal text-sm font-medium text-[#0f172a]",
          !expanded && "line-clamp-3",
        )}
      >
        {raw}
      </div>
      <button
        type="button"
        className="text-xs font-semibold text-[#a68b2e] hover:underline"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

export function MobileRecordCard({
  title,
  subtitle,
  previewFields,
  detailFields,
  showSelect = false,
  selected = false,
  onToggleSelect,
  selectAriaLabel,
  primaryActions = [],
  moreActions = [],
  className,
}: MobileRecordCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <article
      className={cn(
        "rounded-2xl border border-[#e8dcc8] bg-white p-3.5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]",
        selected && "border-[#c9a227] bg-[#fffdf8]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {showSelect && onToggleSelect ? (
          <div className="pt-0.5">
            <TableBulkCheckbox
              checked={selected}
              onChange={onToggleSelect}
              ariaLabel={selectAriaLabel || `Select ${title}`}
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="break-words whitespace-normal text-sm font-semibold leading-snug text-[#0f172a]">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 break-words whitespace-normal text-xs text-[#64748b]">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {previewFields.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
          {previewFields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{field.label}</dt>
              <dd className="mt-0.5">
                <FieldValue field={field} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {(primaryActions.length > 0 || moreActions.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f1e8d8] pt-3">
          {primaryActions.map((action) => (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant="outline"
              className="h-10 min-w-[40px] rounded-full border-[#e8dcc8] px-3 text-xs"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
          {moreActions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e8dcc8] bg-white text-[#64748b] hover:bg-[#faf3e3]"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                {moreActions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    className={action.destructive ? "text-rose-700" : undefined}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      )}

      {detailFields.length ? (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs font-semibold text-[#a68b2e] hover:underline"
            onClick={() => setDetailsOpen((v) => !v)}
          >
            {detailsOpen ? "Hide details" : "View all details"}
          </button>
          {detailsOpen ? (
            <dl className="mt-2 space-y-2.5 rounded-xl border border-[#f1e8d8] bg-[#fffdf8] p-3">
              {detailFields.map((field) => (
                <div key={field.label} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{field.label}</dt>
                  <dd className="mt-0.5">
                    <FieldValue field={field} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
