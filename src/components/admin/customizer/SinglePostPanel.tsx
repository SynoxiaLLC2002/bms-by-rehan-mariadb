"use client";

// Single Post Layout — the Customizer screen for everything a single post
// draws around its content.
//
// Shaped like `SearchPanel` on purpose: both edit an ordered, hideable element
// list plus per-device alignment and backgrounds, and keeping the two screens
// recognisably the same is worth more than sharing a few primitives would save.
//
// The controls themselves now live in `PanelKit`, shared with Page Layout: two
// screens meant to look identical do not stay identical while each owns its own
// copy of the thing that makes them look that way.

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  GOOGLE_FONTS,
  parsePostElements,
  POST_ELEMENT_LABELS,
  type CustomizerSettings,
  type SearchElement,
} from "@/lib/appearanceSettings";
import {
  AlignChoice, CardChoice, CONTENT_STYLE_OPTIONS, DeviceTabs, ElementList, Field,
  LAYOUT_OPTIONS, NumBox, SectionHead, SpacingChoice, Swatch, Switch,
  TITLE_LAYOUT_OPTIONS, inputCls,
  type Device, type SetFn,
} from "./PanelKit";

/* ── The two halves of the screen ─────────────────────────────────────────── */
//
// ItemPanel already draws the General / Design tab bar, so these are exported
// separately rather than as one component with tabs of its own — two stacked
// tab bars was both confusing and left the outer Design tab blank.

export function SinglePostGeneral({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const [alignDevice, setAlignDevice] = useState<Device>("desktop");

  const elements = parsePostElements(s.post_elements);
  const saveElements = (els: SearchElement[]) => set("post_elements", JSON.stringify(els));

  const alignKey: keyof CustomizerSettings =
    alignDevice === "desktop" ? "post_title_align"
    : alignDevice === "tablet" ? "post_title_align_tablet"
    : "post_title_align_mobile";

  return (
    <>

          <SectionHead>Post Title</SectionHead>

          <Switch label="Show post title" value={s.post_title_show} onChange={(v) => set("post_title_show", v)} />

          <Field label="Post Title Layout">
            <CardChoice cols={2} value={s.post_title_layout} onChange={(v) => set("post_title_layout", v)}
              options={TITLE_LAYOUT_OPTIONS} />
          </Field>

          <Field label="Post Title Align" right={<DeviceTabs value={alignDevice} onChange={setAlignDevice} />}>
            <AlignChoice value={s[alignKey]} onChange={(v) => set(alignKey, v)} />
          </Field>

          <Field label="Title Elements">
            <ElementList
              elements={elements}
              labels={POST_ELEMENT_LABELS}
              onChange={saveElements}
              help="Drag to reorder. Order and visibility apply to every single post."
              renderDetail={(id) => (
                <>
                  {id === "title" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="post_title_size" /></div>
                      <div><p className="text-[10px] text-slate-400 mb-1">Weight</p><NumBox s={s} set={set} k="post_title_weight" /></div>
                    </div>
                  )}
                  {id === "categories" && <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="post_cat_font_size" /></div>}
                  {id === "breadcrumb" && <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="post_crumb_font_size" /></div>}
                  {id === "meta" && <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="post_meta_font_size" /></div>}
                  {id === "excerpt" && <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="post_excerpt_font_size" /></div>}
                </>
              )}
            />
          </Field>

          <SectionHead>Default Post Layout</SectionHead>

          <Field label="Default Post Layout">
            <CardChoice value={s.post_layout} onChange={(v) => set("post_layout", v)} options={LAYOUT_OPTIONS} />
            <p className="text-[11px] text-slate-400 mt-1.5">Every post can override this from its own Design panel.</p>
          </Field>

          <Field label="Post Default Sidebar">
            <select className={inputCls} value={s.post_sidebar} onChange={(e) => set("post_sidebar", e.target.value)}>
              <option value="sidebar1">Sidebar 1</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Only one sidebar exists so far.</p>
          </Field>

          <Field label="Content Style">
            <CardChoice cols={2} value={s.post_content_style} onChange={(v) => set("post_content_style", v)}
              options={CONTENT_STYLE_OPTIONS} />
          </Field>

          <Field label="Content Vertical Spacing">
            <SpacingChoice value={s.post_spacing} onChange={(v) => set("post_spacing", v)} />
          </Field>

          <Switch label="Show featured image" value={s.post_feature_show} onChange={(v) => set("post_feature_show", v)} />
          <Switch label="Show post meta" value={s.post_meta_show} onChange={(v) => set("post_meta_show", v)} />
          <Switch label="Show post tags" value={s.post_tags_show} onChange={(v) => set("post_tags_show", v)} />
          <Switch label="Show post author box" value={s.post_author_box_show} onChange={(v) => set("post_author_box_show", v)} defaultOn={false} />
          {s.post_author_box_show === "true" && (
            <div className="pl-6">
              <Switch label="Show author area in boxed mode" value={s.post_author_box_boxed} onChange={(v) => set("post_author_box_boxed", v)} />
            </div>
          )}
          <Switch label="Show post navigation" value={s.post_nav_show} onChange={(v) => set("post_nav_show", v)} />
          <Switch label="Show related posts" value={s.post_related_show} onChange={(v) => set("post_related_show", v)} />

          <Switch label="Show comments" value={s.post_comments_show} onChange={(v) => set("post_comments_show", v)} />
          {s.post_comments_show !== "false" && (
            <div className="pl-6">
              <Switch
                label="Publish comments without review"
                value={s.comments_auto_approve}
                onChange={(v) => set("comments_auto_approve", v)}
                defaultOn={false}
              />
              <p className="-mt-1 mb-3 text-[11px] text-slate-400">
                Off means every comment waits in Comments → Pending before it appears.
              </p>
            </div>
          )}

          {s.post_related_show !== "false" && (
            <>
              <Field label="Related Posts Order By">
                <select className={inputCls} value={s.post_related_orderby} onChange={(e) => set("post_related_orderby", e.target.value)}>
                  <option value="random">Random (default)</option>
                  <option value="date">Date</option>
                  <option value="title">Title</option>
                </select>
              </Field>

              <Field label="Related Posts Order">
                <select className={inputCls} value={s.post_related_order} onChange={(e) => set("post_related_order", e.target.value)}>
                  <option value="desc">Descending (default)</option>
                  <option value="asc">Ascending</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Ignored while the order is Random.</p>
              </Field>

              <Field label="Related Posts Count">
                <div className="grid grid-cols-6 gap-2">
                  {["1", "2", "3", "4", "5", "6"].map((n) => (
                    <button
                      key={n}
                      onClick={() => set("post_related_count", n)}
                      className={cn(
                        "border rounded-lg py-2 text-sm font-medium transition-colors",
                        s.post_related_count === n ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:border-brand-400"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}
    </>
  );
}

export function SinglePostDesign({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const [siteBgDevice, setSiteBgDevice] = useState<Device>("desktop");
  const [contentBgDevice, setContentBgDevice] = useState<Device>("desktop");

  const siteBgKey: keyof CustomizerSettings =
    siteBgDevice === "desktop" ? "post_site_bg"
    : siteBgDevice === "tablet" ? "post_site_bg_tablet"
    : "post_site_bg_mobile";

  const contentBgKey: keyof CustomizerSettings =
    contentBgDevice === "desktop" ? "post_content_bg"
    : contentBgDevice === "tablet" ? "post_content_bg_tablet"
    : "post_content_bg_mobile";

  return (
    <>

          <SectionHead>Post Title</SectionHead>

          <Field label="Post Title Font">
            <select className={cn(inputCls, "mb-2")} value={s.post_title_font} onChange={(e) => set("post_title_font", e.target.value)}>
              <option value="">Inherit</option>
              {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-[10px] text-slate-400 mb-1">Size (px)</p><NumBox s={s} set={set} k="post_title_size" /></div>
              <div><p className="text-[10px] text-slate-400 mb-1">Weight</p><NumBox s={s} set={set} k="post_title_weight" /></div>
            </div>
          </Field>

          <Field label="Title Color"><Swatch s={s} set={set} k="post_title_color" /></Field>

          <Field label="Category Colors">
            <Swatch s={s} set={set} k="post_cat_color" />
            <div className="h-2" />
            <Swatch s={s} set={set} k="post_cat_hover_color" />
            <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
          </Field>

          <Field label="Category Font">
            <div className="w-1/2"><NumBox s={s} set={set} k="post_cat_font_size" /></div>
          </Field>

          <Field label="Breadcrumb Colors">
            <Swatch s={s} set={set} k="post_crumb_color" />
            <div className="h-2" />
            <Swatch s={s} set={set} k="post_crumb_hover_color" />
            <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
          </Field>

          <Field label="Breadcrumb Font">
            <div className="w-1/2"><NumBox s={s} set={set} k="post_crumb_font_size" /></div>
          </Field>

          <Field label="Meta Colors">
            <Swatch s={s} set={set} k="post_meta_color" />
            <div className="h-2" />
            <Swatch s={s} set={set} k="post_meta_hover_color" />
            <p className="text-[11px] text-slate-400 mt-1">Normal, then hover.</p>
          </Field>

          <Field label="Meta Font">
            <div className="w-1/2"><NumBox s={s} set={set} k="post_meta_font_size" /></div>
          </Field>

          <Field label="Excerpt Colors"><Swatch s={s} set={set} k="post_excerpt_color" /></Field>

          <Field label="Excerpt Font">
            <div className="w-1/2"><NumBox s={s} set={set} k="post_excerpt_font_size" /></div>
          </Field>

          <SectionHead>Default Post Layout</SectionHead>

          <Field label="Site Background" right={<DeviceTabs value={siteBgDevice} onChange={setSiteBgDevice} />}>
            <Swatch s={s} set={set} k={siteBgKey} />
          </Field>

          <Field label="Content Background" right={<DeviceTabs value={contentBgDevice} onChange={setContentBgDevice} />}>
            <Swatch s={s} set={set} k={contentBgKey} />
          </Field>
    </>
  );
}
