// The App Info block: an app's facts, a download button, and the
// `SoftwareApplication` structured data built from the same fields.
//
// Sites about apps live or die by the rich result — the star rating, price
// and "Android" line under the link in search. Google builds that from
// SoftwareApplication schema, and the schema has to agree with what the page
// shows. Keeping both on one block, from one set of props, is what makes
// that automatic: an author fills in the version once and it appears in the
// box and in the JSON-LD, and a change to either is a change to both.

import { cssValue } from "./blockStyle";

export const APP_CATEGORIES = [
  { id: "GameApplication", title: "Game" },
  { id: "SocialNetworkingApplication", title: "Social" },
  { id: "EntertainmentApplication", title: "Entertainment" },
  { id: "MultimediaApplication", title: "Multimedia / Streaming" },
  { id: "UtilitiesApplication", title: "Utilities / Tools" },
  { id: "CommunicationApplication", title: "Communication" },
  { id: "EducationalApplication", title: "Education" },
  { id: "FinanceApplication", title: "Finance" },
  { id: "HealthApplication", title: "Health & Fitness" },
  { id: "LifestyleApplication", title: "Lifestyle" },
  { id: "ShoppingApplication", title: "Shopping" },
  { id: "TravelApplication", title: "Travel" },
  { id: "BusinessApplication", title: "Business / Productivity" },
  { id: "DeveloperApplication", title: "Developer Tools" },
  { id: "SecurityApplication", title: "Security" },
  { id: "DesignApplication", title: "Photo & Design" },
] as const;

export const APP_OS = ["Android", "iOS", "Windows", "macOS", "Linux", "Web"] as const;

export const APP_INFO_DEFAULTS = {
  bx: "",
  name: "",
  developer: "",
  version: "",
  size: "",
  requires: "",
  os: "Android",
  category: "UtilitiesApplication",
  updated: "",
  price: "0",
  currency: "USD",
  ratingValue: "",
  ratingCount: "",
  downloadUrl: "",
  buttonText: "Download",
  icon: "",
  showSchema: "1",
  layout: "card", // card | table
} as const;

export interface ResolvedAppInfo {
  name: string;
  developer: string;
  version: string;
  size: string;
  requires: string;
  os: string;
  category: string;
  categoryTitle: string;
  updated: string;
  updatedIso: string;
  price: number;
  currency: string;
  rating: { value: number; count: number } | null;
  downloadUrl: string;
  buttonText: string;
  icon: string;
  showSchema: boolean;
  layout: "card" | "table";
  /** Label → value pairs, in display order, empty ones dropped. */
  specs: [string, string][];
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function safeUrl(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("/") || raw.startsWith("#")) return raw;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export function resolveAppInfo(p: Record<string, unknown>): ResolvedAppInfo {
  const category = APP_CATEGORIES.some((c) => c.id === p.category) ? String(p.category) : APP_INFO_DEFAULTS.category;
  const os = APP_OS.includes(p.os as (typeof APP_OS)[number]) ? String(p.os) : text(p.os) || "Android";
  const price = Math.max(0, Number(String(p.price ?? "0").replace(/[^\d.]/g, "")) || 0);
  const currency = /^[A-Z]{3}$/.test(String(p.currency ?? "")) ? String(p.currency) : "USD";

  const rv = Number(p.ratingValue);
  const rc = Math.floor(Number(p.ratingCount));
  const rating = Number.isFinite(rv) && rv > 0 && rv <= 5 && Number.isFinite(rc) && rc > 0 ? { value: Math.round(rv * 10) / 10, count: rc } : null;

  const updatedRaw = text(p.updated, 40);
  const updatedDate = updatedRaw ? new Date(updatedRaw) : null;
  const updatedIso = updatedDate && !Number.isNaN(updatedDate.getTime()) ? updatedDate.toISOString().slice(0, 10) : "";

  const r: ResolvedAppInfo = {
    name: text(p.name, 120),
    developer: text(p.developer, 120),
    version: text(p.version, 40),
    size: text(p.size, 40),
    requires: text(p.requires, 60),
    os,
    category,
    categoryTitle: APP_CATEGORIES.find((c) => c.id === category)?.title ?? category,
    updated: updatedRaw,
    updatedIso,
    price,
    currency,
    rating,
    downloadUrl: safeUrl(text(p.downloadUrl, 500)),
    buttonText: text(p.buttonText, 60) || "Download",
    icon: cssValue(p.icon),
    showSchema: p.showSchema !== "0",
    layout: p.layout === "table" ? "table" : "card",
    specs: [],
  };

  r.specs = (
    [
      ["Version", r.version],
      ["Size", r.size],
      ["Requires", r.requires ? `${r.os} ${r.requires}`.trim() : r.os],
      ["Category", r.categoryTitle],
      ["Updated", r.updated],
      ["Price", r.price === 0 ? "Free" : `${r.price} ${r.currency}`],
      ["Developer", r.developer],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return r;
}

/**
 * The structured data, or null when there is not enough to say anything.
 *
 * Google's requirements for a SoftwareApplication rich result: a name, and
 * either an offer or a rating. A block with no name is a box, not data.
 * `aggregateRating` is only emitted with a real count — "4.5 from 0 ratings"
 * is the kind of claim that gets a site's rich results switched off.
 */
export function appInfoSchema(
  app: ResolvedAppInfo,
  pageUrl: string,
  absolute: (u: string) => string,
  /** The node's `@id` (see lib/blockSchema), so the page can name it as its main entity. */
  id?: string
): Record<string, unknown> | null {
  if (!app.showSchema || !app.name) return null;
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": app.os === "Android" || app.os === "iOS" ? "MobileApplication" : "SoftwareApplication",
    ...(id ? { "@id": id } : {}),
    name: app.name,
    operatingSystem: app.os,
    applicationCategory: app.category,
    offers: { "@type": "Offer", price: app.price.toFixed(2), priceCurrency: app.currency },
  };
  if (app.version) schema.softwareVersion = app.version;
  if (app.size) schema.fileSize = app.size;
  if (app.updatedIso) schema.dateModified = app.updatedIso;
  if (app.developer) schema.author = { "@type": "Organization", name: app.developer };
  if (app.icon) schema.image = absolute(app.icon);
  if (app.downloadUrl) schema.downloadUrl = absolute(app.downloadUrl);
  if (pageUrl) schema.url = pageUrl;
  if (app.rating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: app.rating.value,
      ratingCount: app.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return schema;
}
