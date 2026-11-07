"use client";

import { useEffect, useState } from "react";
import Header from "@/components/admin/Header";
import MediaPicker from "@/components/admin/MediaPicker";
import { cn } from "@/lib/utils";
import { seoDefaults, SEO_VARIABLES, renderTemplate, type SeoSettings } from "@/lib/seo";
import { DAYS, DAY_LABELS, LOCAL_TYPES, parseHours, type Day, type DayHours } from "@/lib/localSeo";
import { Check, Loader2, Save, Trash2, Plus } from "lucide-react";

interface NotFoundRow {
  id: number;
  path: string;
  hits: number;
  referrer: string | null;
  lastHit: string;
}

interface RedirectRow {
  id: number;
  source: string;
  destination: string;
  type: number;
  enabled: boolean;
  hits: number;
}

type Tab = "titles" | "social" | "webmaster" | "local" | "sitemap" | "redirects" | "notfound" | "robots";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "titles",  label: "Titles & Meta", hint: "Templates used when a post has no SEO title of its own" },
  { id: "social",  label: "Social & Schema", hint: "Knowledge graph, default share image, Twitter card" },
  { id: "webmaster", label: "Webmaster Tools", hint: "Verify the site with Google, Bing, Yandex and Pinterest" },
  { id: "local",   label: "Local SEO",     hint: "Address, hours and phone for a business with a place" },
  { id: "sitemap", label: "Sitemap",       hint: "What appears in /sitemap_index.xml" },
  { id: "redirects", label: "Redirects",   hint: "Send old URLs somewhere new" },
  { id: "notfound", label: "404 Log",      hint: "URLs visitors hit that do not exist" },
  { id: "robots",  label: "robots.txt",    hint: "Served at /robots.txt" },
];

/**
 * People paste the whole `<meta …>` tag more often than the token inside it.
 * Take either; store the token.
 */
function extractVerificationToken(raw: string): string {
  const m = raw.match(/content=["']([^"']+)["']/i);
  return (m ? m[1] : raw).trim();
}

/** Sample values so the preview under each template looks like a real page. */
const SAMPLE = {
  title: "How to fix lag issues",
  sitename: "My Site",
  sitedesc: "A CMS made for bloggers",
  excerpt: "A short summary of the post content.",
  term: "Guides",
  term_description: "Everything in the guides category.",
  search: "lag",
  category: "Guides",
  date: "12 March 2026",
};

/* ── Field components ──────────────────────────────────────────
 *
 * At module scope, not inside SeoPage. Declared inside, each was a new function
 * object on every render, so React saw a different component type, threw the
 * old DOM away and mounted a fresh <input> — the title/description template
 * boxes lost focus after every character typed.
 */

type SetFn = (k: keyof SeoSettings, v: string) => void;

function Template({ settings, set, k, label, help }: { settings: SeoSettings; set: SetFn; k: keyof SeoSettings; label: string; help?: string }) {
  const preview = renderTemplate(settings[k], SAMPLE, settings.seo_separator);
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      <input className="input font-mono text-xs" value={settings[k]} onChange={(e) => set(k, e.target.value)} />
      <p className="text-xs text-slate-400 mt-1">
        {help ? `${help} · ` : ""}Preview: <span className="text-slate-600">{preview || "—"}</span>
      </p>
    </div>
  );
}

function Toggle({ settings, set, k, label, help }: { settings: SeoSettings; set: SetFn; k: keyof SeoSettings; label: string; help?: string }) {
  const on = settings[k] === "true";
  return (
    <div className="mb-3">
      <button type="button" onClick={() => set(k, on ? "false" : "true")} className="flex items-center gap-2.5">
        <span className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", on ? "bg-brand-600" : "bg-slate-300")}>
          <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", on ? "left-[18px]" : "left-0.5")} />
        </span>
        <span className="text-sm text-slate-700">{label}</span>
      </button>
      {help && <p className="text-xs text-slate-400 mt-1 ml-[46px]">{help}</p>}
    </div>
  );
}

function ImageField({ settings, set, setPicking, k, label, help }: { settings: SeoSettings; set: SetFn; setPicking: (k: keyof SeoSettings) => void; k: keyof SeoSettings; label: string; help?: string }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        {settings[k]
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={settings[k]} alt="" className="h-12 w-auto rounded border border-slate-200 bg-slate-50" />
          : <div className="h-12 w-20 rounded border border-dashed border-slate-300 bg-slate-50" />}
        <button type="button" onClick={() => setPicking(k)} className="btn-secondary text-xs">Choose</button>
        {settings[k] && <button type="button" onClick={() => set(k, "")} className="text-xs text-slate-400 hover:text-red-600">Remove</button>}
      </div>
      {help && <p className="text-xs text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

export default function SeoPage() {
  const [settings, setSettings] = useState<SeoSettings>(seoDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("titles");
  const [picking, setPicking] = useState<null | keyof SeoSettings>(null);
  const [rules, setRules] = useState<RedirectRow[]>([]);
  const [draft, setDraft] = useState({ source: "", destination: "", type: 301 });
  const [ruleError, setRuleError] = useState("");
  const [misses, setMisses] = useState<NotFoundRow[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const loaded = { ...seoDefaults };
        for (const key of Object.keys(seoDefaults) as (keyof SeoSettings)[]) {
          if (d.settings?.[key]) loaded[key] = d.settings[key];
        }
        setSettings(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/redirects")
      .then((r) => r.json())
      .then((d) => setRules(d.redirects ?? []))
      .catch(() => {});

    fetch("/api/not-found-log")
      .then((r) => r.json())
      .then((d) => setMisses(d.entries ?? []))
      .catch(() => {});
  }, []);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    setRuleError("");
    const res = await fetch("/api/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (!res.ok) {
      setRuleError(data.error || "Could not save");
      return;
    }
    setRules((prev) => [data.redirect, ...prev.filter((r) => r.id !== data.redirect.id)]);
    setDraft({ source: "", destination: "", type: 301 });
  }

  /**
   * The reason a request was refused, or null when it went through. The
   * redirect routes refuse a rule that would loop or redirect the homepage —
   * a protection the list used to paper over by showing the edit as saved.
   */
  async function refusal(res: Response | null, fallback: string): Promise<string | null> {
    if (res?.ok) return null;
    const data = res ? await res.json().catch(() => ({})) : {};
    return (data as { error?: string }).error || fallback;
  }

  async function patchRule(id: number, patch: Partial<RedirectRow>) {
    // Shown at once, and put back if the server says no.
    const before = rules;
    setRuleError("");
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const res = await fetch(`/api/redirects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    const why = await refusal(res, "The redirect could not be saved.");
    if (why) {
      setRules(before);
      setRuleError(why);
    }
  }

  async function removeRule(id: number) {
    const before = rules;
    setRuleError("");
    setRules((prev) => prev.filter((r) => r.id !== id));
    const res = await fetch(`/api/redirects/${id}`, { method: "DELETE" }).catch(() => null);
    const why = await refusal(res, "The redirect could not be deleted.");
    if (why) {
      setRules(before);
      setRuleError(why);
    }
  }

  /** Sends a logged 404 straight into the redirect form on the other tab. */
  function redirectFromMiss(path: string) {
    setDraft({ source: path, destination: "", type: 301 });
    setTab("redirects");
  }

  async function clearMiss(id?: number) {
    const before = misses;
    if (id) setMisses((prev) => prev.filter((m) => m.id !== id));
    else setMisses([]);
    const res = await fetch(`/api/not-found-log${id ? `?id=${id}` : ""}`, { method: "DELETE" }).catch(() => null);
    const why = await refusal(res, "The 404 log could not be cleared.");
    if (why) {
      // Back as it was: the entries are still there.
      setMisses(before);
      window.alert(why);
    }
  }

  const set = (k: keyof SeoSettings, v: string) => setSettings((p) => ({ ...p, [k]: v }));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "SEO settings could not be saved. Try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <>
        <Header title="SEO" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading SEO settings…
        </div>
      </>
    );
  }

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <>
      <Header title="SEO" />
      <div className="p-8 max-w-4xl">
        <div className="flex gap-1 border-b border-slate-200 mb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm rounded-t-lg border border-b-0 -mb-px transition-colors",
                tab === t.id ? "bg-white border-slate-200 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-6">{current.hint}</p>

        <form onSubmit={save} className="space-y-6">
          {tab === "titles" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Separator</h2>
                <div className="flex gap-2">
                  {["-", "–", "—", "|", "•", "·", "/"].map((sep) => (
                    <button
                      key={sep}
                      type="button"
                      onClick={() => set("seo_separator", sep)}
                      className={cn(
                        "w-10 h-10 rounded-lg border text-sm transition-colors",
                        settings.seo_separator === sep ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 hover:border-brand-400"
                      )}
                    >
                      {sep}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">Used wherever a template contains <code className="font-mono">%sep%</code>.</p>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Homepage</h2>
                <Template settings={settings} set={set} k="seo_home_title" label="Title" />
                <Template settings={settings} set={set} k="seo_home_description" label="Meta description" />
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Posts</h2>
                <Template settings={settings} set={set} k="seo_post_title" label="Title" help="A post's own SEO title overrides this" />
                <Template settings={settings} set={set} k="seo_post_description" label="Meta description" />
                <Toggle settings={settings} set={set} k="seo_post_noindex" label="Tell search engines not to index posts" help="Leave off unless you know you want posts hidden." />
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Pages</h2>
                <Template settings={settings} set={set} k="seo_page_title" label="Title" />
                <Template settings={settings} set={set} k="seo_page_description" label="Meta description" />
                <Toggle settings={settings} set={set} k="seo_page_noindex" label="Tell search engines not to index pages" />
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Categories &amp; other archives</h2>
                <Template settings={settings} set={set} k="seo_category_title" label="Category title" />
                <Template settings={settings} set={set} k="seo_category_description" label="Category description" />
                <Toggle settings={settings} set={set} k="seo_category_noindex" label="Tell search engines not to index category pages" />
                <Toggle settings={settings} set={set} k="seo_category_base_removed" label="Remove the /category/ base from URLs" help="/category/news becomes /news, like Rank Math's setting. The old address redirects. A category and a page with the same slug cannot coexist — the page wins." />
                <div className="h-px bg-slate-100 my-4" />
                <Template settings={settings} set={set} k="seo_tag_title" label="Tag title" />
                <Template settings={settings} set={set} k="seo_tag_description" label="Tag description" />
                <Toggle settings={settings} set={set} k="seo_tag_noindex" label="Tell search engines not to index tag pages" />
                <div className="h-px bg-slate-100 my-4" />
                <Template settings={settings} set={set} k="seo_author_title" label="Author title" help="%name% is the author's name" />
                <Template settings={settings} set={set} k="seo_author_description" label="Author description" help="Empty falls back to the author's bio" />
                <div className="h-px bg-slate-100 my-4" />
                <Toggle settings={settings} set={set} k="seo_paginated_noindex" label="Tell search engines not to index page 2 onwards of any listing" help="Off by default: Google handles pagination fine, and a noindexed page 2 hides the posts linked only from it." />
                <div className="h-px bg-slate-100 my-4" />
                <Template settings={settings} set={set} k="seo_search_title" label="Search results title" />
                <Toggle settings={settings} set={set} k="seo_search_noindex" label="Tell search engines not to index search results" help="Recommended — search pages are thin content." />
                <div className="h-px bg-slate-100 my-4" />
                <Template settings={settings} set={set} k="seo_404_title" label="404 page title" />
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Links in content</h2>
                <p className="text-xs text-slate-400 mb-4">
                  Links typed into a paragraph have no per-link settings, so this decides what every link that
                  leaves the site gets. Buttons, Download Boxes and the Info Box keep their own choice.
                </p>
                <Toggle settings={settings} set={set} k="seo_nofollow_external" label="Add rel=&quot;nofollow&quot; to external links in content"
                  help="Like Rank Math's setting of the same name. Off, an outbound link an author pastes passes full PageRank; on, it does not. Links to this site are never affected." />
                {settings.seo_nofollow_external === "true" && (
                  <div className="ml-[46px] mb-3">
                    <label className="label">Except these domains</label>
                    <textarea className="input max-w-md font-mono text-xs" rows={3} value={settings.seo_nofollow_exclude}
                      onChange={(e) => set("seo_nofollow_exclude", e.target.value)} placeholder={"play.google.com\napps.apple.com"} />
                    <p className="mt-1 text-[11px] text-slate-400">One per line. Links to these stay followed.</p>
                  </div>
                )}
                <Toggle settings={settings} set={set} k="seo_external_new_tab" label="Open external links in content in a new tab" />
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-3">Available variables</h2>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  {SEO_VARIABLES.map((v) => (
                    <div key={v.token} className="flex items-baseline gap-2 text-xs">
                      <code className="font-mono text-brand-700 shrink-0">{v.token}</code>
                      <span className="text-slate-500">{v.label}</span>
                      <span className="text-slate-300 ml-auto shrink-0">{v.scope}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "webmaster" && (
            <div className="card p-5">
              <h2 className="font-semibold text-sm mb-1">Site verification</h2>
              <p className="text-xs text-slate-400 mb-5">
                Each service gives you a meta tag like{" "}
                <code className="text-[11px]">&lt;meta name=&quot;google-site-verification&quot; content=&quot;abc123&quot;&gt;</code>.
                Paste only the <strong>content</strong> value. The tag is added to every page&rsquo;s head; the
                rest of the tag is not needed and is stripped if you paste it anyway.
              </p>
              {([
                ["seo_verify_google", "Google Search Console", "google-site-verification"],
                ["seo_verify_bing", "Bing Webmaster Tools", "msvalidate.01"],
                ["seo_verify_yandex", "Yandex Webmaster", "yandex-verification"],
                ["seo_verify_pinterest", "Pinterest", "p:domain_verify"],
              ] as const).map(([k, label, tag]) => (
                <div key={k} className="mb-4">
                  <label className="label">{label}</label>
                  <input
                    className="input font-mono text-xs"
                    value={settings[k]}
                    onChange={(e) => set(k, extractVerificationToken(e.target.value))}
                    placeholder={`content value of <meta name="${tag}">`}
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
          )}

          {tab === "social" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Knowledge graph</h2>
                <p className="text-xs text-slate-400 mb-4">
                  Tells search engines who publishes this site. Output as Organization or Person schema on every page.
                </p>
                <div className="mb-4">
                  <label className="label">This site represents</label>
                  <div className="flex gap-2">
                    {[["organization", "An organisation"], ["person", "A person"]].map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => set("seo_kg_type", v)}
                        className={cn(
                          "px-4 py-2 rounded-lg border text-sm transition-colors",
                          settings.seo_kg_type === v ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 hover:border-brand-400"
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="label">Name</label>
                  <input className="input" value={settings.seo_kg_name} onChange={(e) => set("seo_kg_name", e.target.value)} placeholder="Defaults to your site name" />
                </div>
                <ImageField settings={settings} set={set} setPicking={setPicking} k="seo_kg_logo" label="Logo" help="Square works best. Used in the publisher schema." />
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Sharing defaults</h2>
                <ImageField settings={settings} set={set} setPicking={setPicking} k="seo_og_default_image" label="Default share image" help="Used when a post has no OG image of its own. 1200×630 is the safe size." />
                <div>
                  <label className="label">Twitter card type</label>
                  <select className="input max-w-xs" value={settings.seo_twitter_card} onChange={(e) => set("seo_twitter_card", e.target.value)}>
                    <option value="summary_large_image">Large image</option>
                    <option value="summary">Summary</option>
                  </select>
                </div>
                <div className="mt-4">
                  <label className="label">X / Twitter handle</label>
                  <input className="input max-w-xs" value={settings.seo_twitter_site} onChange={(e) => set("seo_twitter_site", e.target.value)} placeholder="@yoursite" />
                  <p className="mt-1 text-[11px] text-slate-400">Emitted as <code>twitter:site</code>. An author&apos;s own handle (on their profile) becomes <code>twitter:creator</code> on their posts.</p>
                </div>
                <div>
                  <label className="label">Facebook page URL</label>
                  <input className="input max-w-md" value={settings.seo_fb_page} onChange={(e) => set("seo_fb_page", e.target.value)} placeholder="https://www.facebook.com/yourpage" />
                  <p className="mt-1 text-[11px] text-slate-400">Emitted as <code>article:publisher</code> on every post, so Facebook ties shares to your page.</p>
                  <p className="mt-1 text-[11px] text-slate-400">Shown as the source on shared links (twitter:site). Optional.</p>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Social profiles</h2>
                <p className="text-xs text-slate-400 mb-4">
                  Linked into the Organization/Person schema above (as <code className="font-mono">sameAs</code>, what
                  Google uses to connect your site to these accounts) and shown as icons in the header/footer&rsquo;s
                  Social element.
                </p>
                {([
                  ["social_facebook", "Facebook", "https://facebook.com/yourpage"],
                  ["social_twitter", "X / Twitter", "https://x.com/yourhandle"],
                  ["social_instagram", "Instagram", "https://instagram.com/yourhandle"],
                  ["social_linkedin", "LinkedIn", "https://linkedin.com/company/yourpage"],
                ] as const).map(([k, label, placeholder]) => (
                  <div key={k} className="mb-4 last:mb-0">
                    <label className="label">{label}</label>
                    <input className="input" value={settings[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "sitemap" && (
            <div className="card p-5">
              <div className="mb-5 flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <input id="indexnow" type="checkbox" className="mt-0.5" checked={settings.seo_indexnow_enabled !== "false"}
                  onChange={(e) => set("seo_indexnow_enabled", e.target.checked ? "true" : "false")} />
                <label htmlFor="indexnow" className="text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-800">Notify search engines instantly (IndexNow)</span><br />
                  When a post or page is published or changed, Bing, Yandex and the other IndexNow engines are told
                  right away instead of waiting for their next crawl. Google is not part of IndexNow and reads the
                  sitemap. Nothing to set up — the key is created and served automatically.
                </label>
              </div>
              <h2 className="font-semibold text-sm mb-4">Sitemap</h2>
              <Toggle settings={settings} set={set} k="seo_sitemap_enabled" label="Enable /sitemap_index.xml" />
              <div className="h-px bg-slate-100 my-4" />
              <Toggle settings={settings} set={set} k="seo_sitemap_posts" label="Include posts" />
              <Toggle settings={settings} set={set} k="seo_sitemap_pages" label="Include pages" />
              <Toggle settings={settings} set={set} k="seo_sitemap_categories" label="Include category pages" />
              <Toggle settings={settings} set={set} k="seo_sitemap_tags" label="Include tag pages" />
              <Toggle settings={settings} set={set} k="seo_sitemap_images" label="Include featured images" />
              {/* "Entries per sitemap" was a number input that nothing read —
                  it promised the sitemap would be split, and it never was.
                  Splitting matters at Google's limit of 50,000 URLs, which this
                  site is nowhere near, so the honest thing is to say so rather
                  than keep a control that does nothing. */}
              <p className="mt-4 text-xs leading-relaxed text-slate-400">
                Everything goes in one sitemap. Google accepts up to 50,000 URLs per file, so
                splitting is only worth building if this site ever approaches that.
              </p>
            </div>
          )}

          {tab === "redirects" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Automatic redirects</h2>
                <Toggle settings={settings} set={set}
                  k="seo_auto_redirect"
                  label="Redirect the old URL when a post or page slug changes"
                  help="Recommended. Without this, renaming a slug breaks every existing link to it."
                />
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Add a redirect</h2>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="label">From</label>
                    <input className="input font-mono text-xs" value={draft.source} placeholder="/old-post"
                      onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="label">To</label>
                    <input className="input font-mono text-xs" value={draft.type === 410 ? "" : draft.destination} placeholder={draft.type === 410 ? "No destination: the page is gone" : "/new-post"} disabled={draft.type === 410}
                      onChange={(e) => setDraft({ ...draft, destination: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Type</label>
                    <select className="input w-28" value={draft.type}
                      onChange={(e) => setDraft({ ...draft, type: parseInt(e.target.value) })}>
                      <option value={301}>301</option>
                      <option value={302}>302</option>
                            <option value={410}>410 Gone</option>
                    </select>
                  </div>
                  <button type="button" onClick={addRule} className="btn-secondary inline-flex items-center gap-1.5">
                    <Plus size={14} /> Add
                  </button>
                </div>
                {ruleError && <p className="text-xs text-red-600 mt-2">{ruleError}</p>}
                <p className="text-xs text-slate-400 mt-2">
                  301 is permanent and passes ranking on; 302 is temporary; 410 says the page is removed for good, so search engines drop it fast. Paths match without
                  trailing slashes or case. New rules go live within about ten seconds.
                </p>
              </div>

              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2.5 font-semibold text-slate-600">From</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-600">To</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-600 w-28">Type</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-600 w-16">Hits</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-600 w-20">Active</th>
                      <th className="px-4 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No redirects yet.</td></tr>
                    )}
                    {rules.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-4 py-2.5 font-mono text-xs">{r.source}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{r.type === 410 ? <span className="text-slate-400">— gone —</span> : r.destination}</td>
                        <td className="px-4 py-2.5">
                          <select className="input py-1 text-xs w-24" value={r.type}
                            onChange={(e) => patchRule(r.id, { type: parseInt(e.target.value) })}>
                            <option value={301}>301</option>
                            <option value={302}>302</option>
                            <option value={410}>410 Gone</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{r.hits}</td>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" className="w-4 h-4 rounded border-slate-300" checked={r.enabled}
                            onChange={(e) => patchRule(r.id, { enabled: e.target.checked })} />
                        </td>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => removeRule(r.id)} className="text-slate-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "notfound" && (
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <p className="text-xs text-slate-500">
                  Paths visitors requested that don&apos;t exist. Turn the common ones into redirects.
                </p>
                {misses.length > 0 && (
                  <button type="button" onClick={() => clearMiss()} className="text-xs text-slate-400 hover:text-red-600 shrink-0">
                    Clear all
                  </button>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2.5 font-semibold text-slate-600">Path</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600">Came from</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-600 w-16">Hits</th>
                    <th className="px-4 py-2.5 w-36" />
                  </tr>
                </thead>
                <tbody>
                  {misses.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nothing logged yet.</td></tr>
                  )}
                  {misses.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-mono text-xs">{m.path}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-[220px]">{m.referrer || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{m.hits}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button type="button" onClick={() => redirectFromMiss(m.path)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                          Redirect →
                        </button>
                        <button type="button" onClick={() => clearMiss(m.id)} className="ml-3 text-slate-400 hover:text-red-600 align-middle">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "local" && (
            <div className="card p-5">
              <h2 className="font-semibold text-sm mb-1">Local business</h2>
              <p className="text-xs text-slate-400 mb-5">
                For a site that is a shop, clinic, restaurant, agency — anything with an address. Adds a{" "}
                <strong>LocalBusiness</strong> schema to every page (what Google&rsquo;s map and knowledge panels read) and
                feeds the <strong>Business Info</strong> block, which prints these details wherever you place it.
              </p>
              <label className="mb-5 flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={settings.local_enabled === "true"}
                  onChange={(e) => set("local_enabled", e.target.checked ? "true" : "false")} />
                <span className="text-sm font-medium text-slate-700">This site is a local business</span>
              </label>
              <div className={settings.local_enabled === "true" ? "" : "pointer-events-none opacity-50"}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label">Business type</label>
                    <select className="input" value={settings.local_type} onChange={(e) => set("local_type", e.target.value)}>
                      {LOCAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Business name</label>
                    <input className="input" value={settings.local_name} onChange={(e) => set("local_name", e.target.value)} placeholder="Defaults to the site name" />
                  </div>
                </div>
                <h3 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Address</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="label">Street address</label>
                    <input className="input" value={settings.local_street} onChange={(e) => set("local_street", e.target.value)} />
                  </div>
                  <div><label className="label">City</label><input className="input" value={settings.local_city} onChange={(e) => set("local_city", e.target.value)} /></div>
                  <div><label className="label">State / region</label><input className="input" value={settings.local_region} onChange={(e) => set("local_region", e.target.value)} /></div>
                  <div><label className="label">Postal code</label><input className="input" value={settings.local_postal} onChange={(e) => set("local_postal", e.target.value)} /></div>
                  <div><label className="label">Country</label><input className="input" value={settings.local_country} onChange={(e) => set("local_country", e.target.value)} placeholder="e.g. FR" /></div>
                </div>
                <h3 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><label className="label">Phone</label><input className="input" value={settings.local_phone} onChange={(e) => set("local_phone", e.target.value)} placeholder="+33 1 23 45 67 89" /></div>
                  <div><label className="label">Email</label><input className="input" value={settings.local_email} onChange={(e) => set("local_email", e.target.value)} /></div>
                  <div><label className="label">Price range</label><input className="input" value={settings.local_price_range} onChange={(e) => set("local_price_range", e.target.value)} placeholder="$$ or 10–50 €" /></div>
                </div>
                <h3 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Map</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><label className="label">Latitude</label><input className="input" value={settings.local_lat} onChange={(e) => set("local_lat", e.target.value)} placeholder="48.8566" /></div>
                  <div><label className="label">Longitude</label><input className="input" value={settings.local_lng} onChange={(e) => set("local_lng", e.target.value)} placeholder="2.3522" /></div>
                  <div><label className="label">Google Maps link</label><input className="input" value={settings.local_map_url} onChange={(e) => set("local_map_url", e.target.value)} placeholder="https://maps.app.goo.gl/…" /></div>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Right-click the spot in Google Maps to copy its coordinates. Without them the map uses the address.</p>
                <h3 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Opening hours</h3>
                <HoursEditor value={settings.local_hours} onChange={(v) => set("local_hours", v)} />
              </div>
            </div>
          )}

          {tab === "robots" && (
            <div className="card p-5">
              <h2 className="font-semibold text-sm mb-2">robots.txt</h2>
              <p className="text-xs text-slate-400 mb-3">Served at <code className="font-mono">/robots.txt</code>. Your sitemap URL is appended automatically.</p>
              <textarea
                className="input font-mono text-xs"
                rows={12}
                value={settings.seo_robots_txt}
                onChange={(e) => set("seo_robots_txt", e.target.value)}
              />
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? "Saved" : "Save SEO Settings"}
          </button>
        </form>
      </div>

      {picking && (
        <MediaPicker
          onSelect={(url) => set(picking, url)}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

function HoursEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hours = parseHours(value);
  const set = (d: Day, patch: Partial<DayHours>) => onChange(JSON.stringify({ ...hours, [d]: { ...hours[d], ...patch } }));
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {DAYS.map((d) => (
        <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
          <span className="w-24 font-medium text-slate-700">{DAY_LABELS[d]}</span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={hours[d].closed} onChange={(e) => set(d, { closed: e.target.checked })} /> Closed
          </label>
          {!hours[d].closed && (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <input type="time" className="input w-auto py-1 text-xs" value={hours[d].open} onChange={(e) => set(d, { open: e.target.value })} />
              to
              <input type="time" className="input w-auto py-1 text-xs" value={hours[d].close} onChange={(e) => set(d, { close: e.target.value })} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
