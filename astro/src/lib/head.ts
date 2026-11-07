// Next's `Metadata` object as <head> tags.
//
// The public pages' SEO is built by BMS's own `generateMetadata` functions (the
// same code the Next app runs), so Astro writes exactly the title, canonical,
// hreflang, robots, Open Graph and Twitter tags Next would. This turns that
// object into HTML; it covers the fields BMS sets.

type Rec = Record<string, unknown>;
const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const list = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function titleOf(page: Rec, layout: Rec): string {
  const t = page.title as string | Rec | undefined;
  const lt = layout.title as Rec | string | undefined;
  const template = typeof lt === "object" && lt ? String(lt.template ?? "%s") : "%s";
  const fallback = typeof lt === "object" && lt ? String(lt.default ?? "") : String(lt ?? "");
  if (typeof t === "string") return template.replace("%s", t);
  if (t && typeof t === "object") return String(t.absolute ?? (t.default != null ? template.replace("%s", String(t.default)) : fallback));
  return fallback;
}

function robots(r: unknown): string | null {
  if (!r) return null;
  if (typeof r === "string") return r;
  const o = r as Rec;
  const parts: string[] = [];
  if (o.index !== undefined) parts.push(o.index ? "index" : "noindex");
  if (o.follow !== undefined) parts.push(o.follow ? "follow" : "nofollow");
  for (const k of ["noarchive", "nosnippet", "noimageindex", "nocache", "notranslate"]) if (o[k]) parts.push(k);
  for (const k of ["max-snippet", "max-image-preview", "max-video-preview"]) if (o[k] !== undefined) parts.push(`${k}:${o[k]}`);
  return parts.length ? parts.join(", ") : null;
}

export function headTags(page: Rec, layout: Rec, viewport: Rec = {}): string {
  const base = (page.metadataBase ?? layout.metadataBase) as URL | string | undefined;
  const abs = (u: unknown) => {
    const s = typeof u === "object" && u && "href" in (u as Rec) ? String((u as URL).href) : String(u);
    // As Next resolves them: the site root is the bare origin (`https://site`, as in the
    // sitemap), not new URL()'s `https://site/` — the homepage's canonical disagreed.
    let out = s;
    try { out = base ? new URL(s, base).toString() : s; } catch { /* as written */ }
    return out.replace(/^(https?:\/\/[^/?#]+)\/$/i, "$1");
  };
  const out: string[] = [];
  const meta = (name: string, content: unknown, attr = "name") => {
    if (content !== undefined && content !== null && content !== "") out.push(`<meta ${attr}="${esc(name)}" content="${esc(content)}">`);
  };

  out.push(`<title>${esc(titleOf(page, layout))}</title>`);
  meta("description", page.description ?? layout.description);
  const kw = list(page.keywords as string | string[]);
  if (kw.length) meta("keywords", kw.join(", "));
  for (const a of list(page.authors as Rec | Rec[])) meta("author", (a as Rec).name);
  meta("robots", robots(page.robots));
  const gb = page.robots && typeof page.robots === "object" ? robots((page.robots as Rec).googleBot) : null;
  meta("googlebot", gb);
  if (viewport.themeColor) meta("theme-color", typeof viewport.themeColor === "string" ? viewport.themeColor : (list(viewport.themeColor as Rec[])[0] as Rec)?.color);

  const alt = (page.alternates ?? {}) as Rec;
  if (alt.canonical) out.push(`<link rel="canonical" href="${esc(abs(alt.canonical))}">`);
  for (const [lang, href] of Object.entries((alt.languages ?? {}) as Rec)) out.push(`<link rel="alternate" hreflang="${esc(lang)}" href="${esc(abs(href))}">`);
  for (const [type, href] of Object.entries((alt.types ?? {}) as Rec)) out.push(`<link rel="alternate" type="${esc(type)}" href="${esc(abs(href))}">`);

  const og = (page.openGraph ?? {}) as Rec;
  const ogMap: Record<string, string> = { title: "og:title", description: "og:description", url: "og:url", siteName: "og:site_name", locale: "og:locale", type: "og:type", publishedTime: "article:published_time", modifiedTime: "article:modified_time", section: "article:section" };
  for (const [k, prop] of Object.entries(ogMap)) if (og[k] !== undefined) meta(prop, k === "url" ? abs(og[k]) : og[k], "property");
  for (const l of list(og.alternateLocale as string | string[])) meta("og:locale:alternate", l, "property");
  for (const a of list(og.authors as string | string[])) meta("article:author", a, "property");
  for (const t of list(og.tags as string | string[])) meta("article:tag", t, "property");
  for (const img of list(og.images as Rec | string | (Rec | string)[])) {
    const i = typeof img === "string" ? { url: img } : (img as Rec);
    meta("og:image", abs(i.url), "property");
    if (i.secureUrl) meta("og:image:secure_url", abs(i.secureUrl), "property");
    meta("og:image:type", i.type, "property");
    meta("og:image:width", i.width, "property");
    meta("og:image:height", i.height, "property");
    meta("og:image:alt", i.alt, "property");
  }

  const tw = (page.twitter ?? {}) as Rec;
  meta("twitter:card", tw.card);
  meta("twitter:title", tw.title);
  meta("twitter:description", tw.description);
  meta("twitter:site", tw.site);
  meta("twitter:creator", tw.creator);
  for (const img of list(tw.images as Rec | string | (Rec | string)[])) {
    const i = typeof img === "string" ? { url: img } : (img as Rec);
    meta("twitter:image", abs(i.url));
    meta("twitter:image:alt", i.alt);
  }

  const ver = (layout.verification ?? {}) as Rec;
  meta("google-site-verification", ver.google);
  meta("yandex-verification", ver.yandex);
  for (const [k, v] of Object.entries((ver.other ?? {}) as Rec)) for (const x of list(v as string | string[])) meta(k, x);

  const icons = (layout.icons ?? {}) as Rec;
  for (const [rel, key] of [["icon", "icon"], ["apple-touch-icon", "apple"], ["shortcut icon", "shortcut"]] as const) {
    for (const ic of list(icons[key] as Rec | string | (Rec | string)[])) {
      const i = typeof ic === "string" ? { url: ic } : (ic as Rec);
      out.push(`<link rel="${rel}" href="${esc(abs(i.url))}"${i.type ? ` type="${esc(i.type)}"` : ""}${i.sizes ? ` sizes="${esc(i.sizes)}"` : ""}>`);
    }
  }

  for (const [k, v] of Object.entries({ ...((layout.other ?? {}) as Rec), ...((page.other ?? {}) as Rec) })) for (const x of list(v as string | string[])) meta(k, x);
  return out.join("\n");
}
