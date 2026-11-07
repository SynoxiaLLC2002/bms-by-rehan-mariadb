"use client";

import { hasRobotsAdvanced, parseRobotsAdvanced, serializeRobotsAdvanced, type RobotsAdvanced } from "@/lib/robots";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Search, Share2, Twitter, Settings2, Braces } from "lucide-react";
import SchemaTab from "./SchemaTab";

export interface SeoData {
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  canonicalUrl: string;
  noIndex: boolean;
  noFollow: boolean;
  /** JSON, see lib/robots.ts; null when nothing beyond index/follow is set. */
  robotsAdvanced: string | null;
  schemaType: string;
  /** Author-added JSON-LD entries as JSON — see lib/schemaTypes.ts. */
  schemas: string;
}

interface SeoPanelProps {
  data: SeoData;
  onChange: (data: SeoData) => void;
  title?: string;
  /** The path this document is published at, e.g. `/blog/my-post`. */
  permalink?: string;
  /** "post" or "page" — only used to word the hints. */
  kind?: string;
  compact?: boolean;
  /** The editor's blocks, so the Schema tab can list what they emit. */
  blocks?: unknown[];
}

/**
 * Only the types this CMS can actually populate.
 *
 * The list used to offer FAQPage, HowTo, Product, Organization and Person while
 * the emitter filled Article properties regardless — so choosing Product
 * produced `{"@type":"Product","headline":…,"datePublished":…}`, which is not
 * valid Product and which Search Console reports as an error. An option that
 * emits broken structured data is worse than no option.
 *
 * FAQ is deliberately absent: it comes from the Accordion block's "FAQ schema"
 * switch, which knows the questions and answers. A document-level FAQPage would
 * have to invent them.
 */
const SCHEMA_TYPES = ["Article", "BlogPosting", "NewsArticle", "WebPage"];

type Tab = "search" | "social" | "twitter" | "schema" | "advanced";

export default function SeoPanel({
  data, onChange, title = "", permalink = "", kind = "page", compact = false, blocks,
}: SeoPanelProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("search");
  // The site's own origin, which is the admin's origin too. Read after mount
  // rather than during render: the server has no `window`, and a guessed origin
  // in the markup would not match what hydration produces.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  function update(key: keyof SeoData, value: string | boolean | null) {
    onChange({ ...data, [key]: value });
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "search",   label: "Search",     icon: Search },
    { id: "social",   label: "Open Graph", icon: Share2 },
    { id: "twitter",  label: "Twitter",    icon: Twitter },
    { id: "schema",   label: "Schema",     icon: Braces },
    { id: "advanced", label: "Advanced",   icon: Settings2 },
  ];

  const seoTitleLength = (data.seoTitle || title).length;
  const seoDescLength = data.seoDescription.length;

  const tabBar = (
    <div className="flex flex-wrap border-b border-slate-100">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`flex items-center gap-1 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide shrink-0 border-b-2 transition-colors ${
            tab === t.id
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <t.icon size={12} />
          {t.label}
        </button>
      ))}
    </div>
  );

  const tabContent = (
    <div className="space-y-4">
      {tab === "search" && (
        <>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-500 mb-2 font-semibold uppercase tracking-wide">Search Preview</p>
            <p className="text-blue-700 text-sm font-medium leading-tight truncate">
              {data.seoTitle || title || `Untitled ${kind}`}
            </p>
            <p className="text-green-700 text-xs mt-0.5 truncate">
              {(origin || "") + (permalink || "/…")}
            </p>
            <p className="text-slate-600 text-xs mt-1 line-clamp-2">
              {data.seoDescription || "Add a meta description to control how your page appears in search results."}
            </p>
          </div>
          <div>
            <label className="label">
              SEO Title
              <span className={`ml-1 text-xs font-normal ${seoTitleLength > 60 ? "text-red-500" : "text-slate-400"}`}>
                {seoTitleLength}/60
              </span>
            </label>
            <input
              type="text"
              className="input"
              value={data.seoTitle}
              onChange={(e) => update("seoTitle", e.target.value)}
              placeholder={title || "SEO optimized title"}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {data.seoTitle
                ? `This is what search engines and the browser tab will show for this ${kind}.`
                : `Empty, so the ${kind} title is used — run through your SEO title template from Settings, which usually appends the site name.`}
            </p>
          </div>
          <div>
            <label className="label">
              Meta Description
              <span className={`ml-1 text-xs font-normal ${seoDescLength > 160 ? "text-red-500" : seoDescLength > 130 ? "text-yellow-500" : "text-slate-400"}`}>
                {seoDescLength}/160
              </span>
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              value={data.seoDescription}
              onChange={(e) => update("seoDescription", e.target.value)}
              placeholder="Brief description for search engines"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {data.seoDescription
                ? "Shown under the link in search results."
                : "Empty, so your site's description template fills it in — usually the excerpt."}
            </p>
          </div>
          <div>
            <label className="label">Focus Keywords</label>
            <input
              type="text"
              className="input"
              value={data.seoKeywords}
              onChange={(e) => update("seoKeywords", e.target.value)}
              placeholder="keyword1, keyword2"
            />
          </div>

          {/* Beside the URL it overrides, rather than under Advanced. It is the
              same question the preview above is answering — "which address is
              this document's real one" — and it was two tabs away, on a strip
              that did not fit. */}
          <div>
            <label className="label">Canonical URL</label>
            <input
              type="url"
              className="input"
              value={data.canonicalUrl}
              onChange={(e) => update("canonicalUrl", e.target.value)}
              placeholder={permalink ? `${origin || ""}${permalink}` : "https://example.com/the-original"}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {data.canonicalUrl ? (
                <>
                  Search engines will treat <strong>that</strong> URL as the original and credit it
                  instead of this one. Leave empty unless this {kind} is a copy of something else.
                </>
              ) : (
                <>
                  Empty, so this {kind} points at itself — the usual and correct choice. Set one only
                  when the same content lives at another address that should get the credit.
                </>
              )}
            </p>
          </div>
        </>
      )}

      {tab === "social" && (
        <>
          <div>
            <label className="label">OG Title</label>
            <input type="text" className="input" value={data.ogTitle}
              onChange={(e) => update("ogTitle", e.target.value)}
              placeholder={data.seoTitle || title || "Social share title"} />
          </div>
          <div>
            <label className="label">OG Description</label>
            <textarea className="input resize-none" rows={3} value={data.ogDescription}
              onChange={(e) => update("ogDescription", e.target.value)}
              placeholder={data.seoDescription || "Social share description"} />
          </div>
          <div>
            <label className="label">OG Image URL</label>
            <input type="url" className="input" value={data.ogImage}
              onChange={(e) => update("ogImage", e.target.value)}
              placeholder="https://yoursite.com/og-image.jpg" />
            <p className="text-xs text-slate-400 mt-1">Recommended: 1200×630px</p>
          </div>
        </>
      )}

      {tab === "twitter" && (
        <>
          <div>
            <label className="label">Twitter Title</label>
            <input type="text" className="input" value={data.twitterTitle}
              onChange={(e) => update("twitterTitle", e.target.value)}
              placeholder={data.ogTitle || data.seoTitle || title} />
          </div>
          <div>
            <label className="label">Twitter Description</label>
            <textarea className="input resize-none" rows={3} value={data.twitterDescription}
              onChange={(e) => update("twitterDescription", e.target.value)}
              placeholder={data.ogDescription || data.seoDescription} />
          </div>
          <div>
            <label className="label">Twitter Image URL</label>
            <input type="url" className="input" value={data.twitterImage}
              onChange={(e) => update("twitterImage", e.target.value)}
              placeholder={data.ogImage || "https://yoursite.com/twitter-image.jpg"} />
          </div>
        </>
      )}

      {tab === "schema" && (
        <SchemaTab
          value={data.schemas ?? ""}
          onChange={(v) => update("schemas", v)}
          pageType={data.schemaType}
          onPageTypeChange={(t) => update("schemaType", t)}
          pageTypes={SCHEMA_TYPES}
          blocks={blocks}
          kind={kind}
          permalink={permalink}
        />
      )}

      {tab === "advanced" && (
        <>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={data.noIndex}
                onChange={(e) => update("noIndex", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300" />
              <div>
                <span className="text-sm font-medium text-slate-700">No Index</span>
                <p className="text-xs text-slate-400">Prevent search engines from indexing</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={data.noFollow}
                onChange={(e) => update("noFollow", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300" />
              <div>
                <span className="text-sm font-medium text-slate-700">No Follow</span>
                <p className="text-xs text-slate-400">Don&apos;t follow links on this page</p>
              </div>
            </label>
            <AdvancedRobots value={data.robotsAdvanced} onChange={(v) => update("robotsAdvanced", v)} />
          </div>
        </>
      )}
    </div>
  );

  // Compact mode — no card wrapper or toggle (used inside right sidebar)
  if (compact) {
    return (
      <div>
        {tabBar}
        <div className="p-4">{tabContent}</div>
      </div>
    );
  }

  // Normal mode — standalone card with collapse toggle
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Search size={16} className="text-slate-500" />
          <span className="font-semibold text-slate-900 text-sm">SEO Settings</span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {tabBar}
          <div className="p-5">{tabContent}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The directives beyond index/follow. Behind a fold because almost no page
 * needs them; the fold's label says when one is in use so it is not missed.
 */
function AdvancedRobots({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const adv = parseRobotsAdvanced(value);
  const set = (patch: Partial<RobotsAdvanced>) => onChange(serializeRobotsAdvanced({ ...adv, ...patch }));
  const active = hasRobotsAdvanced(adv);
  const numberField = (label: string, key: "maxSnippet" | "maxVideoPreview", unit: string) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <select className="input text-xs" value={adv[key] === -1 ? "-1" : adv[key] === 0 ? "0" : "n"}
        onChange={(e) => set({ [key]: e.target.value === "n" ? (adv[key] > 0 ? adv[key] : key === "maxSnippet" ? 160 : 30) : Number(e.target.value) } as Partial<RobotsAdvanced>)}>
        <option value="-1">No limit</option>
        <option value="0">None</option>
        <option value="n">Limit…</option>
      </select>
      {adv[key] > 0 && (
        <input type="number" min={1} className="input mt-1 text-xs" value={adv[key]}
          onChange={(e) => set({ [key]: Math.max(1, Number(e.target.value) || 1) } as Partial<RobotsAdvanced>)} placeholder={unit} />
      )}
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-xs font-semibold text-slate-700">
          Advanced robots{active && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">custom</span>}
        </span>
        <span className="text-[11px] text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          {[
            ["noArchive", "No Archive", "No cached copy in search results"],
            ["noImageIndex", "No Image Index", "Keep this page's images out of image search"],
            ["noSnippet", "No Snippet", "Show only the title in results — no text, no preview"],
          ].map(([key, label, help]) => (
            <label key={key} className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={adv[key as keyof RobotsAdvanced] as boolean}
                onChange={(e) => set({ [key]: e.target.checked } as Partial<RobotsAdvanced>)}
                className="h-4 w-4 rounded border-slate-300" />
              <div>
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <p className="text-xs text-slate-400">{help}</p>
              </div>
            </label>
          ))}
          {!adv.noSnippet && (
            <div className="grid gap-3 sm:grid-cols-3">
              {numberField("Snippet length", "maxSnippet", "characters")}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Image preview</label>
                <select className="input text-xs" value={adv.maxImagePreview}
                  onChange={(e) => set({ maxImagePreview: e.target.value as RobotsAdvanced["maxImagePreview"] })}>
                  <option value="large">Large (recommended)</option>
                  <option value="standard">Standard</option>
                  <option value="none">None</option>
                </select>
              </div>
              {numberField("Video preview", "maxVideoPreview", "seconds")}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-400">
            Defaults match what every page already sends: unlimited snippet, large image preview, unlimited video
            preview. Change them only for a reason — a smaller image preview costs Discover traffic.
          </p>
        </div>
      )}
    </div>
  );
}
