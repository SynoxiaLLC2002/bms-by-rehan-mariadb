import SiteLayout from "@/components/frontend/SiteLayout";
import { htmlSig } from "@/lib/htmlSig";
import ElementSlot from "@/components/frontend/ElementSlot";
import Sidebar from "@/components/frontend/Sidebar";
import { getSiteSettings } from "@/lib/settings";
import { defaultContentLanguage } from "@/lib/locale";
import type { SwitcherTarget } from "@/components/frontend/LanguageSwitcher";
import type { PageType } from "@/lib/headerConditions";
import type { ReactNode } from "react";

export interface ContentDesign {
  postLayout?: string | null;
  contentStyle?: string | null;
  verticalSpacing?: string | null;
  transparentHeader?: string | null;
  disableHeader?: boolean | null;
  disableFooter?: boolean | null;
  cssClasses?: string | null;
}

/**
 * Wraps page/post content with SiteLayout and applies the per-document Design
 * settings.
 *
 * Layout, content style and spacing are expressed as data attributes rather than
 * resolved class names: `contentCss` turns them into rules, and an unset value
 * stays the literal "default" so the site-wide default from Posts/Pages Layout
 * applies. That split is what lets the Customizer preview both levels live.
 */
/** ContentShell speaks in document kinds; elements target page types. */
const pageTypeFor = (kind: "page" | "post" | "archive") =>
  kind === "archive" ? ("category" as const) : kind;

export default async function ContentShell({
  design,
  kind = "page",
  currentPath,
  children,
  language,
  direction,
  langOverride,
  switcherTargets,
  scriptHead,
  scriptBodyEnd,
  customCss,
  pageType,
  documentContent,
}: {
  design: ContentDesign;
  /** Which set of site-wide defaults applies when a value is "default". */
  kind?: "page" | "post" | "archive";
  /** Path of this document, so the nav can mark the matching item active. */
  currentPath?: string;
  /**
   * Which language this document belongs to, so the sidebar lists that
   * language's posts. A French article was showing English recent posts,
   * because the sidebar had no idea what it was sitting next to. Defaults to
   * the default language for callers with no document of their own.
   */
  language?: string;
  /** The document's own Direction setting, when it has one. */
  direction?: string | null;
  /** Overrides `<html lang>` without changing which language's content this document queries. See SiteLayout. */
  langOverride?: string | null;
  /** This document's translations, so the switcher links to them by name. */
  switcherTargets?: SwitcherTarget[];
  /**
   * Markup this document alone injects, head and end-of-body.
   *
   * Rendered exactly like the site-wide pair — a tracking snippet is raw markup
   * by definition — which is why only an administrator may write it. The
   * difference is scope: this runs on one document instead of every page.
   */
  scriptHead?: string | null;
  scriptBodyEnd?: string | null;
  /** CSS for this document only. */
  customCss?: string | null;
  /**
   * Which page type header rules and Elements target, when it differs from
   * `kind`. The homepage is a page for layout defaults but "front" for targeting.
   */
  pageType?: PageType;
  /**
   * The document's blocks as stored, passed straight through to SiteLayout so
   * the inlined stylesheet can leave out the blocks this page does not use.
   * Omitting it is safe: the page then gets the whole stylesheet.
   */
  documentContent?: string;
  children: ReactNode;
}) {
  try {
    return await renderContentShell({
      design,
      kind,
      currentPath,
      children,
      language,
      direction,
      langOverride,
      switcherTargets,
      scriptHead,
      scriptBodyEnd,
      customCss,
      // Derived from the document kind unless the caller says otherwise.
      // `pageTypeFor` existed and was never called, so every post, page and
      // archive reported "default": a header rule or Element targeting
      // "Single post" or "Category archive" matched nothing, anywhere, and
      // the feature looked broken rather than unwired.
      pageType: pageType ?? pageTypeFor(kind),
      documentContent,
    });
  } catch (err) {
    console.error("[ContentShell]", err);
    return <>{children}</>;
  }
}

async function renderContentShell({
  design,
  kind = "page",
  currentPath,
  children,
  language,
  direction,
  langOverride,
  switcherTargets,
  scriptHead,
  scriptBodyEnd,
  customCss,
  pageType,
  documentContent,
}: {
  design: ContentDesign;
  kind?: "page" | "post" | "archive";
  currentPath?: string;
  language?: string;
  direction?: string | null;
  langOverride?: string | null;
  switcherTargets?: SwitcherTarget[];
  scriptHead?: string | null;
  scriptBodyEnd?: string | null;
  customCss?: string | null;
  pageType?: PageType;
  documentContent?: string;
  children: ReactNode;
}) {
  // Read here rather than passed in: every caller would otherwise have to load
  // settings only to hand them straight through to the sidebar.
  const settings = await getSiteSettings();

  const layout = design.postLayout || "default";
  const style = design.contentStyle || "default";
  const spacing = design.verticalSpacing || "default";
  const extra = design.cssClasses ?? "";
  const targetType = pageType ?? pageTypeFor(kind);

  // Whether this document's layout shows a sidebar at all — the same rule the
  // stylesheet applies (siteCss `.content-sidebar`): an explicit left/right
  // layout, or "default" when the site-wide layout for this kind has one.
  // The sidebar used to be rendered always and hidden with `display:none`,
  // so a page with no sidebar still carried the Search, Recent Posts and
  // Categories widgets: three `<h2>`s in its outline for a crawler to read,
  // the queries behind them on every render, and the bytes. The customizer
  // previews through its own route, so nothing needs the hidden copy.
  const isSidebar = (v?: string | null) => v === "left-sidebar" || v === "right-sidebar";
  const siteLayout = kind === "page" ? settings.page_layout : kind === "post" ? settings.post_layout : settings.archive_layout;
  const showSidebar = isSidebar(layout) || (layout === "default" && isSidebar(siteLayout));

  return (
    <SiteLayout
      hideHeader={!!design.disableHeader}
      hideFooter={!!design.disableFooter}
      transparentHeader={design.transparentHeader === "enable"}
      pageType={targetType}
      currentPath={currentPath}
      language={language ?? defaultContentLanguage(settings)}
      direction={direction}
      langOverride={langOverride}
      switcherTargets={switcherTargets}
      documentContent={documentContent}
      documentKind={kind === "archive" ? undefined : kind}
      shellAttrs={{ layout, style, spacing }}
    >
      <div
        className={["content-shell mx-auto px-4", extra].filter(Boolean).join(" ")}
        data-kind={kind}
        data-layout={layout}
        data-style={style}
        data-spacing={spacing}
      >
        {/* Scoped to this document. `cssValue`-style escaping is not applied:
            this is CSS an administrator wrote deliberately, the same trust level
            as the site-wide stylesheet, and escaping it would break at-rules and
            selectors. The gate is who may write it, not what it may say. */}
        {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
        {scriptHead && <div data-bms-html={htmlSig(scriptHead)} dangerouslySetInnerHTML={{ __html: scriptHead }} />}
        {/* The article comes first in the document, the sidebar second.
            It used to be the other way round, and placement was — and still is
            — done entirely with CSS `order`, so the visual result is identical
            either way. What was not identical was the reading order: a screen
            reader met "Search / Recent Posts / Categories" before the article's
            own `<h1>`, and a keyboard user tabbed through the whole sidebar to
            reach the content. Source order is the reading order, so the content
            leads and the CSS puts the sidebar wherever the layout asks. */}
        <div className="content-grid">
          <article className="content-article">
            {/* The document's language, like the four slots SiteLayout draws —
                these two were passed none, so a French post's in-content
                Elements used English theme text and default-language lists. */}
            <ElementSlot hook="before_content" pageType={targetType} language={language ?? defaultContentLanguage(settings)} direction={direction} />
            {children}
            <ElementSlot hook="after_content" pageType={targetType} language={language ?? defaultContentLanguage(settings)} direction={direction} />
          </article>
          {showSidebar && (
            <aside className="content-sidebar">
              <Sidebar settings={settings} language={language ?? defaultContentLanguage(settings)} />
            </aside>
          )}
        </div>
        {scriptBodyEnd && <div data-bms-html={htmlSig(scriptBodyEnd)} dangerouslySetInnerHTML={{ __html: scriptBodyEnd }} />}
      </div>
    </SiteLayout>
  );
}
