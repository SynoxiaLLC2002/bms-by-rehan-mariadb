"use client";

// The controls the layout screens are built from.
//
// These lived inside `SinglePostPanel` while it was the only screen that needed
// them. Page Layout asks for the same alignment tabs, the same element list, the
// same swatches and the same layout cards, so they moved here rather than being
// copied — two screens that are meant to look identical will not stay identical
// if each owns its own copy of the thing that makes them look that way.

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Monitor, Tablet, Smartphone, Link2, Unlink,
  AlignLeft, AlignCenter, AlignRight,
  Eye, EyeOff, ChevronDown, GripVertical,
} from "lucide-react";
import type { CustomizerSettings } from "@/lib/appearanceSettings";

export type SetFn = (k: keyof CustomizerSettings, v: string) => void;
export type Device = "desktop" | "tablet" | "mobile";

export const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40";

export const smallCls =
  "w-full px-2 py-1.5 text-xs border border-slate-300 rounded text-center placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

/* ── shared controls ──────────────────────────────────────────────────────── */

export function Field({ label, right, help, children }: { label: string; right?: React.ReactNode; help?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
        {right}
      </div>
      {children}
      {help && <p className="text-[11px] text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

export function Swatch({ k, s, set }: { k: keyof CustomizerSettings; s: CustomizerSettings; set: SetFn }) {
  const v = s[k] ?? "";
  const isRef = /^palette[1-9]$/.test(v);
  const swatchColor = isRef ? (s[v as keyof CustomizerSettings] as string) || "#ffffff" : v;

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="relative shrink-0">
          <span
            className={cn("block w-9 h-9 rounded-full border cursor-pointer", isRef ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-300")}
            style={swatchColor ? { backgroundColor: swatchColor } : { backgroundImage: "linear-gradient(45deg,transparent 45%,#cbd5e1 45%,#cbd5e1 55%,transparent 55%)", background: "#fff" }}
          />
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(swatchColor) ? swatchColor : "#000000"}
            onChange={(e) => set(k, e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </label>
        <input type="text" value={v} placeholder="Inherit" onChange={(e) => set(k, e.target.value)}
          className={cn(inputCls, "font-mono text-xs")} />
        {v && <button onClick={() => set(k, "")} className="text-[11px] text-slate-400 hover:text-red-600 shrink-0">Reset</button>}
      </div>

      {/* Palette slots: picking one links this control to the global palette,
          so re-skinning the site updates every control that references it. */}
      <div className="flex items-center gap-1 mt-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const ref = `palette${n}`;
          const hex = (s[ref as keyof CustomizerSettings] as string) || "#ffffff";
          return (
            <button
              key={n}
              type="button"
              title={`Use ${ref} (${hex})`}
              onClick={() => set(k, v === ref ? hex : ref)}
              className={cn("w-5 h-5 rounded-full border transition-transform hover:scale-110",
                v === ref ? "border-brand-600 ring-2 ring-brand-300" : "border-slate-300")}
              style={{ backgroundColor: hex }}
            />
          );
        })}
        <span className="text-[10px] text-slate-400 ml-1">{isRef ? v : "palette"}</span>
      </div>
    </div>
  );
}

export function ColorPair({ a, b, s, set }: { a: keyof CustomizerSettings; b: keyof CustomizerSettings; s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Swatch k={a} s={s} set={set} />
      <div className="h-2" />
      <Swatch k={b} s={s} set={set} />
      <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
    </>
  );
}

/** Four-sided spacing with a link toggle and a unit, like the reference UI. */
export function SpacingBox({
  keys, unit, s, set, onUnit,
}: {
  keys: [keyof CustomizerSettings, keyof CustomizerSettings, keyof CustomizerSettings, keyof CustomizerSettings];
  unit: string;
  s: CustomizerSettings;
  set: SetFn;
  onUnit?: (u: string) => void;
}) {
  const [linked, setLinked] = useState(false);
  const labels = ["Top", "Right", "Bottom", "Left"];

  function change(i: number, v: string) {
    const clean = v.replace(/[^\d.]/g, "");
    if (linked) keys.forEach((k) => set(k, clean));
    else set(keys[i], clean);
  }

  return (
    <div className="flex items-start gap-2">
      <div className="grid grid-cols-4 gap-1.5 flex-1">
        {keys.map((k, i) => (
          <div key={k as string}>
            <input value={s[k] ?? ""} placeholder="—" onChange={(e) => change(i, e.target.value)} className={smallCls} />
            <p className="text-[10px] text-slate-400 text-center mt-1">{labels[i]}</p>
          </div>
        ))}
      </div>
      <button onClick={() => setLinked(!linked)} title={linked ? "Unlink sides" : "Link sides"}
        className={cn("w-8 h-8 rounded border flex items-center justify-center shrink-0 transition-colors",
          linked ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-400 hover:text-slate-700")}>
        {linked ? <Link2 size={13} /> : <Unlink size={13} />}
      </button>
      {onUnit ? (
        <select value={unit} onChange={(e) => onUnit(e.target.value)}
          className="w-14 h-8 text-[11px] border border-slate-300 rounded bg-white shrink-0 text-center">
          <option value="em">em</option>
          <option value="px">px</option>
          <option value="rem">rem</option>
        </select>
      ) : (
        <span className="w-14 h-8 flex items-center justify-center text-[11px] text-slate-400 shrink-0">{unit}</span>
      )}
    </div>
  );
}

export function LabelChoice({
  options, value, onChange, cols = 2,
}: {
  options: { value: string; label: string; art?: React.ReactNode }[];
  value: string;
  onChange: (v: string) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={cn("border rounded-lg py-2 px-2 text-[10px] font-bold uppercase tracking-wide transition-colors",
              active ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-500 hover:border-brand-400")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const on = value === "true";
  return (
    <button type="button" onClick={() => onChange(on ? "false" : "true")} className="w-full flex items-center gap-2.5 py-2 mb-4">
      <span className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", on ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="text-sm text-slate-700 text-left">{label}</span>
    </button>
  );
}

export function Slider({ k, s, set, min, max, step = 0.1, unit }: {
  k: keyof CustomizerSettings; s: CustomizerSettings; set: SetFn; min: number; max: number; step?: number; unit: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={parseFloat(s[k]) || min}
        onChange={(e) => set(k, e.target.value)} className="flex-1 accent-brand-600" />
      <input value={s[k] ?? ""} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ""))}
        className="w-14 px-2 py-1.5 text-xs border border-slate-300 rounded text-center" />
      <span className="text-[11px] text-slate-400">{unit}</span>
    </div>
  );
}

export function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 px-4 py-2 bg-slate-100 border-y border-slate-200 mb-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{children}</p>
    </div>
  );
}

export function DeviceTabs({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  return (
    <div className="flex border border-slate-300 rounded overflow-hidden">
      {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          title={d}
          className={cn(
            "w-7 h-6 flex items-center justify-center transition-colors",
            value === d ? "bg-brand-600 text-white" : "bg-white text-slate-400 hover:text-slate-700"
          )}
        >
          <Icon size={11} />
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, value, onChange, defaultOn = true }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Settings that ship off store "true" to turn on, not "false" to turn off. */
  defaultOn?: boolean;
}) {
  const on = defaultOn ? value !== "false" : value === "true";
  return (
    <button type="button" onClick={() => onChange(on ? "false" : "true")} className="w-full flex items-center gap-2.5 py-2 mb-3">
      <span className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", on ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  );
}

export function CardChoice({
  options, value, onChange, cols = 3,
}: {
  options: { value: string; label: string; art: React.ReactNode }[];
  value: string;
  onChange: (v: string) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "border rounded-lg p-2 flex flex-col items-center gap-1.5 transition-colors",
              active ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-400 hover:border-brand-400"
            )}
          >
            <span className={cn("w-full h-9 rounded flex items-center justify-center gap-0.5 p-1", active ? "bg-white/15" : "bg-slate-100")}>
              {o.art}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none text-center">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const bar = (cls: string) => <span className={cn("bg-current rounded-[1px]", cls)} />;

export const LAYOUT_ART: Record<string, React.ReactNode> = {
  normal:          <span className="flex flex-col gap-0.5 w-3/4">{bar("h-1 w-full")}{bar("h-1 w-full")}{bar("h-1 w-2/3")}</span>,
  narrow:          <span className="flex flex-col gap-0.5 w-1/2">{bar("h-1 w-full")}{bar("h-1 w-full")}{bar("h-1 w-2/3")}</span>,
  wide:            <span className="flex flex-col gap-0.5 w-5/6">{bar("h-1 w-full")}{bar("h-1 w-full")}{bar("h-1 w-2/3")}</span>,
  fullwidth:       <span className="flex flex-col gap-0.5 w-full">{bar("h-1 w-full")}{bar("h-1 w-full")}{bar("h-1 w-2/3")}</span>,
  "left-sidebar":  <span className="flex gap-0.5 w-3/4 h-full items-stretch">{bar("w-1/3")}{bar("w-2/3 opacity-50")}</span>,
  "right-sidebar": <span className="flex gap-0.5 w-3/4 h-full items-stretch">{bar("w-2/3 opacity-50")}{bar("w-1/3")}</span>,
};

/** The six widths, in the order the layout cards present them. */
export const LAYOUT_OPTIONS = [
  { value: "normal",        label: "Normal",        art: LAYOUT_ART.normal },
  { value: "narrow",        label: "Narrow",        art: LAYOUT_ART.narrow },
  { value: "wide",          label: "Wide",          art: LAYOUT_ART.wide },
  { value: "fullwidth",     label: "Fullwidth",     art: LAYOUT_ART.fullwidth },
  { value: "left-sidebar",  label: "Left Sidebar",  art: LAYOUT_ART["left-sidebar"] },
  { value: "right-sidebar", label: "Right Sidebar", art: LAYOUT_ART["right-sidebar"] },
];

export const CONTENT_STYLE_OPTIONS = [
  { value: "boxed",   label: "Boxed",   art: <span className="flex gap-0.5 w-3/4 h-full items-stretch">{bar("w-1/2 rounded")}{bar("w-1/2 rounded")}</span> },
  { value: "unboxed", label: "Unboxed", art: <span className="flex flex-col gap-0.5 w-3/4">{bar("h-1 w-full opacity-60")}{bar("h-1 w-2/3 opacity-60")}</span> },
];

export const TITLE_LAYOUT_OPTIONS = [
  {
    value: "in-content",
    label: "In Content",
    art: <span className="flex flex-col gap-0.5 w-3/4">{bar("h-1.5 w-2/3")}{bar("h-1 w-full opacity-50")}{bar("h-1 w-full opacity-50")}</span>,
  },
  {
    value: "above-content",
    label: "Above Content",
    art: <span className="flex flex-col gap-0.5 w-full">{bar("h-2.5 w-full")}{bar("h-1 w-3/4 opacity-50 self-center")}</span>,
  },
];

export const SPACING_CHOICES = [
  { value: "default", label: "Default" },
  { value: "enable", label: "Large" },
  { value: "disable", label: "None" },
  { value: "top-only", label: "Top only" },
  { value: "bottom-only", label: "Bottom only" },
];

export function NumBox({ s, set, k, placeholder = "Inherit" }: {
  s: CustomizerSettings; set: SetFn; k: keyof CustomizerSettings; placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={s[k]}
      placeholder={placeholder}
      onChange={(e) => set(k, e.target.value.replace(/[^\d]/g, ""))}
      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded text-center placeholder:text-slate-400"
    />
  );
}

/** Left / centre / right, shared by both title screens. */
export function AlignChoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={cn(
            "border rounded-lg py-2 flex items-center justify-center transition-colors",
            value === a ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-400 hover:border-brand-400"
          )}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

/** The Default-layout spacing row, identical on every layout screen. */
export function SpacingChoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SPACING_CHOICES.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "border rounded-lg py-2 text-[11px] font-medium transition-colors",
            value === o.value ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:border-brand-400"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The drag-to-reorder, click-to-hide element list.
 *
 * Both title screens edit one of these; the only differences are the labels and
 * which extra control each row reveals when expanded, so those are the two
 * things passed in.
 */
export function ElementList({
  elements, labels, onChange, renderDetail, help,
}: {
  elements: { id: string; visible: boolean }[];
  labels: Record<string, string>;
  onChange: (next: { id: string; visible: boolean }[]) => void;
  /** The row's expanded body — typically a size box for that element. */
  renderDetail?: (id: string) => React.ReactNode;
  help?: string;
}) {
  const [openEl, setOpenEl] = useState<string | null>(null);
  const [dragEl, setDragEl] = useState<string | null>(null);

  return (
    <>
      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
        {elements.map((el, i) => (
          <div
            key={el.id}
            draggable
            onDragStart={() => setDragEl(el.id)}
            onDragEnd={() => setDragEl(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!dragEl || dragEl === el.id) return;
              const next = [...elements];
              const from = next.findIndex((x) => x.id === dragEl);
              const [moved] = next.splice(from, 1);
              next.splice(i, 0, moved);
              onChange(next);
              setDragEl(null);
            }}
            className={cn("bg-white", dragEl === el.id && "opacity-50")}
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
              <GripVertical size={12} className="text-slate-300 cursor-grab shrink-0" />
              <button
                onClick={() => onChange(elements.map((x) => x.id === el.id ? { ...x, visible: !x.visible } : x))}
                className={cn("shrink-0 transition-colors", el.visible ? "text-slate-600 hover:text-brand-600" : "text-slate-300 hover:text-slate-500")}
                title={el.visible ? "Hide" : "Show"}
              >
                {el.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <span className={cn("flex-1 text-[13px]", !el.visible && "text-slate-400 line-through")}>
                {labels[el.id] ?? el.id}
              </span>
              {renderDetail && (
                <button onClick={() => setOpenEl(openEl === el.id ? null : el.id)} className="text-slate-400 hover:text-slate-700 shrink-0">
                  <ChevronDown size={13} className={cn("transition-transform", openEl === el.id && "rotate-180")} />
                </button>
              )}
            </div>
            {renderDetail && (
              <div hidden={openEl !== el.id} className="px-2.5 pb-3 pt-1 bg-slate-50/70 border-t border-slate-100">
                {renderDetail(el.id)}
              </div>
            )}
          </div>
        ))}
      </div>
      {help && <p className="text-[11px] text-slate-400 mt-1.5">{help}</p>}
    </>
  );
}
