export const colors = {
  primary: "#355C8A",
  primaryDark: "#29486A",
  primarySoft: "#e6eef5",
  accent: "#7FB8B5",
  sidebar: "#263747",
  sidebarBorder: "#29486a",
  sidebarText: "rgba(220,227,232,0.6)",
  sidebarTextHover: "#dce3e8",
  bg: "#f7f6f3",
  card: "#ffffff",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  fill: "#f1f5f9",
  text: "#0f172a",
  textMuted: "#64748b",
  textLight: "#94a3b8",
  danger: "#dc2626",
} as const;

export const radius = {
  button: "rounded-xl",
  input: "rounded-xl",
  card: "rounded-2xl",
  dropdown: "rounded-xl",
} as const;

export const size = {
  button: "h-10 px-4",
  buttonSm: "h-8 px-3",
  buttonLg: "h-11 px-6",
  input: "h-11",
  inputSm: "h-10",
  filter: "h-10 px-3",
  icon: "w-9 h-9",
  iconSm: "w-8 h-8",
  page: "px-4 lg:px-10 pt-6 lg:pt-8",
  section: "mb-8",
  card: "p-5 lg:p-6",
} as const;

export const font = {
  pageTitle: "text-2xl lg:text-3xl font-bold tracking-tight",
  sectionTitle: "text-base font-semibold",
  cardTitle: "text-sm font-semibold",
  body: "text-sm",
  caption: "text-xs",
  micro: "text-[11px]",
} as const;

export const iconSize = {
  nav: 18,
  action: 14,
  actionMd: 16,
} as const;