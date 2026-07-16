import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from "@/components/finance/financeConfig";
import { mergeSettings } from "@/components/settings/settingsDefaults";
import { createClient } from "@/lib/supabase/client";
import { linesToList, listToLines } from "@/lib/crmSettings";

export const FINANCE_SETTINGS_KEY = "finance";

export type FinanceSettingsLists = {
  incomeCategories: string[];
  expenseCategories: string[];
  paymentMethods: string[];
};

function asStringList(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const list = raw.map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : [...fallback];
}

export function defaultFinanceSettingsLists(): FinanceSettingsLists {
  return {
    incomeCategories: [...INCOME_CATEGORIES],
    expenseCategories: [...EXPENSE_CATEGORIES],
    paymentMethods: [...PAYMENT_METHODS],
  };
}

export function parseFinanceSettingsLists(value: unknown): FinanceSettingsLists {
  const merged = mergeSettings(FINANCE_SETTINGS_KEY, value);
  return {
    incomeCategories: asStringList(merged.incomeCategories, INCOME_CATEGORIES),
    expenseCategories: asStringList(merged.expenseCategories, EXPENSE_CATEGORIES),
    paymentMethods: asStringList(merged.paymentMethods, PAYMENT_METHODS),
  };
}

export async function fetchFinanceSettingsLists(
  _supabase?: ReturnType<typeof createClient>,
): Promise<FinanceSettingsLists> {
  try {
    const res = await fetch("/api/finance/lists", { credentials: "include" });
    const json = (await res.json()) as { lists?: FinanceSettingsLists; error?: string };
    if (res.ok && json.lists) return parseFinanceSettingsLists(json.lists);
  } catch {
    /* fall through */
  }
  if (_supabase) {
    const { data, error } = await _supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", FINANCE_SETTINGS_KEY)
      .maybeSingle();
    if (!error) return parseFinanceSettingsLists(data?.setting_value);
  }
  return defaultFinanceSettingsLists();
}

export async function persistFinanceSettingsLists(
  lists: FinanceSettingsLists,
): Promise<FinanceSettingsLists> {
  const getRes = await fetch(`/api/admin/settings?key=${FINANCE_SETTINGS_KEY}`, {
    credentials: "include",
  });
  const getJson = (await getRes.json()) as {
    setting?: { setting_value?: unknown } | null;
    error?: string;
  };
  if (!getRes.ok) throw new Error(getJson.error ?? "Could not load finance settings.");

  const base = mergeSettings(FINANCE_SETTINGS_KEY, getJson.setting?.setting_value);
  const nextValue = {
    ...base,
    incomeCategories: lists.incomeCategories,
    expenseCategories: lists.expenseCategories,
    paymentMethods: lists.paymentMethods,
  };

  const putRes = await fetch("/api/admin/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setting_key: FINANCE_SETTINGS_KEY,
      setting_value: nextValue,
    }),
  });
  const putJson = (await putRes.json()) as { error?: string };
  if (!putRes.ok) throw new Error(putJson.error ?? "Could not save finance settings.");
  return parseFinanceSettingsLists(nextValue);
}

export { linesToList, listToLines };
