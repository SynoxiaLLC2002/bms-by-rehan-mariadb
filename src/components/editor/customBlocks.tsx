"use client";

import { useRef, useState, type ComponentType } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { setActiveBlock } from "@/lib/blockSettingsStore";
import { hasBox, parseBox, boxPreviewStyle } from "@/lib/blockBox";
import { SOCIAL_GLYPHS } from "@/lib/socialNetworks";
import { parseFields } from "@/lib/forms";
import ButtonGroup from "@/components/frontend/blocks/ButtonGroup";
import IconListView from "@/components/frontend/blocks/IconListView";
import InfoBoxView from "@/components/frontend/blocks/InfoBoxView";
import IframeEmbedView, { IFRAME_EMBED_DEFAULTS } from "@/components/frontend/blocks/IframeEmbedView";
import StepsGridView, { STEPS_GRID_DEFAULTS, parseSteps } from "@/components/frontend/blocks/StepsGridView";
import HighlightPanelView, { HIGHLIGHT_PANEL_DEFAULTS, parsePoints } from "@/components/frontend/blocks/HighlightPanelView";
import type { ViewProps } from "@/components/frontend/blocks/blockKit";
import HeroView, { HERO_DEFAULTS } from "@/components/frontend/blocks/HeroView";
import CtaBandView, { CTA_BAND_DEFAULTS } from "@/components/frontend/blocks/CtaBandView";
import CardGridView, { CARD_GRID_DEFAULTS } from "@/components/frontend/blocks/CardGridView";
import StatsStripView, { STATS_STRIP_DEFAULTS } from "@/components/frontend/blocks/StatsStripView";
import ProsConsView, { PROS_CONS_DEFAULTS } from "@/components/frontend/blocks/ProsConsView";
import CallBarView, { CALL_BAR_DEFAULTS } from "@/components/frontend/blocks/CallBarView";
import LogoStripView, { LOGO_STRIP_DEFAULTS } from "@/components/frontend/blocks/LogoStripView";
import NoticeBarView, { NOTICE_BAR_DEFAULTS } from "@/components/frontend/blocks/NoticeBarView";
import ComparisonTableView, { COMPARISON_TABLE_DEFAULTS } from "@/components/frontend/blocks/ComparisonTableView";
import VersionHistoryView, { VERSION_HISTORY_DEFAULTS } from "@/components/frontend/blocks/VersionHistoryView";
import LinkGridView, { LINK_GRID_DEFAULTS } from "@/components/frontend/blocks/LinkGridView";
import ReviewGridView, { REVIEW_GRID_DEFAULTS } from "@/components/frontend/blocks/ReviewGridView";
import PriceListView, { PRICE_LIST_DEFAULTS } from "@/components/frontend/blocks/PriceListView";
import KeyTakeawaysView, { KEY_TAKEAWAYS_DEFAULTS } from "@/components/frontend/blocks/KeyTakeawaysView";
import FactSheetView, { FACT_SHEET_DEFAULTS } from "@/components/frontend/blocks/FactSheetView";
import ShareButtonsView, { SHARE_BUTTONS_DEFAULTS } from "@/components/frontend/blocks/ShareButtonsView";
import { infoBoxScope } from "@/lib/infoBox";
import { blankItem, iconListScope, parseItems, serializeItems } from "@/lib/iconList";
import { accordionScope, parsePanes, serializePanes } from "@/lib/accordion";
import { parseRows, serializeRows, setCell, tableScope } from "@/lib/table";
import TableView from "@/components/frontend/blocks/TableView";
import AccordionFE from "@/components/frontend/blocks/AccordionFE";
import { resolveAccordion } from "@/lib/accordion";
import TableOfContentsFE from "@/components/frontend/blocks/TableOfContentsFE";
import { tocScope } from "@/lib/tableOfContents";
import AuthorBioFE from "@/components/frontend/blocks/AuthorBioFE";
import { authorBioScope } from "@/lib/authorBio";
import { APP_INFO_DEFAULTS, resolveAppInfo } from "@/lib/appInfo";
import { setActiveListItem } from "@/lib/listItemBus";
import { buttonScope } from "@/lib/button";
import { RowLayoutBlock } from "./RowLayoutBlock";
import { textAdvancedTextStyle, textAdvancedWrapStyle } from "@/lib/textAdvanced";
import DownloadBoxView from "@/components/shared/DownloadBoxView";
import { DLB_DEFAULTS, DOWNLOAD_BOX_CSS, resolveDownloadBox } from "@/lib/downloadBox";
import Icon from "@/components/shared/Icon";

// ── Reusable-block storage (localStorage) ─────────────────────────────────
const REUSABLE_KEY = "bms_reusable_blocks";
export function getReusableBlocks(): { id: string; label: string; block: any }[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REUSABLE_KEY) || "[]"); } catch { return []; }
}
export function saveReusableBlock(label: string, block: any) {
  const list = getReusableBlocks();
  list.push({ id: `${Date.now()}`, label, block: { type: block.type, props: block.props } });
  localStorage.setItem(REUSABLE_KEY, JSON.stringify(list));
}

// The per-block toolbar (move / duplicate / copy / delete / save as reusable)
// is ActiveBlockToolbar in BlockEditor: one toolbar for whatever is selected,
// plain paragraph or custom block, in the page or inside a column. It used to
// live here as a hover-only bar, which meant a hovered row and a selected block
// could show two ⧉ at once.

// ── Wrapper: gives every custom block a click-to-edit UX ──────────────────
function BlockPreview({
  blockId, type, props, editor, block, children,
}: {
  blockId: string; type: string; props: Record<string, string>;
  editor: any; block: any; children: React.ReactNode;
}) {
  return (
    <div
      contentEditable={false}
      className="bms-block relative my-1 select-none cursor-pointer group rounded-xl border-2 border-transparent hover:border-sky-400/60 transition-all duration-150"
      onClick={() =>
        setActiveBlock({
          id: blockId,
          type,
          props,
          update: (np) => editor.updateBlock(block, { props: np }),
        })
      }
    >
      <BoxPreview props={props}>{children}</BoxPreview>
    </div>
  );
}

/**
 * Shows the block's spacing in the editor at its real size.
 *
 * Per-device hiding is shown as a badge rather than actually hiding the block —
 * a block you can't see is a block you can't click back into to un-hide.
 */
function BoxPreview({ props, children }: { props: Record<string, string>; children: React.ReactNode }) {
  const box = parseBox(props.bx);
  if (!hasBox(box)) return <>{children}</>;

  const hidden = [box.hd && "desktop", box.ht && "tablet", box.hm && "mobile"].filter(Boolean);

  // Inline rather than via the `.bx` class: that stylesheet only ships with the
  // rendered site, and the editor canvas is always at desktop width anyway.
  return (
    <div
      className="relative"
      style={boxPreviewStyle(box, "d") as React.CSSProperties}
    >
      {hidden.length > 0 && (
        <span className="absolute -top-2 left-2 z-10 rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">
          Hidden on {hidden.join(", ")}
        </span>
      )}
      {children}
    </div>
  );
}

// ─── 1. BUTTON (Advanced) ─────────────────────────────────────────────────────
//
// The five legacy props are kept in the schema rather than removed: BlockNote
// drops props it has no slot for when it parses a stored document, so deleting
// them would silently wipe every button saved before this block grew up.
// `parseButtons` reads them when `btns` is empty and nothing has to be migrated.
export const ButtonBlock = createReactBlockSpec(
  {
    type: "button" as const,
    propSchema: {
      bx: { default: "" },
      // Group
      btns: { default: "" },
      align: { default: "left" },
      alignT: { default: "" },
      alignM: { default: "" },
      gap: { default: "" },
      stack: { default: "" },
      // Legacy single button, read only as a fallback.
      text: { default: "Click me" },
      url: { default: "#" },
      style: { default: "primary" },
      target: { default: "_self" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="button" props={p} editor={editor} block={block}>
          {/* Same component the page uses, so what the canvas shows is what
              ships — only inert, because a click here selects the block. */}
          <ButtonGroup props={p} scopeBase={buttonScope(block)} inert />
        </BlockPreview>
      );
    },
  }
);

// ─── 2. SPACER / DIVIDER ──────────────────────────────────────────────────────
export const SpacerBlock = createReactBlockSpec(
  { type: "spacer" as const, propSchema: { bx: { default: "" },  height: { default: "40" }, showDivider: { default: "false" }, dividerStyle: { default: "solid" }, dividerColor: { default: "#e2e8f0" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const h = Math.max(8, parseInt(p.height) || 40);
      return (
        <BlockPreview blockId={block.id} type="spacer" props={p} editor={editor} block={block}>
          <div style={{ height: h }} className="flex items-center px-2">
            {p.showDivider === "true"
              ? <hr style={{ width: "100%", borderStyle: p.dividerStyle, borderColor: p.dividerColor, borderTopWidth: 1 }} />
              : <div className="w-full text-center text-[10px] text-slate-300 tracking-widest uppercase">spacer — {h}px</div>
            }
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 3. INFO BOX (Advanced) ──────────────────────────────────────────────────
//
// The pre-Advanced `icon` / `title` / `text` / `variant` props all stay in the
// schema, so every info box saved before this block grew up still renders —
// BlockNote drops props it has no slot for, so removing them would wipe
// existing content. `variant` now only supplies the base palette.
export const InfoBoxBlock = createReactBlockSpec(
  {
    type: "infoBox" as const,
    propSchema: {
      bx: { default: "" },
      // Content
      icon: { default: "ℹ" },
      title: { default: "Info Box Title" },
      text: { default: "" },
      variant: { default: "info" },
      // Layout
      preset: { default: "" },
      textAlign: { default: "" },
      mediaAlign: { default: "top" },
      mediaVAlign: { default: "top" },
      // Link
      link: { default: "" },
      linkTarget: { default: "_self" },
      linkRel: { default: "" },
      linkTitle: { default: "" },
      linkContent: { default: "box" },
      // Container, normal and hover
      bgType: { default: "color" }, bg: { default: "" },
      bgGradFrom: { default: "" }, bgGradTo: { default: "" },
      bgGradType: { default: "linear" }, bgGradAngle: { default: "" },
      hBgType: { default: "color" }, hBg: { default: "" },
      hBgGradFrom: { default: "" }, hBgGradTo: { default: "" },
      hBgGradType: { default: "linear" }, hBgGradAngle: { default: "" },
      bd: { default: "" }, bdColor: { default: "" }, bdStyle: { default: "solid" },
      hBd: { default: "" }, hBdColor: { default: "" },
      rad: { default: "" }, hRad: { default: "" },
      contPad: { default: "" },
      shadow: { default: "" }, shColor: { default: "" },
      shX: { default: "" }, shY: { default: "" }, shBlur: { default: "" }, shSpread: { default: "" },
      hShadow: { default: "" }, hShadowOff: { default: "" }, hShColor: { default: "" },
      hShX: { default: "" }, hShY: { default: "" }, hShBlur: { default: "" }, hShSpread: { default: "" },
      // Media
      mediaType: { default: "icon" },
      iconSize: { default: "" },
      iconBorder: { default: "" },
      iconRadius: { default: "" },
      iconPad: { default: "" },
      iconAnim: { default: "" },
      iconColor: { default: "" }, iconBg: { default: "" }, iconBorderColor: { default: "" },
      hIconColor: { default: "" }, hIconBg: { default: "" }, hIconBorderColor: { default: "" },
      iconTitle: { default: "" },
      mediaPad: { default: "" }, mediaMar: { default: "" },
      image: { default: "" }, imageAlt: { default: "" }, imageW: { default: "" },
      number: { default: "" },
      // Title
      showTitle: { default: "1" },
      titleTag: { default: "h3" },
      titleColor: { default: "" }, hTitleColor: { default: "" },
      titleFs: { default: "" }, titleLh: { default: "" }, titleLs: { default: "" },
      titleFf: { default: "" }, titleFw: { default: "" }, titleTt: { default: "" },
      titlePad: { default: "" }, titleMar: { default: "" }, titleMinH: { default: "" },
      // Text
      showText: { default: "1" },
      textColor: { default: "" }, hTextColor: { default: "" },
      textFs: { default: "" }, textLh: { default: "" }, textLs: { default: "" },
      textFf: { default: "" }, textFw: { default: "" }, textTt: { default: "" },
      textPad: { default: "" }, textMar: { default: "" }, textMinH: { default: "" },
      // Learn More
      showLearn: { default: "" },
      learnMore: { default: "Learn More" },
      learnIcon: { default: "" }, learnIconSide: { default: "right" },
      learnColor: { default: "" }, hLearnColor: { default: "" },
      learnBg: { default: "" }, hLearnBg: { default: "" },
      learnBd: { default: "" }, learnBdColor: { default: "" }, hLearnBdColor: { default: "" },
      learnRad: { default: "" }, learnPad: { default: "" }, learnMar: { default: "" },
      learnFs: { default: "" }, learnLh: { default: "" }, learnLs: { default: "" },
      learnFf: { default: "" }, learnFw: { default: "" }, learnTt: { default: "" },
      // Structure
      maxWidth: { default: "" }, fullHeight: { default: "" },
      // Advanced
      anchor: { default: "" }, cssClass: { default: "" }, customCss: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      // Editing a label on the canvas writes straight back to the prop, so the
      // panel and the canvas are two views of one value rather than two copies.
      const write = (patch: Record<string, string>) =>
        editor.updateBlock(block, { props: { ...p, ...patch } });
      return (
        <BlockPreview blockId={block.id} type="infoBox" props={p} editor={editor} block={block}>
          {/* Same component the page uses, so what the canvas shows is what
              ships — only inert, because a click here selects the block. */}
          <InfoBoxView
            props={p}
            scopeBase={infoBoxScope(block)}
            inert
            onEditTitle={(title) => write({ title })}
            onEditText={(text) => write({ text })}
            onEditLearn={(learnMore) => write({ learnMore })}
          />
        </BlockPreview>
      );
    },
  }
);

// ─── 4. PROGRESS BAR ─────────────────────────────────────────────────────────
export const ProgressBarBlock = createReactBlockSpec(
  { type: "progressBar" as const, propSchema: { bx: { default: "" },  label: { default: "" }, value: { default: "70" }, color: { default: "#0ea5e9" }, showLabel: { default: "true" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const val = Math.min(100, Math.max(0, parseInt(p.value) || 0));
      return (
        <BlockPreview blockId={block.id} type="progressBar" props={p} editor={editor} block={block}>
          <div className="p-3">
            {(p.label || p.showLabel === "true") && (
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-600">{p.label || "Progress"}</span>
                {p.showLabel === "true" && <span className="font-semibold" style={{ color: p.color }}>{val}%</span>}
              </div>
            )}
            <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${val}%`, backgroundColor: p.color || "#0ea5e9" }} />
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 5. COUNT UP ─────────────────────────────────────────────────────────────
export const CountUpBlock = createReactBlockSpec(
  { type: "countUp" as const, propSchema: { bx: { default: "" },  to: { default: "100" }, prefix: { default: "" }, suffix: { default: "" }, title: { default: "" }, duration: { default: "2" }, color: { default: "#0ea5e9" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="countUp" props={p} editor={editor} block={block}>
          <div className="text-center py-3">
            <div className="text-4xl font-bold" style={{ color: p.color || "#0ea5e9" }}>{p.prefix}{p.to || "0"}{p.suffix}</div>
            {p.title && <div className="text-sm text-slate-500 mt-1.5">{p.title}</div>}
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 6. COUNTDOWN ────────────────────────────────────────────────────────────
export const CountdownBlock = createReactBlockSpec(
  { type: "countdown" as const, propSchema: { bx: { default: "" },  targetDate: { default: "" }, title: { default: "Offer ends in" }, expiredText: { default: "This offer has ended" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="countdown" props={p} editor={editor} block={block}>
          <div className="p-3">
            {p.title && <p className="text-xs text-slate-500 text-center mb-2">{p.title}</p>}
            <div className="flex justify-center gap-2">
              {["00", "00", "00", "00"].map((n, i) => (
                <div key={i} className="text-center">
                  <div className="bg-slate-900 text-white rounded-lg px-3 py-2 text-xl font-mono font-bold min-w-[52px]">{n}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{["Days","Hrs","Min","Sec"][i]}</div>
                </div>
              ))}
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 6b. APP INFO ────────────────────────────────────────────────────────────
// Preview only — the public view is a server component (it emits structured
// data), so the canvas draws its own lightweight version of the same box.
export const AppInfoBlock = createReactBlockSpec(
  {
    type: "appInfo" as const,
    propSchema: Object.fromEntries(Object.entries(APP_INFO_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
      [K in keyof typeof APP_INFO_DEFAULTS]: { default: string };
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const app = resolveAppInfo(block.props);
      return (
        <BlockPreview blockId={block.id} type="appInfo" props={block.props} editor={editor} block={block}>
          <div className="m-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              {app.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.icon} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 text-2xl">📱</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-slate-900">{app.name || "App name"}</p>
                {app.developer && <p className="text-xs text-slate-500">{app.developer}</p>}
                {app.rating && <p className="text-xs text-amber-500">★ {app.rating.value.toFixed(1)} · {app.rating.count} ratings</p>}
              </div>
              <span className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white">⤓ {app.buttonText}</span>
            </div>
            {app.specs.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-xs sm:grid-cols-3">
                {app.specs.map(([k, v]) => (
                  <div key={k}><span className="text-slate-400">{k}: </span><span className="font-medium text-slate-700">{v}</span></div>
                ))}
              </div>
            )}
            {!app.name && <p className="mt-2 text-[11px] text-slate-400">Fill in the details in the panel on the right.</p>}
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 6c. PLUGIN ──────────────────────────────────────────────────────────────
// A placed plugin. The real thing renders on the server (see lib/plugins.ts);
// the canvas shows which plugin and its attributes, which is what an author
// needs to see while writing around it.
export const PluginBlock = createReactBlockSpec(
  { type: "plugin" as const, propSchema: { bx: { default: "" }, slug: { default: "" }, name: { default: "" }, attrs: { default: "{}" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      let attrs: Record<string, string> = {};
      try { attrs = JSON.parse(p.attrs || "{}"); } catch { attrs = {}; }
      const pairs = Object.entries(attrs).filter(([, v]) => v !== "");
      return (
        <BlockPreview blockId={block.id} type="plugin" props={p} editor={editor} block={block}>
          <div className="m-2 flex items-center gap-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-lg">🧩</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{p.name || (p.slug ? p.slug : "Plugin — choose one in the panel")}</p>
              <p className="truncate font-mono text-[11px] text-slate-500">
                {p.slug ? `[${p.slug}${pairs.map(([k, v]) => ` ${k}="${v}"`).join("")}]` : "No plugin selected"}
              </p>
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 7. TESTIMONIAL ──────────────────────────────────────────────────────────
export const TestimonialBlock = createReactBlockSpec(
  { type: "testimonial" as const, propSchema: { bx: { default: "" },  quote: { default: "" }, name: { default: "" }, role: { default: "" }, avatar: { default: "" }, rating: { default: "5" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const stars = parseInt(p.rating) || 5;
      return (
        <BlockPreview blockId={block.id} type="testimonial" props={p} editor={editor} block={block}>
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex text-yellow-400 text-sm mb-2">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</div>
            <p className="text-slate-700 text-sm italic">&ldquo;{p.quote || <span className="text-slate-400">Testimonial — click to configure</span>}&rdquo;</p>
            <div className="flex items-center gap-2 mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.avatar && <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full object-cover" />}
              <div>
                <div className="text-sm font-semibold text-slate-800">{p.name || "Name"}</div>
                {p.role && <div className="text-xs text-slate-400">{p.role}</div>}
              </div>
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 8. VIDEO EMBED ──────────────────────────────────────────────────────────
export const VideoEmbedBlock = createReactBlockSpec(
  { type: "videoEmbed" as const, propSchema: { bx: { default: "" },  url: { default: "" }, title: { default: "" }, height: { default: "400" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="videoEmbed" props={p} editor={editor} block={block}>
          <div className="bg-slate-900 rounded-xl flex flex-col items-center justify-center" style={{ minHeight: 120 }}>
            <div className="text-white/60 text-3xl mb-2">▶</div>
            <div className="text-white/40 text-xs text-center px-4">{p.url || "Video Embed — click to set URL"}</div>
            {p.title && <div className="text-white/60 text-xs mt-2">{p.title}</div>}
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 9. GOOGLE MAP ───────────────────────────────────────────────────────────
export const GoogleMapBlock = createReactBlockSpec(
  { type: "googleMap" as const, propSchema: { bx: { default: "" },  query: { default: "" }, zoom: { default: "14" }, height: { default: "400" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="googleMap" props={p} editor={editor} block={block}>
          <div className="bg-slate-100 rounded-xl flex flex-col items-center justify-center py-6 gap-1">
            <span className="text-2xl">📍</span>
            <span className="text-xs text-slate-500">{p.query || "Google Map — click to set address"}</span>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 10. ACCORDION (Advanced) ────────────────────────────────────────────────
//
// `items` keeps its old `{title,content}` shape as a subset of the new one, so
// every accordion saved before this block grew up still renders.
export const AccordionBlock = createReactBlockSpec(
  {
    type: "accordion" as const,
    propSchema: {
      bx: { default: "" },
      items: { default: '[{"title":"Section 1","content":"Content here…"}]' },
      // Behaviour
      closeOthers: { default: "1" },
      startCollapsed: { default: "" },
      initialOpen: { default: "" },
      cols: { default: "" },
      gap: { default: "" },
      // Trigger icon
      showIcon: { default: "1" },
      iconStyle: { default: "plus" },
      iconSide: { default: "right" },
      iconColor: { default: "" },
      hIconColor: { default: "" },
      aIconColor: { default: "" },
      titleTag: { default: "div" },
      // Pane title
      titleColor: { default: "" }, titleBg: { default: "" },
      hTitleColor: { default: "" }, hTitleBg: { default: "" },
      aTitleColor: { default: "" }, aTitleBg: { default: "" },
      tBd: { default: "" }, tBdColor: { default: "" }, tBdStyle: { default: "solid" },
      hTBd: { default: "" }, hTBdColor: { default: "" },
      aTBd: { default: "" }, aTBdColor: { default: "" },
      tRad: { default: "" }, hTRad: { default: "" }, aTRad: { default: "" },
      tPad: { default: "" },
      fs: { default: "" }, lh: { default: "" }, ls: { default: "" },
      ff: { default: "" }, fw: { default: "" }, tt: { default: "" },
      // Inner content
      cText: { default: "" }, cLink: { default: "" }, cLinkHover: { default: "" },
      cBg: { default: "" }, cBd: { default: "" }, cBdColor: { default: "" },
      cBdStyle: { default: "solid" }, cRad: { default: "" }, cPad: { default: "" },
      // Structure
      minHeight: { default: "" }, maxWidth: { default: "" },
      faqSchema: { default: "" },
      // Advanced
      anchor: { default: "" }, cssClass: { default: "" }, customCss: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const editTitle = (index: number, title: string) => {
        const next = parsePanes(p.items).map((it, n) => (n === index ? { ...it, title } : it));
        if (next.length === 0) return;
        editor.updateBlock(block, { props: { ...p, items: serializePanes(next) } });
      };
      return (
        <BlockPreview blockId={block.id} type="accordion" props={p} editor={editor} block={block}>
          {/* Same component the page uses, so what the canvas shows is what
              ships — only inert, because a click here selects the block. */}
          <AccordionFE
            props={p}
            scopeBase={accordionScope(block)}
            titleIcons={resolveAccordion(p, accordionScope(block)).panes.map((pane, i) => <Icon key={i} value={pane.titleIcon} />)}
            inert
            onEditTitle={editTitle}
            onFocusPane={(index) => setActiveListItem({ blockId: block.id, index })}
          />
        </BlockPreview>
      );
    },
  }
);

// ─── 11. TABS ────────────────────────────────────────────────────────────────
export const TabsBlock = createReactBlockSpec(
  { type: "tabs" as const, propSchema: { bx: { default: "" },  tabs: { default: '[{"label":"Tab 1","content":"Content here…"},{"label":"Tab 2","content":"Content here…"}]' } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      let tabs: { label: string; content: string }[] = [];
      try { tabs = JSON.parse(block.props.tabs); } catch {}
      return (
        <BlockPreview blockId={block.id} type="tabs" props={block.props} editor={editor} block={block}>
          <div>
            <div className="flex border-b border-slate-200 bg-slate-50 rounded-t-xl overflow-hidden">
              {tabs.map((tab, i) => (
                <div key={i} className={`px-4 py-2 text-xs font-semibold ${i === 0 ? "text-slate-900 border-b-2 border-slate-900 bg-white" : "text-slate-400"}`}>
                  {tab.label}
                </div>
              ))}
              {tabs.length === 0 && <div className="px-4 py-2 text-xs text-slate-400 italic">Tabs — click to configure</div>}
            </div>
            <div className="p-3 text-xs text-slate-500 bg-white rounded-b-xl border border-t-0 border-slate-200 min-h-[48px]">
              {tabs[0]?.content || <span className="italic text-slate-300">Tab content</span>}
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 12. ICON LIST (Advanced) ────────────────────────────────────────────────
//
// `items` keeps its old `{icon,text}` shape as a subset of the new one, and
// `iconColor` stays in the schema, so every list saved before this block grew up
// still renders — BlockNote drops props it has no slot for, so removing them
// would wipe existing content.
export const IconListBlock = createReactBlockSpec(
  {
    type: "iconList" as const,
    propSchema: {
      bx: { default: "" },
      items: { default: '[{"icon":"✓","text":"Feature one"},{"icon":"✓","text":"Feature two"}]' },
      // Layout
      cols: { default: "" },
      colGap: { default: "" },
      vGap: { default: "" },
      hGap: { default: "" },
      iconAlign: { default: "" },
      // Icon
      icon: { default: "" },
      iconSize: { default: "" },
      iconColor: { default: "#0ea5e9" },
      iconStyle: { default: "default" },
      iconBg: { default: "" },
      iconBorderColor: { default: "" },
      lineWidth: { default: "" },
      // Text
      textColor: { default: "" },
      fs: { default: "" },
      lh: { default: "" },
      ls: { default: "" },
      ff: { default: "" },
      fw: { default: "" },
      tt: { default: "" },
      // Links
      linkColor: { default: "" },
      linkHoverColor: { default: "" },
      underline: { default: "" },
      // Advanced
      anchor: { default: "" },
      cssClass: { default: "" },
      customCss: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      // Editing a label on the canvas writes straight back to `items`, so the
      // panel and the canvas are two views of one value rather than two copies.
      const scope = iconListScope(block);
      const write = (next: ReturnType<typeof parseItems>) =>
        editor.updateBlock(block, { props: { ...p, items: serializeItems(next) } });

      const editText = (index: number, text: string) => {
        const next = parseItems(p.items).map((it, n) => (n === index ? { ...it, text } : it));
        if (next.length === 0) return;
        write(next);
      };

      /**
       * Puts the caret in one item's label once the block has re-rendered.
       *
       * Two frames rather than one: `updateBlock` dispatches a ProseMirror
       * transaction, and the node view is rebuilt on the render that follows it,
       * so a single frame can still find the old element.
       */
      const focusItem = (index: number, atEnd: boolean) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const spans = document
              .querySelector(`.${scope}`)
              ?.querySelectorAll<HTMLElement>(".bmsil-txt[contenteditable]");
            const el = spans?.[index];
            if (!el) return;
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(!atEnd);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          })
        );
      };

      // Enter splits the label at the caret: at the end that is simply a new
      // empty item, which is what pressing Enter in any list does.
      const splitItem = (index: number, before: string, after: string) => {
        const items = parseItems(p.items);
        if (items.length === 0) return;
        const next = items.map((it, n) => (n === index ? { ...it, text: before } : it));
        // The new item inherits nothing but its position — a fresh row should
        // not silently carry the previous one's link or colour overrides.
        next.splice(index + 1, 0, { ...blankItem(), text: after });
        write(next);
        focusItem(index + 1, false);
      };

      const removeItem = (index: number) => {
        const items = parseItems(p.items);
        // Never leave the list with no rows — there would be nothing to click
        // back into to start typing again.
        if (items.length <= 1) return;
        write(items.filter((_, n) => n !== index));
        if (index > 0) focusItem(index - 1, true);
      };
      return (
        <BlockPreview blockId={block.id} type="iconList" props={p} editor={editor} block={block}>
          {/* Same component the page uses, so what the canvas shows is what
              ships — only inert, because a click here selects the block. */}
          <IconListView
            props={p}
            scopeBase={scope}
            inert
            onEditText={editText}
            onSplitItem={splitItem}
            onRemoveItem={removeItem}
            // Focusing a label opens that item in the settings panel, so the
            // two never disagree about which item is being edited.
            onFocusItem={(index) => setActiveListItem({ blockId: block.id, index })}
          />
        </BlockPreview>
      );
    },
  }
);

// ─── 12b. TABLE (Advanced) ───────────────────────────────────────────────────
//
// A separate block from BlockNote's built-in `table`: a built-in has no slot in
// its schema for our props, which is why it is the one block whose panel can
// only say "edit it in the canvas". Same reasoning as `textAdvanced`.
export const TableAdvancedBlock = createReactBlockSpec(
  {
    type: "tableAdvanced" as const,
    propSchema: {
      bx: { default: "" },
      rows: { default: '[["Column 1","Column 2"],["",""],["",""]]' },
      caption: { default: "" },
      // Structure
      head: { default: "1" },
      foot: { default: "" },
      fixed: { default: "1" },
      width: { default: "" },
      align: { default: "" },
      // Style
      style: { default: "default" },
      color: { default: "" },
      fs: { default: "" },
      ff: { default: "" },
      bgType: { default: "color" },
      bg: { default: "" },
      bgGradFrom: { default: "" }, bgGradTo: { default: "" },
      bgGradType: { default: "linear" }, bgGradAngle: { default: "" },
      headBg: { default: "" }, headColor: { default: "" }, headWeight: { default: "" },
      footBg: { default: "" },
      stripeColor: { default: "" }, rowHoverBg: { default: "" },
      bd: { default: "" }, bdColor: { default: "" }, bdStyle: { default: "solid" },
      cellPad: { default: "" },
      // Advanced
      anchor: { default: "" }, cssClass: { default: "" }, customCss: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      // Editing a cell writes straight back to `rows`, so the panel and the
      // canvas are two views of one value rather than two copies.
      const editCell = (r: number, c: number, value: string) =>
        editor.updateBlock(block, {
          props: { ...p, rows: serializeRows(setCell(parseRows(p.rows), r, c, value)) },
        });
      return (
        <BlockPreview blockId={block.id} type="tableAdvanced" props={p} editor={editor} block={block}>
          {/* Same component the page uses, so what the canvas shows is what
              ships — only inert, because a click here selects the block. */}
          <TableView props={p} scopeBase={tableScope(block)} inert onEditCell={editCell} />
        </BlockPreview>
      );
    },
  }
);

// ─── 13. TABLE OF CONTENTS ───────────────────────────────────────────────────
//
// The block owns none of its entries — they come from every heading on the
// page, the same list `documentHeadings` walks for the published side. The
// canvas has no such document-wide view of live headings to read, so it
// previews against a fixed sample outline instead: enough to show every
// panel control (icon, collapse, levels, colours) doing something real,
// without building a second heading-collector just for the editor.
const TOC_SAMPLE_HEADINGS = [
  { level: 1, text: "Getting Started" },
  { level: 2, text: "Installation" },
  { level: 2, text: "Configuration" },
  { level: 1, text: "Advanced Usage" },
];

export const TableOfContentsBlock = createReactBlockSpec(
  {
    type: "tableOfContents" as const,
    propSchema: {
      bx: { default: "" },
      title: { default: "Table of Contents" },
      showTitle: { default: "1" },
      showNumbers: { default: "true" },
      levels: { default: "123456" },
      // Collapsible behaviour
      collapsible: { default: "" },
      startCollapsed: { default: "" },
      titleToggle: { default: "1" },
      showIcon: { default: "1" },
      iconStyle: { default: "plus" },
      iconColor: { default: "" },
      // Title
      titleColor: { default: "" }, titleBg: { default: "" },
      tFs: { default: "" }, tLh: { default: "" }, tLs: { default: "" },
      tFf: { default: "" }, tFw: { default: "" }, tTt: { default: "" },
      tPad: { default: "" }, tBd: { default: "" }, tBdColor: { default: "" }, tBdStyle: { default: "solid" },
      tRad: { default: "" }, tMargin: { default: "" },
      // List
      listGap: { default: "" }, listColor: { default: "" }, listStyle: { default: "underline" },
      lFs: { default: "" }, lLh: { default: "" }, lLs: { default: "" },
      lFf: { default: "" }, lFw: { default: "" }, lTt: { default: "" },
      listMargin: { default: "" }, activeColor: { default: "" },
      // Container
      bg: { default: "" }, bd: { default: "" }, bdColor: { default: "" }, bdStyle: { default: "solid" },
      rad: { default: "" }, shadow: { default: "" },
      // Structure
      pad: { default: "" }, margin: { default: "" }, maxWidth: { default: "" },
      // Scroll behaviour
      smoothScroll: { default: "1" }, highlightActive: { default: "" },
      // Advanced
      anchor: { default: "" }, cssClass: { default: "" }, customCss: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="tableOfContents" props={p} editor={editor} block={block}>
          <TableOfContentsFE props={p} headings={TOC_SAMPLE_HEADINGS} scopeBase={tocScope(block)} inert />
        </BlockPreview>
      );
    },
  }
);

const AUTHOR_BIO_SAMPLE = {
  name: "Jordan Ray",
  slug: "jordan-ray",
  image: null,
  bio: "Writes about gear, guides and everything in between. This text comes from the account's own Biography field — edit it there, not here.",
  website: "https://example.com",
  twitter: "https://x.com/example",
  linkedin: null,
  facebook: null,
  instagram: null,
  github: null,
  youtube: null,
};

export const AuthorBioBlock = createReactBlockSpec(
  {
    type: "authorBio" as const,
    propSchema: {
      bx: { default: "" },
      show: { default: "avatar,name,bio,social" },
      align: { default: "center" },
      // Avatar
      avatarSize: { default: "96px" }, avatarShape: { default: "circle" },
      // Name
      nameTag: { default: "h2" }, nameColor: { default: "" }, nameFs: { default: "" },
      // Bio
      bioColor: { default: "" }, bioFs: { default: "" },
      // Social
      socialColor: { default: "" }, socialSize: { default: "" }, socialGap: { default: "" },
      // Container
      bg: { default: "" }, rad: { default: "" }, pad: { default: "" }, margin: { default: "" }, maxWidth: { default: "" },
      // Advanced
      anchor: { default: "" }, cssClass: { default: "" }, customCss: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="authorBio" props={p} editor={editor} block={block}>
          <AuthorBioFE props={p} author={AUTHOR_BIO_SAMPLE} scopeBase={authorBioScope(block)} />
        </BlockPreview>
      );
    },
  }
);

// ─── 14. SPLIT CONTENT ────────────────────────────────────────────────────────
export const SplitContentBlock = createReactBlockSpec(
  { type: "splitContent" as const, propSchema: { bx: { default: "" },  image: { default: "" }, imagePosition: { default: "right" }, heading: { default: "" }, text: { default: "" }, buttonText: { default: "" }, buttonUrl: { default: "" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="splitContent" props={p} editor={editor} block={block}>
          <div className={`grid grid-cols-2 gap-4 p-3 ${p.imagePosition === "right" ? "" : "direction-rtl"}`}>
            <div className={p.imagePosition === "right" ? "order-2" : "order-1"}>
              {p.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.image} alt="" className="w-full rounded-lg object-cover" style={{ maxHeight: 100 }} />
                : <div className="bg-slate-100 rounded-lg h-20 flex items-center justify-center text-slate-400 text-xs">Image</div>
              }
            </div>
            <div className={p.imagePosition === "right" ? "order-1" : "order-2"}>
              <div className="font-semibold text-sm text-slate-800">{p.heading || <span className="text-slate-300 italic">Heading</span>}</div>
              <div className="text-xs text-slate-500 mt-1">{p.text || <span className="text-slate-300 italic">Body text</span>}</div>
              {p.buttonText && <div className="mt-2 inline-block bg-blue-600 text-white text-xs px-3 py-1 rounded-lg">{p.buttonText}</div>}
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 15. ROW LAYOUT ──────────────────────────────────────────────────────────
// Lives in its own file: it hosts a nested editor per column, so it is an order
// of magnitude more code than the blocks here and shares nothing with them.

// ─── 16. CALLOUT ──────────────────────────────────────────────────────────────
export const CalloutBlock = createReactBlockSpec(
  { type: "callout" as const, propSchema: { bx: { default: "" },  text: { default: "" }, emoji: { default: "💡" }, bgColor: { default: "#fef9c3" } }, content: "none" as const },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="callout" props={p} editor={editor} block={block}>
          <div className="flex gap-3 rounded-xl p-3 items-start" style={{ backgroundColor: p.bgColor || "#fef9c3" }}>
            <span className="text-xl">{p.emoji || "💡"}</span>
            <p className="text-sm text-slate-700">{p.text || <span className="italic text-slate-400">Callout — click to configure</span>}</p>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 16b. IFRAME EMBED ADVANCED ──────────────────────────────────────────────
// A page embedded inside a card with a header, a notice and a footer button.
// The canvas draws the same component the published page does.
export const IframeEmbedAdvancedBlock = createReactBlockSpec(
  {
    type: "iframeEmbedAdvanced" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(IFRAME_EMBED_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof IFRAME_EMBED_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      // Title, badge, notice, footer text and button label are typed on the
      // canvas and written straight back to the block's settings.
      const write = (patch: Record<string, string>) => editor.updateBlock(block, { props: { ...p, ...patch } });
      return (
        <BlockPreview blockId={block.id} type="iframeEmbedAdvanced" props={p} editor={editor} block={block}>
          <IframeEmbedView props={p} canvas onEdit={editor?.isEditable !== false ? write : undefined} />
        </BlockPreview>
      );
    },
  }
);

// ─── 16c. STEPS GRID ─────────────────────────────────────────────────────────
// 1–25 numbered steps in a grid. The canvas draws the published component.
export const StepsGridBlock = createReactBlockSpec(
  {
    type: "stepsGrid" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(STEPS_GRID_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof STEPS_GRID_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      // Typing a title or description on the canvas writes that one field of
      // that one step back into the steps list — the panel and the canvas
      // are two views of the same value.
      const editStep = (index: number, field: "title" | "text", value: string) => {
        const steps = parseSteps(p.steps);
        if (!steps[index] || (steps[index][field] ?? "") === value) return;
        steps[index] = { ...steps[index], [field]: value };
        editor.updateBlock(block, { props: { ...p, steps: JSON.stringify(steps) } });
      };
      return (
        <BlockPreview blockId={block.id} type="stepsGrid" props={p} editor={editor} block={block}>
          <StepsGridView props={p} canvas onEditStep={editor?.isEditable !== false ? editStep : undefined} />
        </BlockPreview>
      );
    },
  }
);

// ─── 16e. THE HOOKLESS VIEW BLOCKS ───────────────────────────────────────────
// Hero, CTA Band, Card Grid, Stats Strip, Pros & Cons, Call Bar, Logo Strip,
// Notice Bar, Comparison Table, Version History. Each is drawn on the canvas
// by the page's own component (components/frontend/blocks/*View.tsx), and what
// is typed in place is written straight to the block's props: a view reports a
// prop's key and its new value, lists as their JSON string.
//
// The specs are written out one by one, not built by a helper, because
// scripts/block-manifest.mjs reads `type` and `propSchema` from this source.
function viewRender(type: string, View: ComponentType<ViewProps>) {
  const Canvas = ({ block, editor }: any) => {
    const p = block.props;
    const onEdit = (key: string, value: string) => editor.updateBlock(block, { props: { ...p, [key]: value } });
    return (
      <BlockPreview blockId={block.id} type={type} props={p} editor={editor} block={block}>
        <View props={p} canvas onEdit={editor?.isEditable !== false ? onEdit : undefined} />
      </BlockPreview>
    );
  };
  return Canvas;
}

export const HeroBlock = createReactBlockSpec(
  {
    type: "hero" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(HERO_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof HERO_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("hero", HeroView) }
);

export const CtaBandBlock = createReactBlockSpec(
  {
    type: "ctaBand" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(CTA_BAND_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof CTA_BAND_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("ctaBand", CtaBandView) }
);

export const CardGridBlock = createReactBlockSpec(
  {
    type: "cardGrid" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(CARD_GRID_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof CARD_GRID_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("cardGrid", CardGridView) }
);

export const StatsStripBlock = createReactBlockSpec(
  {
    type: "statsStrip" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(STATS_STRIP_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof STATS_STRIP_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("statsStrip", StatsStripView) }
);

export const ProsConsBlock = createReactBlockSpec(
  {
    type: "prosCons" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(PROS_CONS_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof PROS_CONS_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("prosCons", ProsConsView) }
);

export const CallBarBlock = createReactBlockSpec(
  {
    type: "callBar" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(CALL_BAR_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof CALL_BAR_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("callBar", CallBarView) }
);

export const LogoStripBlock = createReactBlockSpec(
  {
    type: "logoStrip" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(LOGO_STRIP_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof LOGO_STRIP_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("logoStrip", LogoStripView) }
);

export const NoticeBarBlock = createReactBlockSpec(
  {
    type: "noticeBar" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(NOTICE_BAR_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof NOTICE_BAR_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("noticeBar", NoticeBarView) }
);

export const ComparisonTableBlock = createReactBlockSpec(
  {
    type: "comparisonTable" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(COMPARISON_TABLE_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof COMPARISON_TABLE_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("comparisonTable", ComparisonTableView) }
);

export const VersionHistoryBlock = createReactBlockSpec(
  {
    type: "versionHistory" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(VERSION_HISTORY_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof VERSION_HISTORY_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("versionHistory", VersionHistoryView) }
);

export const LinkGridBlock = createReactBlockSpec(
  {
    type: "linkGrid" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(LINK_GRID_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof LINK_GRID_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("linkGrid", LinkGridView) }
);

export const ReviewGridBlock = createReactBlockSpec(
  {
    type: "reviewGrid" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(REVIEW_GRID_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof REVIEW_GRID_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("reviewGrid", ReviewGridView) }
);

export const PriceListBlock = createReactBlockSpec(
  {
    type: "priceList" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(PRICE_LIST_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof PRICE_LIST_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("priceList", PriceListView) }
);

export const KeyTakeawaysBlock = createReactBlockSpec(
  {
    type: "keyTakeaways" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(KEY_TAKEAWAYS_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof KEY_TAKEAWAYS_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("keyTakeaways", KeyTakeawaysView) }
);

export const FactSheetBlock = createReactBlockSpec(
  {
    type: "factSheet" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(FACT_SHEET_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof FACT_SHEET_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("factSheet", FactSheetView) }
);

export const ShareButtonsBlock = createReactBlockSpec(
  {
    type: "shareButtons" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(SHARE_BUTTONS_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof SHARE_BUTTONS_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  { render: viewRender("shareButtons", ShareButtonsView) }
);

// ─── 16d. HIGHLIGHT PANEL ────────────────────────────────────────────────────
// A coloured panel: heading, intro, 1–12 points. The canvas draws the page's
// component; the heading, intro and each point's title and text are typed in place.
export const HighlightPanelBlock = createReactBlockSpec(
  {
    type: "highlightPanel" as const,
    propSchema: {
      bx: { default: "" },
      ...(Object.fromEntries(Object.entries(HIGHLIGHT_PANEL_DEFAULTS).map(([k, v]) => [k, { default: v }])) as {
        [K in keyof typeof HIGHLIGHT_PANEL_DEFAULTS]: { default: string };
      }),
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const onEdit = (c: { key: "heading" | "intro"; value: string } | { index: number; field: "title" | "text"; value: string }) => {
        if ("key" in c) {
          editor.updateBlock(block, { props: { ...p, [c.key]: c.value } });
          return;
        }
        const points = parsePoints(p.points);
        if (!points[c.index]) return;
        points[c.index] = { ...points[c.index], [c.field]: c.value };
        editor.updateBlock(block, { props: { ...p, points: JSON.stringify(points) } });
      };
      return (
        <BlockPreview blockId={block.id} type="highlightPanel" props={p} editor={editor} block={block}>
          <HighlightPanelView props={p} canvas onEdit={editor?.isEditable !== false ? onEdit : undefined} />
        </BlockPreview>
      );
    },
  }
);

// ─── 17. TEXT ADVANCED ────────────────────────────────────────────────────────
export const FONT_FAMILIES = [
  ["", "Default"], ["Arial, sans-serif", "Arial"], ["Georgia, serif", "Georgia"],
  ["'Times New Roman', serif", "Times New Roman"], ["'Courier New', monospace", "Courier"],
  ["Verdana, sans-serif", "Verdana"], ["Tahoma, sans-serif", "Tahoma"],
  ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Inter, sans-serif", "Inter"],
  ["Roboto, sans-serif", "Roboto"], ["'Poppins', sans-serif", "Poppins"],
  ["'Playfair Display', serif", "Playfair"],
];

// Wrapper and text styles live in `@/lib/textAdvanced` so the canvas and the
// published page cannot drift apart. Re-exported because panels import them
// from here.
export { textAdvancedWrapStyle, textAdvancedTextStyle };

export const TextAdvancedBlock = createReactBlockSpec(
  {
    type: "textAdvanced" as const,
    propSchema: { bx: { default: "" }, 
      tag:           { default: "p" },
      align:         { default: "left" },
      maxWidth:      { default: "" },
      maxWidthUnit:  { default: "%" },
      linkUrl:       { default: "" },
      linkTarget:    { default: "_self" },
      color:         { default: "" },
      bgColor:       { default: "" },
      fontFamily:    { default: "" },
      fontSize:      { default: "" },
      fontWeight:    { default: "400" },
      fontStyle:     { default: "normal" },
      lineHeight:    { default: "" },
      letterSpacing: { default: "" },
      textTransform: { default: "none" },
      textDecoration:{ default: "none" },
      orientation:   { default: "normal" },
      // Text gradient
      textGradient:  { default: "false" },
      gradFrom:      { default: "#0ea5e9" },
      gradTo:        { default: "#9333ea" },
      gradAngle:     { default: "90" },
      // Text shadow
      textShadow:    { default: "false" },
      shadowX:       { default: "0" },
      shadowY:       { default: "2" },
      shadowBlur:    { default: "4" },
      shadowColor:   { default: "#00000040" },
      // Highlight
      highlightColor:  { default: "" },
      highlightRadius: { default: "" },
      // Icon
      iconChar:      { default: "" },
      iconPos:       { default: "left" },
      iconSize:      { default: "" },
      iconColor:     { default: "" },
      // Border — all-sides values, then optional per-side overrides. Each side
      // falls back to the all-sides value, so blocks styled before per-side
      // existed render exactly as they did.
      borderWidth:   { default: "" },
      borderColor:   { default: "#e2e8f0" },
      borderStyle:   { default: "solid" },
      borderRadius:  { default: "" },
      borderTopWidth:    { default: "" },
      borderTopColor:    { default: "" },
      borderTopStyle:    { default: "" },
      borderRightWidth:  { default: "" },
      borderRightColor:  { default: "" },
      borderRightStyle:  { default: "" },
      borderBottomWidth: { default: "" },
      borderBottomColor: { default: "" },
      borderBottomStyle: { default: "" },
      borderLeftWidth:   { default: "" },
      borderLeftColor:   { default: "" },
      borderLeftStyle:   { default: "" },
      // Spacing
      paddingTop:    { default: "" },
      paddingRight:  { default: "" },
      paddingBottom: { default: "" },
      paddingLeft:   { default: "" },
      marginTop:     { default: "" },
      marginBottom:  { default: "" },
    },
    content: "inline" as const,
  },
  {
    // Inline-editable: text is typed directly in the canvas; sidebar controls styling only.
    render: ({ block, editor, contentRef }: any) => {
      const p = block.props;
      const Tag = (p.tag || "p") as any;
      const hasIcon = !!p.iconChar;
      const iconStyle: React.CSSProperties = {
        fontSize: p.iconSize ? `${p.iconSize}px` : undefined,
        color: p.iconColor || undefined,
      };
      const icon = hasIcon ? <span style={iconStyle} contentEditable={false} className="select-none">{p.iconChar}</span> : null;
      // tiptap's base NodeView constructor mounts (and, on an initialised
      // editor, synchronously renders) the React component *before* the React
      // subclass creates its `contentDOMElement`, so on a block inserted into a
      // live editor `contentRef` fires with nothing to attach and ProseMirror's
      // content element stays detached. Typed text then lands in the wrapper
      // div — outside the tag, so an h1 looked like body text — and never
      // reaches the document, so Backspace saw an empty block and removed it.
      // Blocks loaded with the post take a deferred render and were fine. When
      // the element is missing after the first call, ask again one tick later.
      const attachContent = (el: HTMLElement | null) => {
        contentRef(el);
        if (el && !el.querySelector(":scope > [data-node-view-content-react]")) {
          queueMicrotask(() => { if (el.isConnected) contentRef(el); });
        }
      };
      return (
        <div
          style={textAdvancedWrapStyle(p)}
          className="outline-none my-2 transition-shadow hover:ring-2 hover:ring-sky-300/40 flex items-baseline gap-2"
          onClick={() =>
            setActiveBlock({
              id: block.id,
              type: "textAdvanced",
              props: p,
              update: (np) => editor.updateBlock(block, { props: np }),
            })
          }
        >
          {p.iconPos !== "right" && icon}
          <Tag ref={attachContent} style={textAdvancedTextStyle(p)} className="outline-none flex-1" />
          {p.iconPos === "right" && icon}
        </div>
      );
    },
  }
);

// ─── 18. IMAGE ADVANCED ───────────────────────────────────────────────────────
export function imageFilterCss(p: Record<string, string>): string | undefined {
  if (!p.filter || p.filter === "none") return undefined;
  const a = p.filterAmount;
  switch (p.filter) {
    case "grayscale":  return `grayscale(${a || 100}%)`;
    case "sepia":      return `sepia(${a || 100}%)`;
    case "blur":       return `blur(${a || 2}px)`;
    case "brightness": return `brightness(${a || 110}%)`;
    case "contrast":   return `contrast(${a || 110}%)`;
    case "saturate":   return `saturate(${a || 150}%)`;
    case "invert":     return `invert(${a || 100}%)`;
    default:           return undefined;
  }
}

export function imageWrapStyle(p: Record<string, string>): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: p.align === "center" ? "center" : p.align === "right" ? "flex-end" : "flex-start",
    backgroundColor: p.bgColor || undefined,
    paddingTop: p.paddingTop ? `${p.paddingTop}px` : undefined,
    paddingRight: p.paddingRight ? `${p.paddingRight}px` : undefined,
    paddingBottom: p.paddingBottom ? `${p.paddingBottom}px` : undefined,
    paddingLeft: p.paddingLeft ? `${p.paddingLeft}px` : undefined,
    marginTop: p.marginTop ? `${p.marginTop}px` : undefined,
    marginBottom: p.marginBottom ? `${p.marginBottom}px` : undefined,
  };
}

export function imageFigureStyle(p: Record<string, string>): React.CSSProperties {
  return {
    margin: 0,
    width: p.width ? `${p.width}${p.widthUnit || "%"}` : "100%",
    maxWidth: "100%",
    border: p.borderWidth ? `${p.borderWidth}px ${p.borderStyle || "solid"} ${p.borderColor || "#e2e8f0"}` : undefined,
    borderRadius: p.borderRadius ? `${p.borderRadius}px` : undefined,
    boxShadow: p.boxShadow === "true"
      ? `${p.shadowX || 0}px ${p.shadowY || 8}px ${p.shadowBlur || 24}px ${p.shadowSpread || 0}px ${p.shadowColor || "#00000026"}`
      : undefined,
    overflow: "hidden",
  };
}

export function imageImgStyle(p: Record<string, string>): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    height: p.height ? `${p.height}px` : "auto",
    objectFit: (p.objectFit || "cover") as any,
    filter: imageFilterCss(p),
    transition: "transform .4s ease",
  };
}

/**
 * Drag-to-resize rails, the way Gutenberg and Kadence draw them.
 *
 * The width is only written back to the block when the pointer is released.
 * Updating the prop on every pointermove would push a ProseMirror transaction
 * per frame and bury the undo stack under a hundred one-pixel steps, so the
 * drag mutates the frame's own style and commits once at the end.
 *
 * The frame — not the figure — carries the width, which lets the figure stay at
 * 100% and keeps `imageFigureStyle` identical to what the published page uses.
 */
const IMAGE_MIN_WIDTH_RATIO = 0.05;

function ImageResizeFrame({
  p, editable, onCommit, children,
}: {
  p: Record<string, string>;
  editable: boolean;
  onCommit: (width: string) => void;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<string | null>(null);
  const unit = p.widthUnit || "%";

  const startDrag = (side: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current;
    const parent = frame?.parentElement;
    if (!frame || !parent) return;

    const startX = e.clientX;
    const startW = frame.getBoundingClientRect().width;
    const avail = parent.getBoundingClientRect().width || 1;
    // A centred image grows from both edges at once, so one pixel of pointer
    // travel is two pixels of width.
    const factor = (p.align || "center") === "center" ? 2 : 1;
    const dir = side === "right" ? 1 : -1;

    const toUnit = (px: number) => {
      if (unit === "px") return String(Math.round(px));
      if (unit === "rem") return String(Math.round((px / 16) * 100) / 100);
      if (unit === "vw") return String(Math.round((px / window.innerWidth) * 1000) / 10);
      return String(Math.round((px / avail) * 1000) / 10);
    };

    let next = toUnit(startW);

    const move = (ev: PointerEvent) => {
      const raw = startW + (ev.clientX - startX) * dir * factor;
      const px = Math.min(Math.max(raw, avail * IMAGE_MIN_WIDTH_RATIO), avail);
      next = toUnit(px);
      frame.style.width = `${next}${unit}`;
      setLive(`${next}${unit}`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLive(null);
      onCommit(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const rail = (side: "left" | "right") => (
    <span
      onPointerDown={startDrag(side)}
      title="Drag to resize"
      className={`absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover/img:opacity-100 ${
        side === "right" ? "-right-1.5" : "-left-1.5"
      } ${live ? "opacity-100" : ""}`}
    >
      <span className="h-full w-[2px] rounded-full bg-sky-500" />
      <span className="absolute h-3 w-3 rounded-full border-2 border-white bg-sky-500 shadow-sm" />
    </span>
  );

  return (
    <div
      ref={frameRef}
      className="group/img relative"
      style={{
        width: p.width ? `${p.width}${unit}` : "100%",
        maxWidth: "100%",
      }}
    >
      {children}
      {editable && (
        <>
          {rail("left")}
          {rail("right")}
          {live && (
            <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {live}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function imageHoverClass(p: Record<string, string>): string {
  if (p.hoverEffect === "zoom") return "img-adv-zoom";
  if (p.hoverEffect === "lift") return "img-adv-lift";
  return "";
}

export const ImageAdvancedBlock = createReactBlockSpec(
  {
    type: "imageAdvanced" as const,
    propSchema: { bx: { default: "" }, 
      src:          { default: "" },
      alt:          { default: "" },
      caption:      { default: "" },
      align:        { default: "center" },
      width:        { default: "" },
      widthUnit:    { default: "%" },
      height:       { default: "" },
      objectFit:    { default: "cover" },
      linkUrl:      { default: "" },
      linkTarget:   { default: "_self" },
      /** auto | priority (the page's main image) | eager (never lazy) — see BlockRenderer. */
      loadMode:     { default: "auto" },
      // Style
      bgColor:      { default: "" },
      borderWidth:  { default: "" },
      borderStyle:  { default: "solid" },
      borderColor:  { default: "#e2e8f0" },
      borderRadius: { default: "" },
      boxShadow:    { default: "false" },
      shadowX:      { default: "0" },
      shadowY:      { default: "8" },
      shadowBlur:   { default: "24" },
      shadowSpread: { default: "0" },
      shadowColor:  { default: "#00000026" },
      filter:       { default: "none" },
      filterAmount: { default: "" },
      overlayColor: { default: "" },
      overlayOpacity: { default: "30" },
      hoverEffect:  { default: "none" },
      // Advanced
      paddingTop:   { default: "" },
      paddingRight: { default: "" },
      paddingBottom:{ default: "" },
      paddingLeft:  { default: "" },
      marginTop:    { default: "" },
      marginBottom: { default: "" },
      cssClass:     { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const overlay = p.overlayColor ? (
        <div style={{ position: "absolute", inset: 0, backgroundColor: p.overlayColor, opacity: (parseInt(p.overlayOpacity) || 30) / 100, pointerEvents: "none" }} />
      ) : null;
      return (
        <BlockPreview blockId={block.id} type="imageAdvanced" props={p} editor={editor} block={block}>
          <div style={imageWrapStyle(p)} className={p.cssClass || undefined}>
            <ImageResizeFrame
              p={p}
              editable={editor?.isEditable !== false}
              onCommit={(width) => {
                const np = { ...p, width };
                editor.updateBlock(block, { props: np });
                // The panel holds the props it was opened with, so without this
                // the next sidebar edit would write the pre-drag width back.
                setActiveBlock({
                  id: block.id,
                  type: "imageAdvanced",
                  props: np,
                  update: (x) => editor.updateBlock(block, { props: x }),
                });
              }}
            >
              {/* The frame owns the width here, so the figure fills it — every
                  other style stays exactly what the published page renders. */}
              <figure style={{ ...imageFigureStyle(p), width: "100%" }} className={imageHoverClass(p)}>
                <div style={{ position: "relative" }}>
                  {p.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.src} alt={p.alt || ""} style={imageImgStyle(p)} />
                  ) : (
                    <div className="bg-slate-100 flex flex-col items-center justify-center text-slate-400 text-xs gap-1 py-12">
                      <span className="text-2xl">🖼</span>
                      <span>Click to add an image (Image settings)</span>
                    </div>
                  )}
                  {overlay}
                </div>
                {p.caption && <figcaption className="text-center text-xs text-slate-500 mt-2">{p.caption}</figcaption>}
              </figure>
            </ImageResizeFrame>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
// ─── 19. GALLERY ──────────────────────────────────────────────────────────────
export const GalleryBlock = createReactBlockSpec(
  {
    type: "gallery" as const,
    propSchema: {
      bx: { default: "" },
      images:   { default: "[]" },   // [{ src, alt, caption }]
      columns:  { default: "3" },
      gap:      { default: "12" },
      radius:   { default: "10" },
      ratio:    { default: "square" }, // square | landscape | portrait | auto
      captions: { default: "false" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      let imgs: { src: string; alt?: string }[] = [];
      try { imgs = JSON.parse(p.images); } catch {}
      return (
        <BlockPreview blockId={block.id} type="gallery" props={p} editor={editor} block={block}>
          {imgs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              Gallery — click to add images
            </div>
          ) : (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(parseInt(p.columns) || 3, 6)},minmax(0,1fr))` }}>
              {imgs.slice(0, 12).map((im, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={im.src} alt="" className="w-full aspect-square object-cover rounded" />
              ))}
            </div>
          )}
        </BlockPreview>
      );
    },
  }
);

// ─── 20. ICON ─────────────────────────────────────────────────────────────────
export const IconBlock = createReactBlockSpec(
  {
    type: "icon" as const,
    propSchema: {
      bx: { default: "" },
      icon:   { default: "★" },
      size:   { default: "40" },
      color:  { default: "" },
      bg:     { default: "" },
      shape:  { default: "none" },   // none | circle | square
      align:  { default: "left" },
      url:    { default: "" },
      label:  { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="icon" props={p} editor={editor} block={block}>
          <div className={`p-2 flex ${p.align === "center" ? "justify-center" : p.align === "right" ? "justify-end" : "justify-start"}`}>
            <span style={{ fontSize: `${parseInt(p.size) || 40}px`, color: p.color || undefined, lineHeight: 1 }}>
              <Icon value={p.icon} fallback="★" />
            </span>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 21. SOCIAL ICONS ─────────────────────────────────────────────────────────
export const SocialIconsBlock = createReactBlockSpec(
  {
    type: "socialIcons" as const,
    propSchema: {
      bx: { default: "" },
      items: { default: '[{"network":"x","url":""},{"network":"instagram","url":""}]' },
      size:  { default: "20" },
      gap:   { default: "10" },
      style: { default: "plain" },  // plain | filled | outline
      align: { default: "left" },
      color: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      let items: { network: string }[] = [];
      try { items = JSON.parse(p.items); } catch {}
      return (
        <BlockPreview blockId={block.id} type="socialIcons" props={p} editor={editor} block={block}>
          <div className={`p-2 flex gap-3 ${p.align === "center" ? "justify-center" : p.align === "right" ? "justify-end" : ""}`}>
            {items.length === 0
              ? <span className="text-sm text-slate-400 italic">Social Icons — click to configure</span>
              : items.map((it, i) => (
                  <span key={i} className="text-lg" title={it.network}>{SOCIAL_GLYPHS[it.network] ?? "●"}</span>
                ))}
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 22. STAR RATING ──────────────────────────────────────────────────────────
export const StarRatingBlock = createReactBlockSpec(
  {
    type: "starRating" as const,
    propSchema: {
      bx: { default: "" },
      value: { default: "4.5" },
      max:   { default: "5" },
      size:  { default: "22" },
      color: { default: "#f59e0b" },
      label: { default: "" },
      align: { default: "left" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="starRating" props={p} editor={editor} block={block}>
          <div className="p-2 flex items-center gap-2">
            <span style={{ color: p.color || "#f59e0b", fontSize: `${parseInt(p.size) || 22}px`, lineHeight: 1 }}>
              {"★".repeat(Math.round(parseFloat(p.value) || 0))}
            </span>
            {p.label && <span className="text-xs text-slate-500">{p.label}</span>}
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 22b. BUSINESS INFO ──────────────────────────────────────────────────────
// Prints the details from SEO → Local SEO. The editor cannot read settings, so
// the preview names what will appear rather than showing it.
export const BusinessInfoBlock = createReactBlockSpec(
  {
    type: "businessInfo" as const,
    propSchema: {
      bx: { default: "" },
      /** Comma list of parts: address, phone, email, hours, map. */
      show: { default: "address,phone,email,hours" },
      layout: { default: "stack" },
      title: { default: "" },
      mapHeight: { default: "260" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const parts = String(p.show || "").split(",").filter(Boolean);
      return (
        <BlockPreview blockId={block.id} type="businessInfo" props={p} editor={editor} block={block}>
          <div className="p-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40">
            {p.title && <p className="font-semibold text-sm text-slate-800 mb-1">{p.title}</p>}
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-emerald-700">Business Info</span> — shows {parts.length ? parts.join(", ") : "nothing yet"} from SEO → Local SEO.
            </p>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 22c. SLIDER ─────────────────────────────────────────────────────────────
export const SliderBlock = createReactBlockSpec(
  {
    type: "slider" as const,
    propSchema: {
      bx: { default: "" },
      slides: { default: JSON.stringify([
        { image: "", alt: "", title: "Slide one", text: "", buttonLabel: "", buttonUrl: "" },
        { image: "", alt: "", title: "Slide two", text: "", buttonLabel: "", buttonUrl: "" },
        { image: "", alt: "", title: "Slide three", text: "", buttonLabel: "", buttonUrl: "" },
      ]) },
      perDesktop: { default: "1" },
      perTablet: { default: "1" },
      perMobile: { default: "1" },
      gap: { default: "16" },
      autoplay: { default: "true" },
      interval: { default: "5000" },
      pauseOnHover: { default: "true" },
      loop: { default: "true" },
      arrows: { default: "true" },
      dots: { default: "true" },
      captions: { default: "true" },
      overlay: { default: "true" },
      ratio: { default: "16/9" },
      radius: { default: "12" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      let slides: { image?: string; title?: string }[] = [];
      try { slides = JSON.parse(p.slides || "[]"); } catch {}
      const first = slides[0];
      return (
        <BlockPreview blockId={block.id} type="slider" props={p} editor={editor} block={block}>
          <div className="relative overflow-hidden rounded-xl bg-slate-100" style={{ aspectRatio: p.ratio !== "auto" ? p.ratio : "16/9" }}>
            {first?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={first.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Slider — add images in the panel</div>
            )}
            {first?.title && <p className="absolute bottom-3 left-4 font-bold text-white drop-shadow">{first.title}</p>}
            <span className="absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">{slides.length} slides</span>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 22d. MODAL / POPUP ──────────────────────────────────────────────────────
export const ModalBlock = createReactBlockSpec(
  {
    type: "modal" as const,
    propSchema: {
      bx: { default: "" },
      trigger: { default: "button" },
      triggerLabel: { default: "Open" },
      triggerImage: { default: "" },
      triggerAlign: { default: "left" },
      title: { default: "Popup title" },
      text: { default: "" },
      image: { default: "" },
      video: { default: "" },
      buttonLabel: { default: "" },
      buttonUrl: { default: "" },
      width: { default: "md" },
      autoOpen: { default: "false" },
      delay: { default: "5" },
      exitIntent: { default: "false" },
      oncePerVisitor: { default: "true" },
      closeOnBackdrop: { default: "true" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const auto = p.trigger === "none" || p.autoOpen === "true" || p.exitIntent === "true";
      return (
        <BlockPreview blockId={block.id} type="modal" props={p} editor={editor} block={block}>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 p-3">
            <span className="text-lg">🗖</span>
            <div className="min-w-0 flex-1 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">{p.title || "Popup"}</p>
              <p>
                {p.trigger === "none" ? "No trigger" : `Opens from a ${p.trigger}${p.triggerLabel ? ` “${p.triggerLabel}”` : ""}`}
                {auto ? ` · opens by itself${p.autoOpen === "true" ? ` after ${p.delay}s` : ""}${p.exitIntent === "true" ? " / on exit intent" : ""}` : ""}
              </p>
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 22e. LOTTIE ─────────────────────────────────────────────────────────────
export const LottieBlock = createReactBlockSpec(
  {
    type: "lottie" as const,
    propSchema: {
      bx: { default: "" },
      src: { default: "" },
      trigger: { default: "autoplay" },
      loop: { default: "true" },
      speed: { default: "1" },
      width: { default: "400" },
      align: { default: "center" },
      label: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="lottie" props={p} editor={editor} block={block}>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-teal-300 bg-teal-50/50 p-3 text-xs text-slate-600">
            <span className="text-lg">✨</span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-slate-800">Lottie animation</span>
              {p.src ? ` — ${String(p.src).split("/").pop()} · ${p.trigger}${p.loop === "true" ? " · loop" : ""}` : " — choose a .json file in the panel"}
            </span>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 22f. TIMELINE ───────────────────────────────────────────────────────────
export const TimelineBlock = createReactBlockSpec(
  {
    type: "timeline" as const,
    propSchema: {
      bx: { default: "" },
      items: { default: JSON.stringify([
        { date: "Step 1", title: "Download the APK", text: "Get the latest version from the button above.", icon: "" },
        { date: "Step 2", title: "Allow installs", text: "Enable installs from unknown sources in Settings.", icon: "" },
        { date: "Step 3", title: "Install and open", text: "Open the file and follow the prompts.", icon: "" },
      ]) },
      layout: { default: "left" },
      marker: { default: "number" },
      lineColor: { default: "" },
      markerColor: { default: "" },
      showDates: { default: "true" },
      animate: { default: "false" },
      titleTag: { default: "h3" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      let items: { date?: string; title?: string }[] = [];
      try { items = JSON.parse(p.items || "[]"); } catch {}
      return (
        <BlockPreview blockId={block.id} type="timeline" props={p} editor={editor} block={block}>
          <ol className="relative ml-3 border-l-2 border-slate-200 py-1">
            {items.map((it, i) => (
              <li key={i} className="relative mb-3 ml-5">
                <span className="absolute -left-[29px] top-0.5 h-4 w-4 rounded-full border-2 border-white" style={{ background: p.markerColor || "#0ea5e9" }} />
                {p.showDates !== "false" && it.date && <p className="text-[11px] font-semibold uppercase text-slate-400">{it.date}</p>}
                <p className="text-sm font-semibold text-slate-800">{it.title}</p>
              </li>
            ))}
          </ol>
        </BlockPreview>
      );
    },
  }
);

// ─── 22g. DOWNLOAD BOX ───────────────────────────────────────────────────────
export const DownloadBoxBlock = createReactBlockSpec(
  {
    type: "downloadBox" as const,
    propSchema: Object.fromEntries(Object.entries(DLB_DEFAULTS).map(([k, v]) => [k, { default: v }])) as Record<string, { default: string }>,
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => (
      <BlockPreview blockId={block.id} type="downloadBox" props={block.props} editor={editor} block={block}>
        <style dangerouslySetInnerHTML={{ __html: DOWNLOAD_BOX_CSS }} />
        <DownloadBoxView box={resolveDownloadBox(block.props)} inert />
      </BlockPreview>
    ),
  }
);

// ─── 23. PRICING TABLE ────────────────────────────────────────────────────────
export const PricingTableBlock = createReactBlockSpec(
  {
    type: "pricingTable" as const,
    propSchema: {
      bx: { default: "" },
      plans: {
        default:
          '[{"name":"Starter","price":"$9","period":"/mo","features":"One site\\nEmail support","cta":"Choose","url":"#","featured":false}]',
      },
      columns:  { default: "3" },
      accent:   { default: "" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      let plans: { name: string; price: string }[] = [];
      try { plans = JSON.parse(p.plans); } catch {}
      return (
        <BlockPreview blockId={block.id} type="pricingTable" props={p} editor={editor} block={block}>
          <div className="grid gap-2 p-1" style={{ gridTemplateColumns: `repeat(${Math.min(plans.length || 1, 4)},minmax(0,1fr))` }}>
            {plans.length === 0
              ? <span className="text-sm text-slate-400 italic p-2">Pricing Table — click to configure</span>
              : plans.map((pl, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3 text-center">
                    <p className="text-xs font-semibold text-slate-500">{pl.name}</p>
                    <p className="text-xl font-bold">{pl.price}</p>
                  </div>
                ))}
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 24. TEAM MEMBER ──────────────────────────────────────────────────────────
export const TeamMemberBlock = createReactBlockSpec(
  {
    type: "teamMember" as const,
    propSchema: {
      bx: { default: "" },
      photo: { default: "" },
      name:  { default: "" },
      role:  { default: "" },
      bio:   { default: "" },
      links: { default: "[]" },       // [{ network, url }]
      layout: { default: "stacked" }, // stacked | side
      align:  { default: "center" },
      shape:  { default: "circle" },  // circle | rounded | square
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="teamMember" props={p} editor={editor} block={block}>
          <div className="p-3 flex items-center gap-3">
            {p.photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.photo} alt="" className="w-12 h-12 rounded-full object-cover" />
              : <span className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">👤</span>}
            <div>
              <p className="text-sm font-semibold">{p.name || "Team member"}</p>
              <p className="text-xs text-slate-500">{p.role || "Role"}</p>
            </div>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 25. SHOW MORE ────────────────────────────────────────────────────────────
export const ShowMoreBlock = createReactBlockSpec(
  {
    type: "showMore" as const,
    propSchema: {
      bx: { default: "" },
      text:       { default: "" },
      height:     { default: "160" },
      moreLabel:  { default: "Show more" },
      lessLabel:  { default: "Show less" },
      fade:       { default: "true" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="showMore" props={p} editor={editor} block={block}>
          <div className="p-3">
            <p className="text-sm whitespace-pre-line line-clamp-3 opacity-80">
              {p.text || "Show More — long text that collapses behind a button."}
            </p>
            <span className="mt-2 inline-block text-xs font-medium text-sky-600">{p.moreLabel || "Show more"} ▾</span>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 26. HTML EMBED ───────────────────────────────────────────────────────────
export const HtmlEmbedBlock = createReactBlockSpec(
  {
    type: "htmlEmbed" as const,
    propSchema: { bx: { default: "" }, html: { default: "" } },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="htmlEmbed" props={p} editor={editor} block={block}>
          <div className="p-3 rounded-lg bg-slate-900 text-slate-300 font-mono text-[11px] overflow-hidden">
            {p.html
              ? <pre className="whitespace-pre-wrap max-h-24 overflow-hidden">{p.html.slice(0, 300)}</pre>
              : <span className="text-slate-500 italic">HTML Embed — click to paste embed code</span>}
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 27. IMAGE COMPARE ────────────────────────────────────────────────────────
export const ImageCompareBlock = createReactBlockSpec(
  {
    type: "imageCompare" as const,
    propSchema: {
      bx: { default: "" },
      before:      { default: "" },
      after:       { default: "" },
      beforeLabel: { default: "Before" },
      afterLabel:  { default: "After" },
      start:       { default: "50" },
      radius:      { default: "10" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      return (
        <BlockPreview blockId={block.id} type="imageCompare" props={p} editor={editor} block={block}>
          {p.before || p.after ? (
            <div className="relative overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.after || p.before} alt="" className="w-full aspect-video object-cover" />
              <span className="absolute inset-y-0 left-1/2 w-0.5 bg-white/80" />
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              Image Compare — click to pick two images
            </div>
          )}
        </BlockPreview>
      );
    },
  }
);

// ─── 28. POST GRID ────────────────────────────────────────────────────────────
export const PostGridBlock = createReactBlockSpec(
  {
    type: "postGrid" as const,
    propSchema: {
      bx: { default: "" },
      heading:    { default: "" },
      count:      { default: "3" },
      columns:    { default: "3" },
      categoryId: { default: "" },
      orderBy:    { default: "recent" },  // recent | oldest | title
      showImage:  { default: "true" },
      showDate:   { default: "true" },
      showExcerpt:{ default: "true" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const n = Math.min(parseInt(p.count) || 3, 6);
      return (
        <BlockPreview blockId={block.id} type="postGrid" props={p} editor={editor} block={block}>
          <div className="p-2">
            {p.heading && <p className="font-semibold text-sm mb-2">{p.heading}</p>}
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(parseInt(p.columns) || 3, 4)},minmax(0,1fr))` }}>
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="aspect-video bg-slate-100" />
                  <div className="p-2 space-y-1">
                    <div className="h-2 bg-slate-200 rounded w-4/5" />
                    <div className="h-2 bg-slate-100 rounded w-3/5" />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Live posts are pulled in when the page renders.</p>
          </div>
        </BlockPreview>
      );
    },
  }
);

// ─── 29. CONTACT FORM ─────────────────────────────────────────────────────────
export const ContactFormBlock = createReactBlockSpec(
  {
    type: "contactForm" as const,
    propSchema: {
      bx: { default: "" },
      formName:       { default: "Contact" },
      fields:         { default: "" },   // JSON FormField[]; empty = DEFAULT_FIELDS
      submitLabel:    { default: "Send message" },
      successMessage: { default: "Thanks — your message has been sent." },
      redirectUrl:    { default: "" },
      align:          { default: "left" },
      width:          { default: "640" },
    },
    content: "none" as const,
  },
  {
    render: ({ block, editor }: any) => {
      const p = block.props;
      const fields = parseFields(p.fields);
      return (
        <BlockPreview blockId={block.id} type="contactForm" props={p} editor={editor} block={block}>
          <div className="p-3 space-y-2">
            {fields.map((f) => (
              <div key={f.name} className={f.half ? "inline-block w-1/2 pr-2 align-top" : ""}>
                <p className="text-[11px] font-medium text-slate-500 mb-1">
                  {f.label}{f.required ? " *" : ""}
                </p>
                <div className={`rounded border border-slate-200 bg-slate-50 ${f.type === "textarea" ? "h-14" : "h-7"}`} />
              </div>
            ))}
            <span className="inline-block mt-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">
              {p.submitLabel || "Send message"}
            </span>
          </div>
        </BlockPreview>
      );
    },
  }
);

export const customSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    button: ButtonBlock,
    spacer: SpacerBlock,
    infoBox: InfoBoxBlock,
    progressBar: ProgressBarBlock,
    countUp: CountUpBlock,
    countdown: CountdownBlock,
    appInfo: AppInfoBlock,
    plugin: PluginBlock,
    testimonial: TestimonialBlock,
    videoEmbed: VideoEmbedBlock,
    googleMap: GoogleMapBlock,
    accordion: AccordionBlock,
    tabs: TabsBlock,
    iconList: IconListBlock,
    tableOfContents: TableOfContentsBlock,
    authorBio: AuthorBioBlock,
    splitContent: SplitContentBlock,
    rowLayout: RowLayoutBlock,
    callout: CalloutBlock,
    iframeEmbedAdvanced: IframeEmbedAdvancedBlock,
    stepsGrid: StepsGridBlock,
    highlightPanel: HighlightPanelBlock,
    hero: HeroBlock,
    ctaBand: CtaBandBlock,
    cardGrid: CardGridBlock,
    statsStrip: StatsStripBlock,
    prosCons: ProsConsBlock,
    callBar: CallBarBlock,
    logoStrip: LogoStripBlock,
    noticeBar: NoticeBarBlock,
    comparisonTable: ComparisonTableBlock,
    versionHistory: VersionHistoryBlock,
    linkGrid: LinkGridBlock,
    reviewGrid: ReviewGridBlock,
    priceList: PriceListBlock,
    keyTakeaways: KeyTakeawaysBlock,
    factSheet: FactSheetBlock,
    shareButtons: ShareButtonsBlock,
    textAdvanced: TextAdvancedBlock,
    imageAdvanced: ImageAdvancedBlock,
    tableAdvanced: TableAdvancedBlock,
    gallery: GalleryBlock,
    icon: IconBlock,
    socialIcons: SocialIconsBlock,
    starRating: StarRatingBlock,
    businessInfo: BusinessInfoBlock,
    slider: SliderBlock,
    modal: ModalBlock,
    lottie: LottieBlock,
    timeline: TimelineBlock,
    downloadBox: DownloadBoxBlock,
    pricingTable: PricingTableBlock,
    teamMember: TeamMemberBlock,
    showMore: ShowMoreBlock,
    htmlEmbed: HtmlEmbedBlock,
    imageCompare: ImageCompareBlock,
    postGrid: PostGridBlock,
    contactForm: ContactFormBlock,
  },
});
