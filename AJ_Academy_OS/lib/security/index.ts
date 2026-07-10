/**
 * AJ Academy security harness — centralized guards, rate limits, and HTTP hardening.
 * See security/harness/SECURITY_HARNESS_LOG.txt for deployment checklist and SQL patches.
 */
export {
  checkRateLimit,
  clientIp,
  enforceRateLimit,
  rateLimitResponse,
  type RateLimitOptions,
} from "@/lib/security/rateLimit";

export { securityHeaders, type SecurityHeader } from "@/lib/security/headers";

export {
  loadAuthorizedProfile,
  verifySessionRole,
  requireAdminApiSession,
  requireStaffApiSession,
} from "@/lib/security/auth";

export { safeRelativePath } from "@/lib/security/safeRedirect";
export { isValidEmail, isValidUuid, trimString, stringArray, EMAIL_RE, UUID_RE } from "@/lib/security/validate";
export { logSecurityEvent } from "@/lib/security/auditLog";
export { policyCategoryForRole } from "@/lib/security/policies";
export { assertSuperAdminActor } from "@/lib/security/auth/requireSuperAdmin";
