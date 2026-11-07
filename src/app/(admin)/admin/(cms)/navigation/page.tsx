"use client";
import { categoryPath, pagePath, postPath } from "@/lib/permalinks";
import type { SiteSettings } from "@/lib/settings";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/admin/Header";
import { cn } from "@/lib/utils";
import { MENU_LOCATIONS, locationKey } from "@/lib/menuLocations";
import { contentLanguages, defaultContentLanguage, languageName } from "@/lib/locale";
import { ChevronDown, GripVertical, Loader2, Plus, Save, Trash2, Check } from "lucide-react";

type ItemType = "page" | "post" | "category" | "custom";

interface MenuItem {
  key: string;
  label: string;
  url: string;
  target: string;
  objectType: ItemType;
  objectId: number | null;
  // Rich options — icon, sub-label, badge, highlight, mega menu
  icon?: string | null;
  description?: string | null;
  badge?: string | null;
  highlight?: string | null;
  megaMenu?: boolean;
  megaColumns?: number;
  children: MenuItem[];
}

interface Menu {
  id: number;
  name: string;
  autoAddPages: boolean;
  items: MenuItem[];
}

interface SourceRow { id: number; title?: string; name?: string; slug: string; language?: string; publishedAt?: string | null; createdAt?: string | null }

const TYPE_LABEL: Record<ItemType, string> = {
  page: "Page", post: "Post", category: "Category", custom: "Custom Link",
};

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

/** Flat rows from the API → the nested shape the editor works with. */
function toTree(rows: (MenuItem & { id: number; parentId: number | null })[]): MenuItem[] {
  const byId = new Map<number, MenuItem>();
  rows.forEach((r) => byId.set(r.id, { ...r, key: newKey(), children: [] }));
  const roots: MenuItem[] = [];
  rows.forEach((r) => {
    const node = byId.get(r.id)!;
    const parent = r.parentId != null ? byId.get(r.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

export default function MenusPage() {
  const [tab, setTab] = useState<"edit" | "locations">("edit");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [pages, setPages] = useState<SourceRow[]>([]);
  const [posts, setPosts] = useState<SourceRow[]>([]);
  const [cats, setCats] = useState<SourceRow[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  // Menu-location keys changed on this screen. Save sends only these — it
  // used to post the whole settings table as loaded, reverting anything
  // saved elsewhere since this screen opened.
  const changedRef = useRef<Set<string>>(new Set());
  const setLocation = (key: string, value: string) => {
    changedRef.current.add(key);
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const [openPanel, setOpenPanel] = useState<string | null>("pages");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Read from the settings this screen already loads, so the language list
  // needs no extra request.
  const languages = contentLanguages(settings);
  const defaultLang = defaultContentLanguage(settings);
  const [customLink, setCustomLink] = useState({ url: "https://", label: "" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [newMenuName, setNewMenuName] = useState("");

  const active = menus.find((m) => m.id === activeId) ?? null;

  useEffect(() => {
    Promise.all([
      fetch("/api/menus").then((r) => r.json()),
      fetch("/api/pages").then((r) => r.json()).catch(() => ({ pages: [] })),
      fetch("/api/posts").then((r) => r.json()).catch(() => ({ posts: [] })),
      fetch("/api/categories").then((r) => r.json()).catch(() => ({ categories: [] })),
      fetch("/api/settings").then((r) => r.json()).catch(() => ({ settings: {} })),
    ]).then(([m, p, po, c, st]) => {
      const list: Menu[] = (m.menus ?? []).map((x: Menu & { items: (MenuItem & { id: number; parentId: number | null })[] }) => ({
        ...x, items: toTree(x.items ?? []),
      }));
      setMenus(list);
      setActiveId(list[0]?.id ?? null);
      setPages(p.pages ?? []);
      setPosts(po.posts ?? []);
      setCats(c.categories ?? []);
      setSettings(st.settings ?? {});
      setLoading(false);
    });
  }, []);

  function patchActive(patch: Partial<Menu>) {
    setMenus((prev) => prev.map((m) => (m.id === activeId ? { ...m, ...patch } : m)));
  }

  async function createMenu() {
    const name = newMenuName.trim() || "New Menu";
    const res = await fetch("/api/menus", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert((data as { error?: string }).error || "The menu could not be created. Try again.");
      return;
    }
    const { menu } = await res.json();
    setMenus((prev) => [...prev, { ...menu, items: [] }]);
    setActiveId(menu.id);
    setNewMenuName("");
  }

  async function saveMenu() {
    if (!active) return;
    setSaving(true);
    const menuRes = await fetch(`/api/menus/${active.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: active.name, autoAddPages: active.autoAddPages, items: active.items }),
    }).catch(() => null);
    const keys = [...changedRef.current];
    const settingsRes = keys.length
      ? await fetch("/api/settings", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(keys.map((k) => [k, settings[k] ?? ""]))),
        }).catch(() => null)
      : null;
    setSaving(false);
    // "Saved" only when it was: both requests were fire-and-forget, so an
    // editor (refused by both) was told the menu had saved.
    if (!menuRes?.ok || (keys.length && !settingsRes?.ok)) {
      const res = !menuRes?.ok ? menuRes : settingsRes;
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "The menu could not be saved. Try again.");
      return;
    }
    for (const k of keys) changedRef.current.delete(k);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function deleteMenu() {
    if (!active) return;
    if (!confirm(`Delete “${active.name}” and its items? This cannot be undone.`)) return;
    // Off the screen only once it is off the site: the list used to drop the
    // menu whatever the server answered.
    const res = await fetch(`/api/menus/${active.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "The menu could not be deleted. Try again.");
      return;
    }
    const rest = menus.filter((m) => m.id !== active.id);
    setMenus(rest);
    setActiveId(rest[0]?.id ?? null);
  }

  // The real public path of each item — the permalink structure decides a
  // post's URL, a homepage answers at `/`, a French page is prefixed — rather
  // than a guessed `/blog/<slug>` that was wrong under every setting.
  function itemPath(kind: ItemType, r: SourceRow): string {
    const s = settings as SiteSettings;
    const language = r.language ?? "";
    if (kind === "post") return postPath({ id: r.id, slug: r.slug, language, publishedAt: r.publishedAt ? new Date(r.publishedAt) : null, createdAt: r.createdAt ? new Date(r.createdAt) : null }, s);
    if (kind === "page") return pagePath({ id: r.id, slug: r.slug, language }, s);
    if (kind === "category") return categoryPath(r.slug, r.language ?? "", s);
    return `/${r.slug}`;
  }

  function addChecked(kind: ItemType, rows: SourceRow[]) {
    if (!active) return;
    const picked = rows.filter((r) => checked[`${kind}:${r.id}`]);
    if (picked.length === 0) return;
    const added: MenuItem[] = picked.map((r) => ({
      key: newKey(),
      label: r.title ?? r.name ?? "Untitled",
      url: itemPath(kind, r),
      target: "_self",
      objectType: kind,
      objectId: r.id,
      children: [],
    }));
    patchActive({ items: [...active.items, ...added] });
    setChecked((c) => {
      const next = { ...c };
      picked.forEach((r) => delete next[`${kind}:${r.id}`]);
      return next;
    });
  }

  function addCustom() {
    if (!active || !customLink.label.trim()) return;
    patchActive({
      items: [...active.items, {
        key: newKey(), label: customLink.label.trim(), url: customLink.url.trim() || "#",
        target: "_self", objectType: "custom", objectId: null, children: [],
      }],
    });
    setCustomLink({ url: "https://", label: "" });
  }

  /* structure editing — items are one level deep, which is what the header renders */
  function flat(): { item: MenuItem; parent: MenuItem | null }[] {
    if (!active) return [];
    const out: { item: MenuItem; parent: MenuItem | null }[] = [];
    active.items.forEach((t) => {
      out.push({ item: t, parent: null });
      t.children.forEach((c) => out.push({ item: c, parent: t }));
    });
    return out;
  }

  function updateItem(key: string, patch: Partial<MenuItem>) {
    if (!active) return;
    patchActive({
      items: active.items.map((t) =>
        t.key === key ? { ...t, ...patch }
          : { ...t, children: t.children.map((c) => (c.key === key ? { ...c, ...patch } : c)) }
      ),
    });
  }

  function removeItem(key: string) {
    if (!active) return;
    patchActive({
      items: active.items
        .filter((t) => t.key !== key)
        .map((t) => ({ ...t, children: t.children.filter((c) => c.key !== key) })),
    });
  }

  /** Promote a child to top level, or nest a top-level item under the one above. */
  function indent(key: string, dir: -1 | 1) {
    if (!active) return;
    const items = active.items.map((t) => ({ ...t, children: [...t.children] }));

    if (dir === 1) {
      const idx = items.findIndex((t) => t.key === key);
      if (idx > 0) {
        const [moved] = items.splice(idx, 1);
        items[idx - 1].children.push({ ...moved, children: [] });
        // A nested item can't keep its own children — flatten them up a level.
        moved.children.forEach((c) => items[idx - 1].children.push(c));
        patchActive({ items });
      }
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const ci = items[i].children.findIndex((c) => c.key === key);
      if (ci >= 0) {
        const [moved] = items[i].children.splice(ci, 1);
        items.splice(i + 1, 0, { ...moved, children: [] });
        patchActive({ items });
        return;
      }
    }
  }

  /**
   * Moves an item under any top-level parent, or back out to the top level.
   *
   * The arrows only nest under the row directly above, which means reparenting
   * used to require dragging the item into position first. Menus are two levels
   * deep, so a parent that has children can't itself become a child.
   */
  function setParent(key: string, parentKey: string) {
    if (!active) return;
    const items = active.items.map((t) => ({ ...t, children: [...t.children] }));

    // Detach from wherever it is now.
    let moved: MenuItem | undefined;
    const ti = items.findIndex((t) => t.key === key);
    if (ti >= 0) {
      [moved] = items.splice(ti, 1);
    } else {
      for (const t of items) {
        const ci = t.children.findIndex((c) => c.key === key);
        if (ci >= 0) { [moved] = t.children.splice(ci, 1); break; }
      }
    }
    if (!moved) return;

    if (!parentKey) {
      items.push({ ...moved, children: moved.children ?? [] });
      patchActive({ items });
      return;
    }

    const parent = items.find((t) => t.key === parentKey);
    if (!parent) return;
    parent.children.push({ ...moved, children: [] });
    // A nested item can't keep its own children — flatten them up a level.
    (moved.children ?? []).forEach((c) => parent.children.push(c));
    patchActive({ items });
  }

  function reorderTop(fromKey: string, toKey: string) {
    if (!active || fromKey === toKey) return;
    const items = [...active.items];
    const from = items.findIndex((t) => t.key === fromKey);
    const to = items.findIndex((t) => t.key === toKey);
    if (from < 0 || to < 0) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    patchActive({ items });
  }

  if (loading) {
    return (
      <>
        <Header title="Menus" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading menus…
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Menus" />
      <div className="p-8 max-w-[1200px]">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 mb-6">
          {([["edit", "Edit Menus"], ["locations", "Manage Locations"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn("px-4 py-2 text-sm rounded-t-lg border border-b-0 -mb-px transition-colors",
                tab === id ? "bg-white border-slate-200 text-slate-900 font-medium" : "bg-transparent border-transparent text-slate-500 hover:text-slate-800")}>
              {label}
            </button>
          ))}
        </div>

        {tab === "locations" ? (
          <div className="card p-0 overflow-hidden">
            <p className="px-5 py-3 text-sm text-slate-500 border-b border-slate-100">
              Your theme supports {MENU_LOCATIONS.length} menu locations. Choose which menu appears in each.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-5 py-2.5 font-semibold text-slate-600">Menu Location</th>
                  <th className="px-5 py-2.5 font-semibold text-slate-600">Assigned Menu</th>
                </tr>
              </thead>
              <tbody>
                {MENU_LOCATIONS.map((loc) => (
                  <tr key={loc.id} className="border-t border-slate-100">
                    <td className="px-5 py-3 align-top">
                      <span className="font-medium text-slate-800">{loc.label}</span>
                      <span className="block text-[11px] text-slate-400">{loc.description}</span>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        className="input max-w-xs"
                        value={settings[locationKey(loc.id)] ?? ""}
                        onChange={(e) => setLocation(locationKey(loc.id), e.target.value)}
                      >
                        <option value="">— Select a Menu —</option>
                        {menus.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                      </select>

                      {/* One menu per language per location. A language left
                          unset uses the default language's menu, so a site can
                          be translated one menu at a time instead of losing its
                          navigation the moment a language is added. */}
                      {languages.length > 1 && (
                        <div className="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3">
                          {languages
                            .filter((code) => code !== defaultLang)
                            .map((code) => (
                              <div key={code} className="flex items-center gap-2">
                                <span className="w-24 shrink-0 truncate text-[11px] text-slate-500" title={languageName(code)}>
                                  {languageName(code)}
                                </span>
                                <select
                                  className="input max-w-[16rem] py-1 text-xs"
                                  value={settings[locationKey(loc.id, code)] ?? ""}
                                  onChange={(e) =>
                                    setLocation(locationKey(loc.id, code), e.target.value)
                                  }
                                >
                                  <option value="">Same as {languageName(defaultLang)}</option>
                                  {menus.map((m) => (
                                    <option key={m.id} value={String(m.id)}>{m.name}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-4 border-t border-slate-100">
              <button onClick={saveMenu} disabled={saving} className="btn-primary inline-flex items-center gap-2">
                {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
                {saved ? "Saved" : "Save Changes"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Menu picker */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              {menus.length > 0 && (
                <select className="input max-w-xs" value={activeId ?? ""} onChange={(e) => setActiveId(parseInt(e.target.value))}>
                  {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              <div className="flex items-center gap-2">
                <input className="input max-w-[200px]" placeholder="New menu name"
                  value={newMenuName} onChange={(e) => setNewMenuName(e.target.value)} />
                <button onClick={createMenu} className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Plus size={14} /> Create Menu
                </button>
              </div>
            </div>

            {!active ? (
              <div className="card p-8 text-center text-sm text-slate-500">
                No menus yet. Create one above to get started.
              </div>
            ) : (
              <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
                {/* ── Add menu items ── */}
                <div className="card p-0 overflow-hidden">
                  <p className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Add menu items</p>

                  {([
                    ["pages", "Pages", pages, "page" as ItemType],
                    ["posts", "Posts", posts, "post" as ItemType],
                    ["cats", "Categories", cats, "category" as ItemType],
                  ] as const).map(([id, label, rows, kind]) => (
                    <div key={id} className="border-b border-slate-100">
                      <button onClick={() => setOpenPanel(openPanel === id ? null : id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50">
                        {label}
                        <ChevronDown size={14} className={cn("text-slate-400 transition-transform", openPanel === id && "rotate-180")} />
                      </button>
                      <div hidden={openPanel !== id} className="px-4 pb-3">
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                          {rows.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No {label.toLowerCase()} yet.</p>}
                          {rows.map((r) => (
                            <label key={r.id} className="flex items-center gap-2 text-[13px] py-0.5 cursor-pointer">
                              <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                                checked={!!checked[`${kind}:${r.id}`]}
                                onChange={(e) => setChecked((c) => ({ ...c, [`${kind}:${r.id}`]: e.target.checked }))} />
                              <span className="truncate">{r.title ?? r.name}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                            <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                              onChange={(e) => setChecked((c) => {
                                const next = { ...c };
                                rows.forEach((r) => { next[`${kind}:${r.id}`] = e.target.checked; });
                                return next;
                              })} />
                            Select All
                          </label>
                          <button onClick={() => addChecked(kind, rows as SourceRow[])} className="btn-secondary text-xs">Add to Menu</button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div>
                    <button onClick={() => setOpenPanel(openPanel === "custom" ? null : "custom")}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50">
                      Custom Links
                      <ChevronDown size={14} className={cn("text-slate-400 transition-transform", openPanel === "custom" && "rotate-180")} />
                    </button>
                    <div hidden={openPanel !== "custom"} className="px-4 pb-3 space-y-2">
                      <div>
                        <label className="label">URL</label>
                        <input className="input" value={customLink.url} onChange={(e) => setCustomLink({ ...customLink, url: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Link Text</label>
                        <input className="input" value={customLink.label} onChange={(e) => setCustomLink({ ...customLink, label: e.target.value })} />
                      </div>
                      <button onClick={addCustom} className="btn-secondary text-xs">Add to Menu</button>
                    </div>
                  </div>
                </div>

                {/* ── Menu structure ── */}
                <div className="card p-5">
                  <p className="font-semibold text-sm mb-4">Menu structure</p>

                  <div className="mb-4 max-w-sm">
                    <label className="label">Menu Name</label>
                    <input className="input" value={active.name} onChange={(e) => patchActive({ name: e.target.value })} />
                  </div>

                  <p className="text-xs text-slate-500 mb-3">
                    Drag items into the order you prefer. Use the arrows to nest an item as a sub-item, or the chevron to edit it.
                  </p>

                  <div className="space-y-1.5 mb-6">
                    {active.items.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-lg">
                        Add items from the left to build this menu.
                      </p>
                    )}
                    {flat().map(({ item, parent }) => (
                      <div key={item.key} style={{ marginLeft: parent ? 28 : 0 }}>
                        <div
                          draggable={!parent}
                          onDragStart={() => !parent && setDrag(item.key)}
                          onDragEnd={() => setDrag(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (drag && !parent) reorderTop(drag, item.key); setDrag(null); }}
                          className={cn("flex items-center gap-2 border border-slate-200 rounded-lg bg-white px-3 py-2.5",
                            drag === item.key && "opacity-50")}
                        >
                          {!parent && <GripVertical size={13} className="text-slate-300 cursor-grab shrink-0" />}
                          <span className="flex-1 text-sm truncate">{item.label}</span>
                          <span className="text-[11px] text-slate-400 shrink-0">{TYPE_LABEL[item.objectType]}</span>
                          <button onClick={() => indent(item.key, -1)} disabled={!parent}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-25 px-1" title="Move out">←</button>
                          <button onClick={() => indent(item.key, 1)} disabled={!!parent}
                            className="text-slate-400 hover:text-slate-700 disabled:opacity-25 px-1" title="Make sub-item">→</button>
                          <button onClick={() => setExpanded(expanded === item.key ? null : item.key)}
                            className="text-slate-400 hover:text-slate-700 px-1">
                            <ChevronDown size={14} className={cn("transition-transform", expanded === item.key && "rotate-180")} />
                          </button>
                        </div>

                        <div hidden={expanded !== item.key}
                          className="border border-t-0 border-slate-200 rounded-b-lg bg-slate-50/70 px-3 py-3 -mt-1 space-y-2">
                          <div>
                            <label className="label">Parent</label>
                            <select
                              className="input max-w-[240px]"
                              value={parent?.key ?? ""}
                              onChange={(e) => setParent(item.key, e.target.value)}
                            >
                              <option value="">— Top level —</option>
                              {active.items
                                .filter((t) => t.key !== item.key)
                                .map((t) => (
                                  <option key={t.key} value={t.key}>{t.label || "Untitled"}</option>
                                ))}
                            </select>
                            {item.children.length > 0 && (
                              <p className="text-[11px] text-slate-400 mt-1">
                                Its {item.children.length} sub-item{item.children.length === 1 ? "" : "s"} move up a level if you nest this.
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="label">Navigation Label</label>
                            <input className="input" value={item.label} onChange={(e) => updateItem(item.key, { label: e.target.value })} />
                          </div>
                          <div>
                            <label className="label">URL</label>
                            <input className="input" value={item.url} onChange={(e) => updateItem(item.key, { url: e.target.value })} />
                          </div>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <div>
                              <label className="label">Icon</label>
                              <input className="input" value={item.icon ?? ""} placeholder="e.g. ★ or an emoji"
                                onChange={(e) => updateItem(item.key, { icon: e.target.value })} />
                            </div>
                            <div>
                              <label className="label">Badge</label>
                              <input className="input" value={item.badge ?? ""} placeholder="New, Hot…"
                                onChange={(e) => updateItem(item.key, { badge: e.target.value })} />
                            </div>
                          </div>
                          <div>
                            <label className="label">Description</label>
                            <input className="input" value={item.description ?? ""} placeholder="Shown under the label in mega menus"
                              onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                          </div>
                          <div>
                            <label className="label">Highlight</label>
                            <select className="input max-w-[200px]" value={item.highlight ?? ""}
                              onChange={(e) => updateItem(item.key, { highlight: e.target.value })}>
                              <option value="">None</option>
                              <option value="primary">Primary</option>
                              <option value="accent">Accent</option>
                              <option value="outline">Outline</option>
                            </select>
                          </div>

                          {!parent && (
                            <div className="flex flex-wrap items-center gap-4 pt-1">
                              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                                  checked={!!item.megaMenu}
                                  onChange={(e) => updateItem(item.key, { megaMenu: e.target.checked })} />
                                Mega menu
                              </label>
                              {item.megaMenu && (
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                  Columns
                                  <select className="input py-1 w-16" value={String(item.megaColumns ?? 2)}
                                    onChange={(e) => updateItem(item.key, { megaColumns: parseInt(e.target.value) })}>
                                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </label>
                              )}
                            </div>
                          )}

                          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                            <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                              checked={item.target === "_blank"}
                              onChange={(e) => updateItem(item.key, { target: e.target.checked ? "_blank" : "_self" })} />
                            Open in a new tab
                          </label>
                          <button onClick={() => removeItem(item.key)}
                            className="text-xs text-red-500 hover:text-red-700 inline-flex items-center gap-1">
                            <Trash2 size={12} /> Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Menu settings ── */}
                  <div className="border-t border-slate-100 pt-5">
                    <p className="font-semibold text-sm mb-3">Menu Settings</p>

                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-3">
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-300"
                        checked={!!active.autoAddPages}
                        onChange={(e) => patchActive({ autoAddPages: e.target.checked })} />
                      Automatically add new top-level pages to this menu
                    </label>

                    <p className="label mb-1.5">Menu location</p>
                    <div className="space-y-1.5 mb-5">
                      {MENU_LOCATIONS.map((loc) => {
                        const assigned = settings[locationKey(loc.id)] === String(active.id);
                        return (
                          <label key={loc.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-300"
                              checked={assigned}
                              onChange={(e) => setLocation(locationKey(loc.id), e.target.checked ? String(active.id) : "")} />
                            {loc.label}
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-4">
                      <button onClick={saveMenu} disabled={saving} className="btn-primary inline-flex items-center gap-2">
                        {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
                        {saved ? "Saved" : "Save Menu"}
                      </button>
                      <button onClick={deleteMenu} className="text-sm text-red-500 hover:text-red-700">Delete Menu</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
