# Attendance A–C implementation notes

**Date:** 11 Aug 2026  
**Scope:** Camera cleanup, Asia/Kolkata attendance date, server Nominatim reverse-geocode.  
**No schema / RLS / storage migrations applied.**

## Files changed

| File | Change |
|---|---|
| `AJ_Academy_OS/lib/attendance/stopCameraStream.ts` | Reusable track stop + `srcObject = null` |
| `AJ_Academy_OS/lib/location/reverseGeocode.ts` | Cache key helpers, attribution, types |
| `AJ_Academy_OS/app/api/location/reverse-geocode/route.ts` | Auth + rate limit + Nominatim + cache + throttle |
| `AJ_Academy_OS/components/attendance/MemberAttendancePage.tsx` | A–C wiring |
| `AJ_Academy_OS/scripts/verify-attendance-ac.mjs` | Helper + midnight IST vs UTC check |
| `SUPABASE_SETUP_GUIDE.md` | Optional `NOMINATIM_USER_AGENT` |

## Behavior

- Camera stops after successful check-in, on error, cancel, unmount, and before restarting.
- `attendance_date` uses `todayDateIST()` (`Asia/Kolkata`), not browser local date.
- Address lookup goes through `/api/location/reverse-geocode` once per check-in/out; failure does not block punch; coords still saved; `check_in_address` may be null.
- GPS accuracy is captured in UI messaging only (not persisted yet — needs migration approval).

## Still needs approval (next steps)

1. `check_in_accuracy_meters` / `check_out_accuracy_meters` columns
2. Mentor Student Attendance API + RLS
3. Private selfie bucket + path storage + signed URLs
