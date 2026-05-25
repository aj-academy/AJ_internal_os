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

export const btnPrimary =
  "rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f] focus-visible:ring-[#c9a227]/40";

export const inputFocus =
  "outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25";
