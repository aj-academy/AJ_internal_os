"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FormSubmitButton } from "@/components/forms/FormSubmitButton";
import {
  submitPermissionRequest,
  type PermissionFormState,
} from "@/app/employee/permission/actions";

const permissionTypes = [
  "Late Coming",
  "Early Leaving",
  "Personal Permission",
  "Medical Permission",
  "Client Visit",
  "Half Day",
];

const initialState: PermissionFormState = { status: "idle" };

const fieldClass =
  "h-10 w-full rounded-xl border border-[#cfdceb] bg-white px-3 text-sm text-[#0f172a]";

export function PermissionRequestForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(submitPermissionRequest, initialState);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [state.status, router]);

  return (
    <section className="rounded-2xl border border-[#d4deea] bg-[#f8fbff] p-4">
      {state.status === "success" ? (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {state.message}
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {state.message}
        </div>
      ) : null}

      <form action={formAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#334155]">Permission date *</span>
          <input name="permission_date" type="date" required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#334155]">From time</span>
          <input name="from_time" type="time" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#334155]">To time</span>
          <input name="to_time" type="time" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#334155]">Permission type *</span>
          <select name="permission_type" required className={fieldClass} defaultValue="">
            <option value="" disabled>
              Select permission type
            </option>
            {permissionTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#334155]">Reason *</span>
          <input name="reason" required placeholder="Reason" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[#334155]">Description</span>
          <input name="description" placeholder="Description (optional)" className={fieldClass} />
        </label>
        <div className="xl:col-span-3">
          <FormSubmitButton
            label="Submit permission request"
            pendingLabel="Submitting…"
            className="w-full rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          />
        </div>
      </form>
    </section>
  );
}
