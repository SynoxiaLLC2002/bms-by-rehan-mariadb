"use client";

import { cn } from "@/lib/utils";
import type { CustomizerSettings } from "@/lib/appearanceSettings";
import { Field, SectionHead, Swatch, ColorPair, LabelChoice, Toggle, Slider, type SetFn } from "./PanelKit";
import { BackgroundControl } from "./BackgroundControl";
import { PAGE_TYPES, parseConditions, type HeaderCondition, type ConditionKey } from "@/lib/headerConditions";

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40";

/** Base / Secondary share a shape; Outline swaps fill for a border. */
export function ButtonStylePanel({ p, s, set, outline }: { p: string; s: CustomizerSettings; set: SetFn; outline?: boolean }) {
  const k = (x: string) => `${p}_${x}` as keyof CustomizerSettings;
  return (
    <>
      {outline ? (
        <>
          <Field label="Border Colour"><Swatch k={k("border")} s={s} set={set} /></Field>
          <Field label="Border Width"><Slider k={k("border_width")} s={s} set={set} min={0} max={6} step={1} unit="px" /></Field>
          <Field label="Text Colour"><Swatch k={k("text")} s={s} set={set} /></Field>
          <Field label="Hover"><ColorPair a={k("bg_hover")} b={k("text_hover")} s={s} set={set} /></Field>
        </>
      ) : (
        <>
          <Field label="Background"><Swatch k={k("bg")} s={s} set={set} /></Field>
          <Field label="Text Colour"><Swatch k={k("text")} s={s} set={set} /></Field>
          <Field label="Hover Background"><Swatch k={k("bg_hover")} s={s} set={set} /></Field>
          <Field label="Hover Text"><Swatch k={k("text_hover")} s={s} set={set} /></Field>
        </>
      )}

      <SectionHead>Border &amp; shadow</SectionHead>
      {!outline && (
        <>
          <Field label="Border Colour"><Swatch k={k("border_color")} s={s} set={set} /></Field>
          <Field label="Border Hover Colour"><Swatch k={k("border_color_hover")} s={s} set={set} /></Field>
        </>
      )}
      <Field label="Shadow" help="Any CSS box-shadow, e.g. 0 15px 25px -7px rgba(0,0,0,.1)">
        <input value={String(s[k("shadow")] ?? "")} placeholder="none"
          onChange={(e) => set(k("shadow"), e.target.value)} className={cn(inputCls, "font-mono text-xs")} />
      </Field>
      <Field label="Hover Shadow">
        <input value={String(s[k("shadow_hover")] ?? "")} placeholder="none"
          onChange={(e) => set(k("shadow_hover"), e.target.value)} className={cn(inputCls, "font-mono text-xs")} />
      </Field>

      <SectionHead>Shape &amp; size</SectionHead>
      <Field label="Corner Radius"><Slider k={k("radius")} s={s} set={set} min={0} max={40} step={1} unit="px" /></Field>
      <Field label="Padding Y"><Slider k={k("pad_y")} s={s} set={set} min={0} max={40} step={1} unit="px" /></Field>
      <Field label="Padding X"><Slider k={k("pad_x")} s={s} set={set} min={0} max={60} step={1} unit="px" /></Field>
      {!outline && (
        <>
          <Field label="Font Size"><Slider k={k("font_size")} s={s} set={set} min={10} max={28} step={1} unit="px" /></Field>
          <Field label="Font Weight"><Slider k={k("font_weight")} s={s} set={set} min={300} max={900} step={100} unit="" /></Field>
        </>
      )}
    </>
  );
}

/** Layout, sizing, background, border and padding for one header row. */
export function HeaderRowPanel({ row, s, set, onPickImage }: { row: "topbar" | "main" | "bottombar"; s: CustomizerSettings; set: SetFn; onPickImage?: (apply: (url: string) => void) => void }) {
  const k = (x: string) => `hrow_${row}_${x}` as keyof CustomizerSettings;
  const num = (key: keyof CustomizerSettings, placeholder = "Inherit") => (
    <input
      value={String(s[key] ?? "")}
      placeholder={placeholder}
      onChange={(e) => set(key, e.target.value.replace(/[^0-9]/g, ""))}
      className={cn(inputCls, "max-w-[140px] text-center")}
    />
  );

  return (
    <>
      <Field label="Layout" help="Standard keeps a full-width background with contained content.">
        <LabelChoice
          cols={3}
          value={String(s[k("layout")] || "standard")}
          onChange={(v) => set(k("layout"), v)}
          options={[
            { value: "standard", label: "Standard" },
            { value: "wide", label: "Wide" },
            { value: "fullwidth", label: "Fullwidth" },
            { value: "contained", label: "Contained" },
          ]}
        />
      </Field>

      <Field label="Min Height">{num(k("height"))}</Field>
      <Field label="Background"><BackgroundControl k={k("bg")} s={s} set={set} onPickImage={onPickImage} /></Field>
      <Field label="Vertical Padding">{num(k("padding"))}</Field>

      <SectionHead>Border</SectionHead>
      <Field label="Top Border Colour"><Swatch k={k("border_top")} s={s} set={set} /></Field>
      <Field label="Top Border Width"><Slider k={k("border_width_top")} s={s} set={set} min={0} max={8} step={1} unit="px" /></Field>
      <Field label="Bottom Border Colour"><Swatch k={k("border_bottom")} s={s} set={set} /></Field>
      <Field label="Bottom Border Width"><Slider k={k("border_width_bottom")} s={s} set={set} min={0} max={8} step={1} unit="px" /></Field>

      <SectionHead>Transparent header</SectionHead>
      <Field label="Background when transparent" help="Overrides the background above on pages using a transparent header.">
        <BackgroundControl k={k("trans_bg")} s={s} set={set} onPickImage={onPickImage} />
      </Field>
    </>
  );
}

/** Content link styling and font rendering, alongside the type controls. */
export function TypeExtrasPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Field label="Link Style">
        <LabelChoice
          value={s.link_style || "standard"}
          onChange={(v) => set("link_style", v)}
          options={[{ value: "standard", label: "Underline" }, { value: "plain", label: "No Underline" }]}
        />
      </Field>
      <Field label="Link Colours"><ColorPair a="link_color" b="link_color_hover" s={s} set={set} /></Field>

      <SectionHead>Font rendering</SectionHead>
      <Toggle label="Enable font smoothing" value={s.font_smoothing} onChange={(v) => set("font_smoothing", v)} />
      <Field label="Google Font Subsets" help="Latin and the script of each site language are always included. Add any other set the text needs, comma separated, e.g. latin-ext, cyrillic.">
        <input
          value={s.google_subsets}
          placeholder="latin-ext, cyrillic"
          onChange={(e) => set("google_subsets", e.target.value)}
          className={inputCls}
        />
      </Field>
    </>
  );
}

/** Rules that change the header on specific kinds of page. */
export function ConditionalHeaderPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const rules = parseConditions(s.header_conditions || "");
  const save = (next: HeaderCondition[]) => set("header_conditions", JSON.stringify(next));

  const add = () =>
    save([
      ...rules,
      { id: `r${Date.now()}`, name: "New rule", when: "front", overrides: {} },
    ]);

  const patch = (i: number, p: Partial<HeaderCondition>) =>
    save(rules.map((r, x) => (x === i ? { ...r, ...p } : r)));

  const patchOverride = (i: number, key: ConditionKey, value: string) =>
    patch(i, { overrides: { ...rules[i].overrides, [key]: value } });

  return (
    <>
      <p className="text-[11px] text-slate-400 mb-3">
        Each rule targets a page type and overrides part of the header there. Later rules win,
        so the list reads top to bottom.
      </p>

      {rules.length === 0 && (
        <p className="text-[11px] text-slate-400 text-center py-5 border border-dashed border-slate-200 rounded-lg mb-3">
          No rules yet — the header is the same everywhere.
        </p>
      )}

      {rules.map((rule, i) => (
        <div key={rule.id} className="border border-slate-200 rounded-xl mb-3 overflow-hidden">
          <div className="flex items-center gap-2 bg-slate-100 px-2.5 py-2">
            <input
              value={rule.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              className="flex-1 bg-transparent text-[12px] font-medium focus:outline-none"
            />
            <button onClick={() => save(rules.filter((_, x) => x !== i))} className="text-red-400 hover:text-red-600 px-1">✕</button>
          </div>

          <div className="p-2.5 space-y-2">
            <label className="block">
              <span className="text-[10px] text-slate-400">Apply on</span>
              <select className={inputCls} value={rule.when} onChange={(e) => patch(i, { when: e.target.value })}>
                {PAGE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] text-slate-400">Transparent</span>
                <select className={inputCls} value={rule.overrides.header_transparent ?? ""}
                  onChange={(e) => patchOverride(i, "header_transparent", e.target.value)}>
                  <option value="">No change</option>
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-400">Sticky</span>
                <select className={inputCls} value={rule.overrides.header_sticky ?? ""}
                  onChange={(e) => patchOverride(i, "header_sticky", e.target.value)}>
                  <option value="">No change</option>
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] text-slate-400">Main row background</span>
              <input className={cn(inputCls, "font-mono text-xs")} value={rule.overrides.hrow_main_bg ?? ""}
                placeholder="#111, palette3, or leave blank"
                onChange={(e) => patchOverride(i, "hrow_main_bg", e.target.value)} />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] text-slate-400">Text colour</span>
                <input className={cn(inputCls, "font-mono text-xs")} value={rule.overrides.header_text_color ?? ""}
                  placeholder="blank" onChange={(e) => patchOverride(i, "header_text_color", e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-400">Height (px)</span>
                <input className={inputCls} value={rule.overrides.header_height ?? ""}
                  placeholder="blank" onChange={(e) => patchOverride(i, "header_height", e.target.value.replace(/[^0-9]/g, ""))} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                checked={rule.overrides.hide_header === "true"}
                onChange={(e) => patchOverride(i, "hide_header", e.target.checked ? "true" : "")} />
              Hide the header entirely on this page type
            </label>
          </div>
        </div>
      ))}

      <button onClick={add} className="w-full py-2 text-[12px] border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-brand-400 hover:text-brand-700">
        + Add rule
      </button>
    </>
  );
}

export function TransparentHeaderPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <p className="text-[11px] text-slate-400 mb-4">
        Applies on pages that switch it on in their own Design panel — the header floats over the content.
      </p>
      <Field label="Text Colour"><ColorPair a="thdr_text" b="thdr_text_hover" s={s} set={set} /></Field>
      <Field label="Background" help="Leave empty for fully transparent."><Swatch k="thdr_bg" s={s} set={set} /></Field>
      <Field label="Bottom Border" help="Leave empty for none."><Swatch k="thdr_border" s={s} set={set} /></Field>
      <Field label="Height Override" help="Leave empty to keep the normal header height.">
        <input
          value={s.thdr_height}
          placeholder="Inherit"
          onChange={(e) => set("thdr_height", e.target.value.replace(/[^0-9]/g, ""))}
          className={cn(inputCls, "max-w-[140px] text-center")}
        />
      </Field>
    </>
  );
}

export function StickyHeaderPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Toggle label="Stick to top on scroll" value={s.header_sticky} onChange={(v) => set("header_sticky", v)} />
      <Field label="What sticks">
        <LabelChoice
          value={s.hsticky_rows}
          onChange={(v) => set("hsticky_rows", v)}
          options={[{ value: "main", label: "Main row" }, { value: "all", label: "Whole header" }]}
        />
      </Field>

      <SectionHead>Once stuck</SectionHead>
      <Field label="Background"><Swatch k="hsticky_bg" s={s} set={set} /></Field>
      <Field label="Text Colour"><Swatch k="hsticky_text" s={s} set={set} /></Field>
      <Toggle label="Drop shadow" value={s.hsticky_shadow} onChange={(v) => set("hsticky_shadow", v)} />
      <Toggle label="Shrink on scroll" value={s.hsticky_shrink} onChange={(v) => set("hsticky_shrink", v)} />
      {s.hsticky_shrink === "true" && (
        <Field label="Shrunk Height"><Slider k="hsticky_shrink_height" s={s} set={set} min={40} max={120} step={1} unit="px" /></Field>
      )}
      <p className="text-[11px] text-slate-400">
        A distinct stuck appearance needs a small scroll script. Leave these empty and public pages ship none.
      </p>
    </>
  );
}

export function FooterRowPanel({ row, s, set, onPickImage }: { row: "toprow" | "main" | "bottomrow"; s: CustomizerSettings; set: SetFn; onPickImage?: (apply: (url: string) => void) => void }) {
  const k = (x: string) => `footer_${row}_${x}` as keyof CustomizerSettings;
  return (
    <>
      <Field label="Background"><BackgroundControl k={k("bg")} s={s} set={set} onPickImage={onPickImage} /></Field>
      <Field label="Text Colour"><Swatch k={k("text")} s={s} set={set} /></Field>
      <Field label="Link Colour"><Swatch k={k("link")} s={s} set={set} /></Field>
      <Field label="Vertical Padding">
        <input
          value={String(s[k("padding")] ?? "")}
          placeholder="Inherit"
          onChange={(e) => set(k("padding"), e.target.value.replace(/[^0-9]/g, ""))}
          className={cn(inputCls, "max-w-[140px] text-center")}
        />
      </Field>
      <SectionHead>Border</SectionHead>
      <Field label="Top Border Colour"><Swatch k={k("border_top")} s={s} set={set} /></Field>
      <Field label="Top Border Width"><Slider k={k("border_width_top")} s={s} set={set} min={0} max={8} step={1} unit="px" /></Field>
      <Field label="Bottom Border Colour"><Swatch k={k("border_bottom")} s={s} set={set} /></Field>
      <Field label="Bottom Border Width"><Slider k={k("border_width_bottom")} s={s} set={set} min={0} max={8} step={1} unit="px" /></Field>
    </>
  );
}

export function DarkModePanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Field label="Mode">
        <LabelChoice
          cols={3}
          value={s.dark_mode}
          onChange={(v) => set("dark_mode", v)}
          options={[
            { value: "off", label: "Off" },
            { value: "toggle", label: "Visitor toggle" },
            { value: "system", label: "Follow OS" },
          ]}
        />
      </Field>

      <SectionHead>Dark palette</SectionHead>
      <Field label="Background"><Swatch k="dark_bg" s={s} set={set} /></Field>
      <Field label="Body Text"><Swatch k="dark_text" s={s} set={set} /></Field>
      <Field label="Headings"><Swatch k="dark_heading" s={s} set={set} /></Field>
      <Field label="Primary / Links"><Swatch k="dark_primary" s={s} set={set} /></Field>
      <Field label="Header Background"><Swatch k="dark_header_bg" s={s} set={set} /></Field>
      <Field label="Header Text"><Swatch k="dark_header_text" s={s} set={set} /></Field>
      <Field label="Footer Background"><Swatch k="dark_footer_bg" s={s} set={set} /></Field>
      <Field label="Footer Text"><Swatch k="dark_footer_text" s={s} set={set} /></Field>
      <p className="text-[11px] text-slate-400">Empty values keep the light-mode colour.</p>
    </>
  );
}

export function ScrollTopPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const on = s.scroll_top_enabled === "true";
  return (
    <>
      <Toggle label="Show a back-to-top button" value={s.scroll_top_enabled} onChange={(v) => set("scroll_top_enabled", v)} />
      {on && (
        <>
          <Field label="Position">
            <LabelChoice value={s.scroll_top_position || "right"} onChange={(v) => set("scroll_top_position", v)}
              options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
          </Field>
          <Field label="Shape">
            <LabelChoice cols={3} value={s.scroll_top_shape || "circle"} onChange={(v) => set("scroll_top_shape", v)}
              options={[{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }]} />
          </Field>
          <Field label="Size"><Slider k="scroll_top_size" s={s} set={set} min={28} max={80} step={1} unit="px" /></Field>
          <Field label="Distance from edge"><Slider k="scroll_top_bottom" s={s} set={set} min={0} max={120} step={1} unit="px" /></Field>
          <Field label="Appears after scrolling"><Slider k="scroll_top_offset" s={s} set={set} min={0} max={2000} step={50} unit="px" /></Field>
          <Field label="Background"><Swatch k="scroll_top_bg" s={s} set={set} /></Field>
          <Field label="Arrow colour"><Swatch k="scroll_top_color" s={s} set={set} /></Field>
          <Toggle label="Show on mobile" value={s.scroll_top_mobile} onChange={(v) => set("scroll_top_mobile", v)} />
          <p className="text-[11px] text-slate-400">Empty colours use the site&apos;s primary colour and white.</p>
        </>
      )}
    </>
  );
}

export function ReadingPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <SectionHead>Reading progress bar</SectionHead>
      <Toggle label="Show on posts" value={s.reading_progress_enabled} onChange={(v) => set("reading_progress_enabled", v)} />
      {s.reading_progress_enabled === "true" && (
        <>
          <Toggle label="Also show on pages" value={s.reading_progress_pages} onChange={(v) => set("reading_progress_pages", v)} />
          <Field label="Position">
            <LabelChoice value={s.reading_progress_position || "top"} onChange={(v) => set("reading_progress_position", v)}
              options={[{ value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }]} />
          </Field>
          <Field label="Thickness"><Slider k="reading_progress_height" s={s} set={set} min={1} max={12} step={1} unit="px" /></Field>
          <Field label="Colour"><Swatch k="reading_progress_color" s={s} set={set} /></Field>
        </>
      )}

      <SectionHead>Reading time</SectionHead>
      <Toggle label="Show on single posts" value={s.reading_time_post} onChange={(v) => set("reading_time_post", v)} />
      <Toggle label="Show on post cards (blog and categories)" value={s.reading_time_cards} onChange={(v) => set("reading_time_cards", v)} />
      {(s.reading_time_post !== "false" || s.reading_time_cards === "true") && (
        <>
          <Field label="Words per minute"><Slider k="reading_time_wpm" s={s} set={set} min={100} max={400} step={10} unit="wpm" /></Field>
          <Field label="Label">
            <input className={inputCls} value={s.reading_time_label} onChange={(e) => set("reading_time_label", e.target.value)} placeholder="min read" />
          </Field>
          <p className="text-[11px] text-slate-400">
            Shown as “4 min read”. Left as “min read”, each language uses its own wording —
            an Arabic post reads “4 دقيقة قراءة”, a French one “4 min de lecture”. Anything
            else you type here is used for every language.
          </p>
        </>
      )}
    </>
  );
}

export function BlockSpacingPanel({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Field label="Space between blocks (desktop)"><Slider k="content_block_gap" s={s} set={set} min={0} max={80} step={1} unit="px" /></Field>
      <Field label="On phones">
        <div className="flex items-center gap-2">
          <input className={inputCls} value={s.content_block_gap_mobile} placeholder="Same as desktop"
            onChange={(e) => set("content_block_gap_mobile", e.target.value.replace(/[^0-9]/g, ""))} />
          <span className="text-[11px] text-slate-400">px</span>
        </div>
      </Field>
      <p className="text-[11px] leading-relaxed text-slate-400">
        A small gap between blocks in posts, pages and Row Layout columns, so nothing touches. It only fills in where a block
        has no margin of its own — paragraphs and headings keep their usual spacing. Set 0 to remove it everywhere, or change a
        single block under its <strong>Spacing → Margin</strong>, which always wins.
      </p>
    </>
  );
}
