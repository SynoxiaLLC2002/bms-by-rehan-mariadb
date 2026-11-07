// Local SEO: a LocalBusiness entity for sites that are a place, not a blog.
//
// A shop, a clinic, a restaurant, an agency — for those Google's rich results
// come from a LocalBusiness schema with an address, phone, opening hours and
// coordinates, and the same details are what the visitor wants on the
// contact page. Both come from one set of settings (SEO → Local SEO): the
// schema is added to every page's JSON-LD, and the Business Info block prints
// the details wherever the author drops it.

import type { SiteSettings } from "@/lib/settings";

export const LOCAL_TYPES: { value: string; label: string }[] = [
  { value: "LocalBusiness", label: "Local business (general)" },
  { value: "Store", label: "Store / shop" },
  { value: "Restaurant", label: "Restaurant" },
  { value: "CafeOrCoffeeShop", label: "Café" },
  { value: "ProfessionalService", label: "Professional service" },
  { value: "LegalService", label: "Legal service" },
  { value: "FinancialService", label: "Financial service" },
  { value: "MedicalBusiness", label: "Medical / clinic" },
  { value: "Dentist", label: "Dentist" },
  { value: "HealthAndBeautyBusiness", label: "Health & beauty / salon" },
  { value: "AutomotiveBusiness", label: "Automotive" },
  { value: "HomeAndConstructionBusiness", label: "Home & construction" },
  { value: "RealEstateAgent", label: "Real estate agent" },
  { value: "TravelAgency", label: "Travel agency" },
  { value: "LodgingBusiness", label: "Hotel / lodging" },
  { value: "SportsActivityLocation", label: "Gym / sports" },
  { value: "EducationalOrganization", label: "School / education" },
  { value: "EntertainmentBusiness", label: "Entertainment" },
];

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_LABELS: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const SCHEMA_DAYS: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}
export type Hours = Record<Day, DayHours>;

export const LOCAL_DEFAULTS = {
  local_enabled: "false",
  local_type: "LocalBusiness",
  local_name: "",
  local_street: "",
  local_city: "",
  local_region: "",
  local_postal: "",
  local_country: "",
  local_phone: "",
  local_email: "",
  local_price_range: "",
  local_lat: "",
  local_lng: "",
  local_hours: "",
  local_map_url: "",
} as const;

export type LocalSettings = Record<keyof typeof LOCAL_DEFAULTS, string>;

export function defaultHours(): Hours {
  const h = {} as Hours;
  for (const d of DAYS) h[d] = { open: "09:00", close: "17:00", closed: d === "sun" };
  return h;
}

export function parseHours(raw: string | undefined | null): Hours {
  const base = defaultHours();
  if (!raw) return base;
  try {
    const v = JSON.parse(raw) as Partial<Record<Day, Partial<DayHours>>>;
    for (const d of DAYS) {
      const x = v[d];
      if (!x) continue;
      base[d] = {
        open: typeof x.open === "string" && /^\d{2}:\d{2}$/.test(x.open) ? x.open : base[d].open,
        close: typeof x.close === "string" && /^\d{2}:\d{2}$/.test(x.close) ? x.close : base[d].close,
        closed: !!x.closed,
      };
    }
  } catch {
    // Malformed — defaults.
  }
  return base;
}

export function localEnabled(s: SiteSettings): boolean {
  return s.local_enabled === "true" && !!(s.local_name || s.site_name);
}

/** Address lines for display, empty parts skipped. */
export function addressLines(s: SiteSettings): string[] {
  const line2 = [s.local_postal, s.local_city].filter(Boolean).join(" ");
  return [s.local_street, line2, s.local_region, s.local_country].map((x) => (x ?? "").trim()).filter(Boolean);
}

/** The LocalBusiness JSON-LD, or null when the feature is off. */
/** A stored `/uploads/…` path as an absolute URL; passes through real URLs. */
function absolute(url: string | undefined | null, base: string): string | undefined {
  const value = (url ?? "").trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.startsWith("/") ? "" : "/"}${value}`;
}

export function localBusinessSchema(s: SiteSettings, base: string): Record<string, unknown> | null {
  if (!localEnabled(s)) return null;
  const hours = parseHours(s.local_hours);
  // No hours saved = none published. The editor's 9–5, Sunday-closed defaults went into the schema
  // of a site that never set hours, telling Google a 24-hour service was closed nights and Sundays
  // (outside audit of a rank-and-rent site, 2026-11-06).
  const spec = !(s.local_hours ?? "").trim() ? [] : DAYS.filter((d) => !hours[d].closed).map((d) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: SCHEMA_DAYS[d],
    opens: hours[d].open,
    closes: hours[d].close,
  }));
  const lat = parseFloat(s.local_lat ?? "");
  const lng = parseFloat(s.local_lng ?? "");
  const address = {
    "@type": "PostalAddress",
    streetAddress: s.local_street || undefined,
    addressLocality: s.local_city || undefined,
    addressRegion: s.local_region || undefined,
    postalCode: s.local_postal || undefined,
    addressCountry: s.local_country || undefined,
  };
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": s.local_type || "LocalBusiness",
    "@id": `${base}/#business`,
    name: s.local_name || s.site_name,
    url: base,
    // Absolute, like every other schema URL. Google rejects a relative
    // `image` on LocalBusiness outright, and these are stored as
    // `/uploads/…`, so the whole rich result was being dropped for the sake
    // of a missing origin. `siteSchemas` already does this for its logo.
    image: absolute(s.seo_kg_logo || s.site_logo, base),
    telephone: s.local_phone || undefined,
    email: s.local_email || undefined,
    priceRange: s.local_price_range || undefined,
    address: Object.values(address).some((v, i) => i > 0 && v) ? address : undefined,
    geo: Number.isFinite(lat) && Number.isFinite(lng) ? { "@type": "GeoCoordinates", latitude: lat, longitude: lng } : undefined,
    openingHoursSpecification: spec.length ? spec : undefined,
    hasMap: s.local_map_url || undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === "") delete out[k];
  return out;
}

/** Google Maps embed URL for the address (no key needed), or null without one. */
export function mapEmbedUrl(s: SiteSettings): string | null {
  const lat = parseFloat(s.local_lat ?? "");
  const lng = parseFloat(s.local_lng ?? "");
  const q = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : addressLines(s).join(", ");
  if (!q) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
}

/**
 * A weekday's name in the reader's language.
 *
 * `DAY_LABELS` is English and is still right for the schema (schema.org
 * requires the English names) and for the admin. What a visitor sees must
 * follow the page: an Arabic site was printing "Monday" in its opening hours.
 *
 * `Intl` rather than a translation table, because it already knows every
 * language the CMS offers — including the ten with no theme text of their own
 * — and it cannot drift out of date. The fixed dates below are a week whose
 * 1 Jan 2024 is a Monday, so the index maps cleanly onto DAYS.
 */
const DAY_INDEX: Record<Day, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

export function dayName(day: Day, language: string): string {
  try {
    const date = new Date(Date.UTC(2024, 0, DAY_INDEX[day]));
    return new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(date);
  } catch {
    return DAY_LABELS[day];
  }
}
