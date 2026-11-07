"use client";

// The sidebar widget editor.
//
// Four slots, each either empty or holding one widget. Kept deliberately flat
// rather than drag-and-drop: a sidebar is short, and reordering is a matter of
// changing two slots' types.

import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import {
  SIDEBAR_WIDGET_IDS,
  SIDEBAR_WIDGET_TYPES,
  parseSidebarWidgets,
  type CustomizerSettings,
  type SidebarWidget,
} from "@/lib/appearanceSettings";

type SetFn = (k: keyof CustomizerSettings, v: string) => void;

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40";

const HAS_COUNT = new Set(["recent", "categories", "tags"]);

export function SidebarPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const widgets = parseSidebarWidgets(s.sidebar_widgets);

  const save = (next: Record<string, SidebarWidget>) => set("sidebar_widgets", JSON.stringify(next));
  const patch = (id: string, changes: Partial<SidebarWidget>) =>
    save({ ...widgets, [id]: { ...(widgets[id] ?? { type: "text" }), ...changes } as SidebarWidget });
  const clear = (id: string) => {
    const next = { ...widgets };
    delete next[id];
    save(next);
  };

  return (
    <div>
      <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
        Shows on any page or post whose layout is Left Sidebar or Right Sidebar.
      </p>

      {SIDEBAR_WIDGET_IDS.map((id, i) => {
        const w = widgets[id];
        return (
          <div key={id} className="mb-4 rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Slot {i + 1}</span>
              {w && (
                <button onClick={() => clear(id)} className="text-slate-400 hover:text-red-600" title="Remove widget">
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            <select
              className={cn(inputCls, "mb-2")}
              value={w?.type ?? ""}
              onChange={(e) =>
                e.target.value ? patch(id, { type: e.target.value as SidebarWidget["type"] }) : clear(id)
              }
            >
              <option value="">— Empty —</option>
              {SIDEBAR_WIDGET_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>

            {w && (
              <>
                <input
                  className={cn(inputCls, "mb-2")}
                  value={w.title ?? ""}
                  placeholder="Heading (optional)"
                  onChange={(e) => patch(id, { title: e.target.value })}
                />

                {HAS_COUNT.has(w.type) && (
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className={cn(inputCls, "mb-2")}
                    value={w.count ?? 5}
                    onChange={(e) => patch(id, { count: parseInt(e.target.value) || 5 })}
                    placeholder="How many"
                  />
                )}

                {w.type === "text" && (
                  <textarea
                    rows={4}
                    className={inputCls}
                    value={w.text ?? ""}
                    placeholder="Text shown in the sidebar"
                    onChange={(e) => patch(id, { text: e.target.value })}
                  />
                )}

                {w.type === "links" && (
                  <div className="space-y-2">
                    {(w.links ?? []).map((l, li) => (
                      <div key={li} className="flex gap-1.5">
                        <input
                          className={cn(inputCls, "text-xs")}
                          value={l.label}
                          placeholder="Label"
                          onChange={(e) => {
                            const links = [...(w.links ?? [])];
                            links[li] = { ...links[li], label: e.target.value };
                            patch(id, { links });
                          }}
                        />
                        <input
                          className={cn(inputCls, "text-xs")}
                          value={l.url}
                          placeholder="/url"
                          onChange={(e) => {
                            const links = [...(w.links ?? [])];
                            links[li] = { ...links[li], url: e.target.value };
                            patch(id, { links });
                          }}
                        />
                        <button
                          onClick={() => patch(id, { links: (w.links ?? []).filter((_, x) => x !== li) })}
                          className="shrink-0 px-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => patch(id, { links: [...(w.links ?? []), { label: "", url: "" }] })}
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add link
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
