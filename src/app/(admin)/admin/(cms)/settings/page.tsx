"use client";

import { useState, useEffect, useRef } from "react";
import { PERMALINK_STRUCTURES } from "@/lib/permalinks";
import { DATE_FORMATS, LANGUAGES, TEXT_DIRECTIONS, TIME_ZONES, languageLabel } from "@/lib/locale";
import Header from "@/components/admin/Header";
import ImportPanel from "@/components/admin/ImportPanel";
import Link from "next/link";
import { Save, Check, Link2, Search, Paintbrush, ChevronRight, Loader2, Languages , Download } from "lucide-react";

interface Settings {
  site_name: string;
  site_description: string;
  site_url: string;
  hosting_panel_url: string;
  site_language: string;
  site_direction: string;
  admin_language: string;
  admin_direction: string;
  content_languages: string;
  date_format: string;
  site_timezone: string;
  permalink_structure: string;
  permalink_custom: string;
  sitemap_enabled: string;
  sitemap_include_posts: string;
  sitemap_include_pages: string;
  robots_txt: string;
}

const DEFAULT_ROBOTS = `User-agent: *
Allow: /
Disallow: /admin$
Disallow: /admin/
Disallow: /api/`;

const defaults: Settings = {
  site_name: "",
  site_description: "",
  site_url: "",
  hosting_panel_url: "",
  site_language: "en",
  site_direction: "auto",
  admin_language: "en",
  admin_direction: "auto",
  content_languages: "en",
  date_format: "medium",
  site_timezone: "UTC",
  permalink_structure: "post-name",
  permalink_custom: "/%year%/%monthnum%/%postname%/",
  sitemap_enabled: "true",
  sitemap_include_posts: "true",
  sitemap_include_pages: "true",
  robots_txt: DEFAULT_ROBOTS,
};


export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [newLanguage, setNewLanguage] = useState("");

  // Stored as one ordered, comma-separated setting; the first entry is the
  // default. Parsed here so the list and the stored string cannot drift.
  const contentLanguageList = (settings.content_languages || "en")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const setContentLanguages = (codes: string[]) =>
    update("content_languages", Array.from(new Set(codes)).join(","));

  /** Promotes a language to default without disturbing the rest of the order. */
  const moveToFront = (codes: string[], code: string) => [code, ...codes.filter((c) => c !== code)];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings({ ...defaults, ...d.settings });
        setLoading(false);
      });
  }, []);

  // Keys edited on this screen. Save sends only these: it used to post the
  // whole table as loaded (every key, not just this screen's), reverting
  // anything saved elsewhere — Customizer, SEO, Speed — since it opened.
  const changedRef = useRef<Set<string>>(new Set());
  function update(key: keyof Settings, value: string) {
    changedRef.current.add(key);
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const keys = [...changedRef.current];
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(keys.map((k) => [k, (settings as unknown as Record<string, string>)[k] ?? ""]))),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "Settings could not be saved. Try again.");
      return;
    }
    for (const k of keys) changedRef.current.delete(k);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-6 flex items-center justify-center text-slate-400 text-sm">Loading…</main>
    </>
  );

  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-6">
        <form onSubmit={handleSave} className="max-w-2xl space-y-6">

          {/* Anything that changes how the site looks lives in the Customizer.
              These fields used to be duplicated here. */}
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <Paintbrush size={16} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm">Site identity, homepage &amp; scripts</h2>
                <p className="text-xs text-slate-500 mt-1">
                  The logo, favicon, what the homepage shows, posts per page, footer copyright
                  and analytics scripts are edited in the Customizer, where you can see the change
                  as you make it.
                </p>
                <Link href="/admin/customize" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 mt-2">
                  Open the Customizer <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          </div>

          {/* Site URL — technical, and the only General field that isn't visual */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-slate-900 text-sm">General</h2>

            {/* Name and tagline were reachable only from the Customizer, inside
                the header's *Logo* item — three levels deep, under a name that
                does not suggest it holds the site's name. They are not merely
                visual either: they are the `<title>` suffix, `og:site_name`,
                and the description every page falls back to. Same settings keys
                as the Customizer, so the two cannot disagree. */}
            <div>
              <label className="label">Site Name</label>
              <input
                type="text"
                className="input"
                value={settings.site_name}
                onChange={(e) => update("site_name", e.target.value)}
                placeholder="My Site"
              />
              <p className="text-xs text-slate-400 mt-1">
                Used in the browser tab, <code>og:site_name</code> on shared links, and the footer.
                Also editable in the Customizer, where you can see it in the header.
              </p>
            </div>
            <div>
              <label className="label">Tagline</label>
              <input
                type="text"
                className="input"
                value={settings.site_description}
                onChange={(e) => update("site_description", e.target.value)}
                placeholder="What this site is about"
              />
              <p className="text-xs text-slate-400 mt-1">
                One sentence. Search engines use it when a page has no description of its own, so
                a page with nothing written still gets a sensible snippet.
              </p>
            </div>
            <div>
              <label className="label">Site URL</label>
              <input type="url" className="input" value={settings.site_url} onChange={(e) => update("site_url", e.target.value)} placeholder="https://yoursite.com" />
              <p className="text-xs text-slate-400 mt-1">Used for canonical URLs, the sitemap and the RSS feed.</p>
            </div>
            <div>
              <label className="label">Hosting control panel</label>
              <input type="url" className="input" value={settings.hosting_panel_url} onChange={(e) => update("hosting_panel_url", e.target.value)} placeholder="https://yourhost.com:2083" />
              <p className="text-xs text-slate-400 mt-1">
                cPanel, Plesk or your host&apos;s dashboard. Site Health findings that are fixed there (environment variables, cron jobs, memory) link to it.
              </p>
            </div>
          </div>

          {/* Language & Region */}
          <div className="card p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Languages size={16} className="text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Language &amp; Region</h2>
            </div>

            {/* ── The published site ─────────────────────────────────── */}
            <div className="space-y-4">
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Public Site</h3>
                <p className="text-xs text-slate-400 mt-0.5">What your visitors get.</p>
              </div>

              <div>
                <label className="label">Site Language</label>
                <select
                  className="input"
                  value={settings.site_language || "en"}
                  onChange={(e) => update("site_language", e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{languageLabel(l)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Sets the page&apos;s <code>lang</code>, which screen readers use to pick pronunciation and search
                  engines use to tell who a page is for. It also decides how dates are written.
                </p>
              </div>

              <div>
                <label className="label">Text Direction</label>
                <div className="space-y-2">
                  {TEXT_DIRECTIONS.map((d) => (
                    <label
                      key={d.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        (settings.site_direction || "auto") === d.id
                          ? "border-brand-400 bg-brand-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="site_direction"
                        value={d.id}
                        checked={(settings.site_direction || "auto") === d.id}
                        onChange={() => update("site_direction", d.id)}
                        className="mt-0.5 text-brand-600"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800">{d.label}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{d.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Date Format</label>
                <select
                  className="input"
                  value={settings.date_format || "medium"}
                  onChange={(e) => update("date_format", e.target.value)}
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Written in the site language, so one choice reads correctly in each.
                </p>
              </div>

              <div>
                <label className="label">Time Zone</label>
                <select
                  className="input"
                  value={settings.site_timezone || "UTC"}
                  onChange={(e) => update("site_timezone", e.target.value)}
                >
                  {TIME_ZONES.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Decides which day a post published near midnight belongs to. Without it the answer depends on
                  where the reader happens to be.
                </p>
              </div>
            </div>

            {/* ── Content languages ──────────────────────────────────── */}
            <div id="languages" className="space-y-4 border-t border-slate-100 pt-5">
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Content Languages</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  The languages you publish in. Content is <strong>not shared</strong> between them — adding one
                  opens a separate set of posts and pages, it does not translate anything. The first is the default:
                  what new content is created in, and what the public site serves.
                </p>
              </div>

              <div className="space-y-2">
                {contentLanguageList.map((code, i) => {
                  const meta = LANGUAGES.find((l) => l.code === code);
                  return (
                    <div
                      key={code}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <span className="text-sm text-slate-800">
                        {meta ? languageLabel(meta) : code}
                      </span>
                      {i === 0 ? (
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Default
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setContentLanguages(moveToFront(contentLanguageList, code))}
                          className="text-[11px] text-slate-400 hover:text-slate-700"
                        >
                          Make default
                        </button>
                      )}
                      <span className="ml-auto flex items-center gap-3">
                        <code className="text-[11px] text-slate-400">{code}</code>
                        {contentLanguageList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setContentLanguages(contentLanguageList.filter((c) => c !== code))}
                            title="Remove this language"
                            className="text-[11px] text-slate-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="input flex-1"
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                >
                  <option value="">Add a language…</option>
                  {LANGUAGES.filter((l) => !contentLanguageList.includes(l.code)).map((l) => (
                    <option key={l.code} value={l.code}>{languageLabel(l)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!newLanguage}
                  onClick={() => {
                    if (!newLanguage) return;
                    setContentLanguages([...contentLanguageList, newLanguage]);
                    setNewLanguage("");
                  }}
                  className="btn-secondary disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Removing a language does not delete its posts — they stay in the database and reappear if it is added
                back. They simply stop being listed.
              </p>
            </div>

            {/* ── The CMS itself ─────────────────────────────────────── */}
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Admin Interface</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  What <em>you</em> get while working in here — separate from the site, because the people running a
                  site and the people reading it are rarely the same.
                </p>
              </div>

              <div>
                <label className="label">Interface Language</label>
                <select
                  className="input"
                  value={settings.admin_language || "en"}
                  onChange={(e) => update("admin_language", e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{languageLabel(l)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  <strong className="text-amber-600">Labels are not translated yet.</strong> This sets the admin&apos;s
                  reading direction and how dates are written in here; the buttons and headings stay in English until
                  translation files exist.
                </p>
              </div>

              <div>
                <label className="label">Interface Direction</label>
                <div className="space-y-2">
                  {TEXT_DIRECTIONS.map((d) => (
                    <label
                      key={d.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        (settings.admin_direction || "auto") === d.id
                          ? "border-brand-400 bg-brand-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="admin_direction"
                        value={d.id}
                        checked={(settings.admin_direction || "auto") === d.id}
                        onChange={() => update("admin_direction", d.id)}
                        className="mt-0.5 text-brand-600"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800">{d.label}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{d.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Permalinks */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Permalink Settings</h2>
            </div>
            <p className="text-xs text-slate-500">Choose the URL structure for your blog posts.</p>
            <div className="space-y-2">
              {PERMALINK_STRUCTURES.map((opt) => (
                <label key={opt.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settings.permalink_structure === opt.id ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="permalink"
                    value={opt.id}
                    checked={settings.permalink_structure === opt.id}
                    onChange={() => update("permalink_structure", opt.id)}
                    className="mt-0.5 text-brand-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                      {opt.example && (
                        <code className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-500">{opt.example}</code>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {settings.permalink_structure === "custom" && (
              <div>
                <label className="label">Custom Structure</label>
                <input
                  type="text"
                  className="input font-mono text-xs"
                  value={settings.permalink_custom}
                  onChange={(e) => update("permalink_custom", e.target.value)}
                  placeholder="/%year%/%monthnum%/%postname%/"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Available tags: <code className="bg-slate-100 px-1 rounded">%year%</code> <code className="bg-slate-100 px-1 rounded">%monthnum%</code> <code className="bg-slate-100 px-1 rounded">%day%</code> <code className="bg-slate-100 px-1 rounded">%postname%</code> <code className="bg-slate-100 px-1 rounded">%category%</code>
                </p>
              </div>
            )}
          </div>

          {/* SEO: Sitemap & Robots */}
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <Search size={16} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm">Sitemap &amp; robots.txt</h2>
                <p className="text-xs text-slate-500 mt-1">
                  These moved to the SEO screen, alongside title templates and schema.
                </p>
                <Link href="/admin/seo" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 mt-2">
                  Open SEO <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          </div>

          {/* Export.
              Outside the settings form on purpose — it is a download, not a
              setting, and putting a link inside a form invites saving when you
              meant to back up. */}
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <Download size={16} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 text-sm">Export content</h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Downloads every post, page, category, comment, menu and setting. Passwords and
                  two-factor secrets are never included — a backup ends up on laptops and in cloud
                  folders, which is no place for a credential.
                </p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  The <strong>.zip</strong> also contains your uploaded images. The{" "}
                  <strong>.json</strong> is the content only — smaller, readable, and enough if your
                  images are hosted elsewhere.
                </p>
                {/* A plain anchor, not `<Link>`: this is a file download, and
                    the response is served with `Content-Disposition:
                    attachment`. A client-side navigation would try to render
                    the JSON as a route instead of saving it, and would prefetch
                    a full database export on hover. */}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <a
                    href="/api/export?media=1"
                    download
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Download backup with images (.zip) <ChevronRight size={13} />
                  </a>
                  <a
                    href="/api/export"
                    download
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    Content only (.json)
                  </a>
                </div>
              </div>
            </div>
          </div>

          <ImportPanel />

          <button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? "Saved" : "Save Settings"}
          </button>
        </form>
      </main>
    </>
  );
}
