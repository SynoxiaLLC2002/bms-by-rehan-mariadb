// The Download Box block: definition, presets and styles.
//
// Pure — shared by the editor preview, the settings panel and the server
// renderer. A preset is a starting point, not a lock: it picks a layout and a
// set of colours and sizes, and every one of those can be overridden in the
// panel. An empty override means "use the preset's value", so switching
// presets restyles a box that has no overrides and keeps the ones it has.
//
// All styling lives in one stylesheet (DOWNLOAD_BOX_CSS, shipped with the site
// CSS) driven by CSS variables set inline on each box, so twenty boxes on a
// page cost twenty `style` attributes rather than twenty stylesheets.

export type DlbLayout = "card" | "hero" | "split" | "compact" | "table" | "file";

export interface DlbPreset {
  id: string;
  label: string;
  hint: string;
  layout: DlbLayout;
  style: Partial<Record<StyleKey, string>>;
}

export const DLB_STYLE_KEYS = [
  "accent", "bg", "bgTo", "gradAngle", "text", "muted", "border", "borderWidth", "radius", "shadow",
  "padding", "maxWidth", "align", "iconSize", "iconRadius", "titleSize",
  "btnBg", "btnText", "btnHoverBg", "btnRadius", "btnSize", "btnStyle",
  "metaStyle", "metaCols", "badgeBg", "badgeText", "specBg",
] as const;
export type StyleKey = (typeof DLB_STYLE_KEYS)[number];

const BASE_STYLE: Record<StyleKey, string> = {
  accent: "#16a34a",
  bg: "#ffffff",
  bgTo: "",
  gradAngle: "135",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  borderWidth: "1",
  radius: "16",
  shadow: "sm",
  padding: "24",
  maxWidth: "",
  align: "left",
  iconSize: "72",
  iconRadius: "18",
  titleSize: "22",
  btnBg: "",
  btnText: "#ffffff",
  btnHoverBg: "",
  btnRadius: "12",
  btnSize: "md",
  btnStyle: "solid",
  metaStyle: "chips",
  metaCols: "3",
  badgeBg: "",
  badgeText: "#ffffff",
  specBg: "#f8fafc",
};

export const DLB_PRESETS: DlbPreset[] = [
  { id: "classic", label: "Classic card", hint: "Icon, details and button in one row", layout: "card", style: {} },
  {
    id: "hero", label: "Centered hero", hint: "Big icon on top, large button", layout: "hero",
    style: { bg: "#f0fdf4", bgTo: "#dcfce7", border: "#bbf7d0", align: "center", iconSize: "96", iconRadius: "24", titleSize: "28", btnSize: "lg", btnRadius: "999", shadow: "md", padding: "36" },
  },
  {
    id: "split", label: "Split panel", hint: "Details left, coloured download panel right", layout: "split",
    style: { accent: "#2563eb", metaStyle: "grid", metaCols: "2", radius: "18", shadow: "md", iconSize: "64" },
  },
  {
    id: "compact", label: "Compact bar", hint: "Slim one-line strip for inside articles", layout: "compact",
    style: { accent: "#0ea5e9", radius: "12", padding: "14", iconSize: "44", iconRadius: "10", titleSize: "17", btnSize: "sm", shadow: "none", metaStyle: "list" },
  },
  {
    id: "table", label: "Spec table", hint: "Every detail in a table, full-width button", layout: "table",
    style: { accent: "#7c3aed", metaStyle: "grid", radius: "14", shadow: "sm", titleSize: "20", btnRadius: "10", specBg: "#faf5ff" },
  },
  {
    id: "dark", label: "Dark glow", hint: "Dark card with a glowing accent", layout: "card",
    style: { accent: "#22d3ee", bg: "#0f172a", bgTo: "#1e293b", text: "#f8fafc", muted: "#94a3b8", border: "#334155", shadow: "glow", btnText: "#0f172a", btnStyle: "gradient", radius: "20", specBg: "rgba(255,255,255,.06)" },
  },
  {
    id: "file", label: "File download", hint: "Dashed file tile with a type badge", layout: "file",
    style: { accent: "#f97316", bg: "#fffbeb", border: "#fdba74", borderWidth: "2", radius: "14", shadow: "none", iconSize: "56", metaStyle: "list", btnStyle: "solid" },
  },
  {
    id: "banner", label: "Gradient banner", hint: "Bold colour banner, white text", layout: "hero",
    style: { accent: "#ffffff", bg: "#4f46e5", bgTo: "#db2777", gradAngle: "120", text: "#ffffff", muted: "rgba(255,255,255,.8)", border: "transparent", borderWidth: "0", shadow: "lg", btnBg: "#ffffff", btnText: "#4f46e5", btnHoverBg: "#eef2ff", btnRadius: "999", btnSize: "lg", align: "center", iconRadius: "24", titleSize: "28", padding: "40", badgeBg: "rgba(255,255,255,.2)", specBg: "rgba(255,255,255,.12)" },
  },
];

export const DLB_META_FIELDS = [
  { key: "version", label: "Version" },
  { key: "size", label: "Size" },
  { key: "requires", label: "Requires" },
  { key: "updated", label: "Updated" },
  { key: "developer", label: "Developer" },
  { key: "downloads", label: "Downloads" },
  { key: "rating", label: "Rating" },
  { key: "license", label: "License" },
  { key: "arch", label: "Architecture" },
] as const;

export const DLB_DEFAULTS: Record<string, string> = {
  bx: "",
  preset: "classic",
  // Content
  title: "App name",
  subtitle: "",
  icon: "",
  badge: "",
  fileType: "APK",
  version: "",
  size: "",
  requires: "",
  updated: "",
  developer: "",
  downloads: "",
  rating: "",
  /** Number of ratings — Google shows stars only when a count accompanies the score. */
  ratingCount: "",
  license: "",
  arch: "",
  show: "version,size,requires,updated",
  metaLabels: "true",
  extra: "[]",
  features: "",
  note: "",
  // Buttons
  buttonLabel: "Download",
  buttonUrl: "",
  buttonSub: "",
  buttonIcon: "true",
  newTab: "false",
  nofollow: "false",
  downloadAttr: "false",
  button2Label: "",
  button2Url: "",
  btnFullMobile: "true",
  // Countdown
  countdown: "off",
  countdownSeconds: "5",
  countdownText: "Your download will be ready in {s} seconds",
  // Schema
  schema: "false",
  // Style overrides — empty follows the preset
  ...Object.fromEntries(DLB_STYLE_KEYS.map((k) => [k, ""])),
};

export interface DlbMetaItem {
  label: string;
  value: string;
}

export interface ResolvedDlb {
  preset: DlbPreset;
  layout: DlbLayout;
  style: Record<StyleKey, string>;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  fileType: string;
  meta: DlbMetaItem[];
  showLabels: boolean;
  features: string[];
  note: string;
  button: { label: string; url: string; sub: string; icon: boolean; newTab: boolean; nofollow: boolean; download: boolean; fullMobile: boolean };
  button2: { label: string; url: string } | null;
  countdown: { mode: "off" | "click" | "reveal"; seconds: number; text: string };
  schema: boolean;
  /** Inferred from Requires / file type; only used by the schema. */
  os: string;
  raw: Record<string, string>;
}

function str(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function safeHref(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (v.startsWith("/") || v.startsWith("#")) return v;
  try {
    const u = new URL(v);
    return ["http:", "https:", "tg:", "market:", "itms-apps:"].includes(u.protocol) ? u.toString() : "";
  } catch {
    return "";
  }
}

/** A CSS value from the panel, or "" when it could break out of its declaration. */
function cssVal(v: string): string {
  return /[;{}<>\\]|url\s*\(|expression/i.test(v) ? "" : v.trim().slice(0, 80);
}

/** The operating system, read from "Requires" and the file type. Android unless something says otherwise. */
export function inferOs(requires: string, fileType: string): string {
  const t = `${requires} ${fileType}`.toLowerCase();
  if (/\bios\b|iphone|ipad|\.ipa|\bipa\b/.test(t)) return "iOS";
  if (/windows|\.exe|\bexe\b|\bmsi\b/.test(t)) return "Windows";
  if (/mac ?os|\bdmg\b|\bpkg\b/.test(t)) return "macOS";
  if (/linux|\bdeb\b|appimage|\brpm\b/.test(t)) return "Linux";
  return "Android";
}

/** The schema.org app category, guessed from what the box says the app is. */
export function inferCategory(text: string): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(game|games|gaming|mod apk|racing|puzzle|shooter|rpg)\b/, "GameApplication"],
    [/\b(tv|iptv|live|stream|streaming|movie|movies|series|football|sport|sports|match|video|player|anime|music|radio)\b/, "MultimediaApplication"],
    [/\b(vpn|proxy|antivirus|security|password|privacy)\b/, "SecurityApplication"],
    [/\b(chat|messenger|whatsapp|telegram|call|sms)\b/, "CommunicationApplication"],
    [/\b(social|facebook|instagram|tiktok|twitter)\b/, "SocialNetworkingApplication"],
    [/\b(photo|camera|editor|design|wallpaper)\b/, "DesignApplication"],
    [/\b(learn|education|course|quran|dictionary|language)\b/, "EducationalApplication"],
    [/\b(bank|wallet|crypto|finance|money|trading)\b/, "FinanceApplication"],
    [/\b(shop|shopping|store|deals)\b/, "ShoppingApplication"],
    [/\b(fitness|health|workout|diet)\b/, "HealthApplication"],
    [/\b(map|travel|flight|hotel)\b/, "TravelApplication"],
  ];
  for (const [re, id] of rules) if (re.test(t)) return id;
  return "UtilitiesApplication";
}

export function presetById(id: string | undefined): DlbPreset {
  return DLB_PRESETS.find((p) => p.id === id) ?? DLB_PRESETS[0];
}

export function resolveDownloadBox(p: Record<string, unknown>): ResolvedDlb {
  const raw: Record<string, string> = {};
  for (const k of Object.keys(DLB_DEFAULTS)) raw[k] = typeof p[k] === "string" ? (p[k] as string) : DLB_DEFAULTS[k];
  const preset = presetById(raw.preset);

  const style = { ...BASE_STYLE, ...preset.style } as Record<StyleKey, string>;
  for (const k of DLB_STYLE_KEYS) {
    const v = cssVal(raw[k] ?? "");
    if (v) style[k] = v;
  }

  const shown = new Set(raw.show.split(",").map((s) => s.trim()).filter(Boolean));
  const meta: DlbMetaItem[] = [];
  for (const f of DLB_META_FIELDS) {
    const value = str(raw[f.key], 80);
    if (shown.has(f.key) && value) meta.push({ label: f.label, value: f.key === "rating" && /^\d(\.\d)?$/.test(value) ? `★ ${value}` : value });
  }
  try {
    const extra = JSON.parse(raw.extra || "[]");
    if (Array.isArray(extra)) {
      for (const e of extra) {
        const label = str(e?.label, 40);
        const value = str(e?.value, 80);
        if (label && value) meta.push({ label, value });
      }
    }
  } catch {
    // Malformed extra rows are dropped, not fatal.
  }

  const seconds = Math.min(60, Math.max(1, parseInt(raw.countdownSeconds, 10) || 5));
  const mode = raw.countdown === "click" || raw.countdown === "reveal" ? raw.countdown : "off";
  const url2 = safeHref(raw.button2Url);

  return {
    preset,
    layout: preset.layout,
    style,
    title: str(raw.title, 140),
    subtitle: str(raw.subtitle, 300),
    icon: safeHref(raw.icon) || "",
    badge: str(raw.badge, 30),
    fileType: str(raw.fileType, 8),
    meta,
    showLabels: raw.metaLabels !== "false",
    features: raw.features.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12),
    note: str(raw.note, 300),
    button: {
      label: str(raw.buttonLabel, 60) || "Download",
      url: safeHref(raw.buttonUrl),
      sub: str(raw.buttonSub, 60),
      icon: raw.buttonIcon !== "false",
      newTab: raw.newTab === "true",
      nofollow: raw.nofollow === "true",
      download: raw.downloadAttr === "true",
      fullMobile: raw.btnFullMobile !== "false",
    },
    button2: str(raw.button2Label, 60) && url2 ? { label: str(raw.button2Label, 60), url: url2 } : null,
    countdown: { mode, seconds, text: str(raw.countdownText, 120) || DLB_DEFAULTS.countdownText },
    schema: raw.schema === "true",
    os: inferOs(raw.requires, raw.fileType),
    raw,
  };
}

const SHADOWS: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px rgba(15,23,42,.06),0 4px 14px rgba(15,23,42,.06)",
  md: "0 10px 30px rgba(15,23,42,.10)",
  lg: "0 20px 50px rgba(15,23,42,.18)",
  glow: "0 0 0 1px rgba(255,255,255,.04),0 18px 50px -12px var(--dlb-accent)",
};

const BTN_PAD: Record<string, string> = { sm: ".55rem 1rem", md: ".8rem 1.4rem", lg: "1rem 2rem" };
const BTN_FONT: Record<string, string> = { sm: ".85rem", md: ".95rem", lg: "1.05rem" };

function px(v: string, fallback: number): string {
  const n = parseFloat(v);
  return `${Number.isFinite(n) ? n : fallback}px`;
}

/** The CSS variables for one box — set inline on its root element. */
export function downloadBoxVars(r: ResolvedDlb): Record<string, string> {
  const s = r.style;
  const bg = s.bgTo ? `linear-gradient(${parseFloat(s.gradAngle) || 135}deg, ${s.bg}, ${s.bgTo})` : s.bg;
  const btnBg = s.btnBg || s.accent;
  return {
    "--dlb-accent": s.accent,
    "--dlb-bg": bg,
    "--dlb-text": s.text,
    "--dlb-muted": s.muted,
    "--dlb-border": `${px(s.borderWidth, 1)} ${r.layout === "file" ? "dashed" : "solid"} ${s.border}`,
    "--dlb-radius": px(s.radius, 16),
    "--dlb-shadow": SHADOWS[s.shadow] ?? SHADOWS.sm,
    "--dlb-pad": px(s.padding, 24),
    "--dlb-max": s.maxWidth ? px(s.maxWidth, 0) : "none",
    "--dlb-align": s.align === "center" ? "center" : s.align === "right" ? "right" : "left",
    "--dlb-icon": px(s.iconSize, 72),
    "--dlb-icon-radius": px(s.iconRadius, 18),
    "--dlb-title": px(s.titleSize, 22),
    "--dlb-btn-bg": s.btnStyle === "gradient" ? `linear-gradient(135deg, ${btnBg}, color-mix(in srgb, ${btnBg} 55%, #7c3aed))` : btnBg,
    "--dlb-btn-solid": btnBg,
    "--dlb-btn-text": s.btnText,
    "--dlb-btn-hover": s.btnHoverBg || `color-mix(in srgb, ${btnBg} 86%, #000)`,
    "--dlb-btn-radius": px(s.btnRadius, 12),
    "--dlb-btn-pad": BTN_PAD[s.btnSize] ?? BTN_PAD.md,
    "--dlb-btn-font": BTN_FONT[s.btnSize] ?? BTN_FONT.md,
    "--dlb-badge-bg": s.badgeBg || s.accent,
    "--dlb-badge-text": s.badgeText,
    "--dlb-spec-bg": s.specBg,
    "--dlb-cols": String(Math.min(4, Math.max(1, parseInt(s.metaCols, 10) || 3))),
  };
}

/** Class list on the root: layout, meta style, button style. */
export function downloadBoxClass(r: ResolvedDlb): string {
  return [
    "dlb",
    `dlb-l-${r.layout}`,
    `dlb-m-${["chips", "grid", "list"].includes(r.style.metaStyle) ? r.style.metaStyle : "chips"}`,
    `dlb-b-${["solid", "outline", "gradient", "soft"].includes(r.style.btnStyle) ? r.style.btnStyle : "solid"}`,
    r.button.fullMobile ? "dlb-full-mobile" : "",
    r.style.align === "center" ? "dlb-center" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const DOWNLOAD_BOX_CSS = `
.dlb{position:relative;box-sizing:border-box;margin:1.75rem auto;max-width:var(--dlb-max);background:var(--dlb-bg);color:var(--dlb-text);border:var(--dlb-border);border-radius:var(--dlb-radius);box-shadow:var(--dlb-shadow);padding:var(--dlb-pad);overflow:hidden;line-height:1.45}
.dlb *{box-sizing:border-box}
.dlb-main{display:flex;gap:1.1rem;align-items:center}
.dlb-icon{flex:none;width:var(--dlb-icon);height:var(--dlb-icon);border-radius:var(--dlb-icon-radius);object-fit:cover;background:color-mix(in srgb,var(--dlb-accent) 14%,transparent);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--dlb-accent);font-size:calc(var(--dlb-icon) * .3);overflow:hidden}
.dlb-icon img{width:100%;height:100%;object-fit:cover;display:block}
.dlb-body{min-width:0;flex:1}
.dlb-title{margin:0;font-size:var(--dlb-title);font-weight:800;line-height:1.2;color:var(--dlb-text);display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
.dlb-badge{display:inline-block;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:.2rem .5rem;border-radius:999px;background:var(--dlb-badge-bg);color:var(--dlb-badge-text);line-height:1.3}
.dlb-sub{margin:.3rem 0 0;color:var(--dlb-muted);font-size:.93rem}
.dlb-meta{list-style:none;margin:.75rem 0 0;padding:0}
.dlb-m-chips .dlb-meta{display:flex;flex-wrap:wrap;gap:.4rem}
.dlb-m-chips .dlb-meta li{font-size:.8rem;padding:.25rem .6rem;border-radius:999px;background:color-mix(in srgb,var(--dlb-text) 7%,transparent);color:var(--dlb-text)}
.dlb-m-chips .dlb-meta b{font-weight:600;color:var(--dlb-muted);margin-right:.25rem}
.dlb-m-grid .dlb-meta{display:grid;grid-template-columns:repeat(var(--dlb-cols),minmax(0,1fr));gap:.5rem}
.dlb-m-grid .dlb-meta li{background:var(--dlb-spec-bg);border-radius:10px;padding:.55rem .7rem;font-size:.9rem;font-weight:600;min-width:0;overflow-wrap:anywhere}
.dlb-m-grid .dlb-meta b{display:block;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dlb-muted);margin-bottom:.1rem}
.dlb-m-list .dlb-meta{display:flex;flex-wrap:wrap;column-gap:.9rem;row-gap:.2rem;font-size:.85rem;color:var(--dlb-muted)}
.dlb-m-list .dlb-meta li+li::before{content:"•";margin-right:.9rem;opacity:.5}
.dlb-m-list .dlb-meta b{font-weight:600}
.dlb-features{list-style:none;margin:.9rem 0 0;padding:0;display:grid;gap:.35rem;font-size:.92rem}
.dlb-features li{display:flex;gap:.5rem;align-items:flex-start}
.dlb-features li::before{content:"✓";color:var(--dlb-accent);font-weight:800;flex:none}
.dlb-actions{display:flex;flex-direction:column;gap:.5rem;align-items:stretch;flex:none}
.dlb-btn{display:inline-flex;align-items:center;justify-content:center;gap:.55rem;padding:var(--dlb-btn-pad);font-size:var(--dlb-btn-font);font-weight:700;line-height:1.2;border-radius:var(--dlb-btn-radius);text-decoration:none!important;cursor:pointer;border:2px solid transparent;transition:background .15s,transform .15s,box-shadow .15s;background:var(--dlb-btn-bg);color:var(--dlb-btn-text)!important;text-align:center;white-space:nowrap}
.dlb-btn:hover{background:var(--dlb-btn-hover);transform:translateY(-1px)}
.dlb-btn:focus-visible{outline:3px solid color-mix(in srgb,var(--dlb-accent) 50%,transparent);outline-offset:2px}
.dlb-btn svg{width:1.15em;height:1.15em;flex:none}
.dlb-btn-text{display:flex;flex-direction:column;align-items:flex-start}
.dlb-btn-sub{font-size:.72em;font-weight:500;opacity:.85}
.dlb-b-outline .dlb-btn{background:transparent;color:var(--dlb-btn-solid)!important;border-color:var(--dlb-btn-solid)}
.dlb-b-outline .dlb-btn:hover{background:color-mix(in srgb,var(--dlb-btn-solid) 10%,transparent)}
.dlb-b-soft .dlb-btn{background:color-mix(in srgb,var(--dlb-btn-solid) 15%,transparent);color:var(--dlb-btn-solid)!important}
.dlb-b-soft .dlb-btn:hover{background:color-mix(in srgb,var(--dlb-btn-solid) 24%,transparent)}
.dlb-btn2{font-size:.85rem;font-weight:600;text-align:center;color:var(--dlb-muted)!important;text-decoration:underline;text-underline-offset:2px}
.dlb-note{margin:.8rem 0 0;font-size:.78rem;color:var(--dlb-muted)}
.dlb-count{display:flex;align-items:center;gap:.6rem;font-size:.9rem;color:var(--dlb-muted);padding:.7rem 1rem;border-radius:var(--dlb-btn-radius);background:color-mix(in srgb,var(--dlb-accent) 10%,transparent)}
.dlb-count-ring{width:1.9rem;height:1.9rem;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--dlb-accent);background:conic-gradient(var(--dlb-accent) var(--dlb-p,0%),color-mix(in srgb,var(--dlb-accent) 18%,transparent) 0);-webkit-mask:radial-gradient(circle,transparent 55%,#000 56%);mask:radial-gradient(circle,transparent 55%,#000 56%)}
.dlb-count-num{font-weight:800;color:var(--dlb-accent);min-width:1.4rem;text-align:center}
/* card */
.dlb-l-card .dlb-actions{min-width:11rem}
/* hero */
.dlb-l-hero{text-align:var(--dlb-align)}
.dlb-l-hero .dlb-main{flex-direction:column;align-items:stretch;gap:.9rem}
.dlb-l-hero.dlb-center .dlb-icon{margin:0 auto}
.dlb-l-hero.dlb-center .dlb-title{justify-content:center}
.dlb-l-hero.dlb-center .dlb-meta{justify-content:center}
.dlb-l-hero.dlb-center .dlb-features{justify-items:center}
.dlb-l-hero .dlb-actions{align-items:var(--dlb-align);align-self:stretch}
.dlb-l-hero.dlb-center .dlb-actions{align-items:center}
/* split */
.dlb-l-split{padding:0;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}
.dlb-l-split .dlb-main{padding:var(--dlb-pad);align-items:flex-start}
.dlb-l-split .dlb-side{padding:var(--dlb-pad);background:var(--dlb-accent);color:#fff;display:flex;flex-direction:column;justify-content:center;gap:.6rem;text-align:center}
.dlb-l-split .dlb-side .dlb-side-size{font-size:1.6rem;font-weight:800;line-height:1}
.dlb-l-split .dlb-side .dlb-side-label{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;opacity:.85}
.dlb-l-split .dlb-btn{background:#fff;color:var(--dlb-accent)!important}
.dlb-l-split .dlb-btn:hover{background:color-mix(in srgb,#fff 88%,var(--dlb-accent))}
.dlb-l-split .dlb-btn2{color:rgba(255,255,255,.9)!important}
.dlb-l-split .dlb-count{background:rgba(255,255,255,.15);color:#fff}
.dlb-l-split .dlb-count-ring,.dlb-l-split .dlb-count-num{color:#fff}
/* compact */
.dlb-l-compact .dlb-sub,.dlb-l-compact .dlb-features{display:none}
.dlb-l-compact .dlb-meta{margin-top:.2rem}
.dlb-l-compact .dlb-title{font-size:var(--dlb-title)}
/* table */
.dlb-l-table .dlb-main{align-items:center}
.dlb-table{width:100%;border-collapse:collapse;margin:1.1rem 0 1rem;font-size:.92rem;border-radius:10px;overflow:hidden}
.dlb-table th,.dlb-table td{padding:.6rem .85rem;text-align:start;border-bottom:1px solid color-mix(in srgb,var(--dlb-text) 8%,transparent)}
.dlb-table th{width:38%;font-weight:600;color:var(--dlb-muted);background:var(--dlb-spec-bg)}
.dlb-table tr:last-child th,.dlb-table tr:last-child td{border-bottom:0}
.dlb-l-table .dlb-actions .dlb-btn{width:100%}
/* file */
.dlb-l-file .dlb-icon{position:relative;background:#fff;border:2px solid var(--dlb-accent);color:var(--dlb-accent)}
.dlb-type{position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);font-size:.6rem;font-weight:800;letter-spacing:.05em;padding:.1rem .35rem;border-radius:4px;background:var(--dlb-accent);color:#fff;line-height:1.2}
@media (max-width:640px){
  .dlb{margin:1.25rem 0}
  /* Only the title sits beside the icon; everything else takes the full width,
     so details and buttons are never squeezed into a narrow column. */
  .dlb:not(.dlb-l-hero) .dlb-main{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:.85rem;row-gap:.5rem;align-items:center}
  .dlb:not(.dlb-l-hero) .dlb-body{display:contents}
  .dlb:not(.dlb-l-hero) .dlb-title{grid-column:2;margin:0}
  .dlb:not(.dlb-l-hero) .dlb-sub,.dlb:not(.dlb-l-hero) .dlb-meta,.dlb:not(.dlb-l-hero) .dlb-features,.dlb:not(.dlb-l-hero) .dlb-main>.dlb-actions,.dlb:not(.dlb-l-hero) .dlb-main>.dlb-note,.dlb:not(.dlb-l-hero) .dlb-main .dlb-note{grid-column:1/-1;margin-top:0}
  .dlb:not(.dlb-l-hero) .dlb-icon{width:calc(var(--dlb-icon) * .72);height:calc(var(--dlb-icon) * .72)}
  .dlb-l-card .dlb-actions,.dlb-l-compact .dlb-actions,.dlb-l-file .dlb-actions{min-width:0;margin-top:.35rem}
  .dlb-full-mobile .dlb-btn{width:100%}
  .dlb-l-split{grid-template-columns:1fr}
  .dlb-m-grid .dlb-meta{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dlb-title{font-size:calc(var(--dlb-title) * .88)}
  .dlb-l-hero,.dlb-l-card,.dlb-l-table,.dlb-l-file{padding:calc(var(--dlb-pad) * .75)}
  .dlb-btn{white-space:normal}
}
`;
