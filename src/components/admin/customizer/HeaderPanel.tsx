"use client";
import ColorInput from "@/components/admin/customizer/ColorInput";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, GripVertical, Monitor, Tablet, Smartphone } from "lucide-react";
import type { CustomizerSettings } from "@/lib/appearanceSettings";
import { HEADER_ITEMS, parseZone, zoneKey, type DockDevice } from "./HeaderDock";
import { COLS } from "@/lib/builderItems";

type SetFn = (k: keyof CustomizerSettings, v: string) => void;
type Drag = { item: string; from: keyof CustomizerSettings | null };

/* ── shared bits ──────────────────────────────────────────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}


function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <ColorInput value={value} onChange={onChange} fallback="#ffffff" round />;
}

function Switch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const on = value === "true";
  return (
    <button type="button" onClick={() => onChange(on ? "false" : "true")} className="w-full flex items-center gap-2.5 py-2.5">
      <span className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", on ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  );
}

/* ── panel ────────────────────────────────────────────────────────────────── */

export function HeaderPanel({
  s, set, device, drag, setDrag, onFocusItem,
}: {
  s: CustomizerSettings;
  set: SetFn;
  device: DockDevice;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
  onFocusItem: (id: string | null) => void;
}) {
  const [tab, setTab] = useState<"general" | "design">("general");
  const [bgDevice, setBgDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  // Items already placed in any zone of the current device — those drop out of
  // the Available Items list, exactly like the builder this mirrors.
  const placed = new Set<string>();
  (["topbar", "main", "bottombar"] as const).forEach((row) =>
    COLS.forEach((col) =>
      parseZone(s[zoneKey(device, row, col)]).forEach((i) => placed.add(i))
    )
  );
  const available = HEADER_ITEMS.filter((i) => !placed.has(i.id));

  const bgKey: keyof CustomizerSettings =
    bgDevice === "desktop" ? "header_bg_color"
    : bgDevice === "tablet" ? "header_bg_color_tablet"
    : "header_bg_color_mobile";

  return (
    <div>
      {/* General / Design tabs */}
      <div className="flex border-b border-slate-200 -mx-4 -mt-4 mb-4">
        {(["general", "design"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors border-b-2",
              tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <>
          {/* Every item placed in the header gets a row that opens its settings,
              matching how the dock's gear behaves. */}
          {HEADER_ITEMS.filter((i) => placed.has(i.id)).map((item) => (
            <button
              key={item.id}
              onClick={() => onFocusItem(item.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 mb-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 hover:border-brand-300 transition-colors"
            >
              {item.label}
              <ChevronRight size={14} className="text-slate-400" />
            </button>
          ))}

          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Available Items</p>
            <div className="border border-slate-200 rounded-lg p-2 space-y-1.5 bg-slate-50/60">
              {available.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-3">Everything is placed in the header.</p>
              )}
              {available.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDrag({ item: item.id, from: null })}
                  onDragEnd={() => setDrag(null)}
                  className={cn(
                    "flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2.5 py-2 text-[12px] cursor-grab hover:border-brand-400 transition-colors",
                    drag?.item === item.id && "opacity-50"
                  )}
                >
                  <GripVertical size={11} className="text-slate-300" />
                  {item.label}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Drag an item into a row below the preview.</p>
          </div>

          {/* Full screens now — the old inline toggles duplicated them. */}
          {[
            { id: "hrow-topbar",    label: "Top Row",    hint: "Layout, height, background, border" },
            { id: "hrow-main",      label: "Main Row",   hint: "Layout, height, background, border" },
            { id: "hrow-bottombar", label: "Bottom Row", hint: "Layout, height, background, border" },
            { id: "transparent", label: "Transparent Header", hint: "Floats over the page content" },
            { id: "sticky",      label: "Sticky Header",      hint: "Behaviour and stuck appearance" },
            { id: "conditional", label: "Conditional Headers", hint: "Change the header per page type" },
          ].map((row) => (
            <button
              key={row.id}
              onClick={() => onFocusItem(row.id)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 mb-2 border border-slate-200 rounded-lg text-left hover:bg-slate-50 hover:border-brand-300 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm text-slate-700">{row.label}</span>
                <span className="block text-[11px] text-slate-400 truncate">{row.hint}</span>
              </span>
              <ChevronRight size={14} className="text-slate-400 shrink-0" />
            </button>
          ))}
        </>
      ) : (
        <>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Header Background</label>
              <div className="flex border border-slate-300 rounded overflow-hidden">
                {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
                  <button
                    key={d}
                    onClick={() => setBgDevice(d)}
                    title={d}
                    className={cn(
                      "w-7 h-6 flex items-center justify-center transition-colors",
                      bgDevice === d ? "bg-brand-600 text-white" : "bg-white text-slate-400 hover:text-slate-700"
                    )}
                  >
                    <Icon size={11} />
                  </button>
                ))}
              </div>
            </div>
            <Color value={s[bgKey]} onChange={(v) => set(bgKey, v)} />
            {bgDevice !== "desktop" && !s[bgKey] && (
              <p className="text-[11px] text-slate-400 mt-1">Empty means it inherits the desktop colour.</p>
            )}
          </div>

          <Row label="Header Text Colour"><Color value={s.header_text_color} onChange={(v) => set("header_text_color", v)} /></Row>

          <Row label="Header Height">
            <div className="flex items-center gap-3">
              <input type="range" min={48} max={140} value={parseInt(s.header_height) || 64}
                onChange={(e) => set("header_height", e.target.value)} className="flex-1 accent-brand-600" />
              <span className="text-xs font-mono text-slate-500 w-12 text-right">{s.header_height}px</span>
            </div>
          </Row>

          <Row label="Screen size to switch to mobile header">
            <div className="flex items-center gap-3">
              <input
                type="range" min={480} max={1400} step={10}
                value={parseInt(s.header_mobile_breakpoint) || 1024}
                onChange={(e) => set("header_mobile_breakpoint", e.target.value)}
                className="flex-1 accent-brand-600"
              />
              <input
                type="text"
                value={s.header_mobile_breakpoint}
                onChange={(e) => set("header_mobile_breakpoint", e.target.value.replace(/\D/g, ""))}
                className="w-16 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg text-center"
              />
              <span className="text-[11px] text-slate-400">px</span>
            </div>
          </Row>

          <div className="h-px bg-slate-200 my-4" />

          <Switch label="Bottom border" value={s.header_border} onChange={(v) => set("header_border", v)} />
        </>
      )}
    </div>
  );
}
