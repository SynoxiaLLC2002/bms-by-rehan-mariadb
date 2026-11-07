"use client";
import ColorInput from "@/components/admin/customizer/ColorInput";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, GripVertical } from "lucide-react";
import type { CustomizerSettings } from "@/lib/appearanceSettings";
import { parseZone, type Drag } from "./BuilderDock";
import { FOOTER_ITEMS, footerZoneKey } from "./FooterDock";
import { COLS } from "@/lib/builderItems";

type SetFn = (k: keyof CustomizerSettings, v: string) => void;


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <ColorInput value={value} onChange={onChange} fallback="#000000" round />;
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

export function FooterPanel({
  s, set, drag, setDrag, onFocusItem,
}: {
  s: CustomizerSettings;
  set: SetFn;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
  onFocusItem: (id: string | null) => void;
}) {
  const [tab, setTab] = useState<"general" | "design">("general");



  // Items already placed in a zone drop out of Available Items.
  const placed = new Set<string>();
  (["toprow", "main", "bottomrow"] as const).forEach((row) =>
    COLS.forEach((col) =>
      parseZone(s[footerZoneKey(row, col)]).forEach((i) => placed.add(i))
    )
  );
  const available = FOOTER_ITEMS.filter((i) => !placed.has(i.id));

  return (
    <div>
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
          {/* Every placed footer item opens its own settings screen. */}
          {FOOTER_ITEMS.filter((i) => placed.has(i.id)).map((item) => (
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
                <p className="text-[11px] text-slate-400 text-center py-3">Everything is placed in the footer.</p>
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
        </>
      ) : (
        <>
          <Row label="Background"><Color value={s.footer_bg_color} onChange={(v) => set("footer_bg_color", v)} /></Row>
          <Row label="Text Colour"><Color value={s.footer_text_color} onChange={(v) => set("footer_text_color", v)} /></Row>
          <Row label="Heading / Link Colour"><Color value={s.footer_heading_color} onChange={(v) => set("footer_heading_color", v)} /></Row>
          <div className="h-px bg-slate-200 my-4" />
          <Switch label="Show top row" value={s.footer_toprow_enabled} onChange={(v) => set("footer_toprow_enabled", v)} />
          <Switch label="Show bottom row" value={s.footer_bottomrow_enabled} onChange={(v) => set("footer_bottomrow_enabled", v)} />

          <div className="h-px bg-slate-200 my-4" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Row styling</p>
          {[
            { id: "footer-toprow",    label: "Footer Top Row" },
            { id: "footer-main",      label: "Footer Middle Row" },
            { id: "footer-bottomrow", label: "Footer Bottom Row" },
          ].map((row) => (
            <button
              key={row.id}
              onClick={() => onFocusItem(row.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 mb-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 hover:border-brand-300 transition-colors"
            >
              {row.label}
              <ChevronRight size={14} className="text-slate-400" />
            </button>
          ))}
        </>
      )}
    </div>
  );
}
