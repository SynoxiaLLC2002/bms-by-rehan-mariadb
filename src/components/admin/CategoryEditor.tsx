"use client";

// Edit Category — everything a category can say about itself.
//
// A category used to be editable only as a row in a list: name, slug and a
// one-line description. That is the right shape for a rename and the wrong one
// for the eighteen settings a term actually carries, so those live here on a
// screen of their own, grouped the way an editor thinks about them — what the
// term *is*, how its archive *looks*, and how it appears in *search*.

import { useState } from "react";
import DocumentLanguagePanel from "@/components/admin/DocumentLanguagePanel";
import type { SiteSettings } from "@/lib/settings";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageIcon, Loader2, Trash2, X } from "lucide-react";
import MediaPicker from "@/components/admin/MediaPicker";
import { toSlug } from "@/lib/utils";

export interface CategoryRecord {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  language: string;
  direction: string | null;
  parentId: number | null;
  archiveColor: string | null;
  archiveHoverColor: string | null;
  headerImage: string | null;
  archiveColumns: string;
  archiveCardStyle: string;
  archiveDesign: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  focusKeyword: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  noIndex: boolean;
  noFollow: boolean;
  noArchive: boolean;
  noImageIndex: boolean;
  noSnippet: boolean;
}

/** The other terms in this language, for the parent picker. */
export interface ParentOption {
  id: number;
  name: string;
}

type Tab = "general" | "archive" | "seo";

export default function CategoryEditor({
  category,
  parents,
  archiveUrl,
  settings,
}: {
  category: CategoryRecord;
  parents: ParentOption[];
  /** The live archive, so "View" goes somewhere real. */
  archiveUrl: string;
  settings: SiteSettings;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState<null | "header" | "og">(null);

  const [f, setF] = useState({
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    language: category.language,
    direction: category.direction ?? "",
    parentId: category.parentId ? String(category.parentId) : "",
    archiveColor: category.archiveColor ?? "",
    archiveHoverColor: category.archiveHoverColor ?? "",
    headerImage: category.headerImage ?? "",
    archiveColumns: category.archiveColumns || "default",
    archiveCardStyle: category.archiveCardStyle || "default",
    // The colour overrides, held as a plain object while editing and sent as
    // JSON — the column stores only the keys that were actually given a value.
    archiveDesign: parseDesign(category.archiveDesign),
    seoTitle: category.seoTitle ?? "",
    seoDescription: category.seoDescription ?? "",
    focusKeyword: category.focusKeyword ?? "",
    canonicalUrl: category.canonicalUrl ?? "",
    ogTitle: category.ogTitle ?? "",
    ogDescription: category.ogDescription ?? "",
    ogImage: category.ogImage ?? "",
    noIndex: category.noIndex,
    noFollow: category.noFollow,
    noArchive: category.noArchive,
    noImageIndex: category.noImageIndex,
    noSnippet: category.noSnippet,
  });

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, parentId: f.parentId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save this category.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not save this category.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this category? Posts in it will be uncategorized.")) return;
    setError("");
    // Back to the list only when it is gone. The server refuses some deletes
    // with a reason (the default category cannot be deleted); the screen
    // used to leave anyway, and the category was simply still there.
    const res = await fetch(`/api/categories/${category.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError((data as { error?: string }).error || "This category could not be deleted.");
      return;
    }
    router.push("/admin/categories");
  }

  return (
    <main className="flex-1 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <Link href="/admin/categories" className="text-slate-400 hover:text-slate-700">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Edit Category</h1>
          <a
            href={archiveUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-slate-400 hover:text-slate-700"
          >
            View archive
          </a>
          <button
            onClick={remove}
            className="ml-auto flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>

        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {([["general", "General"], ["archive", "Archive"], ["seo", "SEO"]] as const).map(
            ([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  tab === id
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        <div className="card space-y-5 p-5">
          {tab === "general" && (
            <>
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={f.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setF((prev) => ({
                      ...prev,
                      name,
                      // Only while the slug still matches the old name, so a
                      // hand-written slug is never overwritten.
                      slug: prev.slug === toSlug(prev.name) ? toSlug(name) : prev.slug,
                    }));
                    setSaved(false);
                  }}
                />
                <p className="mt-1 text-[11px] text-slate-400">The name as it appears on your site.</p>
              </div>

              <div>
                <label className="label">Slug</label>
                <input className="input" value={f.slug} onChange={(e) => set("slug", e.target.value)} />
                <p className="mt-1 text-[11px] text-slate-400">
                  The URL-friendly version — lowercase, letters, numbers and hyphens.
                </p>
              </div>

              {/* The same two controls a page or post has. A category's archive
                  is a page of its own — it needs a language and a writing
                  direction of its own, not whatever the site default happens
                  to be. */}
              <DocumentLanguagePanel
                kind="category"
                language={f.language}
                direction={f.direction}
                settings={settings}
                onLanguage={(code) => set("language", code)}
                onDirection={(v) => set("direction", v)}
              />

              <div>
                <label className="label">Parent Category</label>
                <select
                  className="input"
                  value={f.parentId}
                  onChange={(e) => set("parentId", e.target.value)}
                >
                  <option value="">None</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Categories can nest. Only terms in this category&rsquo;s own language are offered —
                  a French category cannot sit under an English one.
                </p>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input min-h-[160px]"
                  value={f.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Introduce this section. Shown above the posts on this category page."
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Shown at the top of the archive, above the posts. Blank lines are kept, so this can
                  be several paragraphs.
                </p>
              </div>
            </>
          )}

          {tab === "archive" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Archive Color</label>
                  <ColorField value={f.archiveColor} onChange={(v) => set("archiveColor", v)} />
                  <p className="mt-1 text-[11px] text-slate-400">The category label on post cards.</p>
                </div>
                <div>
                  <label className="label">Archive Hover Color</label>
                  <ColorField
                    value={f.archiveHoverColor}
                    onChange={(v) => set("archiveHoverColor", v)}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">The same label, hovered.</p>
                </div>
              </div>

              <div>
                <label className="label">Header Background Image</label>
                <ImageField
                  value={f.headerImage}
                  onPick={() => setPicking("header")}
                  onClear={() => set("headerImage", "")}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Sits behind the title and description at the top of the archive.
                </p>
              </div>

              <div>
                <label className="label">Card Design</label>
                <div className="grid grid-cols-4 gap-2">
                  {["default", "classic", "elevated", "bordered", "overlay", "list", "minimal"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("archiveCardStyle", v)}
                      className={`rounded-lg border py-2 text-[11px] font-medium capitalize transition-colors ${
                        f.archiveCardStyle === v
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:border-brand-400"
                      }`}
                    >
                      {v === "default" ? "Default" : v}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  How the post cards look in this category&apos;s listing. Default follows
                  Appearance &rarr; Archive. List is always one card per row, so it ignores the
                  column count below.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-1 text-sm font-semibold text-slate-700">Colours</p>
                <p className="mb-4 text-[11px] text-slate-400">
                  For this category&apos;s archive only. Anything left blank follows
                  Appearance &rarr; Archive, where the same colours are set for every listing.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {DESIGN_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label className="label">{field.label}</label>
                      <ColorField
                        value={f.archiveDesign[field.key] ?? ""}
                        onChange={(v) => {
                          const next = { ...f.archiveDesign };
                          if (v) next[field.key] = v;
                          else delete next[field.key];
                          set("archiveDesign", next);
                        }}
                      />
                      {field.help && <p className="mt-1 text-[11px] text-slate-400">{field.help}</p>}
                    </div>
                  ))}
                  <div>
                    <label className="label">Card corner radius</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Inherit"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={f.archiveDesign.archive_card_radius ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, "");
                        const next = { ...f.archiveDesign };
                        if (v) next.archive_card_radius = v;
                        else delete next.archive_card_radius;
                        set("archiveDesign", next);
                      }}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">In pixels.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Archive Columns</label>
                <div className="grid grid-cols-5 gap-2">
                  {["default", "1", "2", "3", "4"].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set("archiveColumns", n)}
                      className={`rounded-lg border py-2 text-[11px] font-medium transition-colors ${
                        f.archiveColumns === n
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:border-brand-400"
                      }`}
                    >
                      {n === "default" ? "Default" : n}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Default follows Appearance &rarr; Archive. Anything else overrides it for this
                  category only.
                </p>
              </div>
            </>
          )}

          {tab === "seo" && (
            <>
              <div>
                <label className="label">SEO Title</label>
                <input
                  className="input"
                  value={f.seoTitle}
                  onChange={(e) => set("seoTitle", e.target.value)}
                  placeholder="Falls back to the category title template"
                />
              </div>

              <div>
                <label className="label">Meta Description</label>
                <textarea
                  className="input min-h-[80px]"
                  value={f.seoDescription}
                  onChange={(e) => set("seoDescription", e.target.value)}
                  placeholder="Falls back to the description above"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  {f.seoDescription.length} characters — around 155 is where Google truncates.
                </p>
              </div>

              <div>
                <label className="label">Focus Keyword</label>
                <input
                  className="input"
                  value={f.focusKeyword}
                  onChange={(e) => set("focusKeyword", e.target.value)}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Recorded for your own reference. It is not published in the page.
                </p>
              </div>

              <div>
                <label className="label">Canonical URL</label>
                <input
                  className="input"
                  value={f.canonicalUrl}
                  onChange={(e) => set("canonicalUrl", e.target.value)}
                  placeholder="Leave blank to point at this category page itself"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Only set this when this archive duplicates another URL. A wrong canonical removes
                  the page from search entirely, so blank is almost always right.
                </p>
              </div>

              <div>
                <label className="label">Robots</label>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {(
                    [
                      ["noIndex", "No Index"],
                      ["noFollow", "Nofollow"],
                      ["noArchive", "No category page"],
                      ["noImageIndex", "No Image Index"],
                      ["noSnippet", "No Snippet"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 py-1 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={f[k]}
                        onChange={(e) => set(k, e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {f.noIndex && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                    No Index keeps this archive out of search results entirely. Its posts stay
                    indexable — only this listing is hidden.
                  </p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-5">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Social preview
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="label">Social Title</label>
                    <input
                      className="input"
                      value={f.ogTitle}
                      onChange={(e) => set("ogTitle", e.target.value)}
                      placeholder="Falls back to the SEO title"
                    />
                  </div>
                  <div>
                    <label className="label">Social Description</label>
                    <textarea
                      className="input min-h-[70px]"
                      value={f.ogDescription}
                      onChange={(e) => set("ogDescription", e.target.value)}
                      placeholder="Falls back to the meta description"
                    />
                  </div>
                  <div>
                    <label className="label">Social Image</label>
                    <ImageField
                      value={f.ogImage}
                      onPick={() => setPicking("og")}
                      onClear={() => set("ogImage", "")}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : "Update"}
          </button>
          {saved && <span className="text-[11px] text-emerald-600">Saved.</span>}
        </div>
      </div>

      {picking && (
        <MediaPicker
          onSelect={(url) => {
            set(picking === "header" ? "headerImage" : "ogImage", url);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </main>
  );
}

/** A colour swatch with a text field, matching the Customizer's control. */
/** The stored JSON as an object the form can edit; {} when there is none. */
function parseDesign(raw: string | null | undefined): Record<string, string> {
  if (!raw || !raw.trim().startsWith("{")) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * The colours a category can set for its own archive.
 *
 * The keys are the Customizer's setting names on purpose: the same CSS builder
 * renders both, so a value here means exactly what it means there. Everything
 * left blank follows Appearance → Archive.
 */
const DESIGN_FIELDS: { key: string; label: string; help?: string }[] = [
  { key: "archive_header_bg", label: "Header band background", help: "The strip behind the title and description." },
  { key: "archive_title_color", label: "Title (H1) colour" },
  { key: "archive_desc_color", label: "Description colour" },
  { key: "archive_count_color", label: "Post count colour" },
  { key: "archive_body_bg", label: "Page background", help: "The strip the cards sit on, edge to edge." },
  { key: "archive_card_bg", label: "Card background" },
  { key: "archive_card_border", label: "Card border" },
  { key: "archive_card_title_color", label: "Card title" },
  { key: "archive_card_title_hover", label: "Card title (hover)" },
  { key: "archive_card_meta_color", label: "Card meta (author, date)" },
  { key: "archive_card_excerpt_color", label: "Card excerpt" },
  { key: "archive_card_more_color", label: "Card “Read more”" },
];

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="relative shrink-0">
        <span
          className="block h-9 w-9 cursor-pointer rounded-full border border-slate-300"
          style={
            value
              ? { backgroundColor: value }
              : {
                  backgroundImage:
                    "linear-gradient(45deg,transparent 45%,#cbd5e1 45%,#cbd5e1 55%,transparent 55%)",
                }
          }
        />
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <input
        className="input font-mono text-xs"
        value={value}
        placeholder="Inherit"
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="shrink-0 text-[11px] text-slate-400 hover:text-red-600"
        >
          Reset
        </button>
      )}
    </div>
  );
}

/** An image field: a thumbnail when set, a button when not. */
function ImageField({
  value,
  onPick,
  onClear,
}: {
  value: string;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-brand-400 hover:text-slate-700"
      >
        <ImageIcon size={14} /> Add image
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={value} alt="" className="h-16 w-28 rounded-lg border border-slate-200 object-cover" />
      <button type="button" onClick={onPick} className="text-[11px] text-brand-600 hover:underline">
        Replace
      </button>
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-600"
      >
        <X size={11} /> Remove
      </button>
    </div>
  );
}
