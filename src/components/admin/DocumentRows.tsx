"use client";

// One row per document, with its other languages folded underneath it.
//
// The list used to be filtered by a language tab strip: you picked English, saw
// the English pages, picked French, saw the French ones. That hides the thing
// you actually want to know — which pages exist in which languages, and which
// are missing — behind a click, and it makes "the same page" look like several
// unrelated rows.
//
// So the tabs are gone. Each row is a document; if it has translations, a
// chevron opens them and each is editable in place. If a language is missing,
// "Add language" creates a blank draft in it, already linked.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Eye, Home, Languages, Loader2, Pencil, Plus, Search } from "lucide-react";
import DeleteButton from "@/components/admin/DeleteButton";
import DuplicateButton from "@/components/admin/DuplicateButton";

export interface DocVersion {
  id: number;
  title: string;
  status: string;
  language: string;
  /** Public URL, resolved server-side by the permalink helpers. */
  path: string;
  /** Pre-formatted; the list never does date maths. */
  date: string;
  /** The same date as a timestamp, for sorting — the text sorts by month name. */
  sortAt?: number;
  /** When a published document goes (or went) live, for the Scheduled filter. */
  publishAt?: number;
  /** Posts only, for the category filter. */
  categoryId?: number | null;
  isHome: boolean;
  /**
   * Whether this document tells search engines to stay away.
   *
   * Shown as its own column because it is invisible everywhere else: a page
   * set to noindex looks completely normal in the editor and in the listing,
   * and the only way to find out was to open the SEO panel one document at a
   * time — or to notice, months later, that it never ranked.
   */
  noIndex?: boolean;
  /**
   * What the second column shows when the list wants something other than the
   * URL — the category, for posts. Supplied by the list rather than decided
   * here, so one component serves both tables.
   */
  meta?: string;
}

export interface DocGroup {
  key: string;
  primary: DocVersion;
  /** Every version including the primary, in configured-language order. */
  versions: DocVersion[];
  /** Configured languages this group has no document in. */
  missing: string[];
}

export default function DocumentRows({
  kind,
  groups,
  languageNames,
  multilingual,
  allLanguages,
  configured,
  trashed = false,
}: {
  kind: "post" | "page";
  groups: DocGroup[];
  languageNames: Record<string, string>;
  /** With one language configured this behaves exactly as the old flat list. */
  multilingual: boolean;
  /** Every language the picker knows about, not only the configured ones. */
  allLanguages: { code: string; label: string }[];
  /**
   * Rendering the Trash view.
   *
   * Restore and Delete-permanently replace the ordinary delete. Permanent
   * deletion exists only here, which is what keeps the irreversible action out
   * of reach of an ordinary mis-click on the main list.
   */
  trashed?: boolean;
  /** Which of those the site currently publishes in. */
  configured: string[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const editBase = `/admin/${kind === "post" ? "posts" : "pages"}`;
  // The eye opens what there is to see: the public address once a document is
  // published, its preview until then. A draft's public address is a 404, so
  // the button used to look broken on exactly the documents still being checked.
  const viewHref = (v: { id: number; status: string; path: string }) => (v.status === "published" ? v.path : `/preview/${kind}/${v.id}`);
  const viewTitle = (v: { status: string }) => (v.status === "published" ? "View" : "Preview draft");
  const apiBase = `/api/${kind === "post" ? "posts" : "pages"}`;

  // Bulk actions act on the row's leading version — the one the row shows.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const pageIds = groups.map((g) => g.primary.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Runs one action over the selection, one document at a time, through the
   * same endpoints the single-row buttons use — so every rule a single save
   * applies (revisions, cache purges, redirects, permissions) applies here too.
   */
  async function runBulk(action: "publish" | "draft" | "trash" | "restore" | "permanent") {
    const ids = [...selected];
    if (ids.length === 0) return;
    const noun = `${ids.length} ${kind === "post" ? "post" : "page"}${ids.length === 1 ? "" : "s"}`;
    const ask = {
      publish: `Publish ${noun}?`,
      draft: `Switch ${noun} to draft? They leave the live site.`,
      trash: `Move ${noun} to the trash? You can restore them afterwards.`,
      restore: "",
      permanent: `Delete ${noun} permanently? This cannot be undone.`,
    }[action];
    if (ask && !window.confirm(ask)) return;
    setBulkBusy(true);
    let failed = 0;
    for (const id of ids) {
      const req =
        action === "publish" || action === "draft"
          ? fetch(`${apiBase}/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: action === "publish" ? "published" : "draft" }),
            })
          : fetch(`${apiBase}/${id}${action === "restore" ? "?restore=1" : action === "permanent" ? "?permanent=1" : ""}`, {
              method: "DELETE",
            });
      const res = await req.catch(() => null);
      if (!res?.ok) failed++;
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failed) window.alert(`${failed} of ${ids.length} could not be changed. The others were.`);
    router.refresh();
  }

  async function addLanguage(sourceId: number, language: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/translations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sourceId, language }),
      });
      const data = await res.json();
      // Straight into the new document: it is blank, so there is nothing to see
      // in the list and everything to do in the editor.
      if (res.ok) router.push(`${editBase}/${data.id}`);
      // That language already exists in this group: open it rather than fail.
      else if (res.status === 409 && data.id) router.push(`${editBase}/${data.id}`);
      else {
        setBusy(null);
        window.alert(data.error || "The translation could not be created.");
      }
    } catch {
      setBusy(null);
    }
  }

  /** Quiet when indexable, loud when not — noindex is the exceptional state. */
  const indexPill = (noIndex?: boolean) =>
    noIndex
      ? "text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800"
      : "text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500";

  const statusPill = (status: string) =>
    `text-xs px-2 py-0.5 rounded-full font-medium ${
      status === "published" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
    }`;

  const bulkBtn = "rounded px-2 py-1 text-xs font-medium ring-1 ring-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50";

  return (
    <>
      {groups.length > 0 && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-5 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={() => setSelected(allOnPage ? new Set() : new Set(pageIds))}
                  aria-label="Select every row on this page"
                />
                {selected.size > 0 ? `${selected.size} selected` : "Select all"}
              </label>
              {selected.size > 0 && (
                <>
                  {trashed ? (
                    <>
                      <button type="button" disabled={bulkBusy} onClick={() => runBulk("restore")} className={`${bulkBtn} text-emerald-700`}>Restore</button>
                      <button type="button" disabled={bulkBusy} onClick={() => runBulk("permanent")} className={`${bulkBtn} text-red-600`}>Delete permanently</button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={bulkBusy} onClick={() => runBulk("publish")} className={`${bulkBtn} text-slate-700`}>Publish</button>
                      <button type="button" disabled={bulkBusy} onClick={() => runBulk("draft")} className={`${bulkBtn} text-slate-700`}>Switch to draft</button>
                      <button type="button" disabled={bulkBusy} onClick={() => runBulk("trash")} className={`${bulkBtn} text-red-600`}>Move to trash</button>
                    </>
                  )}
                  {bulkBusy && <Loader2 size={14} className="animate-spin" />}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
      {groups.map((g) => {
        const others = g.versions.filter((v) => v.id !== g.primary.id);
        const isOpen = !!open[g.key];
        // Something to add as long as any known language is not yet used here.
        const canAdd = allLanguages.length > g.versions.length;
        return (
          <RowFragment key={g.key}>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-5 py-3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selected.has(g.primary.id)}
                    onChange={() => toggle(g.primary.id)}
                    aria-label={`Select ${g.primary.title || "untitled"}`}
                    className="mr-1"
                  />
                  {/* Always rendered, not only when translations exist. An
                      affordance that appears and disappears per row is one
                      nobody trusts, and its absence reads as "this page cannot
                      have other languages" rather than "it does not yet". With
                      none linked, opening it offers to make one. */}
                  {/* Not gated on the site already having two languages:
                      adding the second one is precisely what this opens. */}
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                      aria-expanded={isOpen}
                      title={
                        others.length > 0
                          ? isOpen
                            ? "Hide other languages"
                            : `Show ${others.length} other language${others.length === 1 ? "" : "s"}`
                          : "No other languages yet"
                      }
                      className={`-ml-1 rounded p-0.5 hover:bg-slate-100 hover:text-slate-700 ${
                        others.length > 0 ? "text-slate-400" : "text-slate-300"
                      }`}
                    >
                      <ChevronRight
                        size={14}
                        className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                    </button>
                  )}
                  <Link
                    href={`${editBase}/${g.primary.id}`}
                    className="font-medium text-slate-800 hover:text-brand-600"
                  >
                    {g.primary.title || "(untitled)"}
                  </Link>
                  {multilingual && others.length > 0 && (
                    <span
                      className="ml-1 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                      title={`Also in ${others.map((o) => languageNames[o.language] ?? o.language).join(", ")}`}
                    >
                      <Languages size={9} />
                      {others.length + 1}
                    </span>
                  )}
                </div>
              </td>
              <td className={`px-5 py-3 hidden md:table-cell text-slate-500 ${g.primary.meta === undefined ? "text-xs font-mono" : ""}`}>
                {g.primary.meta ?? g.primary.path}
                {g.primary.isHome && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white font-sans">
                    <Home size={9} />
                    Homepage
                  </span>
                )}
              </td>
              <td className="px-5 py-3 hidden lg:table-cell">
                <span className={statusPill(g.primary.status)}>{g.primary.status}</span>
              </td>
              <td className="px-5 py-3 hidden lg:table-cell">
                <span className={indexPill(g.primary.noIndex)}>
                  {g.primary.noIndex ? "noindex" : "index"}
                </span>
              </td>
              <td className="px-5 py-3 hidden lg:table-cell text-slate-500 text-xs">
                {g.primary.date}
              </td>
              <td className="px-5 py-3">
                <div className="relative flex items-center justify-end gap-1">
                  {canAdd && (
                    /* Opens the row rather than a floating menu. The menu was
                       absolutely positioned inside `.card overflow-hidden`, so
                       on a short table it was clipped and the button looked
                       dead — it fired, and the menu was drawn outside the box.
                       Expanding in place cannot be clipped, and it matches the
                       chevron, so there is one way to open a row, not two. */
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [g.key]: true }))}
                      disabled={busy === g.key}
                      title="Add this in another language"
                      className="btn-ghost p-1.5"
                    >
                      {busy === g.key ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Plus size={14} />
                      )}
                    </button>
                  )}
                  <Link href={viewHref(g.primary)} target="_blank" className="btn-ghost p-1.5" title={viewTitle(g.primary)}>
                    <Eye size={14} />
                  </Link>
                  <Link href={`${editBase}/${g.primary.id}`} className="btn-ghost p-1.5" title="Edit">
                    <Pencil size={14} />
                  </Link>
                  {!trashed && <DuplicateButton id={g.primary.id} type={kind === "post" ? "posts" : "pages"} />}
                  {trashed ? (
                    <>
                      <DeleteButton id={g.primary.id} type={kind === "post" ? "posts" : "pages"} mode="restore" />
                      <DeleteButton id={g.primary.id} type={kind === "post" ? "posts" : "pages"} mode="permanent" />
                    </>
                  ) : (
                    <DeleteButton id={g.primary.id} type={kind === "post" ? "posts" : "pages"} />
                  )}
                </div>
              </td>
            </tr>

            {isOpen && (
              <tr className="bg-slate-50/60">
                <td colSpan={5} className="px-5 py-3 pl-12">
                  <AddLanguagePicker
                    kind={kind}
                    present={new Set(g.versions.map((v) => v.language))}
                    allLanguages={allLanguages}
                    configured={configured}
                    busy={busy === g.key}
                    onPick={(code) => addLanguage(g.primary.id, code, g.key)}
                  />
                </td>
              </tr>
            )}

            {isOpen &&
              others.map((v) => (
                <tr key={v.id} className="bg-slate-50/60">
                  <td className="px-5 py-2 pl-12">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        {v.language}
                      </code>
                      <Link
                        href={`${editBase}/${v.id}`}
                        className="text-sm text-slate-700 hover:text-brand-600"
                      >
                        {v.title || "(untitled)"}
                      </Link>
                      <span className="text-[11px] text-slate-400">
                        {languageNames[v.language] ?? v.language}
                      </span>
                    </div>
                  </td>
                  <td className={`px-5 py-2 hidden md:table-cell text-slate-400 ${v.meta === undefined ? "text-xs font-mono" : ""}`}>
                    {v.meta ?? v.path}
                    {v.isHome && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white font-sans">
                        <Home size={9} />
                        Homepage
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 hidden lg:table-cell">
                    <span className={statusPill(v.status)}>{v.status}</span>
                  </td>
                  <td className="px-5 py-2 hidden lg:table-cell">
                    <span className={indexPill(v.noIndex)}>{v.noIndex ? "noindex" : "index"}</span>
                  </td>
                  <td className="px-5 py-2 hidden lg:table-cell text-slate-400 text-xs">{v.date}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={viewHref(v)} target="_blank" className="btn-ghost p-1.5" title={viewTitle(v)}>
                        <Eye size={14} />
                      </Link>
                      <Link href={`${editBase}/${v.id}`} className="btn-ghost p-1.5" title="Edit">
                        <Pencil size={14} />
                      </Link>
                      {!trashed && <DuplicateButton id={v.id} type={kind === "post" ? "posts" : "pages"} />}
                      {trashed ? (
                        <>
                          <DeleteButton id={v.id} type={kind === "post" ? "posts" : "pages"} mode="restore" />
                          <DeleteButton id={v.id} type={kind === "post" ? "posts" : "pages"} mode="permanent" />
                        </>
                      ) : (
                        <DeleteButton id={v.id} type={kind === "post" ? "posts" : "pages"} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </RowFragment>
        );
      })}
    </>
  );
}

/** A keyed fragment — `<tbody>` may not contain a wrapper element. */
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Pick a language to write this document in — including one the site does not
 * publish in yet.
 *
 * A fixed list of the configured languages made adding a *new* language a trip
 * to Settings and back, which is a strange detour when you are looking at the
 * document you want to translate. Searching the full table and adding on the
 * way through keeps it one action. The server still validates the code against
 * the same table, so this is a shortcut, not a hole.
 */
function AddLanguagePicker({
  kind,
  present,
  allLanguages,
  configured,
  busy,
  onPick,
}: {
  kind: "post" | "page";
  /** Languages this document already exists in — never offered. */
  present: Set<string>;
  allLanguages: { code: string; label: string }[];
  configured: string[];
  busy: boolean;
  onPick: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const configuredSet = new Set(configured);

  const term = q.trim().toLowerCase();
  const options = allLanguages
    .filter((l) => !present.has(l.code))
    .filter((l) => !term || l.label.toLowerCase().includes(term) || l.code.includes(term))
    // Languages the site already publishes in come first: they are the common
    // case, and adding a new one should be possible without being the default.
    .sort((a, b) => Number(configuredSet.has(b.code)) - Number(configuredSet.has(a.code)));

  if (allLanguages.length === present.size) {
    return (
      <p className="text-[11px] text-slate-400">
        This {kind} exists in every available language.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">
          {present.size <= 1 ? "Not in any other language yet." : "Add in:"}
        </span>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search languages…"
            disabled={busy}
            className="w-52 rounded-md border border-slate-200 bg-white py-1 pl-7 pr-2 text-[11px] outline-none focus:border-brand-500"
          />
        </div>
        {busy && <Loader2 size={12} className="animate-spin text-slate-400" />}
      </div>

      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {options.length === 0 ? (
          <span className="text-[11px] text-slate-400">No language matches “{q}”.</span>
        ) : (
          options.slice(0, 60).map((l) => {
            const isNew = !configuredSet.has(l.code);
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => onPick(l.code)}
                disabled={busy}
                title={isNew ? `Adds ${l.label} to this site's languages` : undefined}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ring-1 disabled:opacity-50 ${
                  isNew
                    ? "bg-white text-slate-600 ring-dashed ring-slate-300 hover:bg-slate-50"
                    : "bg-white text-brand-600 ring-slate-200 hover:bg-brand-50"
                }`}
              >
                <Plus size={11} className="inline" /> {l.label}
                {isNew && (
                  <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
                    New
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <p className="mt-1.5 text-[11px] text-slate-400">
        Creates a blank draft, already linked. Nothing is copied. A language marked
        <span className="mx-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
          New
        </span>
        is added to the site as well.
      </p>
    </div>
  );
}
