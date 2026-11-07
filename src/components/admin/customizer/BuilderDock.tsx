"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Monitor, Smartphone, Settings, X, GripVertical } from "lucide-react";
import type { CustomizerSettings } from "@/lib/appearanceSettings";
import { COLS, COL_ALIGN, type Col } from "@/lib/builderItems";

export type Drag = { item: string; from: keyof CustomizerSettings | null };

export const parseZone = (v: string): string[] => {
  try {
    const a = JSON.parse(v || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};

export type RowDef = {
  id: string;
  label: string;
  /** Omit for a row that can't be switched off (the main row). */
  enabledKey?: keyof CustomizerSettings;
};

export type DeviceTab = { id: string; label: string; icon: "desktop" | "mobile" };

/**
 * The docked row/column builder that sits under the preview. Shared by the
 * header and footer so both behave identically.
 */
export function BuilderDock({
  s, set, rows, zoneKeyFor, labelFor, onHide, onConfigureItem, drag, setDrag,
  cols = COLS, devices, device, setDevice,
}: {
  s: CustomizerSettings;
  set: (k: keyof CustomizerSettings, v: string) => void;
  rows: RowDef[];
  zoneKeyFor: (rowId: string, col: Col) => keyof CustomizerSettings;
  labelFor: (itemId: string) => string;
  onHide: () => void;
  onConfigureItem: (id: string) => void;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
  /** Defaults to the five desktop zones; mobile passes three. */
  cols?: readonly Col[];
  devices?: DeviceTab[];
  device?: string;
  setDevice?: (d: string) => void;
}) {
  const [over, setOver] = useState<string | null>(null);

  function move(to: keyof CustomizerSettings) {
    if (!drag) return;
    if (drag.from === to) { setDrag(null); setOver(null); return; }
    if (drag.from) {
      set(drag.from, JSON.stringify(parseZone(s[drag.from]).filter((i) => i !== drag.item)));
    }
    const target = parseZone(s[to]);
    if (!target.includes(drag.item)) set(to, JSON.stringify([...target, drag.item]));
    setDrag(null);
    setOver(null);
  }

  function remove(from: keyof CustomizerSettings, item: string) {
    set(from, JSON.stringify(parseZone(s[from]).filter((i) => i !== item)));
  }

  return (
    <div className="border-t border-slate-300 bg-slate-100 shrink-0">
      <div className="flex items-end gap-1 px-3 pt-2 border-b border-slate-300">
        {devices?.map((d) => {
          const Icon = d.icon === "desktop" ? Monitor : Smartphone;
          return (
            <button
              key={d.id}
              onClick={() => setDevice?.(d.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-t-md border border-b-0 transition-colors",
                device === d.id
                  ? "bg-white text-brand-700 border-slate-300"
                  : "bg-transparent text-slate-500 border-transparent hover:text-slate-800"
              )}
            >
              <Icon size={12} /> {d.label}
            </button>
          );
        })}
        <button
          onClick={onHide}
          className="ml-auto mb-1.5 flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 border border-slate-300 rounded bg-white"
        >
          <X size={11} /> Hide
        </button>
      </div>

      <div className="bg-white">
        {rows.map((row) => {
          const enabled = !row.enabledKey || s[row.enabledKey] === "true";
          return (
            <div key={row.id} className="flex items-stretch border-b border-slate-200 last:border-b-0">
              <button
                onClick={() => row.enabledKey && set(row.enabledKey, String(!enabled))}
                title={row.enabledKey ? (enabled ? `Disable ${row.label}` : `Enable ${row.label}`) : row.label}
                className={cn(
                  "w-9 shrink-0 flex items-center justify-center border-r border-slate-200 transition-colors",
                  enabled ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-400 hover:bg-slate-300"
                )}
              >
                <Settings size={13} />
              </button>

              {cols.map((col) => {
                const key = zoneKeyFor(row.id, col);
                const items = parseZone(s[key]);
                const isOver = over === key;
                return (
                  <div
                    key={col}
                    onDragOver={(e) => { e.preventDefault(); setOver(key); }}
                    onDragLeave={() => setOver(null)}
                    onDrop={() => move(key)}
                    title={col.replace("_", " ")}
                    className={cn(
                      "flex-1 min-w-0 min-h-[42px] flex items-center gap-1 px-1.5 py-1.5 border-r border-slate-200 last:border-r-0 transition-colors",
                      COL_ALIGN[col] === "center" ? "justify-center" : COL_ALIGN[col] === "flex-end" ? "justify-end" : "justify-start",
                      !enabled && "opacity-40 pointer-events-none bg-slate-50",
                      isOver ? "bg-brand-50 ring-2 ring-inset ring-brand-400" : "bg-white"
                    )}
                  >
                    {items.map((id) => (
                      <div
                        key={id}
                        draggable
                        onDragStart={() => setDrag({ item: id, from: key })}
                        onDragEnd={() => { setDrag(null); setOver(null); }}
                        className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded px-1.5 py-1 text-[11px] cursor-grab shrink-0"
                      >
                        <GripVertical size={10} className="text-slate-400" />
                        <span className="whitespace-nowrap">{labelFor(id)}</span>
                        <button onClick={() => onConfigureItem(id)} className="text-slate-400 hover:text-brand-600" title="Settings">
                          <Settings size={10} />
                        </button>
                        <button onClick={() => remove(key, id)} className="text-slate-400 hover:text-red-600" title="Remove">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {items.length === 0 && isOver && (
                      <span className="text-[10px] text-brand-500 font-medium">Drop here</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
