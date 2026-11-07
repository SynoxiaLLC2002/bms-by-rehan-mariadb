import { cache, Fragment } from "react";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { navItems } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import Link from "next/link";
import DarkModeToggle from "./DarkModeToggle";
import HeaderSearch from "./HeaderSearch";
import HeaderNav from "./HeaderNav";
import NavList, { type NavNode } from "./NavList";
import OffCanvas from "./OffCanvas";
import StickyHeader from "./StickyHeader";
import ElementSlot from "./ElementSlot";

/**
 * The stuck state can't be detected in CSS, so it needs a scroll observer.
 * Only ship that JS when the site has actually configured a distinct stuck
 * appearance — otherwise a default page stays script-free.
 */
function needsStickyWatcher(s: Record<string, string>): boolean {
  if (s.header_sticky === "false") return false;
  return !!(s.hsticky_bg || s.hsticky_text || s.hsticky_shrink === "true");
}
import { cachedSiteCss, siteCssHash } from "@/lib/siteCss";
import { presentBlockTypes } from "@/lib/cssTrim";
import { getElements } from "@/components/frontend/ElementSlot";
import { inlineFontCss } from "@/lib/fontCss";
import { localizeFontCss } from "@/lib/localFonts";
import { customFontFaceCss, customFontFamilies, parseCustomFonts } from "@/lib/customFonts";
import { delayLoader, delayScriptsIn, deferScriptsIn } from "@/lib/delayScripts";
import ScriptRunner from "./ScriptRunner";
import { FACADE_SCRIPT } from "@/lib/videoFacade";
import { prefetchScript, type PrefetchMode } from "@/lib/prefetch";
import { intIn, matchesPath, on, parseList, speedSettings } from "@/lib/speed";
import { fontPreloadUrls, keepSubsets, mergeVariableFaces } from "@/lib/fontPreload";
import { cssName, storeCss } from "@/lib/cssStore";
import { progressEnabled, scrollTopEnabled } from "@/lib/siteExtras";
import { ReadingProgress, ScrollTopButton } from "@/components/frontend/SiteExtras";
import { uiText, type UiText } from "@/lib/uiText";
import { HEADER_ITEM_IDS, FOOTER_ITEM_IDS, slotId, COLS, MOBILE_COLS } from "@/lib/builderItems";
import { menuIdForLocation } from "@/lib/menuLocations";
import { applyConditions, type PageType } from "@/lib/headerConditions";
import { activeNavIds } from "@/lib/navActive";
import { escapeHtml } from "@/lib/utils";
import { feedPath, searchPath } from "@/lib/permalinks";
import { hasLivePosts } from "@/lib/feed";
import { logoSrcSet, prepareLogo } from "@/lib/logoSrc";
import { contentLanguages, defaultContentLanguage, documentDir } from "@/lib/locale";
import LanguageSwitcher, { type SwitcherTarget } from "@/components/frontend/LanguageSwitcher";
import { lookupImageSize, siteSchemas } from "@/lib/seoMeta";
import { siteUrl } from "@/lib/siteUrl";
import { jsonLd } from "@/lib/seo";
import { newTabProps } from "@/lib/linkRel";
import { turnstileEnabled, turnstileSiteKey } from "@/lib/turnstile";
import { resolveNavUrls } from "@/lib/navLinks";
import { isDbError } from "@/lib/db/errors";

// Through a client module, so it is a chunk of its own that only the
// customizer iframe fetches — see blocks/lazy.tsx.
import { PreviewBridge } from "./blocks/lazy";

interface NavItem { id: number; label: string; url: string; target: string | null; parentId?: number | null; menuId?: number | null }

// No catch: an empty menu during an outage was cached as the real page.
const getNavItems = cache(async () => {
  const items = await db.query.navItems.findMany({ orderBy: [asc(navItems.order)] });
  // Linked items take their target's current address (lib/navLinks).
  return await resolveNavUrls(items, await getSiteSettings()).catch(() => items);
});

async function getSiteData() {
  const [settings, nav] = await Promise.all([getSiteSettings(), getNavItems()]);
  return { settings, nav };
}

/**
 * The weights to ask Google for, from Speed → Page optimisation. Sorted and
 * de-duplicated because the css2 API rejects `wght@700;400`, and 400 is added
 * back whatever the setting says — it is the body text.
 */
function weightList(setting: string | undefined): string {
  const want = new Set([400]);
  for (const part of (setting || "").split(",")) {
    const n = parseInt(part.trim(), 10);
    if (n >= 100 && n <= 900 && n % 100 === 0) want.add(n);
  }
  return [...want].sort((a, b) => a - b).join(";");
}

/** Builds a single Google Fonts stylesheet URL for the chosen faces. */
function googleFontsUrl(families: (string | undefined)[], subsets = "", display = "swap", weights = "400;500;600;700;800"): string {
  const unique = Array.from(new Set(families.filter((f): f is string => !!f && f.trim() !== "")));
  if (unique.length === 0) return "";
  const params = unique
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${weights}`)
    .join("&");
  // Kept for Google's older API; css2 ignores `subset` and returns every set.
  // The real filtering happens on the CSS that comes back — see keepSubsets.
  const subset = subsets
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(",");
  return `https://fonts.googleapis.com/css2?${params}&display=${display}${subset ? `&subset=${subset}` : ""}`;
}

/** Header rows, top to bottom. */
const HEADER_ROWS = ["topbar", "main", "bottombar"] as const;
type HeaderRow = (typeof HEADER_ROWS)[number];

/**
 * The desktop and mobile header sets, and which rows of them would come out
 * identical — see the header in SiteLayout. What decides the markup is the
 * non-empty zones in order and which menu a Navigation item resolves to
 * (Primary on desktop, Mobile on mobile — the same menu when no Mobile menu
 * is assigned). Also read before rendering, to know whether the page needs
 * the desktop/mobile swap CSS at all.
 */
function headerPlan(settings: Record<string, string>, nav: NavItem[], language: string) {
  const setOf = (dev: "desktop" | "mobile") => {
    const p = dev === "mobile" ? "header_m_" : "header_";
    const cols = dev === "mobile" ? MOBILE_COLS : COLS;
    const rowOf = (row: HeaderRow) => {
      const on = row === "main" || settings[`${p}${row}_enabled`] === "true";
      const zones = cols.map((col) => {
        const fallback = row === "main" && (col === "left" || col === "right") ? (col === "left" ? '["logo"]' : '["navigation"]') : "[]";
        return { col, items: parseZone(settings[`${p}${row}_${col}`] || fallback) };
      });
      return { on, zones };
    };
    return { dev, cls: dev === "mobile" ? "hdr-mobile" : "hdr-desktop", rowOf };
  };
  const sets = [setOf("desktop"), setOf("mobile")] as const;
  const menuOf = (dev: string) => menuIdForLocation(settings, dev === "mobile" ? "mobile" : "primary", nav[0]?.menuId ?? null, language);
  const signature = (s: (typeof sets)[number], row: HeaderRow) => {
    const r = s.rowOf(row);
    const zones = r.zones.map((z) => z.items).filter((items) => items.length);
    return JSON.stringify({ on: r.on, zones, menu: zones.some((z) => z.includes("navigation")) ? menuOf(s.dev) : null });
  };
  const same = (row: HeaderRow) => signature(sets[0], row) === signature(sets[1], row);
  // The off-canvas panel exists only when a shown row holds the menu trigger.
  const uses = (item: string) => HEADER_ROWS.some((row) => sets.some((s) => {
    const r = s.rowOf(row);
    return r.on && r.zones.some((z) => z.items.includes(item));
  }));
  // A Navigation item whose menu has nothing in it renders no <nav> at all
  // (NavList), so the header menu CSS is only needed when one of them does.
  const menuHasItems = (dev: string, location: string) => nav.some((n) => n.menuId === menuIdForLocation(settings, location, nav[0]?.menuId ?? null, language));
  const popup = parseZone(settings.header_m_popup || '["navigation"]');
  const popupUsesNav = (popup.includes("navigation") && menuHasItems("mobile", "mobile")) || (popup.includes("navigation2") && menuHasItems("mobile", "secondary"));
  const usesNav = HEADER_ROWS.some((row) => sets.some((s) => {
    const r = s.rowOf(row);
    return r.on && r.zones.some((z) =>
      (z.items.includes("navigation") && menuHasItems(s.dev, s.dev === "mobile" ? "mobile" : "primary")) ||
      (z.items.includes("navigation2") && menuHasItems(s.dev, "secondary")) ||
      (z.items.includes("trigger") && popupUsesNav)
    );
  }));
  return { sets, same, usesTrigger: uses("trigger"), usesSearch: uses("search"), usesNav };
}

function parseZone(val: string): string[] {
  try { return JSON.parse(val || "[]"); } catch { return []; }
}

type FooterLink = { label: string; url: string };
type FooterWidget = { title?: string; type: "text" | "links" | "about"; text?: string; links?: FooterLink[] };

function parseJson<T>(val: string, fallback: T): T {
  try { return JSON.parse(val || "null") ?? fallback; } catch { return fallback; }
}


/** Sensible footer layout for a site that has never been through the builder. */
const FOOTER_ZONE_DEFAULTS: Record<string, string> = {
  footer_toprow_enabled: "false",
  footer_main_left: '["widget1"]',
  footer_main_center: "[]",
  footer_main_right: '["widget2"]',
  footer_bottomrow_enabled: "true",
  footer_bottomrow_left: "[]",
  footer_bottomrow_center: "[]",
  footer_bottomrow_right: '["copyright"]',
};

/**
 * Footer widgets, falling back to the legacy `footer_cols` array when the site
 * hasn't been re-published through the new builder yet — so an existing footer
 * keeps rendering instead of vanishing.
 */
function footerWidgets(settings: Record<string, string>): Record<string, FooterWidget> {
  const widgets = parseJson<Record<string, FooterWidget>>(settings.footer_widgets, {});
  if (Object.keys(widgets).length > 0) return widgets;

  const legacy = parseJson<FooterWidget[]>(settings.footer_cols, []);
  const out: Record<string, FooterWidget> = {};
  legacy.slice(0, 6).forEach((c, i) => { out[`widget${i + 1}`] = c; });
  return out;
}

/**
 * A live-preview hook (`data-bms-…`) the customizer's PreviewBridge looks
 * up to swap text and images without a reload. Only the customizer mounts
 * that bridge, so on a public page the attribute was dead weight — 27 of
 * them on one measured page. Returns nothing outside the customizer.
 */
const hook = (customizerMode: boolean | undefined, attrs: Record<string, string | boolean>) => (customizerMode ? attrs : {});

/** Renders one footer builder item. */
function FooterItem({ id, settings, nav, language, logoSize, customizerMode }: { id: string; settings: Record<string, string>; nav: NavItem[]; language?: string; logoSize?: { width: number; height: number } | null; customizerMode?: boolean }) {
  if (id === "copyright") {
    let links: FooterLink[] = [];
    try { links = JSON.parse(settings.footer_bottom_links || "[]"); } catch { links = []; }
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="contents" {...hook(customizerMode, { "data-bms-bottom-links": true })}>
          {links.filter((l) => l.label).map((l, i) => (
            <Link key={i} href={l.url || "#"} className="uppercase tracking-wide hover:opacity-100 opacity-70 transition-opacity">{l.label}</Link>
          ))}
        </span>
        <span {...hook(customizerMode, { "data-bms-text": "footer_bottom_text" })}>
          {settings.footer_bottom_text || `© ${new Date().getFullYear()} ${settings.site_name || "My Site"}`}
        </span>
      </div>
    );
  }

  if (id === "footernav") {
    const footerMenuId = menuIdForLocation(settings, "footer", nav[0]?.menuId ?? null, language);
    const footerNav = nav.filter((n) => n.menuId === footerMenuId && n.parentId == null);
    return (
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {footerNav.map((n) => (
          <Link key={n.id} href={n.url} target={n.target || "_self"} className="hover:opacity-100 opacity-80 transition-opacity">{n.label}</Link>
        ))}
      </nav>
    );
  }

  if (id === "social") {
    const socials = [
      ["Facebook", settings.social_facebook],
      ["Twitter", settings.social_twitter],
      ["Instagram", settings.social_instagram],
      ["LinkedIn", settings.social_linkedin],
    ].filter(([, url]) => !!url) as [string, string][];
    if (socials.length === 0) return null;
    return (
      <div className="flex items-center gap-4 text-sm">
        {socials.map(([label, url]) => (
          <a key={label} href={url} {...newTabProps(true)} className="opacity-80 hover:opacity-100 transition-opacity">{label}</a>
        ))}
      </div>
    );
  }

  if (id === "darkmode") return <DarkModeToggle label={uiText(language ?? "en").toggleDarkMode} />;

  // widget1..widget6
  const w = footerWidgets(settings)[id];
  if (!w) return null;

  if (w.type === "about") {
    return (
      <div>
        {settings.site_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...hook(customizerMode, { "data-bms-logo": true })}
            src={settings.site_logo}
            srcSet={logoSrcSet(settings.site_logo, logoSize, (parseInt(settings.logo_height) || 32) + 8)}
            alt={settings.logo_alt || settings.site_name || "Logo"}
            className="w-auto mb-4"
            style={{ height: `${(parseInt(settings.logo_height) || 32) + 8}px` }}
            // Below the fold: lazy, and sized so the footer does not shift.
            loading="lazy"
            decoding="async"
            {...(logoSize ? { width: logoSize.width, height: logoSize.height } : {})}
          />
        ) : (
          <div className="font-bold text-lg mb-3" style={{ color: "var(--footer-heading)" }} {...hook(customizerMode, { "data-bms-text": "site_name" })}>{settings.site_name || "My Site"}</div>
        )}
        {/* Empty text: no paragraph at all, except in the customizer, where the
            element must exist for the live preview to fill. */}
        {(w.text || customizerMode) && (
          <p className="text-sm leading-relaxed max-w-md" {...hook(customizerMode, { "data-bms-widget-text": id })} style={w.text ? undefined : { display: "none" }}>{w.text}</p>
        )}
      </div>
    );
  }

  if (w.type === "links") {
    return (
      <div>
        <h2 className="font-semibold mb-3" style={{ color: "var(--footer-heading)", ...(w.title ? {} : { display: "none" }) }} {...hook(customizerMode, { "data-bms-widget-title": id })}>{w.title}</h2>
        <ul className="space-y-2.5 text-sm" {...hook(customizerMode, { "data-bms-widget-links": id })}>
          {(w.links || []).filter((l) => l.label).map((l, li) => (
            <li key={li}><Link href={l.url || "#"} className="hover:opacity-100 opacity-80 transition-opacity">{l.label}</Link></li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      {w.title && <h2 className="font-semibold mb-3" style={{ color: "var(--footer-heading)" }}>{w.title}</h2>}
      {w.text && (
        // A "Text" widget, so its content is text. The only transformation it
        // wants is keeping the author's line breaks — it was reaching that by
        // injecting the raw value as HTML, which meant a stray `<` broke the
        // layout and a pasted tag ran. Escape first, then add the breaks.
        <div
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: escapeHtml(w.text).replace(/\n/g, "<br/>") }}
        />
      )}
    </div>
  );
}

/** Turns the flat nav_items rows into a parent/child tree for submenus. */
function buildNavTree(items: NavItem[]): NavNode[] {
  const byId = new Map<number, NavNode>();
  items.forEach((i) => byId.set(i.id, { ...i, children: [] }));
  const roots: NavNode[] = [];
  items.forEach((i) => {
    const node = byId.get(i.id)!;
    const parent = i.parentId != null ? byId.get(i.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

/**
 * Nav and search only need client JS for click-to-open dropdowns and the search
 * modal. When neither is in play — the common case on a public page — they are
 * rendered as plain server markup with identical classes, so the CSS behaves the
 * same and visitors download no JavaScript for them.
 *
 * The customizer preview always uses the client versions so mode switches can be
 * previewed live.
 */
function renderNav(
  i: number,
  items: NavNode[],
  settings: Record<string, string>,
  customizerMode?: boolean,
  currentPath?: string,
  label = "Primary"
) {
  // Decided here, not left to NavList's own empty check: the zone around it
  // needs to know now whether anything will be drawn, or it wraps a nothing
  // in a flex box. The customizer keeps the element — its preview fills it.
  if (items.length === 0 && !customizerMode) return null;
  const openOn = settings.hnav_open_on || "hover";
  const active = activeNavIds(items, currentPath, settings.hnav_parent_active === "true");
  if (customizerMode || openOn === "click") {
    return <HeaderNav key={i} items={items} openOn={openOn} activeIds={[...active]} label={label} />;
  }
  return <NavList key={i} items={items} activeIds={active} label={label} />;
}

function renderSearch(i: number, settings: Record<string, string>, u: UiText, customizerMode?: boolean, searchAction = "/search") {
  // The Customizer can set this; its fallback follows the page, not English.
  const placeholder = settings.hsearch_placeholder || u.searchPlaceholder;
  if (customizerMode || settings.hsearch_display === "icon") {
    return <HeaderSearch key={i} placeholder={placeholder} action={searchAction} labels={{ open: u.openSearch, close: u.closeSearch, submit: u.search }} />;
  }
  return (
    <div key={i} className="hsearch flex items-center">
      <form action={searchAction} className="hsearch-inline items-center gap-2">
        <input type="search" name="q" placeholder={placeholder} aria-label={placeholder}
          className="hsearch-field text-sm px-3 py-1.5 bg-black/5 focus:outline-none w-40" />
        {/* Enter submits, but a form needs a submit control to be complete
            (WCAG H32) — visually hidden, since the field is the whole design. */}
        <button type="submit" className="sr-only">{u.search}</button>
      </form>
    </div>
  );
}

interface HeaderZoneProps {
  items: string[];
  settings: Record<string, string>;
  nav: NavItem[];
  /** When set, every item is wrapped in a hidden slot the preview can reveal. */
  slotPrefix?: string;
  /** Which header set this is, so the nav can pick the right menu location. */
  device?: string;
  customizerMode?: boolean;
  /** The path being rendered, so the nav can mark the current item active. */
  currentPath?: string;
  /** Where the header's search box posts — this language's search page. */
  searchAction?: string;
  /** Everything the language switcher needs, bundled to keep signatures short. */
  langSwitch?: { current: string; targets: SwitcherTarget[]; showLabel: boolean };
  /** The document's language, so each location resolves that language's menu. */
  language?: string;
  /** The logo's intrinsic size, when it was uploaded here. */
  logoSize?: { width: number; height: number } | null;
}

function HeaderZone({ items, settings, nav, slotPrefix, device, customizerMode, currentPath, searchAction, langSwitch, language, logoSize }: HeaderZoneProps) {
  try {
    return renderHeaderZone({ items, settings, nav, slotPrefix, device, customizerMode, currentPath, searchAction, langSwitch, language, logoSize });
  } catch (err) {
    console.error("[HeaderZone]", err);
    return null;
  }
}

function renderHeaderZone({ items, settings, nav, slotPrefix, device, customizerMode, currentPath, searchAction, langSwitch, language, logoSize }: HeaderZoneProps) {
  if (!items.length) return null;
  const rendered = items.map((item, i) => [item, renderHeaderItem(item, i, settings, nav, device, customizerMode, currentPath, searchAction, langSwitch, language, logoSize)] as const);
  // An item can come back empty — a navigation whose menu has no entries —
  // and a zone of nothing but those is an empty flex box shipped for no
  // reason. The customizer keeps it: its slots are what the preview fills.
  if (!slotPrefix && rendered.every(([, node]) => node == null)) return null;
  return (
    <div className="flex items-center gap-4">
      {rendered.map(([item, node]) => {
        if (!slotPrefix) return node;
        return (
          <span key={item} data-bms-slot={`${slotPrefix}:${item}`} style={{ display: "none" }}>
            {node}
          </span>
        );
      })}
    </div>
  );
}

function renderHeaderItem(item: string, i: number, settings: Record<string, string>, nav: NavItem[], device?: string, customizerMode?: boolean, currentPath?: string, searchAction?: string, langSwitch?: { current: string; targets: SwitcherTarget[]; showLabel: boolean }, language?: string, logoSize?: { width: number; height: number } | null) {
  /** The chrome's wording in this document's language. */
  const u = uiText(language ?? "en");

  /** Items for one menu location, falling back per menuLocations rules. */
  const menuFor = (location: string) => {
    const id = menuIdForLocation(settings, location, nav[0]?.menuId ?? null, language);
    return nav.filter((n) => n.menuId === id);
  };

  switch (item) {
          case "logo":
            // Logo, title and tagline are all rendered; identityCss decides which
            // show, so Site Identity toggles preview live without a re-render.
            return (
              <Link key={i} href="/" className="site-branding shrink-0 flex items-center gap-2.5" style={{ color: "var(--header-text)" }}>
                {/* Rendered only when there is a logo, or in the customizer,
                    where `identityCss` toggles it live and the element has to
                    exist to be toggled. On a site with no logo this used to emit
                    `<img>` with no `src` — twice per page, hidden by CSS but
                    still invalid, and still telling the browser to fetch nothing
                    at high priority. */}
                {(settings.site_logo || customizerMode) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    {...hook(customizerMode, { "data-bms-logo": true })}
                    // Normal priority, eager. It used to ask for "high" on the
                    // desktop copy, and React turns a high-priority <img> into
                    // a <link rel=preload> in the head — so a 90-pixel logo
                    // competed with the page's real LCP image (the hero, which
                    // BlockRenderer preloads) and with the fonts the H1 needs.
                    // A logo is almost never the largest paint. The header is
                    // rendered twice (desktop and mobile sets, CSS shows one);
                    // both copies share one URL, so it is fetched once.
                    className="site-logo"
                    src={settings.site_logo || undefined}
                    srcSet={settings.site_logo ? logoSrcSet(settings.site_logo, logoSize, parseInt(settings.logo_height) || 32) : undefined}
                    alt={settings.logo_alt || settings.site_name || "Logo"}
                    {...(logoSize ? { width: logoSize.width, height: logoSize.height } : {})}
                  />
                )}
                <span className="leading-tight">
                  <span className="site-title font-bold text-lg" {...hook(customizerMode, { "data-bms-text": "site_name" })}>{settings.site_name || "My Site"}</span>
                  {/* Kept in the customizer even when blank: it is the hook the
                      preview writes a new tagline into. */}
                  {(settings.site_description || customizerMode) && (
                    <span className="site-tagline text-xs opacity-70" {...hook(customizerMode, { "data-bms-text": "site_description" })}>{settings.site_description}</span>
                  )}
                </span>
              </Link>
            );
          case "navigation":
            return renderNav(i, buildNavTree(menuFor(device === "mobile" ? "mobile" : "primary")), settings, customizerMode, currentPath, device === "mobile" ? "Mobile" : "Primary");
          case "navigation2":
            return renderNav(i, buildNavTree(menuFor("secondary")), settings, customizerMode, currentPath, "Secondary");
          case "search":
            return renderSearch(i, settings, u, customizerMode, searchAction);
          case "languageSwitcher":
            return langSwitch ? (
              <LanguageSwitcher
                key={i}
                label={u.language}
                current={langSwitch.current}
                targets={langSwitch.targets}
                showLabel={langSwitch.showLabel}
              />
            ) : null;
          case "button":
            return (
              <Link key={i} {...hook(customizerMode, { "data-bms-href": "header_button_url" })} href={settings.header_button_url || "#"}
                className="btn shrink-0">
                <span {...hook(customizerMode, { "data-bms-text": "header_button_text" })}>{settings.header_button_text || "Get Started"}</span>
              </Link>
            );
          case "social":
            return (
              <div key={i} className="flex items-center gap-2">
                {settings.social_twitter && <a href={settings.social_twitter} {...newTabProps(true)} className="text-xs hover:opacity-70 transition-opacity" style={{ color: "var(--header-text)" }}>𝕏</a>}
                {settings.social_facebook && <a href={settings.social_facebook} {...newTabProps(true)} className="text-xs hover:opacity-70 transition-opacity" style={{ color: "var(--header-text)" }}>f</a>}
                {settings.social_instagram && <a href={settings.social_instagram} {...newTabProps(true)} className="text-xs hover:opacity-70 transition-opacity" style={{ color: "var(--header-text)" }}>Ig</a>}
              </div>
            );
          case "trigger":
            return (
              <OffCanvas key={i} labels={{ open: u.openMenu, menu: u.menu, close: u.closeMenu }}>
                <HeaderZone
                  items={parseZone(settings.header_m_popup || '["navigation"]')}
                  settings={settings}
                  nav={nav}
                  device="mobile"
                  currentPath={currentPath}
                  searchAction={searchAction}
                  langSwitch={langSwitch}
                  language={language}
                  logoSize={logoSize}
                />
              </OffCanvas>
            );
          case "darkmode":
            return <DarkModeToggle key={i} label={u.toggleDarkMode} />;
          case "divider":
            return <div key={i} className="w-px self-stretch opacity-20" style={{ backgroundColor: "var(--header-text)" }} />;
          case "html":
            return settings.header_html_content
              ? <div key={i} className="text-sm" dangerouslySetInnerHTML={{ __html: settings.header_html_content }} />
              : null;
    default:
      return null;
  }
}

interface SiteLayoutProps {
  children: React.ReactNode;
  hideHeader?: boolean;
  hideFooter?: boolean;
  transparentHeader?: boolean;
  /** Preview mode: render every builder item hidden so the Customizer can
   *  reveal and reorder them live, with no server round trip. */
  customizerMode?: boolean;
  /** Which kind of page this is, so conditional header rules can apply. */
  pageType?: PageType;
  /**
   * The document's blocks, as they are stored.
   *
   * Only used to leave out the CSS for blocks this page does not contain —
   * see `cssTrim.ts`. A route that has no document, or does not pass this,
   * gets the whole stylesheet, which is correct and merely larger.
   */
  documentContent?: string;
  /** "post" or "page": which title-area rules this document can use. */
  documentKind?: "post" | "page";
  /** The content shell's data-layout / data-style / data-spacing, for the CSS trim. */
  shellAttrs?: { layout: string; style: string; spacing: string };
  /**
   * Link the site and font stylesheets instead of inlining them.
   *
   * For the 404 page. Next embeds a segment's `not-found` component in the
   * data of *every* page under it, rendered in full, so it can be shown
   * without a round trip — and the 404 here is a whole SiteLayout. On the
   * first live site that put a second copy of the site shell in every page:
   * the complete, untrimmed stylesheet (44 KB, where the page's own trimmed
   * one was 28 KB), the font CSS again, header and footer — parsed by every
   * visitor's phone before the first paint, for a page they never saw.
   * Linked, the copy costs a few bytes, and a real 404 fetches the same
   * immutable, year-cached `/site/<hash>.css` any linked page uses.
   */
  linkedAssets?: boolean;
  /** Path of the page being rendered; marks the matching nav item active. */
  currentPath?: string;
  /**
   * The content language of the document below. The header's search box posts
   * to that language's search page, so searching from a French article does
   * not silently return English results.
   */
  language?: string;
  /**
   * Where each other language's version of this document lives.
   *
   * Passed in because only the route knows what document is being rendered.
   * Left out — on an archive, a listing, or a document with no linked
   * translations — the switcher falls back to the language roots, which always
   * exist. It never prefixes the current path and hopes: that is how a switcher
   * ends up linking to URLs that 404.
   */
  switcherTargets?: SwitcherTarget[];
  /** The document's own Direction setting ("ltr" / "rtl"); anything else follows the language. */
  direction?: string | null;
  /**
   * Overrides the `<html lang>` this document reports, without changing
   * which language's content, search, feed or schema it belongs to. Built
   * for the author page — see the comment at its one use below.
   */
  langOverride?: string | null;
}

export default async function SiteLayout(props: SiteLayoutProps) {
  try {
    return await renderSiteLayout(props);
  } catch (err) {
    // Preview is a force-dynamic render of this same shell. A throw here used
    // to take the whole Preview tab to its 500 screen while the public page
    // (ISR, already cached) still looked fine. Show the article anyway.
    // Not for a database failure: that page, with no header, footer or menu,
    // was cached for a day as the real one. It fails as a 500 instead.
    if (isDbError(err)) throw err;
    console.error("[SiteLayout]", err);
    return <>{props.children}</>;
  }
}

async function renderSiteLayout({ children, hideHeader, hideFooter, transparentHeader, customizerMode, pageType = "default", currentPath, language, switcherTargets, direction, langOverride, documentContent, documentKind, shellAttrs, linkedAssets }: SiteLayoutProps) {
  const { settings: baseSettings, nav } = await getSiteData();
  // Conditional header rules are merged before anything reads the settings, so
  // the CSS builders and the zone rendering both see the adjusted values.
  const settings = applyConditions(baseSettings, pageType);
  // The header belongs to whatever language the document below is in, so its
  // search box posts to that language's search page.
  const docLanguage = language ?? defaultContentLanguage(settings);

  // Logo size, elements (for CSS trim) and “has a feed” start together —
  // they do not depend on each other. getElements / hasLivePosts are already
  // per-request memos, so later awaits reuse these.
  const [logoSize, livePosts, siteElements] = await Promise.all([
    settings.site_logo ? lookupImageSize(settings.site_logo).catch(() => null) : null,
    hasLivePosts(docLanguage).catch(() => false),
    getElements(),
  ]);
  // The header and footer logo sizes as static files, before anything renders
  // a srcset that could point at them (see prepareLogo). Not in the customizer,
  // where the logo is swapped live and the optimiser answers any size.
  if (settings.site_logo && !customizerMode) {
    const h = parseInt(settings.logo_height) || 32;
    await prepareLogo(settings.site_logo, logoSize, [h, h + 8]);
  }
  const searchAction = searchPath(docLanguage, settings);

  // The fallback: every other configured language's root. Always a real URL.
  const defaultLang = defaultContentLanguage(settings);
  const switcher: SwitcherTarget[] =
    switcherTargets ??
    contentLanguages(settings)
      .filter((c) => c !== docLanguage)
      .map((c) => ({ language: c, path: c === defaultLang ? "/" : `/${c}` }));
  const langSwitch = {
    current: docLanguage,
    targets: switcher,
    showLabel: settings.lang_switcher_labels !== "codes",
  };
  // A rule may hide the header even when the document didn't ask to.
  const headerHidden = hideHeader || settings.hide_header === "true";
  // Transparent can come from the document itself or from a conditional rule.
  const isTransparent = !!transparentHeader || settings.header_transparent === "true";

  // Maintenance mode is decided in the middleware, which answers every
  // signed-out visitor with a real 503 before a page renders. Reaching this
  // point means the request carries a session, so the site renders as normal.
  // The old check here called `auth()` — reading cookies inside pages cached
  // for an hour, which Next 15 can refuse mid-revalidation ("changed from
  // static to dynamic at runtime") and which rendered the notice with a 200.

  // Header layout zones
  // Injected scripts held back until the visitor interacts — see delayScripts.ts.
  // Never in the customizer, where the preview should show the site as it is.
  const speed = speedSettings(settings);
  // …and not on the pages listed under "Never delay on these pages".
  const delayOffHere = (() => {
    const paths = parseList(speed.scripts_delay_exclude_paths);
    if (!paths.length || !currentPath) return false;
    let decoded = currentPath;
    try { decoded = decodeURIComponent(currentPath); } catch {}
    return matchesPath(currentPath, paths) || matchesPath(decoded, paths);
  })();
  const delay = speed.scripts_delay === "true" && !customizerMode && !delayOffHere;
  const delayExclude = parseList(speed.scripts_delay_exclude);
  // Speed → Page optimisation: "Defer head scripts" only matters when they
  // are not already being held back until interaction.
  const headScripts = !settings.script_head ? "" : delay ? delayScriptsIn(settings.script_head, delayExclude) : speed.scripts_defer_head === "true" ? deferScriptsIn(settings.script_head) : settings.script_head;
  const fontDisplay = ["swap", "optional", "fallback", "block", "auto"].includes(speed.font_display) ? speed.font_display : "swap";
  // Uploaded families are served from /fonts/custom and never asked of Google.
  const customFonts = parseCustomFonts(settings.custom_fonts);
  const customFamilies = new Set(customFontFamilies(customFonts));
  // Inter is the font when none is chosen (see siteCss `--font-body` and
  // `--font-heading`), so it is requested like any chosen family rather than
  // by next/font, which preloaded it on every page whether used or not.
  const bodyFamily = settings.font_body || "Inter";
  const headingFamily = settings.font_heading || "Inter";
  const fontsUrl = googleFontsUrl(
    [headingFamily, bodyFamily].filter((f) => !customFamilies.has(f)),
    settings.google_subsets || "",
    fontDisplay,
    weightList(speed.font_weights)
  );
  // The font CSS inlined, so the browser skips a blocking round trip to
  // fonts.googleapis.com before it can even start on the font files. Not in
  // the customizer: there the font changes live and the bridge swaps a link.
  // `linkedAssets` does not skip this: the font CSS is what makes the local
  // `/site/f-<hash>.css` link (and the copied font files) exist at all —
  // without it the branch below fell back to Google's own stylesheet, so the
  // 404 page opened two connections to Google for fonts every other page
  // served from this host. The link itself is the few bytes the flag wants.
  let fontCss = fontsUrl && !customizerMode ? await inlineFontCss(fontsUrl) : null;
  // Only the character sets this site writes in — see keepSubsets.
  if (fontCss) fontCss = mergeVariableFaces(keepSubsets(fontCss, [...contentLanguages(settings), docLanguage], parseList(settings.google_subsets)));
  // And the files themselves copied to this server, so gstatic is not needed
  // either (Customizer → Speed). Any file that fails to copy keeps Google's URL.
  let fontsAllLocal = false;
  if (fontCss && on(speed.fonts_local)) {
    const localized = await localizeFontCss(fontCss);
    fontCss = localized.css;
    fontsAllLocal = localized.remote === 0;
  }
  const customFontCss = customFonts.length ? customFontFaceCss(customFonts) : "";
  // Speed → Page optimisation → "Preload fonts": the body and heading files
  // this language will certainly use, plus any the owner listed. Never in the
  // customizer, where the families change live.
  const fontPreloads = customizerMode
    ? []
    : [
        ...(on(speed.fonts_preload)
          ? fontPreloadUrls(fontCss, {
              body: bodyFamily,
              heading: headingFamily,
              language: docLanguage,
              // The weights the page actually paints, not just the family:
              // one family is several files, one per weight.
              headingWeight: parseInt(settings.font_weight_heading || "700", 10),
              buttonWeight: parseInt(settings.btn_font_weight || "600", 10),
            })
          : []),
        ...parseList(speed.fonts_preload_urls),
      ].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 4);
  const extraPreconnects = customizerMode ? [] : parseList(speed.perf_preconnect_hosts);
  const dnsPrefetch = customizerMode ? [] : parseList(speed.perf_dns_prefetch);
  /**
   * Which block families this page needs, when the stylesheet is inlined.
   *
   * Everything a page can render blocks from is scanned, not just the
   * document: Elements inject blocks into six hooks, and the footer and
   * sidebar widgets live in the settings. Missing one of those would mean a
   * block rendering unstyled on a live site, so a route that does not pass
   * its content gets `undefined` here and the whole stylesheet with it.
   *
   * Never in the customizer, where a block can be added without a reload.
   */
  const hdrPlan = headerPlan(settings, nav as NavItem[], docLanguage);
  // Markers for the page furniture cssTrim cannot see in any content.
  const layoutMarkers = headerHidden
    ? ""
    : [
        HEADER_ROWS.some((row) => !hdrPlan.same(row)) ? "@hdr-split" : "",
        hdrPlan.usesTrigger ? "@offcanvas" : "",
        hdrPlan.usesSearch ? "@hsearch" : "",
        hdrPlan.usesNav ? "@hnav" : "",
        documentKind ? `@kind-${documentKind}` : "",
        // Attribute facts — see attrIsDead in cssTrim.
        documentKind ? `@attr:kind=${documentKind}` : "",
        ...(shellAttrs ? [`@attr:layout=${shellAttrs.layout}`, `@attr:style=${shellAttrs.style}`, `@attr:spacing=${shellAttrs.spacing}`] : []),
        ...HEADER_ROWS.filter((row) => hdrPlan.sets.some((s) => s.rowOf(row).on)).map((row) => `@attr:hrow=${row}`),
      ].join(" ");
  const presentBlocks =
    !customizerMode && speed.css_inline_site === "true" && documentContent !== undefined
      ? presentBlockTypes(
          documentContent,
          layoutMarkers,
          JSON.stringify(settings),
          JSON.stringify(siteElements.map((el) => el.content))
        )
      : undefined;

  // Stylesheets that are inlined into the HTML by server.js rather than by
  // React — see lib/cssStore.ts for why. Each is written to disk under its
  // content hash here, and the page carries only a <link> to that name.
  const fontSheet = fontCss ? cssName("f", fontCss) : null;
  if (fontSheet && fontCss) storeCss(fontSheet, fontCss);
  const inlineSiteSheet = !customizerMode && speed.css_inline_site === "true" && !linkedAssets
    ? cssName("s", "", siteCssHash(settings, presentBlocks))
    : null;
  if (inlineSiteSheet) storeCss(inlineSiteSheet, cachedSiteCss(settings, presentBlocks));

  const prefetchMode: PrefetchMode =
    speed.prefetch_mode === "viewport" || speed.prefetch_mode === "prerender" || speed.prefetch_mode === "off"
      ? speed.prefetch_mode
      : "hover";

  return (
    <>
      {fontsUrl && fontCss ? (
        <>
          {/* Font files come from gstatic unless they were copied here. */}
          {!fontsAllLocal && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />}
          {fontSheet && <link rel="stylesheet" href={`/site/${fontSheet}.css`} precedence="fonts" />}
        </>
      ) : fontsUrl ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsUrl} precedence="fonts" />
        </>
      ) : null}
      {customFontCss && <style data-fonts="custom" dangerouslySetInnerHTML={{ __html: customFontCss }} />}
      {fontPreloads.map((href) => (
        <link key={href} rel="preload" as="font" type={/\.woff(?!2)/i.test(href) ? "font/woff" : "font/woff2"} href={href} crossOrigin="anonymous" />
      ))}
      {extraPreconnects.map((href) => (
        <link key={href} rel="preconnect" href={href} {...(/font/i.test(href) ? { crossOrigin: "anonymous" as const } : {})} />
      ))}
      {dnsPrefetch.map((href) => (
        <link key={href} rel="dns-prefetch" href={href} />
      ))}
      {/* Feed autodiscovery. `/feed.xml` existed but nothing linked to it, so
          no reader or browser could find it — a feed nobody can subscribe to.
          React hoists `<link>` into the head. Only once there is a post to
          subscribe to. */}
      {livePosts && <link
        rel="alternate"
        type="application/rss+xml"
        title={`${settings.site_name || "Site"} feed`}
        // This language's feed. A hardcoded `/feed.xml` meant a French page
        // advertised the English one, so a reader subscribing from a French
        // article received English posts.
        href={feedPath(docLanguage, settings)}
      />}

      {/* Site-level structured data: who publishes this, and how to search it.
          The Knowledge Graph settings were collected by the SEO screen and read
          by nothing; this is what reads them. Skipped in the customizer iframe,
          which is a preview rather than a page a crawler sees. */}
      {!customizerMode &&
        siteSchemas(settings, docLanguage, siteUrl(settings)).map((schema, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
          />
        ))}

      {/* Same builder list the live preview uses — see allSiteCss.
          Inline only inside the customizer, whose preview bridge rewrites
          this element as settings change. A public page links the same CSS
          as a hashed, immutable file instead — see app/site/[file]/route.ts
          for why. `precedence` has React hoist the link into <head>. */}
      {customizerMode ? (
        <style id="bms-site-style" dangerouslySetInnerHTML={{ __html: cachedSiteCss(settings) }} />
      ) : inlineSiteSheet ? (
        // Speed → Page optimisation → "Inline site CSS": this page's trimmed
        // rules, linked by hash and put inline by server.js — in the HTML
        // once, not again in React's hydration data. `precedence` has React
        // hoist the link into <head> and order it after the fonts.
        <link rel="stylesheet" href={`/site/${inlineSiteSheet}.css`} precedence="site" />
      ) : (
        <link rel="stylesheet" href={`/site/${siteCssHash(settings)}.css`} precedence="site" />
      )}
      {/* Settings → Head scripts. Rendered inert here and copied into the real
          <head> by server.js (see HEAD_TEMPLATE there): inside a <div> in the
          body, Tag Manager and consent-mode snippets that must run first ran
          late, and <meta>/<link> tags pasted here were ignored. ScriptRunner
          does the copy in the browser on the rare page server.js passes by. */}
      {headScripts && <template data-bms-head="" dangerouslySetInnerHTML={{ __html: headScripts }} />}
      {/* Only the customizer iframe needs the live-preview bridge; public
          pages must not pay for its JS. */}
      {customizerMode && <PreviewBridge />}
      {needsStickyWatcher(settings) && <StickyHeader />}

      {/* `lang` and `dir` belong to the document being served, not to the site:
          `/ur` is right-to-left even when the site default is English. The root
          <html> carries the site default and cannot see the URL, so the content
          subtree corrects both -- they are inherited, and `dir` is what decides
          the layout. The document may also override the direction itself.

          `langOverride` is separate from `docLanguage`: this only touches what
          the tag *says* the document is written in (and Direction's "Auto"
          fallback). `docLanguage` still drives which language's posts, search,
          feed and schema this page belongs to — an author page answers at
          every language's address, so those must keep following the URL even
          when the account has told `lang` something else. */}
      <div className="min-h-screen flex flex-col" lang={langOverride || docLanguage} dir={documentDir(langOverride || docLanguage, settings, direction)}>
        {/* Elements assigned to a layout hook — see src/lib/elements.ts. */}
        {/* The first thing a keyboard reaches: without it, every page began
            with the whole header — logo, menu, search, language switcher —
            before the article could be reached. Hidden until focused. */}
        {!customizerMode && (
          <a
            href="#bms-main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[1000] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black focus:shadow-lg"
          >
            {uiText(langOverride || docLanguage).skipToContent}
          </a>
        )}
        <ElementSlot hook="before_header" pageType={pageType} language={langOverride || docLanguage} contentLanguage={docLanguage} direction={direction} />

        {/* Header — a desktop set and a mobile set, swapped at the configured
            breakpoint by CSS. Built row by row (top, main, bottom): a row whose
            desktop and mobile settings would produce the same markup is emitted
            once, as `hdr-both`, shown at every width. Most sites never
            configure a separate mobile layout, and on those the whole header
            used to be in the HTML twice — twice the DOM, two logos, two menus.
            Rows that do differ are still emitted per device, next to each
            other, so the top/main/bottom order holds on both. The customizer
            always gets both sets: its preview edits each one separately. */}
        {!headerHidden && (() => {
          const { sets, same } = hdrPlan;

          const zone = (s: (typeof sets)[number], items: string[], slot: string) => (
            <HeaderZone
              items={customizerMode ? HEADER_ITEM_IDS : items}
              settings={settings}
              nav={nav as NavItem[]}
              slotPrefix={customizerMode ? slot : undefined}
              device={s.dev}
              customizerMode={customizerMode}
              currentPath={currentPath}
              searchAction={searchAction}
              langSwitch={langSwitch}
              language={docLanguage}
              logoSize={logoSize}
            />
          );

          const renderRow = (s: (typeof sets)[number], row: HeaderRow, cls: string) => {
            const r = s.rowOf(row);
            if (!r.on && !customizerMode) return null;
            const zones = r.zones.map((z) => (
              <Fragment key={z.col}>{zone(s, z.items, `hdr:${s.dev}:${row}:${z.col}`)}</Fragment>
            ));
            if (row === "main") {
              return (
                <header
                  key={`${cls}:main`}
                  style={{ color: "var(--header-text)" }}
                  data-hrow="main"
                  className={[cls, isTransparent ? "is-transparent absolute w-full" : "", "flex items-center"].filter(Boolean).join(" ")}
                >
                  <div className="hrow-inner w-full px-4 flex items-center justify-between gap-6">{zones}</div>
                </header>
              );
            }
            return (
              <div
                key={`${cls}:${row}`}
                {...hook(customizerMode, { "data-bms-row": `hdr:${s.dev}:${row}` })}
                data-hrow={row}
                className={`${cls} border-b border-black/5`}
                style={{ display: customizerMode && !r.on ? "none" : undefined }}
              >
                <div className={`hrow-inner px-4 ${row === "topbar" ? "h-8" : "h-10"} flex items-center justify-between`}>{zones}</div>
              </div>
            );
          };

          return HEADER_ROWS.map((row) =>
            !customizerMode && same(row)
              ? renderRow(sets[0], row, "hdr-both")
              : sets.map((s) => renderRow(s, row, s.cls))
          );
        })()}

        <ElementSlot hook="after_header" pageType={pageType} language={langOverride || docLanguage} contentLanguage={docLanguage} direction={direction} />

        {/* tabIndex so the skip link moves focus here, not just the scroll. */}
        <main id="bms-main" tabIndex={-1} className="flex-1 outline-none">{children}</main>

        <ElementSlot hook="before_footer" pageType={pageType} language={langOverride || docLanguage} contentLanguage={docLanguage} direction={direction} />

        {/* Footer — same zone model as the header: three rows, each split
            left/center/right, filled with configurable widgets. */}
        {!hideFooter && (
          <footer style={{ backgroundColor: "var(--footer-bg)", color: "var(--footer-text)" }}>
            {(["toprow", "main", "bottomrow"] as const).map((row) => {
              const enabled =
                row === "main" ? true : (settings[`footer_${row}_enabled`] ?? FOOTER_ZONE_DEFAULTS[`footer_${row}_enabled`]) === "true";
              if (!enabled && !customizerMode) return null;

              const cols = COLS.map((col) => {
                const key = `footer_${row}_${col}`;
                return parseZone(settings[key] ?? FOOTER_ZONE_DEFAULTS[key] ?? "[]");
              });
              if (cols.every((c) => c.length === 0) && !customizerMode) return null;

              const isBottom = row === "bottomrow";
              return (
                <div
                  key={row}
                  // Not a customizer-only hook: footerRowCss targets this
                  // attribute, so the footer's colours and borders depend on
                  // it on every page. (Gating it broke the live footer once.)
                  data-bms-row={`ftr:${row}`}
                  style={customizerMode && !enabled ? { display: "none" } : undefined}
                >
                  <div
                    className={`max-w-6xl mx-auto px-4 ${isBottom ? "py-5 text-xs" : "py-12"} flex flex-col sm:flex-row gap-8 ${isBottom ? "items-center justify-between" : ""}`}
                  >
                    {cols.map((items, ci) => (!customizerMode && items.length === 0 ? null : (
                      <div
                        key={ci}
                        className={`min-w-0 flex ${isBottom ? "flex-row items-center gap-6" : "flex-col gap-6"} ${
                          ci === 2 ? "sm:items-center" : ci > 2 ? "sm:items-end" : ""
                        }`}
                        style={isBottom ? undefined : { flexBasis: 0, flexGrow: customizerMode || items.length ? 1 : 0 }}
                      >
                        {(customizerMode ? FOOTER_ITEM_IDS : items).map((id) =>
                          customizerMode ? (
                            <span
                              key={id}
                              data-bms-slot={slotId("ftr", row, COLS[ci], id)}
                              style={{ display: "none" }}
                            >
                              <FooterItem id={id} settings={settings} nav={nav as NavItem[]} language={docLanguage} logoSize={logoSize} customizerMode />
                            </span>
                          ) : (
                            <FooterItem key={id} id={id} settings={settings} nav={nav as NavItem[]} language={docLanguage} logoSize={logoSize} />
                          )
                        )}
                      </div>
                    )))}
                  </div>
                </div>
              );
            })}
          </footer>
        )}

        <ElementSlot hook="after_footer" pageType={pageType} language={langOverride || docLanguage} contentLanguage={docLanguage} direction={direction} />
      </div>

      {settings.script_body_end && <div dangerouslySetInnerHTML={{ __html: delay ? delayScriptsIn(settings.script_body_end, delayExclude) : settings.script_body_end }} />}
      {!customizerMode && <ScriptRunner />}
      {/* Turnstile's site key as the server enforces it right now (the build-
          time NEXT_PUBLIC_ value can be stale), read by the widget from here
          rather than by a request per visit. Empty means off. When on, the
          widget's height is reserved in this HTML so the form does not jump
          when it appears. Not during `next build`: a prerendered page would
          carry the build machine's answer ("off", usually), and forms on it
          would lose their widget while the host still demands a token. Left
          out, the widget asks /api/turnstile until the page is re-rendered
          on the host. */}
      {process.env.NEXT_PHASE !== "phase-production-build" && (
        <>
          <meta name="bms-turnstile" content={turnstileEnabled() ? turnstileSiteKey() : ""} />
          {turnstileEnabled() && <style>{".cf-turnstile-slot{min-height:65px}"}</style>}
        </>
      )}
      {delay && (settings.script_head || settings.script_body_end) && (
        <script dangerouslySetInnerHTML={{ __html: delayLoader(intIn(speed.scripts_delay_timeout, 0, 60, 6)) }} />
      )}
      {/* Speed helpers, Customizer → Speed. Both tiny, both inline so they
          cost no request; neither runs in the customizer preview. */}
      {!customizerMode && on(speed.perf_video_facade) && (
        <script dangerouslySetInnerHTML={{ __html: FACADE_SCRIPT }} />
      )}
      {!customizerMode && prefetchMode !== "off" && (
        <script dangerouslySetInnerHTML={{ __html: prefetchScript(prefetchMode, parseList(speed.prefetch_exclude)) }} />
      )}
      {/* Customizer → General → Scroll to Top / Reading Experience. */}
      {scrollTopEnabled(settings) && <ScrollTopButton offset={parseInt(settings.scroll_top_offset || "400", 10) || 400} label={uiText(docLanguage).backToTop} />}
      {progressEnabled(settings, pageType) && <ReadingProgress />}
    </>
  );
}
