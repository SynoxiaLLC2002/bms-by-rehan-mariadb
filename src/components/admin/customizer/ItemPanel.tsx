"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import {
  GOOGLE_FONTS, LOGO_LAYOUTS, parseWidgets, resolveLogoLayout,
  type CustomizerSettings, type FooterWidget, type FooterLink,
} from "@/lib/appearanceSettings";
import {
  ButtonStylePanel, TransparentHeaderPanel, StickyHeaderPanel, FooterRowPanel, DarkModePanel, ScrollTopPanel, ReadingPanel, BlockSpacingPanel,
  HeaderRowPanel, TypeExtrasPanel, ConditionalHeaderPanel,
} from "./StatePanels";
import { BackgroundControl } from "./BackgroundControl";
import { SinglePostGeneral, SinglePostDesign } from "./SinglePostPanel";
import { PageLayoutGeneral, PageLayoutDesign } from "./PageLayoutPanel";
import { SidebarPanel } from "./SidebarPanel";
import {
  ColorPair, DeviceTabs, Field, LabelChoice, SectionHead, Slider, SpacingBox,
  Swatch, Toggle, inputCls, smallCls, type Device, type SetFn,
} from "./PanelKit";

/* ── per-item content ─────────────────────────────────────────────────────── */

function SearchGeneral({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Field label="Search Display" help="The icon opens a full-screen modal; the field sits inline in the header.">
        <LabelChoice value={s.hsearch_display} onChange={(v) => set("hsearch_display", v)}
          options={[{ value: "input", label: "Input Field" }, { value: "icon", label: "Icon + Modal" }]} />
      </Field>
      <Field label="Placeholder Text">
        <input className={inputCls} value={s.hsearch_placeholder} onChange={(e) => set("hsearch_placeholder", e.target.value)} placeholder="Search…" />
      </Field>
      <p className="text-[11px] text-slate-400">Results are shown by the Search Results section.</p>
    </>
  );
}

function SearchDesign({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  const [iconDevice, setIconDevice] = useState<Device>("desktop");
  const [modalDevice, setModalDevice] = useState<Device>("desktop");

  const iconKey: keyof CustomizerSettings =
    iconDevice === "desktop" ? "hsearch_icon_size" : iconDevice === "tablet" ? "hsearch_icon_size_tablet" : "hsearch_icon_size_mobile";
  const modalKey: keyof CustomizerSettings =
    modalDevice === "desktop" ? "hsearch_modal_bg" : modalDevice === "tablet" ? "hsearch_modal_bg_tablet" : "hsearch_modal_bg_mobile";

  return (
    <>
      <Field label="Search Style">
        <LabelChoice value={s.hsearch_style} onChange={(v) => set("hsearch_style", v)}
          options={[{ value: "default", label: "Default" }, { value: "bordered", label: "Bordered" }]} />
      </Field>

      <Field label="Icon Size" right={<DeviceTabs value={iconDevice} onChange={setIconDevice} />}>
        <Slider k={iconKey} s={s} set={set} min={0.5} max={4} step={0.1} unit="em" />
      </Field>

      <Field label="Search Colors"><ColorPair a="hsearch_color" b="hsearch_color_hover" s={s} set={set} /></Field>
      <Field label="Search Background"><ColorPair a="hsearch_bg" b="hsearch_bg_hover" s={s} set={set} /></Field>

      <Field label="Search Padding">
        <SpacingBox
          keys={["hsearch_pad_top", "hsearch_pad_right", "hsearch_pad_bottom", "hsearch_pad_left"]}
          unit={s.hsearch_pad_unit || "em"} s={s} set={set}
          onUnit={(u) => set("hsearch_pad_unit", u)}
        />
      </Field>

      <Field label="Margin">
        <SpacingBox
          keys={["hsearch_margin_top", "hsearch_margin_right", "hsearch_margin_bottom", "hsearch_margin_left"]}
          unit="px" s={s} set={set}
        />
      </Field>

      <SectionHead>Modal Options</SectionHead>
      <Field label="Text Colors"><ColorPair a="hsearch_modal_text" b="hsearch_modal_text_hover" s={s} set={set} /></Field>
      <Field label="Modal Background" right={<DeviceTabs value={modalDevice} onChange={setModalDevice} />}>
        <Swatch k={modalKey} s={s} set={set} />
      </Field>
    </>
  );
}

function NavGeneral({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Link href="/admin/navigation"
        className="w-full flex items-center justify-between px-3 py-2.5 mb-5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-brand-400 hover:text-brand-700 transition-colors">
        Select Menu <span className="text-slate-400">›</span>
      </Link>

      <Field label="Items Spacing">
        <Slider k="hnav_spacing" s={s} set={set} min={0} max={4} step={0.05} unit="em" />
      </Field>

      <Toggle label="Stretch Menu?" value={s.hnav_stretch} onChange={(v) => set("hnav_stretch", v)} />

      <Field label="Open on">
        <LabelChoice value={s.hnav_open_on} onChange={(v) => set("hnav_open_on", v)}
          options={[{ value: "hover", label: "Hover" }, { value: "click", label: "Click" }]} />
      </Field>

      <SectionHead>Dropdown Options</SectionHead>
      <Field label="Dropdown Width"><Slider k="hnav_dd_width" s={s} set={set} min={120} max={420} step={10} unit="px" /></Field>
      <Field label="Corner Radius"><Slider k="hnav_dd_radius" s={s} set={set} min={0} max={24} step={1} unit="px" /></Field>
      <p className="text-[11px] text-slate-400">Dropdowns appear for menu items that have children in the navigation builder.</p>
    </>
  );
}

function NavDesign({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Field label="Navigation Style">
        <LabelChoice cols={2} value={s.hnav_style} onChange={(v) => set("hnav_style", v)}
          options={[
            { value: "standard", label: "Standard" },
            { value: "full-height", label: "Full Height" },
            { value: "underline", label: "Underline" },
            { value: "full-height-underline", label: "Full Height Underline" },
          ]} />
      </Field>

      <Field label="Navigation Colors">
        <Swatch k="hnav_color" s={s} set={set} />
        <div className="h-2" />
        <Swatch k="hnav_color_hover" s={s} set={set} />
        <div className="h-2" />
        <Swatch k="hnav_color_active" s={s} set={set} />
        <p className="text-[11px] text-slate-400 mt-1">Normal, hover, then active.</p>
      </Field>

      <Field label="Navigation Background">
        <Swatch k="hnav_bg" s={s} set={set} />
        <div className="h-2" />
        <Swatch k="hnav_bg_hover" s={s} set={set} />
        <div className="h-2" />
        <Swatch k="hnav_bg_active" s={s} set={set} />
        <p className="text-[11px] text-slate-400 mt-1">Normal, hover, then active.</p>
      </Field>

      <Toggle label="Make Parent of Current Menu Item Active?" value={s.hnav_parent_active} onChange={(v) => set("hnav_parent_active", v)} />

      <Field label="Navigation Font">
        <select className={inputCls} value={s.hnav_font} onChange={(e) => set("hnav_font", e.target.value)}>
          <option value="">Inherit</option>
          {GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div>
            <p className="text-[10px] text-slate-400 mb-1">Size</p>
            <input value={s.hnav_font_size} placeholder="Inherit" onChange={(e) => set("hnav_font_size", e.target.value.replace(/[^\d]/g, ""))} className={smallCls} />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1">Weight</p>
            <input value={s.hnav_font_weight} placeholder="Inherit" onChange={(e) => set("hnav_font_weight", e.target.value.replace(/[^\d]/g, ""))} className={smallCls} />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1">Case</p>
            <select value={s.hnav_transform} onChange={(e) => set("hnav_transform", e.target.value)} className={smallCls}>
              <option value="none">—</option>
              <option value="uppercase">AB</option>
              <option value="capitalize">Ab</option>
            </select>
          </div>
        </div>
      </Field>

      <SectionHead>Dropdown Options</SectionHead>
      <Field label="Dropdown Background"><Swatch k="hnav_dd_bg" s={s} set={set} /></Field>
      <Field label="Dropdown Link Colors"><ColorPair a="hnav_dd_color" b="hnav_dd_color_hover" s={s} set={set} /></Field>
      <Field label="Divider Color"><Swatch k="hnav_dd_divider" s={s} set={set} /></Field>
    </>
  );
}

function WidgetGeneral({ id, s, set }: { id: string; s: CustomizerSettings; set: SetFn }) {
  const widgets = parseWidgets(s.footer_widgets);
  const w: FooterWidget = widgets[id] ?? { type: "text" };
  const patch = (p: Partial<FooterWidget>) =>
    set("footer_widgets", JSON.stringify({ ...widgets, [id]: { ...w, ...p } }));

  return (
    <>
      <Field label="Widget Type">
        <select className={inputCls} value={w.type} onChange={(e) => patch({ type: e.target.value as FooterWidget["type"] })}>
          <option value="text">Text / HTML</option>
          <option value="links">Link List</option>
          <option value="about">About + Logo</option>
        </select>
      </Field>
      {w.type !== "about" && (
        <Field label="Title">
          <input className={inputCls} value={w.title ?? ""} onChange={(e) => patch({ title: e.target.value })} placeholder="Column title" />
        </Field>
      )}
      {w.type === "links" ? (
        <Field label="Links">
          <div className="space-y-1.5">
            {(w.links ?? []).map((lnk, li) => (
              <div key={li} className="flex gap-1.5">
                <input className={cn(smallCls, "text-left px-2.5")} value={lnk.label} placeholder="Label"
                  onChange={(e) => { const links = [...(w.links ?? [])]; links[li] = { ...links[li], label: e.target.value }; patch({ links }); }} />
                <input className={cn(smallCls, "text-left px-2.5")} value={lnk.url} placeholder="/url"
                  onChange={(e) => { const links = [...(w.links ?? [])]; links[li] = { ...links[li], url: e.target.value }; patch({ links }); }} />
                <button onClick={() => patch({ links: (w.links ?? []).filter((_, x) => x !== li) })} className="text-red-400 hover:text-red-600 px-1 shrink-0">✕</button>
              </div>
            ))}
            <button onClick={() => patch({ links: [...(w.links ?? []), { label: "", url: "" }] })} className="text-[11px] text-brand-600 hover:text-brand-700 font-medium">+ Add link</button>
          </div>
        </Field>
      ) : (
        <Field label={w.type === "about" ? "About Text" : "Content"}
          help={w.type === "about" ? "Shows your site logo above this text." : undefined}>
          <textarea rows={4} className={cn(inputCls, w.type === "text" && "font-mono text-xs")}
            value={w.text ?? ""} onChange={(e) => patch({ text: e.target.value })} />
        </Field>
      )}
    </>
  );
}

function CopyrightGeneral({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  let links: FooterLink[] = [];
  try { links = JSON.parse(s.footer_bottom_links || "[]"); } catch { links = []; }
  const save = (l: FooterLink[]) => set("footer_bottom_links", JSON.stringify(l));
  return (
    <>
      <Field label="Copyright Text">
        <input className={inputCls} value={s.footer_bottom_text} onChange={(e) => set("footer_bottom_text", e.target.value)}
          placeholder="© 2026 My Site. All rights reserved." />
      </Field>
      <Field label="Bottom Bar Links">
        <div className="space-y-1.5">
          {links.map((lnk, li) => (
            <div key={li} className="flex gap-1.5">
              <input className={cn(smallCls, "text-left px-2.5")} value={lnk.label} placeholder="Label"
                onChange={(e) => { const l = [...links]; l[li] = { ...l[li], label: e.target.value }; save(l); }} />
              <input className={cn(smallCls, "text-left px-2.5")} value={lnk.url} placeholder="/url"
                onChange={(e) => { const l = [...links]; l[li] = { ...l[li], url: e.target.value }; save(l); }} />
              <button onClick={() => save(links.filter((_, x) => x !== li))} className="text-red-400 hover:text-red-600 px-1 shrink-0">✕</button>
            </div>
          ))}
          <button onClick={() => save([...links, { label: "", url: "" }])} className="text-[11px] text-brand-600 hover:text-brand-700 font-medium">+ Add link</button>
        </div>
      </Field>
    </>
  );
}

function NotBuilt({ what }: { what: string }) {
  return <p className="text-[11px] text-slate-400">{what}</p>;
}

/* ── Posts/Pages Layout sub-screens ───────────────────────────────────────── */

const LAYOUT_CHOICES = [
  { value: "normal", label: "Normal" },
  { value: "narrow", label: "Narrow" },
  { value: "wide", label: "Wide" },
  { value: "fullwidth", label: "Fullwidth" },
  { value: "left-sidebar", label: "Left Sidebar" },
  { value: "right-sidebar", label: "Right Sidebar" },
];

const SPACING_CHOICES = [
  { value: "default", label: "Default" },
  { value: "enable", label: "Large" },
  { value: "disable", label: "None" },
  { value: "top-only", label: "Top only" },
  { value: "bottom-only", label: "Bottom only" },
];

function LayoutGeneral({
  kind, s, set,
}: { kind: "page" | "post" | "archive"; s: CustomizerSettings; set: SetFn }) {
  const k = (suffix: string) => `${kind}_${suffix}` as keyof CustomizerSettings;
  return (
    <>
      <Field label="Layout" help="Every page and post can override this from its own Design panel.">
        <LabelChoice cols={3} value={String(s[k("layout")])} onChange={(v) => set(k("layout"), v)} options={LAYOUT_CHOICES} />
      </Field>

      <Field label="Content Style">
        <LabelChoice value={String(s[k("content_style")])} onChange={(v) => set(k("content_style"), v)}
          options={[{ value: "boxed", label: "Boxed" }, { value: "unboxed", label: "Unboxed" }]} />
      </Field>

      <Field label="Vertical Spacing">
        <LabelChoice cols={3} value={String(s[k("spacing")])} onChange={(v) => set(k("spacing"), v)} options={SPACING_CHOICES} />
      </Field>

      {kind === "archive" && (
        <>
          <Field label="Pagination" help="Load more and infinite scroll keep the page links in the HTML, so search engines still reach every page.">
            <LabelChoice cols={3} value={s.archive_pagination || "numbers"} onChange={(v) => set("archive_pagination", v)}
              options={[{ value: "numbers", label: "Numbers" }, { value: "loadmore", label: "Load more" }, { value: "infinite", label: "Infinite" }]} />
          </Field>
          {(s.archive_pagination === "loadmore" || s.archive_pagination === "infinite") && (
            <Field label="Button text" help="Left as “Load more”, each language's category page uses its own wording (Arabic gets تحميل المزيد, French Charger plus). Anything else you type is used everywhere.">
              <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" placeholder="Load more" value={s.archive_loadmore_label} onChange={(e) => set("archive_loadmore_label", e.target.value)} />
            </Field>
          )}
          <Toggle label="Reading time on post cards" value={s.reading_time_cards} onChange={(v) => set("reading_time_cards", v)} />
        </>
      )}

      {kind === "archive" && (
        <Field label="Card design" help="The look of every post card in the listing. All six render the same markup, so switching one changes only the stylesheet.">
          <LabelChoice cols={3} value={s.archive_card_style || "classic"} onChange={(v) => set("archive_card_style", v)}
            options={[
              { value: "classic", label: "Classic" },
              { value: "elevated", label: "Elevated" },
              { value: "bordered", label: "Bordered" },
              { value: "overlay", label: "Overlay" },
              { value: "list", label: "List" },
              { value: "minimal", label: "Minimal" },
            ]} />
        </Field>
      )}

      {kind === "archive" && s.archive_card_style !== "list" && (
        <Field label="Columns">
          <div className="grid grid-cols-4 gap-2">
            {["1", "2", "3", "4"].map((n) => (
              <button key={n} onClick={() => set("archive_columns", n)}
                className={cn("border rounded-lg py-2 text-sm font-medium transition-colors",
                  s.archive_columns === n ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:border-brand-400")}>
                {n}
              </button>
            ))}
          </div>
        </Field>
      )}
    </>
  );
}

function LayoutDesign({
  kind, s, set,
}: { kind: "page" | "post" | "archive"; s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <SectionHead>Elements</SectionHead>
      {kind === "page" && <Toggle label="Show page title" value={s.page_title_show} onChange={(v) => set("page_title_show", v)} />}
      {kind === "post" && (
        <>
          <Toggle label="Show post title" value={s.post_title_show} onChange={(v) => set("post_title_show", v)} />
          <Toggle label="Show meta (date, category)" value={s.post_meta_show} onChange={(v) => set("post_meta_show", v)} />
          <Toggle label="Show featured image" value={s.post_feature_show} onChange={(v) => set("post_feature_show", v)} />
        </>
      )}
      {kind === "archive" && <Toggle label="Show the category page title" value={s.archive_title_show} onChange={(v) => set("archive_title_show", v)} />}
      {kind === "archive" ? (
        <>
          {/* The archive draws its own two bands and its own cards, so its
              colours cannot come from Colors & Fonts the way a page's do: the
              title sits on a tinted strip, and on a dark theme that strip was
              near-white with white text on it, so the heading was invisible.
              Every field is "Inherit" until set, so a site that never opens
              this keeps exactly the look it had. */}
          <SectionHead>Header band</SectionHead>
          <Field label="Band background"><Swatch k="archive_header_bg" s={s} set={set} /></Field>
          <Field label="Title colour"><Swatch k="archive_title_color" s={s} set={set} /></Field>
          <Field label="Description colour"><Swatch k="archive_desc_color" s={s} set={set} /></Field>
          <Field label="Count colour"><Swatch k="archive_count_color" s={s} set={set} /></Field>

          <SectionHead>Category filter row</SectionHead>
          <Toggle
            label="Show the category filter row"
            value={s.archive_chips_show}
            onChange={(v) => set("archive_chips_show", v)}
          />
          {s.archive_chips_show !== "false" && (
            <>
              <Field label="Chip text"><Swatch k="archive_chip_color" s={s} set={set} /></Field>
              <Field label="Chip background" help="Left empty, chips take a faint tint of the text colour around them, which suits a light and a dark theme alike.">
                <Swatch k="archive_chip_bg" s={s} set={set} />
              </Field>
              <Field label="Selected chip text"><Swatch k="archive_chip_active_color" s={s} set={set} /></Field>
              <Field label="Selected chip background" help="Left empty, the selected chip uses the site's primary colour.">
                <Swatch k="archive_chip_active_bg" s={s} set={set} />
              </Field>
            </>
          )}

          <SectionHead>Cards</SectionHead>
          <Field label="Grid background"><Swatch k="archive_body_bg" s={s} set={set} /></Field>
          <Field label="Card background"><Swatch k="archive_card_bg" s={s} set={set} /></Field>
          <Field label="Card border"><Swatch k="archive_card_border" s={s} set={set} /></Field>
          <Field label="Corner radius (px)">
            <input type="text" value={s.archive_card_radius} placeholder="Inherit"
              onChange={(e) => set("archive_card_radius", e.target.value.replace(/[^\d]/g, ""))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </Field>

          <SectionHead>Card text</SectionHead>
          <Field label="Title"><ColorPair a="archive_card_title_color" b="archive_card_title_hover" s={s} set={set} /></Field>
          <Field label="Category label"><Swatch k="archive_card_term_color" s={s} set={set} /></Field>
          <Field label="Meta (author, date)"><Swatch k="archive_card_meta_color" s={s} set={set} /></Field>
          <Field label="Excerpt"><Swatch k="archive_card_excerpt_color" s={s} set={set} /></Field>
          <Field label="Read more"><Swatch k="archive_card_more_color" s={s} set={set} /></Field>
          <p className="text-[11px] text-slate-400">
            Fonts and sizes still come from Colors &amp; Fonts. The Overlay design writes its text
            white over the image, so the card text colours do not apply to it.
          </p>
        </>
      ) : (
        <p className="text-[11px] text-slate-400">
          Colours and typography for these come from Colors &amp; Fonts, so they are set in one place.
        </p>
      )}
    </>
  );
}

/* ── Site Identity sub-screens ────────────────────────────────────────────── */

/** A row that drills into a nested screen, matching the section list style. */
function DrillRow({ label, value, onClick }: { label: string; value?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 mb-5 border border-slate-200 rounded-lg text-left hover:border-brand-400 hover:bg-slate-50 transition-colors group"
    >
      <span className="flex-1 min-w-0 text-sm text-slate-700 group-hover:text-brand-700">{label}</span>
      {value}
      <ChevronRight size={14} className="text-slate-400 shrink-0" />
    </button>
  );
}

function LogoBox({
  url, onChoose, onRemove, square,
}: { url: string; onChoose: () => void; onRemove: () => void; square?: boolean }) {
  return (
    <div>
      <div className={cn(
        "flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden mb-2",
        square ? "w-20 h-20" : "w-full max-w-[220px] h-20"
      )}>
        {url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          : <span className="text-[11px] text-slate-400">No image</span>}
      </div>
      <div className="flex items-center gap-2">
        {url && (
          <button onClick={onRemove}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded text-slate-600 hover:border-red-400 hover:text-red-600 transition-colors">
            Remove
          </button>
        )}
        <button onClick={onChoose}
          className="px-3 py-1.5 text-xs font-medium border border-brand-500 rounded text-brand-700 hover:bg-brand-50 transition-colors">
          {url ? "Change" : "Select image"}
        </button>
      </div>
    </div>
  );
}

function TitleAndLogoGeneral({
  s, set, openMedia, onOpen,
}: {
  s: CustomizerSettings;
  set: SetFn;
  openMedia?: (t: "site_logo" | "site_favicon") => void;
  /** Opens the media library and hands the chosen URL back. */
  pickImage?: (apply: (url: string) => void) => void;
  onOpen?: (id: string) => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const widthKey: keyof CustomizerSettings =
    device === "desktop" ? "logo_max_width" : device === "tablet" ? "logo_max_width_tablet" : "logo_max_width_mobile";
  const layout = resolveLogoLayout(s);

  return (
    <>
      <Field label="Logo">
        <LogoBox
          url={s.site_logo}
          onChoose={() => openMedia?.("site_logo")}
          onRemove={() => set("site_logo", "")}
        />
      </Field>

      <Field label="Logo Alt Text" help="What screen readers and Google read for the logo. Leave blank to use the site title.">
        <input className={inputCls} value={s.logo_alt ?? ""} onChange={(e) => set("logo_alt", e.target.value)} placeholder={s.site_name || "Site title"} />
      </Field>

      <Field
        label="Logo Max Width"
        right={<DeviceTabs value={device} onChange={setDevice} />}
        help="Leave at 0 for no limit. Set per device so a wide logo still fits on phones."
      >
        <Slider k={widthKey} s={s} set={set} min={0} max={600} step={1} unit="px" />
      </Field>

      <Field label="Logo Layout">
        <LabelChoice
          cols={3}
          value={layout}
          onChange={(v) => set("logo_layout", v)}
          options={LOGO_LAYOUTS.map((l) => ({ value: l.value, label: l.label }))}
        />
      </Field>

      <Field label="Site Title">
        <input className={inputCls} value={s.site_name} onChange={(e) => set("site_name", e.target.value)} placeholder="My site" />
      </Field>

      <Field label="Tagline">
        <input className={inputCls} value={s.site_description} onChange={(e) => set("site_description", e.target.value)} placeholder="Just another site" />
      </Field>

      <DrillRow
        label="Site Icon"
        onClick={() => onOpen?.("site-icon")}
        value={s.site_favicon
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={s.site_favicon} alt="" className="w-5 h-5 rounded object-contain shrink-0" />
          : undefined}
      />

      {!s.site_logo && (
        <p className="text-[11px] text-slate-400 -mt-3">
          With no logo set the site title always shows, so the header is never empty.
        </p>
      )}
    </>
  );
}

function TitleAndLogoDesign({ s, set }: { s: CustomizerSettings; set: SetFn }) {
  return (
    <>
      <Field label="Logo Height" help="The rendered height of the logo image. Width scales with it.">
        <Slider k="logo_height" s={s} set={set} min={16} max={160} step={1} unit="px" />
      </Field>
      <p className="text-[11px] text-slate-400">
        Title and tagline colours follow the header text colour, set in the Header section.
      </p>
    </>
  );
}

function SiteIconPanel({
  s, set, openMedia,
}: { s: CustomizerSettings; set: SetFn; openMedia?: (t: "site_logo" | "site_favicon") => void }) {
  return (
    <Field label="Site Icon" help="Shown in browser tabs and when the site is bookmarked. A square image of at least 512×512 works best.">
      <LogoBox
        square
        url={s.site_favicon}
        onChoose={() => openMedia?.("site_favicon")}
        onRemove={() => set("site_favicon", "")}
      />
    </Field>
  );
}

/* ── the screen ───────────────────────────────────────────────────────────── */

/** Site-wide and content surfaces — colour, gradient or image. */
function SurfacePanel({
  s, set, pickImage,
}: { s: CustomizerSettings; set: SetFn; pickImage?: (apply: (url: string) => void) => void }) {
  return (
    <>
      <Field label="Site Background" help="Behind everything, including outside the content column.">
        <BackgroundControl k="site_background" s={s} set={set} onPickImage={pickImage} />
      </Field>
      <Field label="Content Background" help="The article surface itself. Boxed layouts make this visible.">
        <BackgroundControl k="content_background" s={s} set={set} onPickImage={pickImage} />
      </Field>
    </>
  );
}

export function ItemPanel({
  scope, id, label, s, set, openMedia, onOpen, pickImage,
}: {
  scope: "header" | "footer" | "identity" | "layout" | "state" | "buttons";
  id: string;
  label: string;
  s: CustomizerSettings;
  set: SetFn;
  openMedia?: (t: "site_logo" | "site_favicon") => void;
  /** Drill into a nested screen within the same section. */
  onOpen?: (id: string) => void;
  /** Opens the media library and hands the chosen URL back. */
  pickImage?: (apply: (url: string) => void) => void;
}) {
  const [tab, setTab] = useState<"general" | "design">("general");

  function general() {
    if (scope === "buttons") {
      if (id === "base") return <ButtonStylePanel p="btn" s={s} set={set} />;
      if (id === "secondary") return <ButtonStylePanel p="btn2" s={s} set={set} />;
      return <ButtonStylePanel p="btno" s={s} set={set} outline />;
    }
    if (scope === "state") {
      if (id.startsWith("hrow-")) {
        return <HeaderRowPanel row={id.replace("hrow-", "") as "topbar" | "main" | "bottombar"} s={s} set={set} onPickImage={pickImage} />;
      }
      if (id === "typeextras") return <TypeExtrasPanel s={s} set={set} />;
      if (id === "surfaces") return <SurfacePanel s={s} set={set} pickImage={pickImage} />;
      if (id === "transparent") return <TransparentHeaderPanel s={s} set={set} />;
      if (id === "sticky") return <StickyHeaderPanel s={s} set={set} />;
      if (id === "conditional") return <ConditionalHeaderPanel s={s} set={set} />;
      if (id === "darkmode") return <DarkModePanel s={s} set={set} />;
      if (id === "scrolltop") return <ScrollTopPanel s={s} set={set} />;
      if (id === "spacing") return <BlockSpacingPanel s={s} set={set} />;
      if (id === "reading") return <ReadingPanel s={s} set={set} />;
      return <FooterRowPanel row={id.replace("footer-", "") as "toprow" | "main" | "bottomrow"} s={s} set={set} onPickImage={pickImage} />;
    }
    if (scope === "layout") {
      // Single posts have a screen of their own — it carries the title-area
      // element list and the after-content blocks the other kinds lack.
      if (id === "post") return <SinglePostGeneral s={s} set={set} />;
      // Pages have one of their own now too, for the same reason: the generic
      // screen could offer a width and a spacing and nothing about the title
      // area, which is most of what a page layout actually is.
      if (id === "page") return <PageLayoutGeneral s={s} set={set} />;
      if (id === "sidebar") return <SidebarPanel s={s} set={set} />;
      return <LayoutGeneral kind={id as "archive"} s={s} set={set} />;
    }
    if (scope === "identity") {
      if (id === "title-logo") return <TitleAndLogoGeneral s={s} set={set} openMedia={openMedia} onOpen={onOpen} />;
      if (id === "site-icon") return <SiteIconPanel s={s} set={set} openMedia={openMedia} />;
      return <NotBuilt what="Unknown section." />;
    }
    if (scope === "header") {
      switch (id) {
        case "search": return <SearchGeneral s={s} set={set} />;
        case "logo": return <TitleAndLogoGeneral s={s} set={set} openMedia={openMedia} onOpen={onOpen} />;
        case "button": return (
          <>
            <Field label="Button Label"><input className={inputCls} value={s.header_button_text} onChange={(e) => set("header_button_text", e.target.value)} /></Field>
            <Field label="Button URL"><input className={inputCls} value={s.header_button_url} onChange={(e) => set("header_button_url", e.target.value)} /></Field>
          </>
        );
        case "html": return (
          <Field label="Custom HTML">
            <textarea rows={5} className={cn(inputCls, "font-mono text-xs")} value={s.header_html_content}
              onChange={(e) => set("header_html_content", e.target.value)} placeholder='<a href="/contact">Contact</a>' />
          </Field>
        );
        case "navigation": return <NavGeneral s={s} set={set} />;
        default: return <NotBuilt what="This item has no options yet." />;
      }
    }
    if (id.startsWith("widget")) return <WidgetGeneral id={id} s={s} set={set} />;
    if (id === "copyright") return <CopyrightGeneral s={s} set={set} />;
    if (id === "footernav") return <NotBuilt what="Uses the same menu as the header — edit it in the navigation builder." />;
    return <NotBuilt what="This item has no options yet." />;
  }

  function design() {
    if (scope === "buttons" || scope === "state") {
      return <NotBuilt what="Everything for this section lives under General." />;
    }
    if (scope === "layout") {
      if (id === "post") return <SinglePostDesign s={s} set={set} />;
      if (id === "page") return <PageLayoutDesign s={s} set={set} />;
      if (id === "sidebar") return <NotBuilt what="Widget content is set under General." />;
      return <LayoutDesign kind={id as "archive"} s={s} set={set} />;
    }
    if (scope === "identity") {
      if (id === "title-logo") return <TitleAndLogoDesign s={s} set={set} />;
      return <NotBuilt what="No design options for this section." />;
    }
    if (scope === "header" && id === "logo") return <TitleAndLogoDesign s={s} set={set} />;
    if (scope === "header" && id === "search") return <SearchDesign s={s} set={set} />;
    if (scope === "header" && id === "navigation") return <NavDesign s={s} set={set} />;
    return <NotBuilt what="No design options for this item yet." />;
  }

  return (
    <div>
      <div className="flex border-b border-slate-200 -mx-4 -mt-4 mb-4">
        {(["general", "design"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors border-b-2",
              tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-400 hover:text-slate-600")}>
            {t}
          </button>
        ))}
      </div>
      <div key={`${id}-${tab}`}>{tab === "general" ? general() : design()}</div>
      <p className="sr-only">{label}</p>
    </div>
  );
}
