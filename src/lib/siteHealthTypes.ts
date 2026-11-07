// Types and labels for the Site Health screen — kept apart from the checks
// themselves because the client-side panel imports these, and the checks pull
// in Node modules (fs, pg, sharp) that have no place in a browser bundle.

export type HealthStatus = "ok" | "warn" | "fail" | "info";

/** The screen groups checks by what they are about, one card per category. */
export type HealthCategory = "identity" | "seo" | "security" | "server" | "database" | "content" | "integrations";

export const CATEGORY_LABELS: Record<HealthCategory, { label: string; blurb: string }> = {
  identity: { label: "Identity", blurb: "Who the site says it is" },
  seo: { label: "SEO", blurb: "What search engines are told" },
  security: { label: "Security", blurb: "Accounts, secrets and access" },
  server: { label: "Server", blurb: "The machine this runs on" },
  database: { label: "Database", blurb: "Schema, size and speed" },
  content: { label: "Content", blurb: "What is published and what is waiting" },
  integrations: { label: "Integrations", blurb: "Email, crons, plugins and services" },
};

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  /** One sentence: what was found, and what it means. */
  detail: string;
  /** Where to fix it, when it is fixable in the admin. */
  href?: string;
  /** How to fix it, step by step — see lib/siteHealthGuides.ts. */
  how?: string;
  category?: HealthCategory;
}

/** A number worth seeing at a glance — shown as a tile above the checks. */
export interface HealthStat {
  id: string;
  label: string;
  value: string;
  /** Small print under the value. */
  note?: string;
  href?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}

/** What the database clean-up would remove; see lib/maintenance.ts. */
export interface CleanupItem {
  id: string;
  label: string;
  /** How many rows would be removed. */
  count: number;
  /** One line: what and why. */
  detail: string;
}

export interface CleanupPreview {
  items: CleanupItem[];
  total: number;
  /** ISO time of the last run, from settings; null when never. */
  lastRun: string | null;
  /** Revisions kept — the trashed documents' revisions go with them. */
  trashDays: number;
}

export interface HealthReport {
  checks: HealthCheck[];
  stats: HealthStat[];
  /** Present when the database was reachable. */
  cleanup?: CleanupPreview;
  counts: Record<HealthStatus, number>;
  /** 0-100: fails and warnings pull it down, notes do not. */
  score: number;
  ranAt: string;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
