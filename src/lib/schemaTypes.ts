// Structured data an author adds to a document by hand: SEO → Schema.
//
// The page's own node (Article, WebPage…), the site's WebSite and publisher,
// an Accordion's FAQPage and an App Info box's SoftwareApplication are all
// built from content the CMS already holds. This is for what it does not: a
// page that is *about* an app, a product, a video or an event, where the
// facts live nowhere else. Each type lists the fields Google's rich-result
// documentation asks for, the builder turns the answers into JSON-LD, and
// anything left blank is left out — a blank property is a claim.
//
// Framework-free on purpose: the editor renders forms from these definitions
// and the page routes call `buildCustomSchemas` on the server.

export type FieldKind = "text" | "textarea" | "url" | "number" | "date" | "datetime" | "select" | "lines" | "group";

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: string;
  /** For `group`: the fields of each repeated row. */
  fields?: Field[];
  /** For `group`: what one row is called ("Question", "Step"). */
  rowLabel?: string;
}

export type Values = Record<string, string | Record<string, string>[]>;

export interface SchemaEntry {
  id: string;
  type: string;
  values: Values;
}

/** Everything a builder may need to make a relative URL absolute or fill a default. */
export interface BuildContext {
  pageUrl: string;
  absolute: (url: string) => string;
}

export interface SchemaTypeDef {
  id: string;
  label: string;
  hint: string;
  /** Which field names the entry in the list, e.g. `name`. */
  titleKey: string;
  fields: Field[];
  build: (v: Values, ctx: BuildContext) => Record<string, unknown> | null;
}

const OS_OPTIONS = ["ANDROID", "iOS", "WINDOWS", "MACOS", "LINUX", "WEB", "ANY"].map((o) => ({ value: o, label: o.charAt(0) + o.slice(1).toLowerCase() }));
const APP_CATEGORIES = [
  "EntertainmentApplication", "GameApplication", "MultimediaApplication", "SocialNetworkingApplication", "CommunicationApplication",
  "UtilitiesApplication", "BusinessApplication", "EducationalApplication", "FinanceApplication", "HealthApplication",
  "LifestyleApplication", "MedicalApplication", "MusicApplication", "NewsApplication", "PhotoApplication", "ProductivityApplication",
  "ReferenceApplication", "SecurityApplication", "ShoppingApplication", "SportsApplication", "TravelApplication", "VideoApplication",
  "BrowserApplication", "DesktopEnhancementApplication", "DeveloperApplication", "DriverApplication", "HomeApplication", "MobileApplication",
].map((c) => ({ value: c, label: c.replace(/Application$/, "") }));
const CURRENCIES = ["USD", "EUR", "GBP", "PLN", "SAR", "AED", "EGP", "MAD", "DZD", "TND", "PKR", "INR", "TRY", "BRL"].map((c) => ({ value: c, label: c }));

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const rows = (v: unknown): Record<string, string>[] => (Array.isArray(v) ? v.filter((r) => r && typeof r === "object") : []);
const lines = (v: unknown): string[] => str(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const num = (v: unknown): number | undefined => {
  const n = Number(str(v).replace(",", "."));
  return str(v) && Number.isFinite(n) ? n : undefined;
};

/** Drops empty strings, undefined, empty arrays and empty objects, recursively. */
export function pruneSchema<T>(value: T): T {
  if (Array.isArray(value)) {
    const out = value.map(pruneSchema).filter((x) => x !== undefined && x !== "" && !(typeof x === "object" && x !== null && Object.keys(x).length === 0));
    return out as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = pruneSchema(v);
      if (p === undefined || p === "" || (Array.isArray(p) && p.length === 0)) continue;
      if (typeof p === "object" && p !== null && !Array.isArray(p) && Object.keys(p).length === 0) continue;
      out[k] = p;
    }
    return out as T;
  }
  return value;
}

const priceFields: Field[] = [
  { key: "price", label: "Price", kind: "number", default: "0", hint: "0 for a free app." },
  { key: "priceCurrency", label: "Currency", kind: "select", options: CURRENCIES, default: "USD" },
];
const ratingFields: Field[] = [
  { key: "ratingValue", label: "Rating (1–5)", kind: "number", hint: "Only from real reviews. Google penalises invented ratings; leave blank otherwise." },
  { key: "ratingCount", label: "Number of ratings", kind: "number" },
];

function rating(v: Values): Record<string, unknown> | undefined {
  const value = num(v.ratingValue);
  const count = num(v.ratingCount);
  if (value === undefined || count === undefined || count < 1) return undefined;
  return { "@type": "AggregateRating", ratingValue: value, ratingCount: count, bestRating: 5, worstRating: 1 };
}

function offer(v: Values): Record<string, unknown> | undefined {
  const price = num(v.price);
  if (price === undefined) return undefined;
  return { "@type": "Offer", price, priceCurrency: str(v.priceCurrency) || "USD", ...(str(v.availability) ? { availability: `https://schema.org/${str(v.availability)}` } : {}) };
}

function app(kind: "SoftwareApplication" | "MobileApplication"): SchemaTypeDef {
  return {
    id: kind,
    label: kind === "MobileApplication" ? "Mobile application" : "Software application",
    hint: kind === "MobileApplication" ? "An Android or iOS app — an APK download page." : "Any software: desktop, web or mobile.",
    titleKey: "name",
    fields: [
      { key: "name", label: "App name", kind: "text", required: true, placeholder: "Yacine TV APK" },
      { key: "operatingSystem", label: "Operating system", kind: "select", required: true, options: OS_OPTIONS, default: kind === "MobileApplication" ? "ANDROID" : "ANY" },
      { key: "applicationCategory", label: "Category", kind: "select", required: true, options: APP_CATEGORIES, default: "EntertainmentApplication" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "downloadUrl", label: "Download URL", kind: "url", placeholder: "https://… or /downloads/app.apk" },
      { key: "softwareVersion", label: "Version", kind: "text", placeholder: "5.5.1" },
      { key: "fileSize", label: "File size", kind: "text", placeholder: "25 MB" },
      { key: "image", label: "Icon or screenshot URL", kind: "url" },
      { key: "author", label: "Developer", kind: "text" },
      { key: "dateModified", label: "Last updated", kind: "date" },
      ...priceFields,
      ...ratingFields,
    ],
    build: (v, ctx) => ({
      "@context": "https://schema.org",
      "@type": kind,
      name: str(v.name),
      operatingSystem: str(v.operatingSystem),
      applicationCategory: str(v.applicationCategory),
      description: str(v.description),
      downloadUrl: str(v.downloadUrl) ? ctx.absolute(str(v.downloadUrl)) : "",
      softwareVersion: str(v.softwareVersion),
      fileSize: str(v.fileSize),
      image: str(v.image) ? ctx.absolute(str(v.image)) : "",
      author: str(v.author) ? { "@type": "Organization", name: str(v.author) } : undefined,
      dateModified: str(v.dateModified),
      url: ctx.pageUrl,
      offers: offer(v),
      aggregateRating: rating(v),
    }),
  };
}

export const SCHEMA_TYPE_DEFS: SchemaTypeDef[] = [
  app("SoftwareApplication"),
  app("MobileApplication"),
  {
    id: "FAQPage",
    label: "FAQ",
    hint: "Questions and answers. The Accordion block can emit this from its own panes; use this when the FAQ is written as plain text. Since August 2023 Google shows FAQ rich results only for well-known government and health sites — other sites get no FAQ snippet, though the markup is still read.",
    titleKey: "",
    fields: [
      { key: "items", label: "Questions", kind: "group", rowLabel: "Question", fields: [
        { key: "question", label: "Question", kind: "text", required: true },
        { key: "answer", label: "Answer", kind: "textarea", required: true },
      ] },
    ],
    build: (v) => {
      const items = rows(v.items).filter((r) => str(r.question) && str(r.answer));
      if (!items.length) return null;
      return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((r) => ({ "@type": "Question", name: str(r.question), acceptedAnswer: { "@type": "Answer", text: str(r.answer) } })) };
    },
  },
  {
    id: "HowTo",
    label: "How-to",
    hint: "Numbered steps to do something — install an app, fix a problem. Google stopped showing How-to rich results in September 2023, so this will not produce a snippet in Google search; other search engines and AI tools may still read it.",
    titleKey: "name",
    fields: [
      { key: "name", label: "Title", kind: "text", required: true, placeholder: "How to install Yacine TV on Android" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "totalTime", label: "Time it takes", kind: "text", placeholder: "PT5M", hint: "ISO 8601: PT5M is 5 minutes, PT1H30M is 1½ hours." },
      { key: "image", label: "Image URL", kind: "url" },
      { key: "steps", label: "Steps", kind: "group", rowLabel: "Step", fields: [
        { key: "name", label: "Step title", kind: "text" },
        { key: "text", label: "What to do", kind: "textarea", required: true },
        { key: "image", label: "Image URL", kind: "url" },
      ] },
    ],
    build: (v, ctx) => {
      const steps = rows(v.steps).filter((r) => str(r.text));
      if (!str(v.name) || !steps.length) return null;
      return {
        "@context": "https://schema.org", "@type": "HowTo", name: str(v.name), description: str(v.description), totalTime: str(v.totalTime),
        image: str(v.image) ? ctx.absolute(str(v.image)) : "",
        step: steps.map((r, i) => ({ "@type": "HowToStep", position: i + 1, name: str(r.name), text: str(r.text), image: str(r.image) ? ctx.absolute(str(r.image)) : "" })),
      };
    },
  },
  {
    id: "Product",
    label: "Product",
    hint: "Something sold or reviewed, with a price and availability.",
    titleKey: "name",
    fields: [
      { key: "name", label: "Product name", kind: "text", required: true },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "image", label: "Image URL", kind: "url" },
      { key: "brand", label: "Brand", kind: "text" },
      { key: "sku", label: "SKU", kind: "text" },
      ...priceFields,
      { key: "availability", label: "Availability", kind: "select", options: ["InStock", "OutOfStock", "PreOrder", "Discontinued"].map((a) => ({ value: a, label: a.replace(/([A-Z])/g, " $1").trim() })), default: "InStock" },
      ...ratingFields,
    ],
    build: (v, ctx) => ({
      "@context": "https://schema.org", "@type": "Product", name: str(v.name), description: str(v.description),
      image: str(v.image) ? ctx.absolute(str(v.image)) : "", brand: str(v.brand) ? { "@type": "Brand", name: str(v.brand) } : undefined, sku: str(v.sku),
      offers: offer(v) ? { ...offer(v), url: ctx.pageUrl } : undefined, aggregateRating: rating(v),
    }),
  },
  {
    id: "VideoObject",
    label: "Video",
    hint: "A video on this page — needed for a video rich result.",
    titleKey: "name",
    fields: [
      { key: "name", label: "Title", kind: "text", required: true },
      { key: "description", label: "Description", kind: "textarea", required: true },
      { key: "thumbnailUrl", label: "Thumbnail URL", kind: "url", required: true },
      { key: "uploadDate", label: "Upload date", kind: "date", required: true },
      { key: "duration", label: "Duration", kind: "text", placeholder: "PT2M30S", hint: "ISO 8601: PT2M30S is 2 min 30 s." },
      { key: "contentUrl", label: "Video file URL", kind: "url" },
      { key: "embedUrl", label: "Embed URL", kind: "url", placeholder: "https://www.youtube.com/embed/…" },
    ],
    build: (v, ctx) => ({
      "@context": "https://schema.org", "@type": "VideoObject", name: str(v.name), description: str(v.description),
      thumbnailUrl: str(v.thumbnailUrl) ? ctx.absolute(str(v.thumbnailUrl)) : "", uploadDate: str(v.uploadDate), duration: str(v.duration),
      contentUrl: str(v.contentUrl), embedUrl: str(v.embedUrl),
    }),
  },
  {
    id: "Event",
    label: "Event",
    hint: "A match, a concert, a launch — with a date and a place.",
    titleKey: "name",
    fields: [
      { key: "name", label: "Event name", kind: "text", required: true },
      { key: "startDate", label: "Starts", kind: "datetime", required: true },
      { key: "endDate", label: "Ends", kind: "datetime" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "image", label: "Image URL", kind: "url" },
      { key: "locationName", label: "Venue", kind: "text" },
      { key: "locationAddress", label: "Address", kind: "text" },
      { key: "online", label: "Where", kind: "select", options: [{ value: "", label: "In person" }, { value: "online", label: "Online" }], default: "" },
      { key: "eventStatus", label: "Status", kind: "select", options: ["EventScheduled", "EventCancelled", "EventPostponed", "EventRescheduled", "EventMovedOnline"].map((s) => ({ value: s, label: s.replace("Event", "") })), default: "EventScheduled" },
      { key: "offersUrl", label: "Tickets URL", kind: "url" },
      ...priceFields,
    ],
    build: (v, ctx) => ({
      "@context": "https://schema.org", "@type": "Event", name: str(v.name), startDate: str(v.startDate), endDate: str(v.endDate), description: str(v.description),
      image: str(v.image) ? ctx.absolute(str(v.image)) : "",
      eventStatus: str(v.eventStatus) ? `https://schema.org/${str(v.eventStatus)}` : "",
      eventAttendanceMode: str(v.online) === "online" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
      location: str(v.online) === "online"
        ? { "@type": "VirtualLocation", url: str(v.offersUrl) || ctx.pageUrl }
        : str(v.locationName) || str(v.locationAddress) ? { "@type": "Place", name: str(v.locationName), address: str(v.locationAddress) } : undefined,
      offers: offer(v) ? { ...offer(v), url: str(v.offersUrl) || ctx.pageUrl } : undefined,
    }),
  },
  {
    id: "Organization",
    label: "Organization",
    hint: "A company or team this page is about. The site's own publisher comes from Settings → SEO; this is for another one.",
    titleKey: "name",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "url", label: "Website", kind: "url" },
      { key: "logo", label: "Logo URL", kind: "url" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "sameAs", label: "Profiles", kind: "lines", hint: "One URL per line: social profiles, Wikipedia, app-store listings." },
    ],
    build: (v, ctx) => ({ "@context": "https://schema.org", "@type": "Organization", name: str(v.name), url: str(v.url), logo: str(v.logo) ? ctx.absolute(str(v.logo)) : "", description: str(v.description), sameAs: lines(v.sameAs) }),
  },
  {
    id: "Person",
    label: "Person",
    hint: "A person this page is about — a developer, an athlete, a public figure.",
    titleKey: "name",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "jobTitle", label: "Job title", kind: "text" },
      { key: "url", label: "Website", kind: "url" },
      { key: "image", label: "Photo URL", kind: "url" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "sameAs", label: "Profiles", kind: "lines", hint: "One URL per line." },
    ],
    build: (v, ctx) => ({ "@context": "https://schema.org", "@type": "Person", name: str(v.name), jobTitle: str(v.jobTitle), url: str(v.url), image: str(v.image) ? ctx.absolute(str(v.image)) : "", description: str(v.description), sameAs: lines(v.sameAs) }),
  },
  {
    id: "LocalBusiness",
    label: "Local business",
    hint: "A shop, restaurant or office with an address and opening hours.",
    titleKey: "name",
    fields: [
      { key: "name", label: "Business name", kind: "text", required: true },
      { key: "image", label: "Photo URL", kind: "url", required: true },
      { key: "streetAddress", label: "Street address", kind: "text", required: true },
      { key: "addressLocality", label: "City", kind: "text", required: true },
      { key: "addressRegion", label: "Region / state", kind: "text" },
      { key: "postalCode", label: "Postal code", kind: "text" },
      { key: "addressCountry", label: "Country code", kind: "text", placeholder: "SA" },
      { key: "telephone", label: "Telephone", kind: "text" },
      { key: "priceRange", label: "Price range", kind: "text", placeholder: "$$" },
      { key: "url", label: "Website", kind: "url" },
      { key: "openingHours", label: "Opening hours", kind: "lines", hint: "One per line, e.g. Mo-Fr 09:00-18:00" },
    ],
    build: (v, ctx) => ({
      "@context": "https://schema.org", "@type": "LocalBusiness", name: str(v.name), image: str(v.image) ? ctx.absolute(str(v.image)) : "",
      address: { "@type": "PostalAddress", streetAddress: str(v.streetAddress), addressLocality: str(v.addressLocality), addressRegion: str(v.addressRegion), postalCode: str(v.postalCode), addressCountry: str(v.addressCountry) },
      telephone: str(v.telephone), priceRange: str(v.priceRange), url: str(v.url) || ctx.pageUrl, openingHours: lines(v.openingHours),
    }),
  },
  {
    id: "Custom",
    label: "Custom JSON-LD",
    hint: "Paste any schema.org JSON-LD. It is checked for valid JSON and an @type, then emitted as written.",
    titleKey: "",
    fields: [{ key: "json", label: "JSON-LD", kind: "textarea", required: true, placeholder: '{\n  "@context": "https://schema.org",\n  "@type": "…"\n}' }],
    build: (v) => {
      const parsed = parseCustomJson(str(v.json));
      return parsed.ok ? parsed.value : null;
    },
  },
];

export const SCHEMA_TYPE_BY_ID: Record<string, SchemaTypeDef> = Object.fromEntries(SCHEMA_TYPE_DEFS.map((d) => [d.id, d]));

/** The Custom type's text, as an object, or why not. */
export function parseCustomJson(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: "Empty." };
  // A pasted <script> wrapper is a common mistake and easy to forgive.
  const body = text.replace(/^\s*<script[^>]*>/i, "").replace(/<\/script>\s*$/i, "");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Must be one JSON object." };
  const obj = value as Record<string, unknown>;
  if (typeof obj["@type"] !== "string" && !Array.isArray(obj["@type"])) return { ok: false, error: 'Needs an "@type".' };
  if (!obj["@context"]) obj["@context"] = "https://schema.org";
  return { ok: true, value: obj };
}

/** Required fields still blank, by label. */
export function missingRequired(def: SchemaTypeDef, v: Values): string[] {
  const out: string[] = [];
  for (const f of def.fields) {
    if (f.kind === "group") {
      const rs = rows(v[f.key]);
      if (!rs.length) out.push(f.label);
      continue;
    }
    if (f.required && !str(v[f.key])) out.push(f.label);
  }
  return out;
}

export function blankValues(def: SchemaTypeDef): Values {
  const v: Values = {};
  for (const f of def.fields) v[f.key] = f.kind === "group" ? [] : (f.default ?? "");
  return v;
}

/** The stored JSON (a `schemas` column) as entries; anything malformed is dropped. */
export function parseSchemaEntries(raw: string | null | undefined): SchemaEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && typeof e === "object" && typeof e.type === "string" && SCHEMA_TYPE_BY_ID[e.type] && e.values && typeof e.values === "object")
      .map((e, i) => ({ id: typeof e.id === "string" ? e.id : `s${i}`, type: e.type, values: e.values as Values }));
  } catch {
    return [];
  }
}

const MAX_ENTRIES = 20;
const MAX_TEXT = 20000;

/**
 * What the API stores: the entries re-serialised with only known types and
 * string values, or null when there are none. Never trusts the client's
 * JSON as-is.
 */
export function sanitizeSchemas(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const entries = parseSchemaEntries(raw).slice(0, MAX_ENTRIES);
  const clean = entries.map((e) => {
    const def = SCHEMA_TYPE_BY_ID[e.type];
    const values: Values = {};
    for (const f of def.fields) {
      const v = e.values[f.key];
      if (f.kind === "group") {
        values[f.key] = rows(v).slice(0, 100).map((r) => Object.fromEntries((f.fields ?? []).map((sub) => [sub.key, str(r[sub.key]).slice(0, MAX_TEXT)])));
      } else {
        values[f.key] = str(v).slice(0, MAX_TEXT);
      }
    }
    return { id: e.id.slice(0, 40), type: e.type, values };
  });
  return clean.length ? JSON.stringify(clean) : null;
}

/** Types that can be what a page is *about* — the WebPage's `mainEntity`. */
const THING_TYPES = new Set(["SoftwareApplication", "MobileApplication", "Product", "Event", "VideoObject", "LocalBusiness", "Organization", "Person"]);

/** A stable `@id` for an entry, so other nodes on the page can point at it. */
function entryId(e: SchemaEntry, ctx: BuildContext): string {
  return `${ctx.pageUrl.replace(/\/+$/, "")}/#${e.type.toLowerCase()}-${e.id.slice(0, 12)}`;
}

/** The JSON-LD objects to emit for a document, blanks removed, invalid entries skipped. */
export function buildCustomSchemas(raw: string | null | undefined, ctx: BuildContext): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const e of parseSchemaEntries(raw)) {
    const def = SCHEMA_TYPE_BY_ID[e.type];
    if (missingRequired(def, e.values).length && def.id !== "Custom") continue;
    const built = def.build(e.values, ctx);
    // An `@id` ties the entry into the page's graph (the WebPage names it as
    // mainEntity); a Custom paste keeps whatever id it wrote.
    if (built) out.push(pruneSchema(def.id === "Custom" ? built : { "@id": entryId(e, ctx), ...built }));
  }
  return out;
}

/**
 * The `@id` of the first entry the page can be said to be about (an app, a
 * product, an event…), for the WebPage node's `mainEntity`. Undefined when
 * there is none, so nothing is claimed.
 */
export function mainEntityId(raw: string | null | undefined, ctx: BuildContext): string | undefined {
  for (const e of parseSchemaEntries(raw)) {
    const def = SCHEMA_TYPE_BY_ID[e.type];
    if (!THING_TYPES.has(e.type) || missingRequired(def, e.values).length) continue;
    return entryId(e, ctx);
  }
  return undefined;
}
