import { cookies } from "next/headers";
import type { Profile, UserRole } from "@/types/profile";

export const PROFILE_SESSION_COOKIE = "aj_profile";

export type ProfileSessionPayload = {
  id: string;
  role: UserRole;
  email: string;
  full_name?: string | null;
};

export function parseProfileSessionCookie(
  value: string | undefined,
): ProfileSessionPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ProfileSessionPayload;
    if (!parsed.id || !parsed.role || !parsed.email) return null;
    return {
      ...parsed,
      role: parsed.role.trim().toLowerCase() as UserRole,
      email: parsed.email.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function readProfileSessionCookie(): Promise<ProfileSessionPayload | null> {
  const cookieStore = await cookies();
  return parseProfileSessionCookie(cookieStore.get(PROFILE_SESSION_COOKIE)?.value);
}

export function profileFromSessionPayload(payload: ProfileSessionPayload): Profile {
  return {
    id: payload.id,
    full_name: payload.full_name ?? null,
    email: payload.email,
    role: payload.role,
    department: null,
    designation: null,
    status: null,
    created_at: "",
  };
}
