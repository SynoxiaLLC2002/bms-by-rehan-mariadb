"use client";

import { useState, useEffect } from "react";
import { capSlug, toSlug } from "@/lib/utils";
import Header from "@/components/admin/Header";
import Link from "next/link";
import { Plus, Pencil, Trash2, Check, X, SlidersHorizontal, Eye } from "lucide-react";
import { contentLanguages, defaultContentLanguage, languageName } from "@/lib/locale";
import { categoryPath } from "@/lib/permalinks";
import TermTranslationCell from "@/components/admin/TermTranslationCell";

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /** Terms belong to a language, like the posts filed under them. */
  language: string;
  /** Shared by a term and the same term in another language. */
  translationGroup: number | null;
  /** The category's own "No index" (its SEO screen). */
  noIndex?: boolean | null;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  // Read from the settings endpoint rather than passed in: this screen is a
  // client component, and the language list is the only server value it needs.
  const [settings, setSettings] = useState<Record<string, string>>({});
  const languages = contentLanguages(settings);
  const defaultLang = defaultContentLanguage(settings);
  // SEO → "Tell search engines not to index category pages" covers every category.
  const allNoIndex = settings.seo_category_noindex === "true";

  const [form, setForm] = useState({ name: "", slug: "", description: "", language: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", slug: "", description: "" });

  async function fetchCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.categories);
    setLoading(false);
  }

  useEffect(() => {
    fetchCategories();
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.settings && setSettings(d.settings))
      .catch(() => {});
  }, []);

  // The form starts on the default language once settings arrive.
  useEffect(() => {
    setForm((f) => (f.language ? f : { ...f, language: defaultContentLanguage(settings) }));
  }, [settings]);

  // The server's own rule, so the preview is what gets saved: the old
  // a–z/0–9 preview blanked Arabic and Hindi names and turned "Café" into "caf".
  function autoSlug(name: string) {
    return capSlug(toSlug(name));
  }

  const [error, setError] = useState("");
  /** Throws the server's message when a request fails, so nothing looks saved that was not. */
  async function check(res: Response, fallback: string) {
    if (res.ok) return;
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || fallback);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await check(
        await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }),
        "Could not add the category."
      );
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setForm({ name: "", slug: "", description: "", language: form.language });
    fetchCategories();
  }

  async function handleUpdate(id: number) {
    setError("");
    try {
      await check(
        await fetch(`/api/categories/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        }),
        "Could not save the category."
      );
    } catch (err) {
      // The row stays open with what was typed, so it can be corrected.
      setError((err as Error).message);
      return;
    }
    setEditingId(null);
    fetchCategories();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this category? Posts in it will be uncategorized.")) return;
    setError("");
    try {
      await check(await fetch(`/api/categories/${id}`, { method: "DELETE" }), "Could not delete the category.");
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    fetchCategories();
  }

  return (
    <>
      <Header title="Categories" />
      <main className="flex-1 p-6">
        {error && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-red-600" aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Add form */}
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 text-sm mb-4">Add New Category</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value, slug: autoSlug(e.target.value) })}
                  placeholder="Category name"
                  required
                />
              </div>
              {languages.length > 1 && (
                <div>
                  <label className="label">Language</label>
                  <select
                    className="input"
                    value={form.language || defaultLang}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                  >
                    {languages.map((code) => (
                      <option key={code} value={code}>{languageName(code)}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    A category belongs to one language, like the posts filed under it. Only this
                    language&apos;s posts can use it, and it appears on that language&apos;s archive.
                  </p>
                </div>
              )}
              <div>
                <label className="label">Slug</label>
                <input
                  type="text"
                  className="input font-mono text-xs"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="category-slug"
                  required
                />
                {languages.length > 1 && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Slugs are unique per language, so a translation may reuse this one.
                  </p>
                )}
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                <Plus size={16} />
                Add Category
              </button>
            </form>
          </div>

          {/* Category list */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-sm">All Categories ({categories.length})</h2>
            </div>
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
            ) : categories.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No categories yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Slug</th>
                    {languages.length > 1 && (
                      <>
                        <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Language</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Translations</th>
                      </>
                    )}
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Search engines</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Description</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        {editingId === cat.id ? (
                          <input
                            type="text"
                            className="input py-1 text-xs"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        ) : (
                          <span className="font-medium text-slate-800">{cat.name}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        {editingId === cat.id ? (
                          <input
                            type="text"
                            className="input py-1 text-xs font-mono"
                            value={editForm.slug}
                            onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                          />
                        ) : (
                          <span className="text-slate-500 text-xs font-mono">{cat.slug}</span>
                        )}
                      </td>
                      {languages.length > 1 && (
                        <td className="px-5 py-3">
                          {/* Read-only here; the category's own screen has the
                              Language and Text Direction controls. */}
                          <span
                            className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                            title={languageName(cat.language)}
                          >
                            {cat.language}
                          </span>
                        </td>
                      )}
                      {languages.length > 1 && (
                        <td className="px-5 py-3">
                          {/* The same term in another language. The columns for
                              this were added and then read by nothing, so
                              "Recipes" and "Recettes" stayed unrelated. */}
                          <TermTranslationCell
                            kind="category"
                            id={cat.id}
                            language={cat.language}
                            languages={languages}
                            languageNames={Object.fromEntries(languages.map((c) => [c, languageName(c)]))}
                            initial={[]}
                          />
                        </td>
                      )}
                      <td className="px-5 py-3">
                        {/* The same rule the archive page uses for its robots tag (termRobots). */}
                        <Link
                          href={`/admin/categories/${cat.id}`}
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            cat.noIndex || allNoIndex ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                          }`}
                          title={
                            cat.noIndex
                              ? "No index: set on this category (its SEO settings)"
                              : allNoIndex
                                ? "No index: SEO → category pages are set to no index for the whole site"
                                : "Index: search engines may show this category page"
                          }
                        >
                          {cat.noIndex || allNoIndex ? "No index" : "Index"}
                        </Link>
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell text-slate-500 text-xs">
                        {editingId === cat.id ? (
                          <input
                            type="text"
                            className="input py-1 text-xs"
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          />
                        ) : (
                          cat.description ?? "—"
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {editingId === cat.id ? (
                            <>
                              <button onClick={() => handleUpdate(cat.id)} className="btn-ghost p-1.5 text-green-600">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="btn-ghost p-1.5 text-slate-400">
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Quick rename stays inline — it is the common
                                  edit and worth one click. Everything else the
                                  term carries lives on its own screen. */}
                              <button
                                onClick={() => { setEditingId(cat.id); setEditForm({ name: cat.name, slug: cat.slug, description: cat.description ?? "" }); }}
                                className="btn-ghost p-1.5"
                                title="Quick rename"
                              >
                                <Pencil size={14} />
                              </button>
                              {/* The live archive. Built through `categoryPath`
                                  so it carries the language prefix — a French
                                  category lives at `/fr/category/…`, and a
                                  hand-built `/category/…` would 404. */}
                              <a
                                href={categoryPath(cat.slug, cat.language, settings)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-ghost p-1.5"
                                title="View this category on the site"
                              >
                                <Eye size={14} />
                              </a>
                              <Link
                                href={`/admin/categories/${cat.id}`}
                                className="btn-ghost p-1.5"
                                title="Settings, category page and SEO"
                              >
                                <SlidersHorizontal size={14} />
                              </Link>
                              <button onClick={() => handleDelete(cat.id)} className="btn-ghost p-1.5 text-red-400 hover:text-red-600">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
