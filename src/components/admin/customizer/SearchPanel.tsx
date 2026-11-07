"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Eye, EyeOff, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, GripVertical,
} from "lucide-react";
import {
  GOOGLE_FONTS,
  parseSearchElements,
  SEARCH_ELEMENT_LABELS,
  type CustomizerSettings,
  type SearchElement,
} from "@/lib/appearanceSettings";
import {
  CardChoice, DeviceTabs, Field, LAYOUT_ART, NumBox, SectionHead, Swatch, Switch, bar,
  inputCls, type Device, type SetFn,
} from "./PanelKit";

/* ── panel ────────────────────────────────────────────────────────────────── */

export function SearchPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const [tab, setTab] = useState<"general" | "design">("general");
  const [alignDevice, setAlignDevice] = useState<Device>("desktop");
  const [siteBgDevice, setSiteBgDevice] = useState<Device>("desktop");
  const [contentBgDevice, setContentBgDevice] = useState<Device>("desktop");
  const [openEl, setOpenEl] = useState<string | null>(null);
  const [dragEl, setDragEl] = useState<string | null>(null);

  const elements = parseSearchElements(s.search_elements);
  const saveElements = (els: SearchElement[]) => set("search_elements", JSON.stringify(els));

  const alignKey: keyof CustomizerSettings =
    alignDevice === "desktop" ? "search_title_align"
    : alignDevice === "tablet" ? "search_title_align_tablet"
    : "search_title_align_mobile";

  const siteBgKey: keyof CustomizerSettings =
    siteBgDevice === "desktop" ? "search_site_bg"
    : siteBgDevice === "tablet" ? "search_site_bg_tablet"
    : "search_site_bg_mobile";

  const contentBgKey: keyof CustomizerSettings =
    contentBgDevice === "desktop" ? "search_content_bg"
    : contentBgDevice === "tablet" ? "search_content_bg_tablet"
    : "search_content_bg_mobile";

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
          <SectionHead>Search Results Title</SectionHead>

          <Switch label="Show Search Results Title?" value={s.search_title_show} onChange={(v) => set("search_title_show", v)} />

          <Field label="Search Results Title Layout">
            <CardChoice
              cols={2}
              value={s.search_title_layout}
              onChange={(v) => set("search_title_layout", v)}
              options={[
                { value: "in-content",    label: "In Content",    art: <span className="flex flex-col gap-0.5 w-3/4">{bar("h-1 w-1/2")}{bar("h-1 w-full opacity-50")}{bar("h-1 w-full opacity-50")}</span> },
                { value: "above-content", label: "Above Content", art: <span className="flex flex-col gap-0.5 w-3/4">{bar("h-2 w-full")}{bar("h-1 w-full opacity-50")}</span> },
              ]}
            />
          </Field>

          <Field label="Search Results Title Align" right={<DeviceTabs value={alignDevice} onChange={setAlignDevice} />}>
            <div className="grid grid-cols-3 gap-2">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                <button
                  key={a}
                  onClick={() => set(alignKey, a)}
                  className={cn(
                    "border rounded-lg py-2 flex items-center justify-center transition-colors",
                    s[alignKey] === a ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-400 hover:border-brand-400"
                  )}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </Field>

          <SectionHead>Results Layout</SectionHead>

          <Field label="Results Layout">
            <CardChoice
              value={s.search_archive_layout}
              onChange={(v) => set("search_archive_layout", v)}
              options={[
                { value: "normal",        label: "Normal",        art: LAYOUT_ART.normal },
                { value: "narrow",        label: "Narrow",        art: LAYOUT_ART.narrow },
                { value: "wide",          label: "Wide",          art: LAYOUT_ART.wide },
                { value: "fullwidth",     label: "Fullwidth",     art: LAYOUT_ART.fullwidth },
                { value: "left-sidebar",  label: "Left Sidebar",  art: LAYOUT_ART["left-sidebar"] },
                { value: "right-sidebar", label: "Right Sidebar", art: LAYOUT_ART["right-sidebar"] },
              ]}
            />
          </Field>

          <Field label="Category Pages Default Sidebar">
            <select className={inputCls} value={s.search_sidebar} onChange={(e) => set("search_sidebar", e.target.value)}>
              <option value="sidebar1">Sidebar 1</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Only one sidebar exists so far — it holds the search box.</p>
          </Field>

          <Field label="Content Style">
            <CardChoice
              cols={2}
              value={s.search_content_style}
              onChange={(v) => set("search_content_style", v)}
              options={[
                { value: "boxed",   label: "Boxed",   art: <span className="flex gap-0.5 w-3/4 h-full items-stretch">{bar("w-1/2 rounded")}{bar("w-1/2 rounded")}</span> },
                { value: "unboxed", label: "Unboxed", art: <span className="flex flex-col gap-0.5 w-3/4">{bar("h-1 w-full opacity-60")}{bar("h-1 w-2/3 opacity-60")}</span> },
              ]}
            />
          </Field>

          <Field label="Search Result Columns">
            <div className="grid grid-cols-4 gap-2">
              {["1", "2", "3", "4"].map((n) => (
                <button
                  key={n}
                  onClick={() => set("search_columns", n)}
                  className={cn(
                    "border rounded-lg py-2 text-sm font-medium transition-colors",
                    s.search_columns === n ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:border-brand-400"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          <SectionHead>Search Item Layout</SectionHead>

          <Field label="Search Item Elements">
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
                    saveElements(next);
                    setDragEl(null);
                  }}
                  className={cn("bg-white", dragEl === el.id && "opacity-50")}
                >
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <GripVertical size={12} className="text-slate-300 cursor-grab shrink-0" />
                    <button
                      onClick={() => saveElements(elements.map((x) => x.id === el.id ? { ...x, visible: !x.visible } : x))}
                      className={cn("shrink-0 transition-colors", el.visible ? "text-slate-600 hover:text-brand-600" : "text-slate-300 hover:text-slate-500")}
                      title={el.visible ? "Hide" : "Show"}
                    >
                      {el.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <span className={cn("flex-1 text-[13px]", !el.visible && "text-slate-400 line-through")}>
                      {SEARCH_ELEMENT_LABELS[el.id] ?? el.id}
                    </span>
                    <button onClick={() => setOpenEl(openEl === el.id ? null : el.id)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      <ChevronDown size={13} className={cn("transition-transform", openEl === el.id && "rotate-180")} />
                    </button>
                  </div>
                  <div hidden={openEl !== el.id} className="px-2.5 pb-3 pt-1 bg-slate-50/70 border-t border-slate-100">
                    {el.id === "title" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="search_item_title_size" /></div>
                        <div><p className="text-[10px] text-slate-400 mb-1">Weight</p><NumBox s={s} set={set} k="search_item_title_weight" /></div>
                      </div>
                    )}
                    {el.id === "categories" && (
                      <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="search_cat_font_size" /></div>
                    )}
                    {el.id === "meta" && (
                      <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="search_meta_font_size" /></div>
                    )}
                    {!["title", "categories", "meta"].includes(el.id) && (
                      <p className="text-[11px] text-slate-400">Drag to reorder, or use the eye to hide it.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Drag to reorder. Order and visibility apply to every result card.</p>
          </Field>
        </>
      ) : (
        <>
          <SectionHead>Search Results Title</SectionHead>
          <Field label="Title Color"><Swatch s={s} set={set} k="search_title_color" /></Field>

          <SectionHead>Results Layout</SectionHead>

          <Field label="Search Item Title Font">
            <select className={cn(inputCls, "mb-2")} value={s.search_item_title_font} onChange={(e) => set("search_item_title_font", e.target.value)}>
              <option value="">Inherit</option>
              {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="search_item_title_size" /></div>
              <div><p className="text-[10px] text-slate-400 mb-1">Weight</p><NumBox s={s} set={set} k="search_item_title_weight" /></div>
            </div>
          </Field>

          <Field label="Item Category Colors">
            <Swatch s={s} set={set} k="search_cat_color" />
            <div className="h-2" />
            <Swatch s={s} set={set} k="search_cat_hover_color" />
            <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
          </Field>

          <Field label="Item Category Font">
            <div className="w-1/2"><NumBox s={s} set={set} k="search_cat_font_size" /></div>
          </Field>

          <Field label="Item Meta Colors">
            <Swatch s={s} set={set} k="search_meta_color" />
            <div className="h-2" />
            <Swatch s={s} set={set} k="search_meta_hover_color" />
            <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
          </Field>

          <Field label="Item Meta Font">
            <div className="w-1/2"><NumBox s={s} set={set} k="search_meta_font_size" /></div>
          </Field>

          <Field label="Site Background" right={<DeviceTabs value={siteBgDevice} onChange={setSiteBgDevice} />}>
            <Swatch s={s} set={set} k={siteBgKey} />
          </Field>

          <Field label="Content Background" right={<DeviceTabs value={contentBgDevice} onChange={setContentBgDevice} />}>
            <Swatch s={s} set={set} k={contentBgKey} />
          </Field>
        </>
      )}
    </div>
  );
}
