"use client";

import { useState, useEffect } from "react";
import { capSlug, toSlug } from "@/lib/utils";
import Header from "@/components/admin/Header";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { contentLanguages, defaultContentLanguage, languageName } from "@/lib/locale";
import TermTranslationCell from "@/components/admin/TermTranslationCell";

interface Tag {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /** Tags belong to a language, like the posts they are on. */
  language: string;
  /** Shared by a term and the same term in another language. */
  translationGroup: number | null;
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  // Read from the settings endpoint rather than passed in: this screen is a
  // client component, and the language list is the only server value it needs.
  const [settings, setSettings] = useState<Record<string, string>>({});
  const languages = contentLanguages(settings);
  const defaultLang = defaultContentLanguage(settings);

  const [form, setForm] = useState({ name: "", slug: "", description: "", language: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", slug: "", description: "" });

  async function fetchTags() {
    const res = await fetch("/api/tags");
    const data = await res.json();
    setTags(data.tags);
    setLoading(false);
  }

  useEffect(() => {
    fetchTags();
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.settings && setSettings(d.settings))
      .catch(() => {});
  }, []);

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
        await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, strict: true }),
        }),
        "Could not add the tag."
      );
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setForm({ name: "", slug: "", description: "", language: form.language });
    fetchTags();
  }

  async function handleUpdate(id: number) {
    setError("");
    try {
      await check(
        await fetch(`/api/tags/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        }),
        "Could not save the tag."
      );
    } catch (err) {
      // The row stays open with what was typed, so it can be corrected.
      setError((err as Error).message);
      return;
    }
    setEditingId(null);
    fetchTags();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this tag? It is removed from every post that uses it.")) return;
    setError("");
    try {
      await check(await fetch(`/api/tags/${id}`, { method: "DELETE" }), "Could not delete the tag.");
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    fetchTags();
  }

  return (
    <>
      <Header title="Tags" />
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
            <h2 className="font-semibold text-slate-900 text-sm mb-4">Add New Tag</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value, slug: autoSlug(e.target.value) })}
                  placeholder="Tag name"
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
                    A tag belongs to one language. Only that language&apos;s posts can carry it, and
                    it appears on that language&apos;s tag archive.
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
                  placeholder="tag-slug"
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
                Add Tag
              </button>
            </form>
          </div>

          {/* Tag list */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-sm">All Tags ({tags.length})</h2>
            </div>
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
            ) : tags.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No tags yet</div>
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
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Description</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tags.map((cat) => (
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
                          {/* Not editable: moving a tag between languages would
                              move it out from under every post carrying it. */}
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
                            kind="tag"
                            id={cat.id}
                            language={cat.language}
                            languages={languages}
                            languageNames={Object.fromEntries(languages.map((c) => [c, languageName(c)]))}
                            initial={[]}
                          />
                        </td>
                      )}
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
                              <button
                                onClick={() => { setEditingId(cat.id); setEditForm({ name: cat.name, slug: cat.slug, description: cat.description ?? "" }); }}
                                className="btn-ghost p-1.5"
                              >
                                <Pencil size={14} />
                              </button>
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
