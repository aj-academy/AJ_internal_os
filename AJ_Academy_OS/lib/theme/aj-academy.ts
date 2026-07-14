/** AJ Academy brand colors — use with Tailwind arbitrary values or CSS variables. */
export const aj = {
  gold: "#c9a227",
  goldHover: "#b8921f",
  goldDark: "#a68b2e",
  goldLight: "#faf3e3",
  cream: "#fffdf8",
  border: "#e8dcc8",
  text: "#3d3428",
  muted: "#6b5d4d",
  chart: ["#c9a227", "#d4b84a", "#a68b2e", "#10b981", "#f59e0b", "#6b5d4d"],
} as const;

/** Premium primary CTA — desktop + mobile touch-friendly height via utility CSS. */
export const btnPrimary =
  "h-11 min-h-11 rounded-xl bg-[#c9a227] px-4 text-sm font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.2)_inset] transition hover:bg-[#b8921f] focus-visible:ring-[#c9a227]/40 sm:h-10 sm:min-h-10";

export const btnSecondary =
  "h-11 min-h-11 rounded-xl border border-[#e8dcc8] bg-white px-4 text-sm font-semibold text-[#3d3428] transition hover:bg-[#faf3e3] sm:h-10 sm:min-h-10";

export const inputFocus =
  "outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25";

/** Shared type + surface class names (pairs with styles/premium-surface.css). */
export const ajUi = {
  page: "aj-page",
  pageHeader: "aj-page-header",
  pageCopy: "aj-page-header__copy",
  kicker: "aj-page-kicker",
  title: "aj-page-title",
  subtitle: "aj-page-subtitle",
  actions: "aj-page-actions",
  section: "aj-section",
  sectionTitle: "aj-section-title",
  meta: "aj-meta",
  card: "aj-card",
  cardQuiet: "aj-card-quiet",
  panel: "aj-panel",
  workbench: "aj-workbench",
  field: "aj-field",
  fieldLabel: "aj-field-label",
  authCanvas: "aj-auth-canvas",
  authCard: "aj-auth-card",
  actionRail: "aj-action-rail",
} as const;
