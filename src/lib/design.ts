export const colors = {
  primary: "var(--vq-primary)",
  primaryDark: "var(--vq-primary-dark)",
  primarySoft: "var(--vq-primary-soft)",
  accent: "var(--vq-accent)",
  sidebar: "var(--vq-sidebar)",
  sidebarBorder: "var(--vq-sidebar-border)",
  sidebarText: "var(--vq-sidebar-text)",
  sidebarTextHover: "var(--vq-sidebar-text-hover)",
  bg: "var(--vq-bg)",
  card: "var(--vq-card)",
  border: "var(--vq-border)",
  borderLight: "var(--vq-border-light)",
  fill: "var(--vq-fill)",
  text: "var(--vq-text)",
  textMuted: "var(--vq-text-muted)",
  textLight: "var(--vq-text-light)",
  danger: "var(--vq-danger)",
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
  filter: "h-9 px-2.5 sm:h-10 sm:px-3",
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