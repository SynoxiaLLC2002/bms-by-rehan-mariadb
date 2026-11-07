"use client";

// Page Layout — the Customizer screen for everything a single page draws around
// its content.
//
// The sibling of `SinglePostPanel`, and deliberately the same screen minus the
// parts an article has and a page does not: no categories, no excerpt, no tags,
// no author box, no prev/next, no related posts. What is left is the title area,
// the width, and the two backgrounds.
//
// Before this existed a page had four settings — a width, a content style, a
// spacing and a title toggle — and that title toggle generated a rule that
// matched nothing, because a page rendered a bare <h1> with none of the classes
// the stylesheet was written against.

import { useState } from "react";
import {
  GOOGLE_FONTS,
  parsePageElements,
  PAGE_ELEMENT_LABELS,
  type CustomizerSettings,
  type SearchElement,
} from "@/lib/appearanceSettings";
import {
  AlignChoice, CardChoice, CONTENT_STYLE_OPTIONS, DeviceTabs, ElementList, Field,
  LAYOUT_OPTIONS, NumBox, SectionHead, SpacingChoice, Swatch, Switch,
  TITLE_LAYOUT_OPTIONS, inputCls,
  type Device, type SetFn,
} from "./PanelKit";

export function PageLayoutGeneral({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const [alignDevice, setAlignDevice] = useState<Device>("desktop");

  const elements = parsePageElements(s.page_elements);
  const saveElements = (els: SearchElement[]) => set("page_elements", JSON.stringify(els));

  const alignKey: keyof CustomizerSettings =
    alignDevice === "desktop" ? "page_title_align"
    : alignDevice === "tablet" ? "page_title_align_tablet"
    : "page_title_align_mobile";

  return (
    <>
      <SectionHead>Page Title</SectionHead>

      <Switch label="Show page title" value={s.page_title_show} onChange={(v) => set("page_title_show", v)} />

      <Field label="Page Title Layout">
        <CardChoice cols={2} value={s.page_title_layout} onChange={(v) => set("page_title_layout", v)}
          options={TITLE_LAYOUT_OPTIONS} />
      </Field>

      <Field label="Page Title Align" right={<DeviceTabs value={alignDevice} onChange={setAlignDevice} />}>
        <AlignChoice value={s[alignKey]} onChange={(v) => set(alignKey, v)} />
      </Field>

      <Field label="Title Elements">
        <ElementList
          elements={elements}
          labels={PAGE_ELEMENT_LABELS}
          onChange={saveElements}
          help="Drag to reorder. Order and visibility apply to every page."
          renderDetail={(id) => (
            <>
              {id === "title" && (
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="page_title_size" /></div>
                  <div><p className="text-[10px] text-slate-400 mb-1">Weight</p><NumBox s={s} set={set} k="page_title_weight" /></div>
                </div>
              )}
              {id === "breadcrumb" && <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="page_crumb_font_size" /></div>}
              {id === "meta" && <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="page_meta_font_size" /></div>}
            </>
          )}
        />
      </Field>

      <SectionHead>Default Page Layout</SectionHead>

      <Field label="Default Page Layout">
        <CardChoice value={s.page_layout} onChange={(v) => set("page_layout", v)} options={LAYOUT_OPTIONS} />
        <p className="text-[11px] text-slate-400 mt-1.5">Every page can override this from its own Design panel.</p>
      </Field>

      <Field label="Page Default Sidebar">
        <select className={inputCls} value={s.page_sidebar} onChange={(e) => set("page_sidebar", e.target.value)}>
          <option value="sidebar1">Sidebar 1</option>
        </select>
        <p className="text-[11px] text-slate-400 mt-1">Only one sidebar exists so far.</p>
      </Field>

      <Field label="Content Style">
        <CardChoice cols={2} value={s.page_content_style} onChange={(v) => set("page_content_style", v)}
          options={CONTENT_STYLE_OPTIONS} />
      </Field>

      <Field label="Content Vertical Spacing">
        <SpacingChoice value={s.page_spacing} onChange={(v) => set("page_spacing", v)} />
      </Field>

      <Switch label="Show featured image" value={s.page_feature_show} onChange={(v) => set("page_feature_show", v)} />

      <Switch
        label="Show comments"
        value={s.page_comments_show}
        onChange={(v) => set("page_comments_show", v)}
        defaultOn={false}
      />
      <p className="-mt-1 mb-3 text-[11px] text-slate-400">
        Off by default: most pages are not conversations. Any page can still override this from its own
        Discussion panel.
      </p>
    </>
  );
}

export function PageLayoutDesign({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const [siteBgDevice, setSiteBgDevice] = useState<Device>("desktop");
  const [contentBgDevice, setContentBgDevice] = useState<Device>("desktop");

  const siteBgKey: keyof CustomizerSettings =
    siteBgDevice === "desktop" ? "page_site_bg"
    : siteBgDevice === "tablet" ? "page_site_bg_tablet"
    : "page_site_bg_mobile";

  const contentBgKey: keyof CustomizerSettings =
    contentBgDevice === "desktop" ? "page_content_bg"
    : contentBgDevice === "tablet" ? "page_content_bg_tablet"
    : "page_content_bg_mobile";

  return (
    <>
      <SectionHead>Page Title</SectionHead>

      <Field label="Page Title Font">
        <select className={`${inputCls} mb-2`} value={s.page_title_font} onChange={(e) => set("page_title_font", e.target.value)}>
          <option value="">Inherit</option>
          {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="page_title_size" /></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Weight</p><NumBox s={s} set={set} k="page_title_weight" /></div>
        </div>
      </Field>

      <Field label="Title Color"><Swatch s={s} set={set} k="page_title_color" /></Field>

      <Field label="Breadcrumb Colors">
        <Swatch s={s} set={set} k="page_crumb_color" />
        <div className="h-2" />
        <Swatch s={s} set={set} k="page_crumb_hover_color" />
        <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
      </Field>

      <Field label="Breadcrumb Font">
        <div className="w-1/2"><NumBox s={s} set={set} k="page_crumb_font_size" /></div>
      </Field>

      <Field label="Meta Colors">
        <Swatch s={s} set={set} k="page_meta_color" />
        <div className="h-2" />
        <Swatch s={s} set={set} k="page_meta_hover_color" />
        <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
      </Field>

      <Field label="Meta Font">
        <div className="w-1/2"><NumBox s={s} set={set} k="page_meta_font_size" /></div>
      </Field>

      <SectionHead>Default Page Layout</SectionHead>

      <Field label="Site Background" right={<DeviceTabs value={siteBgDevice} onChange={setSiteBgDevice} />}>
        <Swatch s={s} set={set} k={siteBgKey} />
      </Field>

      <Field label="Content Background" right={<DeviceTabs value={contentBgDevice} onChange={setContentBgDevice} />}>
        <Swatch s={s} set={set} k={contentBgKey} />
      </Field>
    </>
  );
}
