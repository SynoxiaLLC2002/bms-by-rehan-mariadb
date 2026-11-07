"use client";

import React, { useState, useEffect } from "react";
import { PANEL_TYPES } from "./blockPanelTypes";
export { BLOCK_SETTING_TYPES } from "./blockPanelTypes";
import {
  subscribeActiveBlock,
  updateActiveBlockProp,
  updateActiveBlockProps,
  deleteBlockById,
  ActiveBlock,
} from "@/lib/blockSettingsStore";
import { Trash2 } from "lucide-react";
import { SHARE_NETWORKS } from "@/components/frontend/blocks/ShareButtonsView";
import { COMPARISON_TABLE_DEFAULTS, MAX_COMPARE_COLS, MAX_COMPARE_ROWS, parseComparison } from "@/components/frontend/blocks/ComparisonTableView";
import DownloadBoxView from "@/components/shared/DownloadBoxView";
import { DLB_DEFAULTS, DLB_META_FIELDS, DLB_PRESETS, DLB_STYLE_KEYS, DOWNLOAD_BOX_CSS, presetById, resolveDownloadBox, type StyleKey } from "@/lib/downloadBox";
import MediaPicker from "@/components/admin/MediaPicker";
import IconPicker from "@/components/editor/IconPicker";
import { APP_CATEGORIES, APP_OS } from "@/lib/appInfo";
import { HOVER_EFFECTS, SCROLL_ANIMATIONS, parseBox, boxPadding, boxMargin, upgradeBox, type BlockBox } from "@/lib/blockBox";
import { DEVICES, SPACING_UNITS, parseScalar, rawScalar, serializeScalar, serializeSides } from "@/lib/responsive";
import { safeHref, stateKey } from "@/lib/blockStyle";
import {
  TBL_ALIGN,
  TBL_FONT_SIZES,
  TBL_STYLES,
  addColumn,
  addRow,
  columnCount,
  normalizeRows,
  parseRows,
  removeColumn,
  removeRow,
  serializeRows,
} from "@/lib/table";
import {
  BTN_ICON_DISPLAY,
  BTN_INHERIT,
  BTN_LETTER_CASE,
  BTN_REL_FLAGS,
  BTN_SIZES,
  BTN_UNDERLINE,
  BTN_WIDTHS,
  blankButton,
  isPlaceholderHref,
  parseButtons,
  serializeButtons,
  type BtnRec,
} from "@/lib/button";
import {
  IL_ICON_ALIGN,
  IL_ICON_STYLE,
  IL_LETTER_CASE,
  IL_OUTLINED,
  IL_UNDERLINE,
  blankItem,
  parseItems,
  serializeItems,
  type IconListItem,
} from "@/lib/iconList";
import {
  IB_ALIGN,
  IB_ICON_ANIMS,
  IB_LETTER_CASE,
  IB_LINK_CONTENT,
  IB_MEDIA_ALIGN,
  IB_MEDIA_TYPES,
  IB_MEDIA_VALIGN,
  IB_PRESETS,
  IB_REL_FLAGS,
  IB_TITLE_TAGS,
  IB_VARIANTS,
  presetPatch,
} from "@/lib/infoBox";
import { setActiveListItem, subscribeActiveListItem } from "@/lib/listItemBus";
import {
  ACC_ICON_SIDES,
  ACC_ICON_STYLES,
  ACC_LETTER_CASE,
  ACC_STATES,
  ACC_STATE_PREFIX,
  ACC_TITLE_TAGS,
  blankPane,
  parsePanes,
  serializePanes,
  type AccState,
  type AccordionPane,
} from "@/lib/accordion";
import { TOC_ICON_STYLES, TOC_LETTER_CASE, TOC_LIST_STYLES, parseLevels } from "@/lib/tableOfContents";
import { AUTHOR_BIO_PARTS, AVATAR_SHAPES, NAME_TAGS } from "@/lib/authorBio";
import {
  DeviceProvider,
  DeviceToggle,
  PanelSection,
  ResponsiveBox,
  ResponsiveSlider,
  useDevice,
  ColorSwatches as PaletteSwatches,
} from "./controls";
import { SOCIAL_NETWORKS } from "@/lib/socialNetworks";
const BUILTIN_HINTS: Record<string, string> = {
  paragraph: "Start with the basic building block of all narrative.",
  heading: "Introduce new sections and organise content.",
  bulletListItem: "Create a bulleted list.",
  numberedListItem: "Create a list that follows an order.",
  checkListItem: "Track tasks with a checkbox list.",
  quote: "Give quoted text visual emphasis.",
  codeBlock: "Display code, preserving its formatting.",
  table: "Organise data in rows and columns.",
  image: "Insert an image to make a visual statement.",
  video: "Embed a video file.",
  audio: "Embed an audio file.",
  file: "Attach a file for readers to download.",
};

import { BLOCK_LIBRARY } from "@/lib/blockLibrary";
import { DEFAULT_FIELDS, FIELD_TYPES, fieldKey } from "@/lib/forms";
import { blockMeta } from "@/lib/blockMeta";
import {
  CONDITION_KINDS,
  parseConditions,
  serializeConditions,
  type DisplayCondition,
} from "@/lib/conditions";
import {
  clearBlockDefault,
  hasBlockDefault,
  loadBlockDefaults,
  saveBlockDefault,
} from "@/lib/blockDefaults";
import { getRowApi } from "@/lib/rowApi";
import {
  BACKDROP_FILTERS,
  FLEX_ALIGN,
  FLEX_DIRECTIONS,
  FLEX_JUSTIFY,
  SECTION_TAGS,
  TEXT_ALIGN,
} from "@/lib/section";
import type { RowColumnData } from "@/lib/rowLayout";
import {
  DIVIDER_STYLES,
  GUTTERS,
  MAX_ROW_COLUMNS,
  ROW_TAGS,
  clampColumns,
  findPreset,
  presetsFor,
} from "@/lib/rowLayout";

/** Overlay blend modes, in the order Kadence lists them. */
const BLEND_MODES: { id: string; label: string }[] = [
  { id: "normal",      label: "Normal" },
  { id: "multiply",    label: "Multiply" },
  { id: "screen",      label: "Screen" },
  { id: "overlay",     label: "Overlay" },
  { id: "darken",      label: "Darken" },
  { id: "lighten",     label: "Lighten" },
  { id: "color-dodge", label: "Color Dodge" },
  { id: "color-burn",  label: "Color Burn" },
  { id: "hard-light",  label: "Hard Light" },
  { id: "soft-light",  label: "Soft Light" },
  { id: "difference",  label: "Difference" },
  { id: "exclusion",   label: "Exclusion" },
  { id: "hue",         label: "Hue" },
  { id: "saturation",  label: "Saturation" },
  { id: "color",       label: "Color" },
  { id: "luminosity",  label: "Luminosity" },
];

const BG_POSITIONS: { id: string; label: string }[] = [
  { id: "center center", label: "Center Center" },
  { id: "top center",    label: "Top Center" },
  { id: "bottom center", label: "Bottom Center" },
  { id: "center left",   label: "Center Left" },
  { id: "center right",  label: "Center Right" },
  { id: "top left",      label: "Top Left" },
  { id: "top right",     label: "Top Right" },
  { id: "bottom left",   label: "Bottom Left" },
  { id: "bottom right",  label: "Bottom Right" },
];

const sel =
  "border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-sky-400 w-full";
const inp = sel;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">{hint}</p>}
    </div>
  );
}

function Tabs3({
  tab,
  setTab,
  options,
}: {
  tab: string;
  setTab: (t: string) => void;
  options: string[];
}) {
  return (
    <div className="flex border-b border-slate-100 shrink-0">
      {options.map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            tab === t ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-200">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 text-[10px] font-semibold uppercase transition-colors ${
            value === o.value ? "bg-slate-900 text-white" : "bg-white text-slate-400 hover:text-slate-600"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const FONT_WEIGHTS = [
  ["100", "Thin"], ["200", "Extra Light"], ["300", "Light"], ["400", "Regular"],
  ["500", "Medium"], ["600", "Semi Bold"], ["700", "Bold"], ["800", "Extra Bold"], ["900", "Black"],
];

const FONT_FAMILIES: [string, string][] = [
  ["", "Default"], ["Arial, sans-serif", "Arial"], ["Georgia, serif", "Georgia"],
  ["'Times New Roman', serif", "Times New Roman"], ["'Courier New', monospace", "Courier"],
  ["Verdana, sans-serif", "Verdana"], ["Tahoma, sans-serif", "Tahoma"],
  ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Inter, sans-serif", "Inter"],
  ["Roboto, sans-serif", "Roboto"], ["'Poppins', sans-serif", "Poppins"],
  ["'Playfair Display', serif", "Playfair"],
];

const FONT_SIZE_PRESETS: [string, string][] = [
  ["14", "SM"], ["16", "MD"], ["20", "LG"], ["28", "XL"], ["40", "2XL"], ["56", "3XL"],
];

const ICON_OPTIONS = ["✓","✅","★","→","❤","⚡","🛡","ℹ","⚠","✗","●","◆","▶","🔥","💡","🎯","🚀","📌","🎁","💎"];

// ─────────────────────────────────────────────────────────────────────────────
// Per-block settings panels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advanced Button panel — Kadence's Single Button, minus the parts this CMS
 * already solves block-wide.
 *
 * Kadence's Advanced tab carries Padding, Margin, Animate on Scroll,
 * Conditional Display and Block Defaults. All five are `bx` features here and
 * `BoxSettings` already appends them to every custom block's panel, so
 * repeating them would give the author two padding controls that disagree.
 * What is left below is what is genuinely the button's own.
 */
function ButtonSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  const [state, setState] = useState<"normal" | "hover">("normal");
  // Named `picked` because `sel` is the shared input class in this file.
  const [picked, setPicked] = useState(0);
  const { device } = useDevice();

  const list = parseButtons(p);
  // The stored list can shrink under a stale selection — clamp on read rather
  // than syncing state, so a delete never renders an undefined button.
  const i = Math.min(Math.max(picked, 0), list.length - 1);
  const b = list[i] ?? blankButton();

  const writeList = (next: BtnRec[]) => u("btns", serializeButtons(next));
  /** Patches the selected button. */
  const set = (patch: BtnRec) => writeList(list.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  // Normal / Hover decides which half of each colour pair the controls write.
  const hoverOn = state === "hover";
  const k = (name: string) => (hoverOn ? `h${name[0].toUpperCase()}${name.slice(1)}` : name);
  const v = (name: string) => b[k(name)] ?? "";

  // The panel-wide device switch chooses which group alignment key is edited.
  const alignKey = device === "d" ? "align" : device === "t" ? "alignT" : "alignM";

  const relFlags = (b.rel ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const toggleRel = (flag: string) =>
    set({ rel: (relFlags.includes(flag) ? relFlags.filter((f) => f !== flag) : [...relFlags, flag]).join(",") });

  const move = (dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    writeList(next);
    setPicked(j);
  };

  return (
    <>
      {/* Which button is being edited. A group of one still shows the strip, so
          "add a second button" is discoverable before it is needed. */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <div className="mb-1.5 flex items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Buttons</span>
          <span className="ml-auto flex gap-0.5">
            <button type="button" title="Move left" onClick={() => move(-1)} disabled={i === 0}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white disabled:opacity-25">←</button>
            <button type="button" title="Move right" onClick={() => move(1)} disabled={i === list.length - 1}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white disabled:opacity-25">→</button>
            <button type="button" title="Duplicate this button"
              onClick={() => { writeList([...list.slice(0, i + 1), { ...b }, ...list.slice(i + 1)]); setPicked(i + 1); }}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white">⧉</button>
            <button type="button" title="Remove this button" disabled={list.length <= 1}
              onClick={() => { writeList(list.filter((_, n) => n !== i)); setPicked(Math.max(0, i - 1)); }}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-25">✕</button>
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {list.map((btn, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPicked(n)}
              className={`max-w-[9rem] truncate rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                n === i ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800"
              }`}
            >
              {btn.text?.trim() || `Button ${n + 1}`}
            </button>
          ))}
          <button
            type="button"
            title="Add a button"
            onClick={() => { writeList([...list, blankButton()]); setPicked(list.length); }}
            className="rounded px-2 py-1 text-[11px] font-bold text-sky-600 ring-1 ring-sky-200 hover:bg-sky-50"
          >
            +
          </button>
        </div>

        {/* Alignment sits here, not inside a collapsed section further down.
            It works -- the group is a flex row and this writes `justify-content`
            -- but it was two clicks deep under "Group Layout", below the
            per-button settings, so it read as missing. It aligns the whole
            group, which is why it belongs beside the group's own strip. */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Align
          </span>
          <div className="min-w-0 flex-1">
            <Seg value={p[alignKey] || ""} onChange={(x) => u(alignKey, x)}
              options={[
                { id: "left", title: "Left" },
                { id: "center", title: "Center" },
                { id: "right", title: "Right" },
                { id: "between", title: "Apart" },
              ]} />
          </div>
        </div>
        {device !== "d" && (
          <p className="mt-1 text-[11px] text-amber-600">
            Editing the {device === "t" ? "tablet" : "mobile"} value. Desktop is set separately.
          </p>
        )}
      </div>

      <Tabs3 tab={tab} setTab={(t) => setTab(t as "general" | "style" | "advanced")} options={["general", "style", "advanced"]} />

      <div className="space-y-4 p-4">
        {/* ── General ─────────────────────────────────────────────────────── */}
        {tab === "general" && (
          <>
            <Field label="Button Label">
              <input key={`text-${i}`} className={sel} defaultValue={b.text ?? ""} placeholder="Click me"
                onBlur={(e) => set({ text: e.target.value })} />
            </Field>

            <Field label="Button Link">
              <input key={`url-${i}`} className={sel} defaultValue={b.url ?? ""} placeholder="https://… or /page"
                onBlur={(e) => set({ url: e.target.value })} />
              {b.url && !safeHref(b.url) && (
                <p className="mt-1 text-[11px] text-red-500">
                  That link scheme isn&apos;t allowed and will be dropped when the page renders.
                </p>
              )}
              {isPlaceholderHref(b.url) && b.role !== "1" && (
                <p className="mt-1 text-[11px] text-amber-700">
                  No link yet — on the published page this button goes nowhere.
                </p>
              )}
            </Field>

            <Field label="Open In">
              <Seg value={b.target || "_self"} onChange={(x) => set({ target: x || "_self" })}
                options={[{ id: "_self", title: "Same Tab" }, { id: "_blank", title: "New Tab" }]} />
            </Field>

            <Field label="Link Relationship">
              <div className="grid grid-cols-3 gap-1.5">
                {BTN_REL_FLAGS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleRel(f.id)}
                    className={`rounded border px-1 py-1.5 text-[11px] transition-colors ${
                      relFlags.includes(f.id)
                        ? "border-sky-500 bg-sky-500 text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {f.title}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                A new-tab link always gets <code>noopener noreferrer</code> as well.
              </p>
            </Field>

            <Switch checked={b.download === "1"} onChange={(c) => set({ download: c ? "1" : "" })}
              label="Download the file instead of opening it" />

            <Collapse label="Please Wait Timer" defaultOpen={b.wait === "1"}>
              <Switch checked={b.wait === "1"} onChange={(c) => set({ wait: c ? "1" : "" })}
                label="Make visitors wait before the link works" />
              {b.wait === "1" && (
                <>
                  <Field label="Seconds">
                    <input key={`waitS-${i}`} className={sel} defaultValue={b.waitSeconds ?? "5"} placeholder="5"
                      onBlur={(e) => set({ waitSeconds: e.target.value.replace(/[^0-9]/g, "") || "5" })} />
                  </Field>
                  <Field label="Text while waiting">
                    <input key={`waitT-${i}`} className={sel} defaultValue={b.waitText ?? ""} placeholder="Please wait {s} seconds"
                      onBlur={(e) => set({ waitText: e.target.value })} />
                    <p className="mt-1 text-[11px] text-slate-400"><code>{"{s}"}</code> is replaced by the seconds left. A circle fills up beside it.</p>
                  </Field>
                  <Field label="When the time is up">
                    <Seg value={b.waitAfter || "go"} onChange={(x) => set({ waitAfter: x || "go" })}
                      options={[{ id: "go", title: "Open the link" }, { id: "unlock", title: "Unlock the button" }]} />
                  </Field>
                  {b.waitAfter === "unlock" && (
                    <Field label="Button text when ready">
                      <input key={`waitR-${i}`} className={sel} defaultValue={b.waitReady ?? ""} placeholder="Download now"
                        onBlur={(e) => set({ waitReady: e.target.value })} />
                    </Field>
                  )}
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {b.waitAfter === "unlock"
                      ? "After the countdown the next click opens the link — use this for New Tab links, since browsers block tabs opened by a timer."
                      : "After the countdown the link opens in the same tab automatically."}
                  </p>
                </>
              )}
            </Collapse>

            <Collapse label="Button Inherit Styles" defaultOpen>
              <Field label="Style">
                <Seg columns={2} value={b.inherit || "fill"} onChange={(x) => set({ inherit: x || "fill" })}
                  options={BTN_INHERIT} />
              </Field>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Theme Base and Theme Secondary follow the Customizer&apos;s button colours, so a button here matches
                the header CTA without being restyled. Fill and Outline stand on their own.
              </p>
            </Collapse>

            <Field label="Button Size">
              <Seg value={b.size || "md"} onChange={(x) => set({ size: x || "md" })} options={BTN_SIZES} />
            </Field>

            <Field label="Button Width">
              <Seg value={b.width || "auto"} onChange={(x) => set({ width: x || "auto" })} options={BTN_WIDTHS} />
            </Field>
            {b.width === "fixed" && (
              <ResponsiveSlider label="Fixed Width" value={b.widthVal ?? ""} min={40} max={800}
                onChange={(x) => set({ widthVal: x })} />
            )}

            <Collapse label="Group Layout">
              <ResponsiveSlider label="Gap Between Buttons" value={p.gap ?? ""} min={0} max={80}
                onChange={(x) => u("gap", x)} />
              <Switch checked={p.stack === "1"} onChange={(c) => u("stack", c ? "1" : "")}
                label="Stack into a column on mobile" />
            </Collapse>
          </>
        )}

        {/* ── Style ───────────────────────────────────────────────────────── */}
        {tab === "style" && (
          <>
            <StateTabs state={state} setState={setState} />

            <Field label="Text Type">
              <Seg value={v("txType") || "color"} onChange={(x) => set({ [k("txType")]: x || "color" })}
                options={[{ id: "color", title: "Colour" }, { id: "gradient", title: "Gradient" }]} />
            </Field>
            {v("txType") === "gradient" ? (
              <>
                <Field label="Text Gradient From">
                  <ColorField value={v("txGradFrom")} fallback="#0ea5e9" onChange={(x) => set({ [k("txGradFrom")]: x })} />
                </Field>
                <Field label="Text Gradient To">
                  <ColorField value={v("txGradTo")} fallback="#9333ea" onChange={(x) => set({ [k("txGradTo")]: x })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Style">
                    <Seg value={v("txGradType") || "linear"} onChange={(x) => set({ [k("txGradType")]: x || "linear" })}
                      options={[{ id: "linear", title: "Linear" }, { id: "radial", title: "Radial" }]} />
                  </Field>
                  <Field label="Angle">
                    <input key={`txang-${i}-${state}`} type="number" className={sel} placeholder="160"
                      defaultValue={v("txGradAngle")} onBlur={(e) => set({ [k("txGradAngle")]: e.target.value })} />
                  </Field>
                </div>
              </>
            ) : (
              <Field label="Colour">
                <ColorField value={v("color")} fallback="#ffffff" onChange={(x) => set({ [k("color")]: x })} />
              </Field>
            )}

            <Field label="Background Type">
              <Seg value={v("bgType") || "color"} onChange={(x) => set({ [k("bgType")]: x || "color" })}
                options={[{ id: "color", title: "Colour" }, { id: "gradient", title: "Gradient" }]} />
            </Field>
            {v("bgType") === "gradient" ? (
              <>
                <Field label="Background From">
                  <ColorField value={v("bgGradFrom")} fallback="#0ea5e9" onChange={(x) => set({ [k("bgGradFrom")]: x })} />
                </Field>
                <Field label="Background To">
                  <ColorField value={v("bgGradTo")} fallback="#9333ea" onChange={(x) => set({ [k("bgGradTo")]: x })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Style">
                    <Seg value={v("bgGradType") || "linear"} onChange={(x) => set({ [k("bgGradType")]: x || "linear" })}
                      options={[{ id: "linear", title: "Linear" }, { id: "radial", title: "Radial" }]} />
                  </Field>
                  <Field label="Angle">
                    <input key={`bgang-${i}-${state}`} type="number" className={sel} placeholder="160"
                      defaultValue={v("bgGradAngle")} onBlur={(e) => set({ [k("bgGradAngle")]: e.target.value })} />
                  </Field>
                </div>
              </>
            ) : (
              <Field label="Background Colour">
                <ColorField value={v("bg")} fallback="#0ea5e9" onChange={(x) => set({ [k("bg")]: x })} />
              </Field>
            )}

            <Collapse label="Border">
              <ResponsiveBox
                label="Border Width"
                value={(hoverOn ? b.hBd : b.bd) ?? ""}
                min={0}
                max={20}
                onChange={(x) => set({ [hoverOn ? "hBd" : "bd"]: x })}
              />
              {!hoverOn && (
                <Field label="Border Style">
                  <Seg value={b.bdStyle || "solid"} onChange={(x) => set({ bdStyle: x || "solid" })}
                    options={[
                      { id: "solid", title: "Solid" },
                      { id: "dashed", title: "Dashed" },
                      { id: "dotted", title: "Dotted" },
                      { id: "double", title: "Double" },
                    ]} />
                </Field>
              )}
              <Field label="Border Colour">
                <ColorField value={v("bdColor")} fallback="#0ea5e9" onChange={(x) => set({ [k("bdColor")]: x })} />
              </Field>
            </Collapse>

            <Collapse label="Border Radius">
              <ResponsiveBox
                label="Radius"
                value={(hoverOn ? b.hRad : b.rad) ?? ""}
                min={0}
                max={200}
                onChange={(x) => set({ [hoverOn ? "hRad" : "rad"]: x })}
              />
              <p className="text-[11px] leading-relaxed text-slate-400">
                The four fields are the corners in CSS order: top-left, top-right, bottom-right, bottom-left.
              </p>
            </Collapse>

            <Collapse label="Box Shadow">
              <Switch checked={v("shOn") === "1"} onChange={(c) => set({ [k("shOn")]: c ? "1" : "" })}
                label={hoverOn ? "Shadow on hover" : "Shadow"} />
              {v("shOn") === "1" && (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([["shX", "X"], ["shY", "Y"], ["shBlur", "Blur"], ["shSpread", "Spread"]] as const).map(([key, lbl]) => (
                      <div key={key}>
                        <input key={`${key}-${i}-${state}`} type="number" className={inp} placeholder="—"
                          defaultValue={v(key)} onBlur={(e) => set({ [k(key)]: e.target.value })} />
                        <div className="mt-0.5 text-center text-[9px] text-slate-400">{lbl}</div>
                      </div>
                    ))}
                  </div>
                  <Field label="Shadow Colour">
                    <ColorField value={v("shColor")} fallback="#0f172a" onChange={(x) => set({ [k("shColor")]: x })} />
                  </Field>
                </>
              )}
            </Collapse>

            <Collapse label="Icon Settings">
              <Field label="Icon">
                <IconPicker value={b.icon || ""} onChange={(v) => set({ icon: v })} clearLabel="Clear" />
              </Field>

              {b.icon && (
                <>
                  <Field label="Icon and Text Display">
                    <select className={sel} value={b.iconDisplay || "both"} onChange={(e) => set({ iconDisplay: e.target.value })}>
                      {BTN_ICON_DISPLAY.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                    </select>
                  </Field>
                  <Field label="Icon Location">
                    <Seg value={b.iconPos || "left"} onChange={(x) => set({ iconPos: x || "left" })}
                      options={[{ id: "left", title: "Left" }, { id: "right", title: "Right" }]} />
                  </Field>
                  <ResponsiveSlider label="Icon Size" value={b.iconSize ?? ""} min={8} max={72}
                    onChange={(x) => set({ iconSize: x })} />
                  <Field label={hoverOn ? "Icon Colour (Hover)" : "Icon Colour"}>
                    <ColorField value={v("iconColor")} fallback="#ffffff" onChange={(x) => set({ [k("iconColor")]: x })} />
                  </Field>
                  <ResponsiveBox label="Icon Padding" value={b.iconPad ?? ""} min={0} max={60}
                    units={SPACING_UNITS} onChange={(x) => set({ iconPad: x })} />
                  <Field label="Title for Screen Readers">
                    <input key={`ititle-${i}`} className={sel} defaultValue={b.iconTitle ?? ""}
                      placeholder="Leave empty if decorative" onBlur={(e) => set({ iconTitle: e.target.value })} />
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      With no title the icon is hidden from screen readers, which is right when it only decorates the
                      label. An icon-only button needs one — or an Aria Label on the Advanced tab.
                    </p>
                  </Field>
                  <Switch checked={b.iconHover === "1"} onChange={(c) => set({ iconHover: c ? "1" : "" })}
                    label="Reveal the icon on hover" />
                </>
              )}
            </Collapse>

            <Collapse label="Typography Settings">
              <Field label="Font Size">
                <div className="mb-1.5 grid grid-cols-6 gap-1">
                  {FONT_SIZE_PRESETS.map(([px_, lbl]) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => set({ fs: serializeScalar({ ...parseScalar(b.fs), [device]: px_ }) })}
                      className="rounded border border-slate-200 bg-white py-1 text-[10px] font-semibold text-slate-500 hover:bg-sky-50 hover:text-sky-600"
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <ResponsiveSlider label="Size" value={b.fs ?? ""} min={8} max={80} onChange={(x) => set({ fs: x })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line Height">
                  <input key={`lh-${i}`} className={inp} placeholder="1.2" defaultValue={b.lh ?? ""}
                    onBlur={(e) => set({ lh: e.target.value })} />
                </Field>
                <Field label="Letter Case">
                  <Seg value={b.tt || ""} onChange={(x) => set({ tt: x })} options={BTN_LETTER_CASE} />
                </Field>
              </div>
              <Field label="Font Family">
                <select className={sel} value={b.ff || ""} onChange={(e) => set({ ff: e.target.value })}>
                  {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="Font Weight">
                <select className={sel} value={b.fw || ""} onChange={(e) => set({ fw: e.target.value })}>
                  <option value="">Inherit</option>
                  {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <ResponsiveSlider label="Letter Spacing" value={b.ls ?? ""} min={-5} max={20} step={0.1}
                onChange={(x) => set({ ls: x })} />
              <Field label="Text Underline">
                <Seg value={b.td || ""} onChange={(x) => set({ td: x })} options={BTN_UNDERLINE} />
              </Field>
            </Collapse>
          </>
        )}

        {/* ── Advanced ────────────────────────────────────────────────────── */}
        {tab === "advanced" && (
          <>
            <ResponsiveBox label="Padding" value={b.pad ?? ""} min={0} max={120} units={SPACING_UNITS}
              onChange={(x) => set({ pad: x })} />
            <ResponsiveBox label="Margin" value={b.mar ?? ""} min={-120} max={120} units={SPACING_UNITS}
              onChange={(x) => set({ mar: x })} />
            <p className="text-[11px] leading-relaxed text-slate-400">
              These size this button. The Spacing section further down sizes the whole group.
            </p>

            <Field label="Aria Label">
              <input key={`aria-${i}`} className={sel} defaultValue={b.aria ?? ""}
                placeholder="Overrides the label for screen readers" onBlur={(e) => set({ aria: e.target.value })} />
            </Field>

            <Switch checked={b.role === "1"} onChange={(c) => set({ role: c ? "1" : "" })}
              label="Button role (not a link)" />
            <p className="-mt-2 text-[11px] leading-relaxed text-slate-400">
              Renders a real <code>&lt;button&gt;</code> for something scripted to act on the page. It navigates
              nowhere, so the link above is ignored.
            </p>

            <Field label="HTML Anchor">
              <input key={`anchor-${i}`} className={sel} defaultValue={b.anchor ?? ""} placeholder="download"
                onBlur={(e) => set({ anchor: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                One word, no spaces. Other links can then point at <code>#{b.anchor || "your-anchor"}</code>.
              </p>
            </Field>

            <Field label="Additional CSS Class(es)">
              <input key={`class-${i}`} className={sel} defaultValue={b.cssClass ?? ""} placeholder="Separate with spaces"
                onBlur={(e) => set({ cssClass: e.target.value })} />
            </Field>

            <Field label="Additional CSS">
              <textarea key={`css-${i}`} className={`${sel} h-24 font-mono`} defaultValue={b.customCss ?? ""}
                placeholder="selector { transform: skewX(-6deg); }" onBlur={(e) => set({ customCss: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this button.
              </p>
            </Field>
          </>
        )}
      </div>
    </>
  );
}

function SpacerSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Height (px)">
        <input type="number" className={sel} defaultValue={p.height} min="0" max="400" onBlur={(e) => u("height", e.target.value)} />
      </Field>
      <Field label="Show Divider">
        <ToggleRow value={p.showDivider || "false"} onChange={(v) => u("showDivider", v)}
          options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} />
      </Field>
      {p.showDivider === "true" && (
        <>
          <Field label="Divider Style">
            <ToggleRow value={p.dividerStyle || "solid"} onChange={(v) => u("dividerStyle", v)}
              options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]} />
          </Field>
          <Field label="Divider Color">
            <ColorDot value={p.dividerColor} fallback="#e2e8f0" onChange={(v) => u("dividerColor", v)} className="w-full h-8 rounded border border-slate-200 p-1" />
          </Field>
        </>
      )}
    </div>
  );
}

/** A colour-or-gradient background for one state of the info box container. */
function InfoBoxBackground({
  p, u, prefix,
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
  prefix: "" | "h";
}) {
  const k = (n: string) => stateKey(prefix, n);
  const type = p[k("bgType")] || "color";
  return (
    <>
      <Field label="Background">
        <ToggleRow
          value={type}
          onChange={(v) => u(k("bgType"), v)}
          options={[{ value: "color", label: "Colour" }, { value: "gradient", label: "Gradient" }]}
        />
      </Field>
      {type === "gradient" ? (
        <>
          <Field label="Gradient Type">
            <ToggleRow
              value={p[k("bgGradType")] || "linear"}
              onChange={(v) => u(k("bgGradType"), v)}
              options={[{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <ColorField value={p[k("bgGradFrom")] ?? ""} fallback="#38bdf8"
                onChange={(v) => u(k("bgGradFrom"), v)} />
            </Field>
            <Field label="To">
              <ColorField value={p[k("bgGradTo")] ?? ""} fallback="#6366f1"
                onChange={(v) => u(k("bgGradTo"), v)} />
            </Field>
          </div>
          {(p[k("bgGradType")] || "linear") === "linear" && (
            <Field label="Angle">
              <NumSlider value={p[k("bgGradAngle")] ?? ""} placeholder="160" max={360} unit="°"
                onChange={(v) => u(k("bgGradAngle"), v)} />
            </Field>
          )}
        </>
      ) : (
        <Field label="Background Colour">
          <ColorField value={p[k("bg")] ?? ""} fallback="#f1f5f9" onChange={(v) => u(k("bg"), v)} />
        </Field>
      )}
    </>
  );
}

/** The box shadow controls for one state — five parts and a switch. */
function InfoBoxShadow({
  p, u, prefix,
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
  prefix: "" | "h";
}) {
  const k = (n: string) => stateKey(prefix, n);
  const on = p[k("shadow")] === "1";
  return (
    <>
      <Switch checked={on} onChange={(c) => u(k("shadow"), c ? "1" : "")}
        label={prefix ? "Box shadow on hover" : "Enable box shadow"} />
      {/* A hover state has to be able to take the resting shadow away, which an
          empty shadow cannot express. */}
      {prefix === "h" && !on && (
        <Switch checked={p.hShadowOff === "1"} onChange={(c) => u("hShadowOff", c ? "1" : "")}
          label="Remove the shadow on hover" />
      )}
      {on && (
        <>
          <Field label="Shadow Colour">
            <ColorField value={p[k("shColor")] ?? ""} fallback="#0f172a"
              onChange={(v) => u(k("shColor"), v)} />
          </Field>
          <div className="grid grid-cols-4 gap-1.5">
            {([["shX", "X"], ["shY", "Y"], ["shBlur", "Blur"], ["shSpread", "Spread"]] as const).map(
              ([key, label]) => (
                <div key={key}>
                  <input key={`${k(key)}`} type="number" className={inp} placeholder="—"
                    defaultValue={p[k(key)] ?? ""} onBlur={(e) => u(k(key), e.target.value)} />
                  <div className="mt-0.5 text-center text-[9px] uppercase text-slate-400">{label}</div>
                </div>
              )
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * One typographic part of the info box — the title, the text and the Learn More
 * all carry the same controls, so they are emitted from one component rather
 * than three copies that drift.
 */
function InfoBoxTypography({
  p, u, part,
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
  /** The prop-name prefix: `title`, `text` or `learn`. */
  part: "title" | "text" | "learn";
}) {
  const { device } = useDevice();
  const k = (n: string) => `${part}${n[0].toUpperCase()}${n.slice(1)}`;
  return (
    <>
      <Field label="Font Size">
        <div className="mb-1.5 grid grid-cols-6 gap-1">
          {FONT_SIZE_PRESETS.map(([px_, lbl]) => (
            <button key={lbl} type="button"
              onClick={() => u(k("fs"), serializeScalar({ ...parseScalar(p[k("fs")]), [device]: px_ }))}
              className="rounded border border-slate-200 bg-white py-1 text-[10px] font-semibold text-slate-500 hover:bg-sky-50 hover:text-sky-600">
              {lbl}
            </button>
          ))}
        </div>
        <ResponsiveSlider label="Size" value={p[k("fs")] ?? ""} min={8} max={96}
          onChange={(v) => u(k("fs"), v)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Line Height">
          <input key={k("lh")} className={inp} placeholder="1.5" defaultValue={p[k("lh")] ?? ""}
            onBlur={(e) => u(k("lh"), e.target.value)} />
        </Field>
        <Field label="Letter Case">
          <Seg value={p[k("tt")] || ""} onChange={(v) => u(k("tt"), v)} options={IB_LETTER_CASE} />
        </Field>
      </div>
      <Field label="Font Family">
        <select className={sel} value={p[k("ff")] || ""} onChange={(e) => u(k("ff"), e.target.value)}>
          {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
        </select>
      </Field>
      <Field label="Font Weight">
        <select className={sel} value={p[k("fw")] || ""} onChange={(e) => u(k("fw"), e.target.value)}>
          <option value="">Inherit</option>
          {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
        </select>
      </Field>
      <ResponsiveSlider label="Letter Spacing" value={p[k("ls")] ?? ""} min={-5} max={20} step={0.1}
        onChange={(v) => u(k("ls"), v)} />
      <ResponsiveBox label="Padding" value={p[k("pad")] ?? ""} units={SPACING_UNITS}
        onChange={(v) => u(k("pad"), v)} />
      <ResponsiveBox label="Margin" value={p[k("mar")] ?? ""} units={SPACING_UNITS}
        onChange={(v) => u(k("mar"), v)} />
    </>
  );
}

/**
 * The sketch on a quick-layout tile — the frame, the media, two rules of text.
 *
 * Drawn rather than shipped as six images: the tile has to show where the media
 * sits *relative to the box*, and the two badge layouts only read as different
 * from the others because the mark straddles the frame's top edge.
 */
function PresetSketch({ sketch }: { sketch: (typeof IB_PRESETS)[number]["sketch"] }) {
  const bar = (w: string, strong = false) => (
    <span
      className={`block h-[3px] rounded-full ${strong ? "bg-slate-500" : "bg-slate-300"}`}
      style={{ width: w }}
    />
  );

  const mark = (
    <span
      className={`block h-3 w-3 shrink-0 border ${
        sketch.shape === "circle" ? "rounded-full" : "rounded-[2px]"
      } ${
        sketch.badge
          ? "border-sky-400 bg-white"
          : sketch.shape === "none"
            ? "border-transparent bg-slate-400"
            : "border-sky-400 bg-sky-400"
      }`}
    />
  );

  const lines = (
    <span className={`flex flex-col gap-1 ${sketch.align === "center" ? "items-center" : "items-start"}`}>
      {bar("80%", true)}
      {bar("100%")}
      {bar("60%")}
      {sketch.learn && <span className="mt-0.5 block h-[5px] w-6 rounded-sm bg-sky-400" />}
    </span>
  );

  return (
    <span className="relative flex w-full flex-col">
      {/* A badge hangs half out of the frame, so it is drawn above it. */}
      {sketch.badge && (
        <span
          className={`z-10 -mb-1.5 flex ${sketch.align === "center" ? "justify-center" : "justify-start pl-1.5"}`}
        >
          {mark}
        </span>
      )}
      <span
        className={`flex gap-1.5 rounded border border-slate-200 px-1.5 py-1.5 ${
          sketch.media === "top"
            ? `flex-col ${sketch.align === "center" ? "items-center" : "items-start"}`
            : `flex-row ${sketch.shape === "circle" ? "items-center" : "items-start"}`
        }`}
      >
        {!sketch.badge && mark}
        <span className="min-w-0 flex-1">{lines}</span>
      </span>
    </span>
  );
}

/**
 * Advanced Info Box panel — Kadence's Info Box, minus the parts this CMS
 * already solves block-wide.
 *
 * Kadence's Advanced tab carries Padding, Margin, Block Defaults and
 * Conditional Display. All four are `bx` features here and `BoxSettings`
 * already appends them to every custom block's panel, so repeating them would
 * give the author two padding controls that disagree. Max Width and Set Height
 * 100% stay, because those are the box's own and nothing else offers them.
 */
function InfoBoxSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  const [container, setContainer] = useState<"normal" | "hover">("normal");
  const [mediaState, setMediaState] = useState<"normal" | "hover">("normal");
  const [titleState, setTitleState] = useState<"normal" | "hover">("normal");
  const [textState, setTextState] = useState<"normal" | "hover">("normal");
  const [learnState, setLearnState] = useState<"normal" | "hover">("normal");
  const { device } = useDevice();

  const mediaAlign = p.mediaAlign || "top";
  const mediaType = p.mediaType || "icon";
  const align = rawScalar(parseScalar(p.textAlign), device);
  const relFlags = String(p.linkRel ?? "").split(/[\s,]+/).filter(Boolean);

  const setAlign = (v: string) =>
    u("textAlign", serializeScalar({ ...parseScalar(p.textAlign), [device]: v }));

  const toggleRel = (flag: string, on: boolean) =>
    u("linkRel", (on ? [...relFlags, flag] : relFlags.filter((f) => f !== flag)).join(" "));

  // A preset is one write rather than a dozen, so undo takes the whole layout
  // back in a single step. It clears every prop any preset sets, so switching
  // from the badge layouts cannot leave their negative margin behind, and it
  // touches nothing else — `bx` spacing, links and content all survive.
  const applyPreset = (id: string) => {
    const patch = presetPatch(id);
    if (patch) updateActiveBlockProps({ ...p, ...patch });
  };

  return (
    <>
      <Tabs3
        tab={tab}
        setTab={(t) => setTab(t as "general" | "style" | "advanced")}
        options={["general", "style", "advanced"]}
      />

      <div className="space-y-4 p-4">
        {/* ══ GENERAL ══════════════════════════════════════════════════════ */}
        {tab === "general" && (
          <>
            <Field label="Info Box Quick Layout Presets">
              <div className="grid grid-cols-3 gap-1.5">
                {IB_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.title}
                    onClick={() => applyPreset(preset.id)}
                    className={`flex h-14 items-center justify-center rounded border p-1.5 transition-colors ${
                      p.preset === preset.id
                        ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                        : "border-slate-200 bg-white hover:border-sky-300"
                    }`}
                  >
                    <PresetSketch sketch={preset.sketch} />
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                A preset is a starting point: it writes ordinary settings you can then take apart.
              </p>
            </Field>

            <Collapse label="Content" defaultOpen>
              <Field label="Title">
                <input key="title" className={sel} defaultValue={p.title ?? ""} placeholder="Info box title"
                  onBlur={(e) => u("title", e.target.value)} />
                <p className="mt-1 text-[11px] text-slate-400">Editable on the canvas too.</p>
              </Field>
              <Field label="Body Text">
                <textarea key="text" className={`${sel} h-20 resize-none`} defaultValue={p.text ?? ""}
                  placeholder="Describe it here…" onBlur={(e) => u("text", e.target.value)} />
              </Field>
              <Field label="Base Palette">
                <Seg value={p.variant ?? ""} onChange={(v) => u("variant", v)} options={IB_VARIANTS} columns={5} />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  The look an untouched box has. Every colour under Style overrides it.
                </p>
              </Field>
            </Collapse>

            <Collapse label="Link" defaultOpen>
              <Field label="Link">
                <input key="link" className={sel} defaultValue={p.link ?? ""} placeholder="https://… or /page"
                  onBlur={(e) => u("link", e.target.value)} />
                {p.link && !safeHref(p.link) && (
                  <p className="mt-1 text-[11px] text-red-500">
                    That link scheme isn&apos;t allowed and will be dropped when the page renders.
                  </p>
                )}
              </Field>
              <Field label="Link Content">
                <select className={sel} value={p.linkContent || "box"} onChange={(e) => u("linkContent", e.target.value)}>
                  {IB_LINK_CONTENT.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  What the link wraps. Entire Box makes the whole card clickable; Learn More links only that.
                </p>
              </Field>
              <Field label="Link Title">
                <input key="linkTitle" className={sel} defaultValue={p.linkTitle ?? ""}
                  placeholder="Read the full guide" onBlur={(e) => u("linkTitle", e.target.value)} />
              </Field>
              <Field label="Open In">
                <Seg value={p.linkTarget || "_self"} onChange={(v) => u("linkTarget", v || "_self")}
                  options={[{ id: "_self", title: "Same Tab" }, { id: "_blank", title: "New Tab" }]} />
              </Field>
              <Field label="Link Relationship">
                <div className="flex flex-wrap gap-2">
                  {IB_REL_FLAGS.map((f) => (
                    <label key={f.id} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <input type="checkbox" checked={relFlags.includes(f.id)}
                        onChange={(e) => toggleRel(f.id, e.target.checked)} />
                      {f.title}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  A new-tab link always gets <code>noopener noreferrer</code>.
                </p>
              </Field>
            </Collapse>

            <Field label="Content Align">
              <Seg value={align} onChange={setAlign} options={IB_ALIGN} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Set per device — the toggle in the panel header decides which one you are editing.
              </p>
            </Field>
          </>
        )}

        {/* ══ STYLE ════════════════════════════════════════════════════════ */}
        {tab === "style" && (
          <>
            <Collapse label="Container Settings" defaultOpen>
              <StateTabs state={container} setState={setContainer} />
              {container === "normal" ? (
                <>
                  <ResponsiveBox label="Padding" value={p.contPad ?? ""} min={0} max={200}
                    units={SPACING_UNITS} onChange={(v) => u("contPad", v)} />
                  <p className="-mt-2 text-[11px] leading-relaxed text-slate-400">
                    The space inside the card. The Padding further down the panel is the block&apos;s own box, which
                    sits outside this border.
                  </p>
                  <InfoBoxBackground p={p} u={u} prefix="" />
                  <ResponsiveBox label="Border Width" value={p.bd ?? ""} min={0} max={40}
                    onChange={(v) => u("bd", v)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Border Colour">
                      <ColorField value={p.bdColor ?? ""} fallback="#cbd5e1" onChange={(v) => u("bdColor", v)} />
                    </Field>
                    <Field label="Border Style">
                      <select className={sel} value={p.bdStyle || "solid"} onChange={(e) => u("bdStyle", e.target.value)}>
                        {["solid", "dashed", "dotted", "double"].map((s) => (
                          <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <ResponsiveBox label="Border Radius" value={p.rad ?? ""} min={0} max={200}
                    onChange={(v) => u("rad", v)} />
                  <InfoBoxShadow p={p} u={u} prefix="" />
                </>
              ) : (
                <>
                  <InfoBoxBackground p={p} u={u} prefix="h" />
                  <Field label="Border Colour">
                    <ColorField value={p.hBdColor ?? ""} fallback="#0ea5e9" onChange={(v) => u("hBdColor", v)} />
                  </Field>
                  <ResponsiveBox label="Border Width" value={p.hBd ?? ""} min={0} max={40}
                    onChange={(v) => u("hBd", v)} />
                  <ResponsiveBox label="Border Radius" value={p.hRad ?? ""} min={0} max={200}
                    onChange={(v) => u("hRad", v)} />
                  <InfoBoxShadow p={p} u={u} prefix="h" />
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Colour and shadow are the safe ones to change here. A different border <em>width</em> on hover
                    moves the content under the pointer, so set it only when the resting border already has room for
                    it.
                  </p>
                </>
              )}
            </Collapse>

            <Collapse label="Media Settings">
              <Field label="Media Align">
                <Seg value={mediaAlign} onChange={(v) => u("mediaAlign", v || "top")} options={IB_MEDIA_ALIGN} />
              </Field>
              {mediaAlign !== "top" && (
                <Field label="Media Vertical Align">
                  <Seg value={p.mediaVAlign || "top"} onChange={(v) => u("mediaVAlign", v || "top")}
                    options={IB_MEDIA_VALIGN} />
                </Field>
              )}
              <Field label="Media Type">
                <Seg value={mediaType} onChange={(v) => u("mediaType", v || "icon")} options={IB_MEDIA_TYPES} />
              </Field>

              {mediaType === "icon" && (
                <Field label="Icon">
                  <IconPicker value={p.icon || ""} onChange={(v) => u("icon", v)} fallback="ℹ" />
                </Field>
              )}

              {mediaType === "image" && (
                <>
                  <ImageField label="Image" value={p.image ?? ""} onChange={(v) => u("image", v)} />
                  <Field label="Alt Text">
                    <input key="imageAlt" className={sel} defaultValue={p.imageAlt ?? ""}
                      placeholder="What the image shows" onBlur={(e) => u("imageAlt", e.target.value)} />
                  </Field>
                  <ResponsiveSlider label="Image Width" value={p.imageW ?? ""} min={16} max={600}
                    onChange={(v) => u("imageW", v)} />
                </>
              )}

              {mediaType === "number" && (
                <Field label="Number">
                  <input key="number" className={sel} defaultValue={p.number ?? ""} placeholder="01"
                    onBlur={(e) => u("number", e.target.value)} />
                </Field>
              )}

              {mediaType !== "none" && (
                <>
                  {mediaType !== "image" && (
                    <ResponsiveSlider label="Media Size" value={p.iconSize ?? ""} min={8} max={160}
                      onChange={(v) => u("iconSize", v)} />
                  )}
                  <ResponsiveSlider label="Media Border Width" value={p.iconBorder ?? ""} min={0} max={20}
                    units={[]} onChange={(v) => u("iconBorder", v)} />
                  <ResponsiveSlider label="Media Border Radius" value={p.iconRadius ?? ""} min={0} max={999}
                    onChange={(v) => u("iconRadius", v)} />
                  <ResponsiveBox label="Media Frame Padding" value={p.iconPad ?? ""} min={0} max={120}
                    units={SPACING_UNITS} onChange={(v) => u("iconPad", v)} />
                  <Field label="Media Hover Animation">
                    <select className={sel} value={p.iconAnim || ""} onChange={(e) => u("iconAnim", e.target.value)}>
                      {IB_ICON_ANIMS.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      Plays when the pointer is anywhere over the box, not only over the media itself.
                    </p>
                  </Field>

                  <StateTabs state={mediaState} setState={setMediaState} />
                  {mediaState === "normal" ? (
                    <>
                      <Field label="Media Colour">
                        <ColorField value={p.iconColor ?? ""} fallback="#0ea5e9"
                          onChange={(v) => u("iconColor", v)} />
                      </Field>
                      <Field label="Media Background">
                        <ColorField value={p.iconBg ?? ""} fallback="#0ea5e9" onChange={(v) => u("iconBg", v)} />
                      </Field>
                      <Field label="Media Border Colour">
                        <ColorField value={p.iconBorderColor ?? ""} fallback="#0ea5e9"
                          onChange={(v) => u("iconBorderColor", v)} />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Media Colour">
                        <ColorField value={p.hIconColor ?? ""} fallback="#0284c7"
                          onChange={(v) => u("hIconColor", v)} />
                      </Field>
                      <Field label="Media Background">
                        <ColorField value={p.hIconBg ?? ""} fallback="#0284c7" onChange={(v) => u("hIconBg", v)} />
                      </Field>
                      <Field label="Media Border Colour">
                        <ColorField value={p.hIconBorderColor ?? ""} fallback="#0284c7"
                          onChange={(v) => u("hIconBorderColor", v)} />
                      </Field>
                    </>
                  )}

                  {mediaType !== "image" && (
                    <Field label="Title For Screen Readers">
                      <input key="iconTitle" className={sel} defaultValue={p.iconTitle ?? ""}
                        placeholder="Leave empty for decoration" onBlur={(e) => u("iconTitle", e.target.value)} />
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        With no title the glyph is hidden from screen readers, which is right when it only decorates
                        the title beside it.
                      </p>
                    </Field>
                  )}

                  <ResponsiveBox label="Media Padding" value={p.mediaPad ?? ""} units={SPACING_UNITS}
                    onChange={(v) => u("mediaPad", v)} />
                  <ResponsiveBox label="Media Margin" value={p.mediaMar ?? ""} units={SPACING_UNITS}
                    onChange={(v) => u("mediaMar", v)} />
                </>
              )}
            </Collapse>

            <Collapse label="Title Settings">
              <Switch checked={p.showTitle !== ""} onChange={(c) => u("showTitle", c ? "1" : "")}
                label="Show title" />
              {p.showTitle !== "" && (
                <>
                  <Field label="HTML Tag">
                    <Seg
                      value={p.titleTag || "h3"}
                      onChange={(v) => u("titleTag", v || "h3")}
                      options={IB_TITLE_TAGS.map((t) => ({ id: t, title: t.toUpperCase() }))}
                      columns={7}
                    />
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      <code>div</code> is not a heading — pick one only when the box is decorative and should stay
                      out of the document outline.
                    </p>
                  </Field>
                  <StateTabs state={titleState} setState={setTitleState} />
                  <Field label="Title Colour">
                    {titleState === "normal" ? (
                      <ColorField value={p.titleColor ?? ""} fallback="#0f172a"
                        onChange={(v) => u("titleColor", v)} />
                    ) : (
                      <ColorField value={p.hTitleColor ?? ""} fallback="#0ea5e9"
                        onChange={(v) => u("hTitleColor", v)} />
                    )}
                  </Field>
                  <InfoBoxTypography p={p} u={u} part="title" />
                  <ResponsiveSlider label="Min Height" value={p.titleMinH ?? ""} min={0} max={400}
                    onChange={(v) => u("titleMinH", v)} />
                </>
              )}
            </Collapse>

            <Collapse label="Text Settings">
              <Switch checked={p.showText !== ""} onChange={(c) => u("showText", c ? "1" : "")}
                label="Show text" />
              {p.showText !== "" && (
                <>
                  <StateTabs state={textState} setState={setTextState} />
                  <Field label="Text Colour">
                    {textState === "normal" ? (
                      <ColorField value={p.textColor ?? ""} fallback="#475569"
                        onChange={(v) => u("textColor", v)} />
                    ) : (
                      <ColorField value={p.hTextColor ?? ""} fallback="#0f172a"
                        onChange={(v) => u("hTextColor", v)} />
                    )}
                  </Field>
                  <InfoBoxTypography p={p} u={u} part="text" />
                  <ResponsiveSlider label="Min Height" value={p.textMinH ?? ""} min={0} max={400}
                    onChange={(v) => u("textMinH", v)} />
                </>
              )}
            </Collapse>

            <Collapse label="Learn More Settings">
              <Switch checked={p.showLearn === "1"} onChange={(c) => u("showLearn", c ? "1" : "")}
                label="Show Learn More" />
              {p.showLearn === "1" && (
                <>
                  <Field label="Learn More Text">
                    <input key="learnMore" className={sel} defaultValue={p.learnMore ?? ""} placeholder="Learn More"
                      onBlur={(e) => u("learnMore", e.target.value)} />
                  </Field>
                  <Field label="Icon">
                    <IconPicker value={p.learnIcon || ""} onChange={(v) => u("learnIcon", v)} clearLabel="Clear">
                      <Seg value={p.learnIconSide || "right"} onChange={(v) => u("learnIconSide", v || "right")}
                        options={[{ id: "left", title: "Left" }, { id: "right", title: "Right" }]} />
                    </IconPicker>
                    {p.learnIcon && (
                      <div className="mt-2">
                        <ColorField value={p.learnIconColor ?? ""} fallback="" onChange={(v) => u("learnIconColor", v)} />
                        <p className="mt-1 text-[10px] text-slate-400">Icon colour. Empty follows the link text.</p>
                      </div>
                    )}
                  </Field>

                  <StateTabs state={learnState} setState={setLearnState} />
                  {learnState === "normal" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Colour">
                        <ColorField value={p.learnColor ?? ""} fallback="#0ea5e9"
                          onChange={(v) => u("learnColor", v)} />
                      </Field>
                      <Field label="Background">
                        <ColorField value={p.learnBg ?? ""} fallback="#0ea5e9" onChange={(v) => u("learnBg", v)} />
                      </Field>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Colour">
                        <ColorField value={p.hLearnColor ?? ""} fallback="#ffffff"
                          onChange={(v) => u("hLearnColor", v)} />
                      </Field>
                      <Field label="Background">
                        <ColorField value={p.hLearnBg ?? ""} fallback="#0284c7"
                          onChange={(v) => u("hLearnBg", v)} />
                      </Field>
                    </div>
                  )}
                  <ResponsiveBox label="Border Width" value={p.learnBd ?? ""} min={0} max={20}
                    onChange={(v) => u("learnBd", v)} />
                  <Field label="Border Colour">
                    {learnState === "normal" ? (
                      <ColorField value={p.learnBdColor ?? ""} fallback="#0ea5e9"
                        onChange={(v) => u("learnBdColor", v)} />
                    ) : (
                      <ColorField value={p.hLearnBdColor ?? ""} fallback="#0284c7"
                        onChange={(v) => u("hLearnBdColor", v)} />
                    )}
                  </Field>
                  <ResponsiveBox label="Border Radius" value={p.learnRad ?? ""} min={0} max={200}
                    onChange={(v) => u("learnRad", v)} />
                  <InfoBoxTypography p={p} u={u} part="learn" />
                </>
              )}
            </Collapse>
          </>
        )}

        {/* ══ ADVANCED ═════════════════════════════════════════════════════ */}
        {tab === "advanced" && (
          <>
            <ResponsiveSlider label="Max Width" value={p.maxWidth ?? ""} min={0} max={1200}
              onChange={(v) => u("maxWidth", v)} />
            <Switch checked={p.fullHeight === "1"} onChange={(c) => u("fullHeight", c ? "1" : "")}
              label="Set height 100%" />
            <p className="text-[11px] leading-relaxed text-slate-400">
              Height only does something when the parent has one — a Row Layout column, typically.
            </p>
            <Field label="HTML Anchor">
              <input key="anchor" className={sel} defaultValue={p.anchor ?? ""} placeholder="why-us"
                onBlur={(e) => u("anchor", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                One word, no spaces. Other links can then point at <code>#{p.anchor || "your-anchor"}</code>.
              </p>
            </Field>
            <Field label="Additional CSS Class(es)">
              <input key="cssClass" className={sel} defaultValue={p.cssClass ?? ""} placeholder="Separate with spaces"
                onBlur={(e) => u("cssClass", e.target.value)} />
            </Field>
            <Field label="Additional CSS">
              <textarea key="customCss" className={`${sel} h-24 font-mono`} defaultValue={p.customCss ?? ""}
                placeholder="selector .bmsib-ico { transform: rotate(-8deg); }"
                onBlur={(e) => u("customCss", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this box. Its parts are <code>.bmsib-wrap</code>,{" "}
                <code>.bmsib-media</code>, <code>.bmsib-ico</code>, <code>.bmsib-title</code>,{" "}
                <code>.bmsib-text</code> and <code>.bmsib-learn</code>.
              </p>
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Padding, margin, visibility, scroll animation and conditional display are in the sections below — they
              work the same on every block.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function ProgressBarSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Label">
        <input className={sel} defaultValue={p.label} placeholder="React" onBlur={(e) => u("label", e.target.value)} />
      </Field>
      <Field label="Value (%)">
        <input type="number" className={sel} defaultValue={p.value} min="0" max="100" onBlur={(e) => u("value", e.target.value)} />
      </Field>
      <Field label="Bar Color">
        <ColorDot value={p.color} fallback="#0ea5e9" onChange={(v) => u("color", v)} className="w-full h-8 rounded border border-slate-200 p-1" />
      </Field>
      <Field label="Show Percentage">
        <ToggleRow value={p.showLabel || "true"} onChange={(v) => u("showLabel", v)}
          options={[{ value: "true", label: "Show" }, { value: "false", label: "Hide" }]} />
      </Field>
    </div>
  );
}

function CountUpSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Number">
        <input type="number" className={sel} defaultValue={p.to} placeholder="100" onBlur={(e) => u("to", e.target.value)} />
      </Field>
      <Field label="Prefix">
        <input className={sel} defaultValue={p.prefix} placeholder="$" onBlur={(e) => u("prefix", e.target.value)} />
      </Field>
      <Field label="Suffix">
        <input className={sel} defaultValue={p.suffix} placeholder="+" onBlur={(e) => u("suffix", e.target.value)} />
      </Field>
      <Field label="Label Below">
        <input className={sel} defaultValue={p.title} placeholder="Happy clients" onBlur={(e) => u("title", e.target.value)} />
      </Field>
      <Field label="Color">
        <ColorDot value={p.color} fallback="#0ea5e9" onChange={(v) => u("color", v)} className="w-full h-8 rounded border border-slate-200 p-1" />
      </Field>
      <Field label="Duration (s)">
        <input type="number" className={sel} defaultValue={p.duration} placeholder="2" onBlur={(e) => u("duration", e.target.value)} />
      </Field>
    </div>
  );
}

function CountdownSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Label">
        <input className={sel} defaultValue={p.title} placeholder="Offer ends in" onBlur={(e) => u("title", e.target.value)} />
      </Field>
      <Field label="Target Date & Time">
        <input type="datetime-local" className={sel} defaultValue={p.targetDate} onBlur={(e) => u("targetDate", e.target.value)} />
      </Field>
      <Field label="Expired Message">
        <input className={sel} defaultValue={p.expiredText} placeholder="This offer has ended" onBlur={(e) => u("expiredText", e.target.value)} />
      </Field>
    </div>
  );
}

function PluginSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [list, setList] = useState<{ slug: string; name: string; enabled: boolean; manifest: { attributes?: { name: string; label?: string; default?: string }[] } }[] | null>(null);
  useEffect(() => {
    fetch("/api/plugins").then((r) => (r.ok ? r.json() : { plugins: [] })).then((d) => setList(d.plugins ?? [])).catch(() => setList([]));
  }, []);
  const current = list?.find((x) => x.slug === p.slug);
  let attrs: Record<string, string> = {};
  try { attrs = JSON.parse(p.attrs || "{}"); } catch { attrs = {}; }
  const setAttr = (k: string, v: string) => u("attrs", JSON.stringify({ ...attrs, [k]: v }));
  return (
    <div className="p-4 space-y-4">
      <Field label="Plugin">
        {list === null ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-slate-500">No plugins installed. Add one under Admin → Plugins.</p>
        ) : (
          <select className={sel} value={p.slug} onChange={(e) => { const x = list.find((y) => y.slug === e.target.value); u("slug", e.target.value); u("name", x?.name ?? ""); }}>
            <option value="">Choose…</option>
            {list.map((x) => <option key={x.slug} value={x.slug}>{x.name}{x.enabled ? "" : " (off)"}</option>)}
          </select>
        )}
      </Field>
      {current?.manifest.attributes?.length ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Attributes</p>
          {current.manifest.attributes.map((a) => (
            <Field key={a.name} label={a.label ?? a.name}>
              <input className={sel} defaultValue={attrs[a.name] ?? ""} placeholder={a.default ?? ""} onBlur={(e) => setAttr(a.name, e.target.value)} />
            </Field>
          ))}
        </div>
      ) : current ? (
        <p className="text-[11px] text-slate-400">This plugin takes no attributes.</p>
      ) : null}
      {p.slug && (
        <p className="rounded bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-500">
          Same as typing [{p.slug}{Object.entries(attrs).filter(([, v]) => v).map(([k, v]) => ` ${k}="${v}"`).join("")}] in a paragraph.
        </p>
      )}
    </div>
  );
}

function AppInfoSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const text = (k: string, label: string, placeholder = "", help?: string) => (
    <Field label={label}>
      <input key={k} className={sel} defaultValue={p[k] ?? ""} placeholder={placeholder} onBlur={(e) => u(k, e.target.value)} />
      {help && <p className="mt-1 text-[11px] text-slate-400">{help}</p>}
    </Field>
  );
  return (
    <div className="p-4 space-y-4">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-800">
        What you enter here is shown in the box <em>and</em> sent to Google as SoftwareApplication structured
        data, so the rich result (stars, price, platform) always matches the page.
      </p>
      {text("name", "App name", "Yacine TV")}
      {text("developer", "Developer", "Yacine Inc.")}
      <div className="grid grid-cols-2 gap-3">
        {text("version", "Version", "5.5.1")}
        {text("size", "Size", "24 MB")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Platform">
          <select className={sel} value={p.os || "Android"} onChange={(e) => u("os", e.target.value)}>
            {APP_OS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        {text("requires", "Requires", "5.0 and up", "Shown after the platform: “Android 5.0 and up”.")}
      </div>
      <Field label="Category">
        <select className={sel} value={p.category || "UtilitiesApplication"} onChange={(e) => u("category", e.target.value)}>
          {APP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </Field>
      <Field label="Last updated">
        <input key="updated" type="date" className={sel} defaultValue={p.updated ?? ""} onBlur={(e) => u("updated", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {text("price", "Price", "0", "0 shows as “Free”.")}
        {text("currency", "Currency", "USD")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text("ratingValue", "Rating (1–5)", "4.5")}
        {text("ratingCount", "Number of ratings", "1200", "Stars only appear with a real count.")}
      </div>
      <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400 -mt-1">
        Only enter a rating your visitors actually gave on this site. Google treats a copied store rating,
        or one the author made up, as self-serving review markup and can drop rich results for the whole site.
      </p>
      <ImageField label="App icon" value={p.icon ?? ""} onChange={(url) => u("icon", url)} />
      {text("downloadUrl", "Download link", "https://…/app.apk or /downloads/app.apk")}
      {text("buttonText", "Button text", "Download")}
      <Field label="Layout">
        <Seg value={p.layout || "card"} onChange={(v) => u("layout", v || "card")}
          options={[{ id: "card", title: "Card" }, { id: "table", title: "Table" }]} />
      </Field>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={p.showSchema !== "0"} onChange={(e) => u("showSchema", e.target.checked ? "1" : "0")} />
        Send structured data to search engines
      </label>
    </div>
  );
}

function TestimonialSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Quote">
        <textarea className={`${sel} resize-none`} rows={4} defaultValue={p.quote} placeholder="Testimonial text…" onBlur={(e) => u("quote", e.target.value)} />
      </Field>
      <Field label="Name">
        <input className={sel} defaultValue={p.name} placeholder="John Doe" onBlur={(e) => u("name", e.target.value)} />
      </Field>
      <Field label="Role / Company">
        <input className={sel} defaultValue={p.role} placeholder="CEO at Acme" onBlur={(e) => u("role", e.target.value)} />
      </Field>
      <Field label="Avatar URL">
        <input type="url" className={sel} defaultValue={p.avatar} placeholder="https://…" onBlur={(e) => u("avatar", e.target.value)} />
      </Field>
      <Field label="Rating">
        <ToggleRow value={p.rating || "5"} onChange={(v) => u("rating", v)}
          options={[{ value: "1", label: "1★" }, { value: "2", label: "2★" }, { value: "3", label: "3★" }, { value: "4", label: "4★" }, { value: "5", label: "5★" }]} />
      </Field>
    </div>
  );
}

function VideoEmbedSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Video URL">
        <input type="url" className={sel} defaultValue={p.url} placeholder="https://youtube.com/watch?v=…" onBlur={(e) => u("url", e.target.value)} />
        <p className="text-[10px] text-slate-400 mt-1">YouTube or Vimeo URL</p>
      </Field>
      <Field label="Caption">
        <input className={sel} defaultValue={p.title} placeholder="Optional caption" onBlur={(e) => u("title", e.target.value)} />
      </Field>
      <Field label="Height (px)">
        <input type="number" className={sel} defaultValue={p.height} placeholder="400" onBlur={(e) => u("height", e.target.value)} />
      </Field>
    </div>
  );
}

function GoogleMapSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Address / Place">
        <input className={sel} defaultValue={p.query} placeholder="New York, USA" onBlur={(e) => u("query", e.target.value)} />
      </Field>
      <Field label="Zoom Level">
        <input type="number" className={sel} defaultValue={p.zoom} min="1" max="20" placeholder="14" onBlur={(e) => u("zoom", e.target.value)} />
      </Field>
      <Field label="Height (px)">
        <input type="number" className={sel} defaultValue={p.height} placeholder="400" onBlur={(e) => u("height", e.target.value)} />
      </Field>
    </div>
  );
}

/**
 * Advanced Accordion panel — Kadence's Accordion and its child pane.
 *
 * Same two-level shape the Icon List uses: the tabs show either the
 * accordion's settings or the selected pane's, and List View drives the
 * selection through `listItemBus`. Padding, margin, animation, conditional
 * display and block defaults come from `bx` via `BoxSettings`, so they are not
 * repeated here.
 */
function AccordionSettings({
  p, u, id,
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
  id: string;
}) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  const [mode, setMode] = useState<"list" | "item">("list");
  const [sel_, setSel] = useState(0);
  const [titleState, setTitleState] = useState<AccState>("normal");
  const [borderState, setBorderState] = useState<AccState>("normal");
  const [iconState, setIconState] = useState<AccState>("normal");
  const { device } = useDevice();

  useEffect(
    () =>
      subscribeActiveListItem((s) => {
        if (!s || s.blockId !== id) return;
        setSel(s.index);
        setMode("item");
      }),
    [id]
  );

  const panes = parsePanes(p.items);
  const i = Math.min(Math.max(sel_, 0), panes.length - 1);
  const pane = panes[i] ?? blankPane(1);

  const writePanes = (next: AccordionPane[]) => u("items", serializePanes(next));
  const setPane = (patch: AccordionPane) =>
    writePanes(panes.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  const pick = (n: number) => {
    setSel(n);
    setMode("item");
    setActiveListItem({ blockId: id, index: n });
  };

  const move = (dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= panes.length) return;
    const next = [...panes];
    [next[i], next[j]] = [next[j], next[i]];
    writePanes(next);
    pick(j);
  };

  /** `k("titleColor")` -> the key for whichever state that group is showing. */
  const tk = (n: string) => stateKey(ACC_STATE_PREFIX[titleState], n);
  const bk = (n: string) => stateKey(ACC_STATE_PREFIX[borderState], n);
  const ik = (n: string) => stateKey(ACC_STATE_PREFIX[iconState], n);

  const startCollapsed = p.startCollapsed === "1";
  // Style belongs to the accordion, so a pane opened while that tab was showing
  // lands on General rather than on a tab it does not have.
  const paneTab = mode === "item" && tab === "style" ? "general" : tab;

  return (
    <>
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        {mode === "item" ? (
          <button
            type="button"
            onClick={() => setMode("list")}
            className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 hover:text-sky-800"
          >
            ‹ View Parent Block Settings
          </button>
        ) : (
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Accordion
          </div>
        )}

        <div className="mb-1.5 flex items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Panes</span>
          <span className="ml-auto flex gap-0.5">
            <button type="button" title="Move up" onClick={() => move(-1)} disabled={i === 0}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white disabled:opacity-25">↑</button>
            <button type="button" title="Move down" onClick={() => move(1)} disabled={i === panes.length - 1}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white disabled:opacity-25">↓</button>
            <button type="button" title="Duplicate"
              onClick={() => { writePanes([...panes.slice(0, i + 1), { ...pane }, ...panes.slice(i + 1)]); pick(i + 1); }}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white">⧉</button>
            <button type="button" title="Remove" disabled={panes.length <= 1}
              onClick={() => { writePanes(panes.filter((_, n) => n !== i)); pick(Math.max(0, i - 1)); }}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-25">✕</button>
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {panes.map((row, n) => (
            <button
              key={n}
              type="button"
              onClick={() => pick(n)}
              className={`max-w-[9rem] truncate rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                n === i && mode === "item"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800"
              }`}
            >
              {String(row.title ?? "").trim() || `Pane ${n + 1}`}
            </button>
          ))}
          <button
            type="button"
            title="Add a pane"
            onClick={() => { writePanes([...panes, blankPane(panes.length + 1)]); pick(panes.length); }}
            className="rounded px-2 py-1 text-[11px] font-bold text-sky-600 ring-1 ring-sky-200 hover:bg-sky-50"
          >
            +
          </button>
        </div>
      </div>

      {/* A pane has no Style tab: panes share one look, set on the accordion.
          Kadence's pane panel is General + Advanced for the same reason. */}
      <Tabs3
        tab={paneTab}
        setTab={(t) => setTab(t as "general" | "style" | "advanced")}
        options={mode === "item" ? ["general", "advanced"] : ["general", "style", "advanced"]}
      />

      <div className="space-y-4 p-4">
        {/* ══ ACCORDION ════════════════════════════════════════════════════ */}
        {mode === "list" && tab === "general" && (
          <>
            <Switch checked={p.closeOthers !== "0"} onChange={(c) => u("closeOthers", c ? "1" : "0")}
              label="Panes close when another opens" />
            <Switch checked={startCollapsed} onChange={(c) => u("startCollapsed", c ? "1" : "")}
              label="Start with all panes collapsed" />

            <ResponsiveSlider label="Column Layout" value={p.cols ?? ""} min={1} max={3} units={[]}
              onChange={(v) => u("cols", v)} />

            <Field label="Initial Open Accordion">
              {startCollapsed ? (
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Every pane starts closed, so there is nothing to choose. Turn off &ldquo;Start with all panes
                  collapsed&rdquo; to pick one.
                </p>
              ) : (
                <div className="space-y-1">
                  {panes.map((row, n) => {
                    const on = (parseInt(p.initialOpen ?? "", 10) || 0) === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => u("initialOpen", String(n))}
                        className={`w-full truncate rounded border px-2 py-1.5 text-left text-[11px] transition-colors ${
                          on ? "border-sky-500 bg-sky-50 font-semibold text-sky-700"
                             : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {String(row.title ?? "").trim() || `Accordion Pane ${n + 1}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>

            <Collapse label="Pane Title Trigger Icon" defaultOpen>
              <Switch checked={p.showIcon !== "0"} onChange={(c) => u("showIcon", c ? "1" : "0")}
                label="Show icon" />
              {p.showIcon !== "0" && (
                <>
                  <Field label="Icon Style">
                    <select className={sel} value={p.iconStyle || "plus"} onChange={(e) => u("iconStyle", e.target.value)}>
                      {ACC_ICON_STYLES.map((o) => (
                        <option key={o.id} value={o.id}>{`${o.closed} ${o.open}  ${o.title}`}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Icon Side">
                    <Seg value={p.iconSide || "right"} onChange={(v) => u("iconSide", v || "right")}
                      options={ACC_ICON_SIDES} />
                  </Field>
                  <Field label="Icon Colour">
                    <StateTabs3 state={iconState} setState={setIconState} />
                    <ColorField value={p[ik("iconColor")] ?? ""} fallback="#64748b"
                      onChange={(v) => u(ik("iconColor"), v)} />
                  </Field>
                </>
              )}
            </Collapse>

            <Collapse label="Title Tag Settings">
              <Field label="Title Tag">
                <select className={sel} value={p.titleTag || "div"} onChange={(e) => u("titleTag", e.target.value)}>
                  {ACC_TITLE_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              {(p.titleTag || "div") === "div" && (
                <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800">
                  The title tag is not currently a heading. This block would be more accessible with a real heading
                  level, so the accordion appears in the page&apos;s outline.
                </p>
              )}
            </Collapse>
          </>
        )}

        {mode === "list" && tab === "style" && (
          <>
            <Collapse label="Pane Title Colours" defaultOpen>
              <StateTabs3 state={titleState} setState={setTitleState} />
              <Field label="Title Colour">
                <ColorField value={p[tk("titleColor")] ?? ""} fallback="#0f172a"
                  onChange={(v) => u(tk("titleColor"), v)} />
              </Field>
              <Field label="Title Background">
                <ColorField value={p[tk("titleBg")] ?? ""} fallback="#10b981"
                  onChange={(v) => u(tk("titleBg"), v)} />
              </Field>
            </Collapse>

            <Collapse label="Pane Title Border">
              <StateTabs3 state={borderState} setState={setBorderState} />
              <ResponsiveBox label="Border" value={p[bk("tBd")] ?? ""} min={0} max={20}
                onChange={(v) => u(bk("tBd"), v)} />
              <Field label="Border Colour">
                <ColorField value={p[bk("tBdColor")] ?? ""} fallback="#10b981"
                  onChange={(v) => u(bk("tBdColor"), v)} />
              </Field>
              {borderState === "normal" && (
                <Field label="Border Style">
                  <Seg value={p.tBdStyle || "solid"} onChange={(v) => u("tBdStyle", v || "solid")}
                    options={[
                      { id: "solid", title: "Solid" },
                      { id: "dashed", title: "Dashed" },
                      { id: "dotted", title: "Dotted" },
                    ]} />
                </Field>
              )}
              <ResponsiveBox label="Border Radius" value={p[bk("tRad")] ?? ""} min={0} max={200}
                onChange={(v) => u(bk("tRad"), v)} />
            </Collapse>

            <Collapse label="Pane Title Font Settings">
              <Field label="Font Size">
                <div className="mb-1.5 grid grid-cols-6 gap-1">
                  {FONT_SIZE_PRESETS.map(([px_, lbl]) => (
                    <button key={lbl} type="button"
                      onClick={() => u("fs", serializeScalar({ ...parseScalar(p.fs), [device]: px_ }))}
                      className="rounded border border-slate-200 bg-white py-1 text-[10px] font-semibold text-slate-500 hover:bg-sky-50 hover:text-sky-600">
                      {lbl}
                    </button>
                  ))}
                </div>
                <ResponsiveSlider label="Size" value={p.fs ?? ""} min={8} max={72} onChange={(v) => u("fs", v)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line Height">
                  <input key="alh" className={inp} placeholder="1.4" defaultValue={p.lh ?? ""}
                    onBlur={(e) => u("lh", e.target.value)} />
                </Field>
                <Field label="Letter Case">
                  <Seg value={p.tt || ""} onChange={(v) => u("tt", v)} options={ACC_LETTER_CASE} />
                </Field>
              </div>
              <Field label="Font Family">
                <select className={sel} value={p.ff || ""} onChange={(e) => u("ff", e.target.value)}>
                  {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="Font Weight">
                <select className={sel} value={p.fw || ""} onChange={(e) => u("fw", e.target.value)}>
                  <option value="">Inherit</option>
                  {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <ResponsiveSlider label="Letter Spacing" value={p.ls ?? ""} min={-5} max={20} step={0.1}
                onChange={(v) => u("ls", v)} />
            </Collapse>

            <Collapse label="Inner Content Styling">
              <Field label="Text Colour">
                <ColorField value={p.cText ?? ""} fallback="#334155" onChange={(v) => u("cText", v)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Link Colour">
                  <ColorField value={p.cLink ?? ""} fallback="#0ea5e9" onChange={(v) => u("cLink", v)} />
                </Field>
                <Field label="Link Hover">
                  <ColorField value={p.cLinkHover ?? ""} fallback="#0284c7" onChange={(v) => u("cLinkHover", v)} />
                </Field>
              </div>
              <Field label="Background">
                <ColorField value={p.cBg ?? ""} fallback="#ffffff" onChange={(v) => u("cBg", v)} />
              </Field>
              <ResponsiveBox label="Border" value={p.cBd ?? ""} min={0} max={20}
                onChange={(v) => u("cBd", v)} />
              <Field label="Border Colour">
                <ColorField value={p.cBdColor ?? ""} fallback="#e2e8f0" onChange={(v) => u("cBdColor", v)} />
              </Field>
              <ResponsiveBox label="Border Radius" value={p.cRad ?? ""} min={0} max={200}
                onChange={(v) => u("cRad", v)} />
            </Collapse>
          </>
        )}

        {mode === "list" && tab === "advanced" && (
          <>
            <Collapse label="Pane Title Sizing" defaultOpen>
              <ResponsiveBox label="Padding" value={p.tPad ?? ""} min={0} max={80} units={SPACING_UNITS}
                onChange={(v) => u("tPad", v)} />
            </Collapse>
            <ResponsiveSlider label="Pane Space Between" value={p.gap ?? ""} min={0} max={60}
              onChange={(v) => u("gap", v)} />
            <Collapse label="Inner Content Padding">
              <ResponsiveBox label="Padding" value={p.cPad ?? ""} min={0} max={80} units={SPACING_UNITS}
                onChange={(v) => u("cPad", v)} />
            </Collapse>

            <Collapse label="Structure Settings">
              <ResponsiveSlider label="Content Minimum Height" value={p.minHeight ?? ""} min={0} max={600}
                onChange={(v) => u("minHeight", v)} />
              <ResponsiveSlider label="Max Width" value={p.maxWidth ?? ""} min={0} max={1400}
                onChange={(v) => u("maxWidth", v)} />
            </Collapse>

            <Collapse label="FAQ Schema" defaultOpen>
              <Switch checked={p.faqSchema === "1"} onChange={(c) => u("faqSchema", c ? "1" : "")}
                label="Enable FAQ schema" />
              <p className="text-[11px] leading-relaxed text-slate-400">
                Adds FAQPage structured data for these panes, so search engines can show them as questions. Use it
                only when the panes really are questions and answers, and only once per page. Google has shown
                FAQ rich results only for well-known government and health sites since August 2023, so on
                most sites this adds no snippet in Google.
              </p>
            </Collapse>

            <Field label="HTML Anchor">
              <input key="aanchor" className={sel} defaultValue={p.anchor ?? ""} placeholder="faqs"
                onBlur={(e) => u("anchor", e.target.value)} />
            </Field>
            <Field label="Additional CSS Class(es)">
              <input key="acls" className={sel} defaultValue={p.cssClass ?? ""} placeholder="Separate with spaces"
                onBlur={(e) => u("cssClass", e.target.value)} />
            </Field>
            <Field label="Additional CSS">
              <textarea key="acss" className={`${sel} h-24 font-mono`} defaultValue={p.customCss ?? ""}
                placeholder="selector .bmsacc-title { letter-spacing: .02em; }"
                onBlur={(e) => u("customCss", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this accordion. Its parts are <code>.bmsacc-pane</code>,{" "}
                <code>.bmsacc-title</code>, <code>.bmsacc-ico</code> and <code>.bmsacc-body</code>.
              </p>
            </Field>
          </>
        )}

        {/* ══ PANE ═════════════════════════════════════════════════════════ */}
        {mode === "item" && panes.length > 0 && paneTab === "general" && (
          <>
            <Field label="Title">
              <input key={`ptitle-${i}`} className={sel} defaultValue={pane.title ?? ""} placeholder="Pane title"
                onBlur={(e) => setPane({ title: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Editable on the canvas too — click the title and type.
              </p>
            </Field>
            <Field label="Content">
              <textarea key={`pcontent-${i}`} className={`${sel} h-32`} defaultValue={pane.content ?? ""}
                placeholder="What this pane reveals" onBlur={(e) => setPane({ content: e.target.value })} />
            </Field>
            <Collapse label="Title Icon Settings" defaultOpen>
              <Field label="Select Icon">
                <IconPicker value={pane.titleIcon || ""} onChange={(v) => setPane({ titleIcon: v })}
                  hint={pane.titleIcon ? "Shown beside the title" : "None"} clearLabel="Clear" />
                {pane.titleIcon && (
                  <div className="mt-2">
                    <ColorField value={pane.titleIconColor ?? ""} fallback="" onChange={(v) => setPane({ titleIconColor: v })} />
                    <p className="mt-1 text-[10px] text-slate-400">Icon colour for this pane. Empty follows the title.</p>
                  </div>
                )}
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Decoration in the title — separate from the open/close trigger, which the accordion sets.
                </p>
              </Field>

              {pane.titleIcon && (
                <Field label="Icon Side">
                  <Seg value={pane.titleIconSide || "left"}
                    onChange={(v) => setPane({ titleIconSide: v || "left" })} options={ACC_ICON_SIDES} />
                </Field>
              )}

              <Switch checked={pane.iconOnly === "1"} onChange={(c) => setPane({ iconOnly: c ? "1" : "" })}
                label="Show only icon" />

              <Field label="Button Label for Accessibility">
                <input key={`paria-${i}`} className={sel} defaultValue={pane.ariaLabel ?? ""}
                  placeholder={pane.title || "Describes what this pane opens"}
                  onBlur={(e) => setPane({ ariaLabel: e.target.value })} />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Names the trigger for screen readers. With &ldquo;Show only icon&rdquo; on there is no visible
                  label, so the title is used until you write one.
                </p>
              </Field>
            </Collapse>

            <Field label="Open This Pane First">
              <button
                type="button"
                onClick={() => { u("initialOpen", String(i)); u("startCollapsed", ""); }}
                className="w-full rounded border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-700"
              >
                {(parseInt(p.initialOpen ?? "", 10) || 0) === i && p.startCollapsed !== "1"
                  ? "✓ Opens first"
                  : "Make this the open pane"}
              </button>
            </Field>
          </>
        )}

        {mode === "item" && panes.length > 0 && paneTab === "advanced" && (
          <>
            {/* The same rule model every block uses, evaluated server-side — a
                pane the viewer must not see never reaches the browser. */}
            <ConditionalDisplaySection
              box={{ cd: pane.cd } as BlockBox}
              write={(patch) => setPane({ cd: patch.cd ?? "" })}
            />

            <Field label="HTML Anchor">
              <input key={`panchor-${i}`} className={sel} defaultValue={pane.anchor ?? ""} placeholder="pricing"
                onBlur={(e) => setPane({ anchor: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Lets a link point straight at this pane.
              </p>
            </Field>
            <Field label="Additional CSS Class(es)">
              <input key={`pcls-${i}`} className={sel} defaultValue={pane.cssClass ?? ""}
                placeholder="Separate with spaces" onBlur={(e) => setPane({ cssClass: e.target.value })} />
            </Field>
            <Field label="Additional CSS">
              <textarea key={`pcss-${i}`} className={`${sel} h-24 font-mono`} defaultValue={pane.customCss ?? ""}
                placeholder="selector .bmsacc-title { background: #fee; }"
                onBlur={(e) => setPane({ customCss: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this pane.
              </p>
            </Field>
          </>
        )}
      </div>
    </>
  );
}

/** Normal / Hover / Active, the three states an accordion title really has. */
function StateTabs3({ state, setState }: { state: AccState; setState: (s: AccState) => void }) {
  return (
    <div className="mb-2 flex gap-1">
      {ACC_STATES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setState(s)}
          className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
            state === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function TabsSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tabs, setTabs] = useState<{ label: string; content: string }[]>(() => {
    try { return JSON.parse(p.tabs); } catch { return [{ label: "Tab 1", content: "" }]; }
  });
  const save = (next: typeof tabs) => { setTabs(next); u("tabs", JSON.stringify(next)); };
  return (
    <div className="p-4 space-y-3">
      <Field label="Tabs">
        <div className="space-y-2 mt-1">
          {tabs.map((tab, i) => (
            <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5">
                <span className="text-[10px] text-slate-400 shrink-0">Tab {i + 1}:</span>
                <input className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none focus:border-sky-400"
                  value={tab.label} onChange={(e) => { const n = [...tabs]; n[i] = { ...n[i], label: e.target.value }; save(n); }} placeholder="Tab label" />
                <button onClick={() => save(tabs.filter((_, j) => j !== i))} className="text-red-400 text-xs px-1 hover:text-red-600">✕</button>
              </div>
              <textarea className="w-full border-t border-slate-200 px-2 py-1.5 text-xs resize-none focus:outline-none" rows={2}
                value={tab.content} onChange={(e) => { const n = [...tabs]; n[i] = { ...n[i], content: e.target.value }; save(n); }} placeholder="Tab content" />
            </div>
          ))}
          <button onClick={() => save([...tabs, { label: `Tab ${tabs.length + 1}`, content: "" }])}
            className="w-full border border-dashed border-slate-300 rounded py-1.5 text-xs text-slate-400 hover:bg-slate-50 hover:border-sky-300">
            + Add Tab
          </button>
        </div>
      </Field>
    </div>
  );
}

/**
 * Advanced Icon List panel — Kadence's Icon List, minus the parts this CMS
 * already solves block-wide.
 *
 * Padding, Margin, Animate on Scroll, Conditional Display and Block Defaults are
 * `bx` features that `BoxSettings` already appends to every custom block's
 * panel, so repeating them here would give the author two padding controls that
 * disagree. What is left is the list's own.
 */
/**
 * Advanced Icon List panel — Kadence's Icon List and its child Icon List Item,
 * minus the parts this CMS already solves block-wide.
 *
 * Kadence makes each item a real block, so it gets its own panel and a "View
 * Parent Block Settings" link back. One block holds the whole list here, so the
 * same two-level feel comes from a mode switch: the tabs show either the list's
 * settings or the selected item's, and List View drives the selection through
 * `listItemBus`.
 *
 * Padding, Margin, Animate on Scroll, Conditional Display and Block Defaults are
 * `bx` features that `BoxSettings` already appends to every custom block's
 * panel, so repeating them would give the author two padding controls that
 * disagree.
 */
function IconListSettings({
  p, u, id,
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
  id: string;
}) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  const [mode, setMode] = useState<"list" | "item">("list");
  const [sel_, setSel] = useState(0);
  const { device } = useDevice();

  // Clicking an item in List View, or focusing its label on the canvas, opens
  // that item here — which is what makes the tree and the panel one thing.
  useEffect(
    () =>
      subscribeActiveListItem((s) => {
        if (!s || s.blockId !== id) return;
        setSel(s.index);
        setMode("item");
      }),
    [id]
  );

  const items = parseItems(p.items);
  // The stored list can shrink under a stale selection — clamp on read rather
  // than syncing state, so a delete never renders an undefined item.
  const i = Math.min(Math.max(sel_, 0), items.length - 1);
  const it = items[i] ?? blankItem();

  const writeItems = (next: IconListItem[]) => u("items", serializeItems(next));
  const setItem = (patch: IconListItem) =>
    writeItems(items.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  const pick = (n: number) => {
    setSel(n);
    setMode("item");
    setActiveListItem({ blockId: id, index: n });
  };

  const move = (dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    writeItems(next);
    pick(j);
  };

  const listStyle = p.iconStyle || "default";
  const listOutlined = IL_OUTLINED.has(listStyle);
  const listShaped = ["stacked", "square"].includes(listStyle);
  // An item may pick its own treatment; "" means it follows the list.
  const itemStyle = it.iconStyle || listStyle;
  const itemOutlined = IL_OUTLINED.has(itemStyle);

  const textGradOn = it.hlTextGrad === "1";
  const bgGradOn = it.hlBgGrad === "1";

  return (
    <>
      {/* Which level is being edited, and the way back up. */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        {mode === "item" ? (
          <button
            type="button"
            onClick={() => setMode("list")}
            className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 hover:text-sky-800"
          >
            ‹ View Parent Block Settings
          </button>
        ) : (
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Icon List
          </div>
        )}

        <div className="mb-1.5 flex items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Items</span>
          <span className="ml-auto flex gap-0.5">
            <button type="button" title="Move up" onClick={() => move(-1)} disabled={i === 0}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white disabled:opacity-25">↑</button>
            <button type="button" title="Move down" onClick={() => move(1)} disabled={i === items.length - 1}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white disabled:opacity-25">↓</button>
            <button type="button" title="Duplicate"
              onClick={() => { writeItems([...items.slice(0, i + 1), { ...it }, ...items.slice(i + 1)]); pick(i + 1); }}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white">⧉</button>
            <button type="button" title="Remove" disabled={items.length <= 1}
              onClick={() => { writeItems(items.filter((_, n) => n !== i)); pick(Math.max(0, i - 1)); }}
              className="h-5 w-5 rounded text-xs text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-25">✕</button>
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {items.map((row, n) => (
            <button
              key={n}
              type="button"
              onClick={() => pick(n)}
              className={`max-w-[9rem] truncate rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                n === i && mode === "item"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800"
              }`}
            >
              {(row.icon || p.icon || "✓") + " " + (String(row.text ?? "").replace(/==([^=]+)==/g, "$1").trim() || `Item ${n + 1}`)}
            </button>
          ))}
          <button
            type="button"
            title="Add an item"
            onClick={() => { writeItems([...items, blankItem()]); pick(items.length); }}
            className="rounded px-2 py-1 text-[11px] font-bold text-sky-600 ring-1 ring-sky-200 hover:bg-sky-50"
          >
            +
          </button>
        </div>
        {/* Right where the text is typed — the same tip sits in the item's
            settings, where nobody found it. */}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          Link or highlight a few words: select them in the list on the canvas and pick Link (Ctrl+K) or Highlight.
          They are stored as <code className="rounded bg-white px-1 ring-1 ring-slate-200">[word](https://…)</code> and{" "}
          <code className="rounded bg-white px-1 ring-1 ring-slate-200">==word==</code>, which you can also type.
        </p>
      </div>

      <Tabs3
        tab={tab}
        setTab={(t) => setTab(t as "general" | "style" | "advanced")}
        options={["general", "style", "advanced"]}
      />

      <div className="space-y-4 p-4">
        {/* ══ LIST ═════════════════════════════════════════════════════════ */}
        {mode === "list" && tab === "general" && (
          <>
            <ResponsiveSlider label="List Columns" value={p.cols ?? ""} min={1} max={6} units={[]}
              onChange={(v) => u("cols", v)} />
            <ResponsiveSlider label="List Column Gap" value={p.colGap ?? ""} min={0} max={120}
              onChange={(v) => u("colGap", v)} />
            <ResponsiveSlider label="List Vertical Spacing" value={p.vGap ?? ""} min={0} max={80}
              onChange={(v) => u("vGap", v)} />
            <ResponsiveSlider label="Icon and Label Spacing" value={p.hGap ?? ""} min={0} max={80}
              onChange={(v) => u("hGap", v)} />
            <Field label="Icon Align">
              <Seg value={p.iconAlign || ""} onChange={(v) => u("iconAlign", v)} options={IL_ICON_ALIGN} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Where the icon sits against a label that wraps onto more than one line.
              </p>
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Click an item above — or its text on the canvas — to edit that item on its own.
            </p>
          </>
        )}

        {mode === "list" && tab === "style" && (
          <>
            <Collapse label="Icon Styling" defaultOpen>
              <Field label="Default Icon">
                <IconPicker value={p.icon || ""} onChange={(v) => u("icon", v)} fallback="✓"
                  hint="Used by every item with no icon of its own" />
              </Field>
              <ResponsiveSlider label="Icon Size" value={p.iconSize ?? ""} min={8} max={72}
                onChange={(v) => u("iconSize", v)} />
              <Field label="Icon Colour">
                <ColorField value={p.iconColor ?? ""} fallback="#0ea5e9" onChange={(v) => u("iconColor", v)} />
              </Field>
              <Field label="Icon Style">
                <select className={sel} value={listStyle} onChange={(e) => u("iconStyle", e.target.value)}>
                  {IL_ICON_STYLE.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </Field>
              {listShaped && (
                <Field label="Shape Colour">
                  <ColorField value={p.iconBg ?? ""} fallback="#0ea5e9" onChange={(v) => u("iconBg", v)} />
                </Field>
              )}
              {listOutlined && (
                <>
                  <ResponsiveSlider label="Line Width" value={p.lineWidth ?? ""} min={0} max={12} units={[]}
                    onChange={(v) => u("lineWidth", v)} />
                  <Field label="Outline Colour">
                    <ColorField value={p.iconBorderColor ?? ""} fallback="#0ea5e9"
                      onChange={(v) => u("iconBorderColor", v)} />
                  </Field>
                </>
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">
                Line Width draws the frame around the icon, so it applies to the two outlined styles. Our icons are
                text glyphs rather than SVG, so there is no stroke of their own to widen.
              </p>
            </Collapse>

            <Collapse label="Text Styling">
              <Field label="Colour">
                <ColorField value={p.textColor ?? ""} fallback="#0f172a" onChange={(v) => u("textColor", v)} />
              </Field>
              <Field label="Font Size">
                <div className="mb-1.5 grid grid-cols-6 gap-1">
                  {FONT_SIZE_PRESETS.map(([px_, lbl]) => (
                    <button key={lbl} type="button"
                      onClick={() => u("fs", serializeScalar({ ...parseScalar(p.fs), [device]: px_ }))}
                      className="rounded border border-slate-200 bg-white py-1 text-[10px] font-semibold text-slate-500 hover:bg-sky-50 hover:text-sky-600">
                      {lbl}
                    </button>
                  ))}
                </div>
                <ResponsiveSlider label="Size" value={p.fs ?? ""} min={8} max={72} onChange={(v) => u("fs", v)} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line Height">
                  <input key="lh" className={inp} placeholder="1.5" defaultValue={p.lh ?? ""}
                    onBlur={(e) => u("lh", e.target.value)} />
                </Field>
                <Field label="Letter Case">
                  <Seg value={p.tt || ""} onChange={(v) => u("tt", v)} options={IL_LETTER_CASE} />
                </Field>
              </div>
              <Field label="Font Family">
                <select className={sel} value={p.ff || ""} onChange={(e) => u("ff", e.target.value)}>
                  {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="Font Weight">
                <select className={sel} value={p.fw || ""} onChange={(e) => u("fw", e.target.value)}>
                  <option value="">Inherit</option>
                  {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <ResponsiveSlider label="Letter Spacing" value={p.ls ?? ""} min={-5} max={20} step={0.1}
                onChange={(v) => u("ls", v)} />
            </Collapse>

            <Collapse label="Link Styling">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Link Colour">
                  <ColorField value={p.linkColor ?? ""} fallback="#0ea5e9" onChange={(v) => u("linkColor", v)} />
                </Field>
                <Field label="Hover Colour">
                  <ColorField value={p.linkHoverColor ?? ""} fallback="#0284c7"
                    onChange={(v) => u("linkHoverColor", v)} />
                </Field>
              </div>
              <Field label="Underline Links">
                <Seg value={p.underline || ""} onChange={(v) => u("underline", v)} options={IL_UNDERLINE} />
                <p className="mt-1 text-[11px] text-slate-400">Unset inherits whatever the theme does.</p>
              </Field>
            </Collapse>
          </>
        )}

        {mode === "list" && tab === "advanced" && (
          <>
            <Field label="HTML Anchor">
              <input key="anchor" className={sel} defaultValue={p.anchor ?? ""} placeholder="features"
                onBlur={(e) => u("anchor", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                One word, no spaces. Other links can then point at <code>#{p.anchor || "your-anchor"}</code>.
              </p>
            </Field>
            <Field label="Additional CSS Class(es)">
              <input key="cssClass" className={sel} defaultValue={p.cssClass ?? ""} placeholder="Separate with spaces"
                onBlur={(e) => u("cssClass", e.target.value)} />
            </Field>
            <Field label="Additional CSS">
              <textarea key="customCss" className={`${sel} h-24 font-mono`} defaultValue={p.customCss ?? ""}
                placeholder="selector .bmsil-ico { transform: rotate(-8deg); }"
                onBlur={(e) => u("customCss", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this list. Its parts are{" "}
                <code>.bmsil-item</code>, <code>.bmsil-ico</code>, <code>.bmsil-txt</code> and{" "}
                <code>.bmsil-hl</code>.
              </p>
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Padding, margin, visibility, scroll animation and conditional display are in the sections below — they
              work the same on every block.
            </p>
          </>
        )}

        {/* ══ ITEM ═════════════════════════════════════════════════════════ */}
        {mode === "item" && items.length > 0 && tab === "general" && (
          <>
            <Field label="Text">
              <input key={`text-${i}`} className={sel} defaultValue={it.text ?? ""} placeholder="List item text"
                onBlur={(e) => setItem({ text: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Editable on the canvas too. Wrap a phrase in <code>==equals==</code> to highlight it, then style it
                under Advanced Highlight Settings.
              </p>
            </Field>

            <Field label="Link">
              <input key={`link-${i}`} className={sel} defaultValue={it.link ?? ""} placeholder="https://… or /page"
                onBlur={(e) => setItem({ link: e.target.value })} />
              {it.link && !safeHref(it.link) && (
                <p className="mt-1 text-[11px] text-red-500">
                  That link scheme isn&apos;t allowed and will be dropped when the page renders.
                </p>
              )}
            </Field>
            {it.link && (
              <Field label="Open In">
                <Seg value={it.target || "_self"} onChange={(v) => setItem({ target: v || "_self" })}
                  options={[{ id: "_self", title: "Same Tab" }, { id: "_blank", title: "New Tab" }]} />
              </Field>
            )}

            <Switch checked={it.hideIcon === "1"} onChange={(c) => setItem({ hideIcon: c ? "1" : "" })}
              label="Hide icon" />

            {it.hideIcon !== "1" && (
              <Field label="Select Icon">
                <IconPicker value={it.icon || ""} onChange={(v) => setItem({ icon: v })} fallback={p.icon || "✓"}
                  hint={it.icon ? "Overridden" : "Using the list icon"} clearLabel="Reset" />
              </Field>
            )}

            <Field label="Icon Title for Screen Readers">
              <input key={`ititle-${i}`} className={sel} defaultValue={it.iconTitle ?? ""}
                placeholder="Leave empty if decorative" onBlur={(e) => setItem({ iconTitle: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                With no title the icon is hidden from screen readers, which is right when it only decorates the label.
              </p>
            </Field>
          </>
        )}

        {mode === "item" && items.length > 0 && tab === "style" && (
          <>
            <ResponsiveSlider label="Icon Size" value={it.iconSize ?? ""} min={8} max={72}
              onChange={(v) => setItem({ iconSize: v })} />
            {itemOutlined && (
              <ResponsiveSlider label="Line Width" value={it.lineWidth ?? ""} min={0} max={12} units={[]}
                onChange={(v) => setItem({ lineWidth: v })} />
            )}
            <Field label="Icon Colour">
              <ColorField value={it.iconColor ?? ""} fallback={p.iconColor || "#0ea5e9"}
                onChange={(v) => setItem({ iconColor: v })} />
            </Field>
            <Field label="Icon Style">
              <select className={sel} value={it.iconStyle || ""} onChange={(e) => setItem({ iconStyle: e.target.value })}>
                <option value="">Inherit</option>
                {IL_ICON_STYLE.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </Field>
            <Field label="Text Colour">
              <ColorField value={it.textColor ?? ""} fallback={p.textColor || "#0f172a"}
                onChange={(v) => setItem({ textColor: v })} />
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Each of these falls back to the list-wide value when left empty.
            </p>

            {/* The item-level Link below wraps the whole row. This is the other
                half of it: one word inside the text, which is what a download
                link or an inline internal link actually needs. */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] leading-relaxed text-slate-500">
                <span className="font-semibold text-slate-600">Link one word</span> inside the text: select it on the canvas and
                pick Link (Ctrl+K), or type{" "}
                <code className="rounded bg-white px-1 py-0.5 text-[10px] ring-1 ring-slate-200">
                  [Download](/file.pdf)
                </code>
                . The rest of the item stays plain. Combine with{" "}
                <code className="rounded bg-white px-1 py-0.5 text-[10px] ring-1 ring-slate-200">==highlight==</code>{" "}
                either way round. The Link field below still links the whole row.
              </p>
            </div>

            <Collapse label="Advanced Highlight Settings">
              <p className="text-[11px] leading-relaxed text-slate-400">
                Styles the part of this item&apos;s text wrapped in <code>==equals==</code>. With nothing wrapped,
                none of it renders.
              </p>

              <Field label="Colour">
                <ColorField value={it.hlColor ?? ""} fallback="#f59e0b" onChange={(v) => setItem({ hlColor: v })} />
              </Field>

              <Switch checked={textGradOn}
                onChange={(c) => setItem({ hlTextGrad: c ? "1" : "", ...(c ? { hlBgGrad: "" } : {}) })}
                label="Enable Text Gradient" />
              <p className="-mt-2 text-[11px] leading-relaxed text-slate-400">
                A text gradient paints the glyphs themselves, so it takes over the background — it and the background
                options below cannot both apply.
              </p>
              {textGradOn && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="From">
                      <ColorField value={it.hlTextGradFrom ?? ""} fallback="#0ea5e9"
                        onChange={(v) => setItem({ hlTextGradFrom: v })} />
                    </Field>
                    <Field label="To">
                      <ColorField value={it.hlTextGradTo ?? ""} fallback="#9333ea"
                        onChange={(v) => setItem({ hlTextGradTo: v })} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Style">
                      <Seg value={it.hlTextGradType || "linear"}
                        onChange={(v) => setItem({ hlTextGradType: v || "linear" })}
                        options={[{ id: "linear", title: "Linear" }, { id: "radial", title: "Radial" }]} />
                    </Field>
                    <Field label="Angle">
                      <input key={`htga-${i}`} type="number" className={sel} placeholder="160"
                        defaultValue={it.hlTextGradAngle ?? ""}
                        onBlur={(e) => setItem({ hlTextGradAngle: e.target.value })} />
                    </Field>
                  </div>
                </>
              )}

              {!textGradOn && (
                <>
                  <Field label="Background">
                    <ColorField value={it.hlBg ?? ""} fallback="#fef08a" onChange={(v) => setItem({ hlBg: v })} />
                  </Field>
                  <Switch checked={bgGradOn} onChange={(c) => setItem({ hlBgGrad: c ? "1" : "" })}
                    label="Enable Background Gradient" />
                  {bgGradOn && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="From">
                          <ColorField value={it.hlBgGradFrom ?? ""} fallback="#fef08a"
                            onChange={(v) => setItem({ hlBgGradFrom: v })} />
                        </Field>
                        <Field label="To">
                          <ColorField value={it.hlBgGradTo ?? ""} fallback="#fca5a5"
                            onChange={(v) => setItem({ hlBgGradTo: v })} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Style">
                          <Seg value={it.hlBgGradType || "linear"}
                            onChange={(v) => setItem({ hlBgGradType: v || "linear" })}
                            options={[{ id: "linear", title: "Linear" }, { id: "radial", title: "Radial" }]} />
                        </Field>
                        <Field label="Angle">
                          <input key={`hbga-${i}`} type="number" className={sel} placeholder="160"
                            defaultValue={it.hlBgGradAngle ?? ""}
                            onBlur={(e) => setItem({ hlBgGradAngle: e.target.value })} />
                        </Field>
                      </div>
                    </>
                  )}
                </>
              )}

              <ResponsiveBox label="Border" value={it.hlBd ?? ""} min={0} max={20}
                onChange={(v) => setItem({ hlBd: v })} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Border Style">
                  <Seg value={it.hlBdStyle || "solid"} onChange={(v) => setItem({ hlBdStyle: v || "solid" })}
                    options={[
                      { id: "solid", title: "Solid" },
                      { id: "dashed", title: "Dashed" },
                      { id: "dotted", title: "Dotted" },
                    ]} />
                </Field>
                <Field label="Border Colour">
                  <ColorField value={it.hlBdColor ?? ""} fallback="#f59e0b"
                    onChange={(v) => setItem({ hlBdColor: v })} />
                </Field>
              </div>
              <ResponsiveBox label="Border Radius" value={it.hlRad ?? ""} min={0} max={200}
                onChange={(v) => setItem({ hlRad: v })} />

              <Field label="Font Size">
                <div className="mb-1.5 grid grid-cols-6 gap-1">
                  {FONT_SIZE_PRESETS.map(([px_, lbl]) => (
                    <button key={lbl} type="button"
                      onClick={() => setItem({ hlFs: serializeScalar({ ...parseScalar(it.hlFs), [device]: px_ }) })}
                      className="rounded border border-slate-200 bg-white py-1 text-[10px] font-semibold text-slate-500 hover:bg-sky-50 hover:text-sky-600">
                      {lbl}
                    </button>
                  ))}
                </div>
                <ResponsiveSlider label="Size" value={it.hlFs ?? ""} min={8} max={72}
                  onChange={(v) => setItem({ hlFs: v })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line Height">
                  <input key={`hlh-${i}`} className={inp} placeholder="1.5" defaultValue={it.hlLh ?? ""}
                    onBlur={(e) => setItem({ hlLh: e.target.value })} />
                </Field>
                <Field label="Letter Case">
                  <Seg value={it.hlTt || ""} onChange={(v) => setItem({ hlTt: v })} options={IL_LETTER_CASE} />
                </Field>
              </div>
              <Field label="Font Family">
                <select className={sel} value={it.hlFf || ""} onChange={(e) => setItem({ hlFf: e.target.value })}>
                  {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="Font Weight">
                <select className={sel} value={it.hlFw || ""} onChange={(e) => setItem({ hlFw: e.target.value })}>
                  <option value="">Inherit</option>
                  {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <ResponsiveSlider label="Letter Spacing" value={it.hlLs ?? ""} min={-5} max={20} step={0.1}
                onChange={(v) => setItem({ hlLs: v })} />
              <ResponsiveBox label="Padding" value={it.hlPad ?? ""} min={0} max={80} units={SPACING_UNITS}
                onChange={(v) => setItem({ hlPad: v })} />
            </Collapse>
          </>
        )}

        {mode === "item" && items.length > 0 && tab === "advanced" && (
          <>
            <Field label="Additional CSS Class(es)">
              <input key={`icls-${i}`} className={sel} defaultValue={it.cssClass ?? ""}
                placeholder="Separate with spaces" onBlur={(e) => setItem({ cssClass: e.target.value })} />
            </Field>
            <Field label="Additional CSS">
              <textarea key={`icss-${i}`} className={`${sel} h-24 font-mono`} defaultValue={it.customCss ?? ""}
                placeholder="selector .bmsil-hl { text-shadow: 0 1px 0 #fff; }"
                onBlur={(e) => setItem({ customCss: e.target.value })} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this item.
              </p>
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Conditional display and scroll animation apply to the whole list — they are in the sections below.
            </p>
          </>
        )}

        {mode === "item" && items.length === 0 && (
          <p className="text-[11px] leading-relaxed text-slate-400">
            This list has no items yet. Add one with the + above.
          </p>
        )}
      </div>
    </>
  );
}

function TableOfContentsSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");

  const levels = parseLevels(p.levels);
  const toggleLevel = (n: number) => {
    const next = new Set(levels);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    // Never let every level end up off — there would be nothing left to list.
    u("levels", (next.size ? [...next] : [1, 2, 3, 4, 5, 6]).sort().join(""));
  };
  const collapsible = p.collapsible === "1";

  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as "general" | "style" | "advanced")} options={["general", "style", "advanced"]} />

      <div className="space-y-4 p-4">
        {tab === "general" && (
          <>
            <Field label="Title">
              <input className={sel} defaultValue={p.title} placeholder="Table of Contents" onBlur={(e) => u("title", e.target.value)} />
            </Field>
            <Switch checked={p.showTitle !== "0"} onChange={(c) => u("showTitle", c ? "1" : "0")} label="Enable Title" />
            <Field label="Numbering">
              <ToggleRow value={p.showNumbers || "true"} onChange={(v) => u("showNumbers", v)}
                options={[{ value: "true", label: "Numbered" }, { value: "false", label: "Bullets" }]} />
            </Field>

            <Collapse label="Allowed Headers" defaultOpen>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Switch key={n} checked={levels.has(n)} onChange={() => toggleLevel(n)} label={`H${n}`} />
              ))}
            </Collapse>

            <Collapse label="Collapsible Settings" defaultOpen>
              <Switch checked={collapsible} onChange={(c) => u("collapsible", c ? "1" : "")} label="Enable Collapsible Content" />
              {collapsible && (
                <Switch checked={p.startCollapsed === "1"} onChange={(c) => u("startCollapsed", c ? "1" : "")} label="Start Collapsed" />
              )}
            </Collapse>

            {collapsible && (
              <Collapse label="Pane Title Trigger Icon" defaultOpen>
                <Switch checked={p.showIcon !== "0"} onChange={(c) => u("showIcon", c ? "1" : "0")} label="Show Icon" />
                {p.showIcon !== "0" && (
                  <>
                    <Field label="Icon Style">
                      <select className={sel} value={p.iconStyle || "plus"} onChange={(e) => u("iconStyle", e.target.value)}>
                        {TOC_ICON_STYLES.map((o) => (
                          <option key={o.id} value={o.id}>{`${o.closed} ${o.open}  ${o.title}`}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Icon Colour">
                      <ColorField value={p.iconColor ?? ""} fallback="#64748b" onChange={(v) => u("iconColor", v)} />
                    </Field>
                  </>
                )}
                <Switch checked={p.titleToggle !== "0"} onChange={(c) => u("titleToggle", c ? "1" : "0")}
                  label="Enable title to toggle as well as icon" />
              </Collapse>
            )}
          </>
        )}

        {tab === "style" && (
          <>
            <Collapse label="Title Style" defaultOpen>
              <Field label="Title Colour">
                <ColorField value={p.titleColor ?? ""} fallback="#0f172a" onChange={(v) => u("titleColor", v)} />
              </Field>
              <Field label="Title Background">
                <ColorField value={p.titleBg ?? ""} fallback="#f8fafc" onChange={(v) => u("titleBg", v)} />
              </Field>
              <ResponsiveSlider label="Font Size" value={p.tFs ?? ""} min={8} max={72} onChange={(v) => u("tFs", v)} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line Height">
                  <input key="tlh" className={inp} placeholder="1.4" defaultValue={p.tLh ?? ""} onBlur={(e) => u("tLh", e.target.value)} />
                </Field>
                <Field label="Letter Case">
                  <Seg value={p.tTt || ""} onChange={(v) => u("tTt", v)} options={TOC_LETTER_CASE} />
                </Field>
              </div>
              <Field label="Font Family">
                <select className={sel} value={p.tFf || ""} onChange={(e) => u("tFf", e.target.value)}>
                  {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="Font Weight">
                <select className={sel} value={p.tFw || ""} onChange={(e) => u("tFw", e.target.value)}>
                  <option value="">Inherit</option>
                  {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <ResponsiveSlider label="Letter Spacing" value={p.tLs ?? ""} min={-5} max={20} step={0.1} onChange={(v) => u("tLs", v)} />
              <ResponsiveBox label="Padding" value={p.tPad ?? ""} min={0} max={80} units={SPACING_UNITS} onChange={(v) => u("tPad", v)} />
              <ResponsiveBox label="Border" value={p.tBd ?? ""} min={0} max={20} onChange={(v) => u("tBd", v)} />
              <Field label="Border Colour">
                <ColorField value={p.tBdColor ?? ""} fallback="#e2e8f0" onChange={(v) => u("tBdColor", v)} />
              </Field>
              <ResponsiveBox label="Border Radius" value={p.tRad ?? ""} min={0} max={200} onChange={(v) => u("tRad", v)} />
              <ResponsiveBox label="Margin" value={p.tMargin ?? ""} min={0} max={80} units={SPACING_UNITS} onChange={(v) => u("tMargin", v)} />
            </Collapse>

            <Collapse label="List Style">
              <Field label="Items Colour">
                <ColorField value={p.listColor ?? ""} fallback="#334155" onChange={(v) => u("listColor", v)} />
              </Field>
              <Field label="Active Item Colour">
                <ColorField value={p.activeColor ?? ""} fallback="#0ea5e9" onChange={(v) => u("activeColor", v)} />
              </Field>
              <Field label="Link Style">
                <Seg value={p.listStyle || "underline"} onChange={(v) => u("listStyle", v || "underline")} options={TOC_LIST_STYLES} />
              </Field>
              <ResponsiveSlider label="Font Size" value={p.lFs ?? ""} min={8} max={48} onChange={(v) => u("lFs", v)} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line Height">
                  <input key="llh" className={inp} placeholder="1.6" defaultValue={p.lLh ?? ""} onBlur={(e) => u("lLh", e.target.value)} />
                </Field>
                <Field label="Letter Case">
                  <Seg value={p.lTt || ""} onChange={(v) => u("lTt", v)} options={TOC_LETTER_CASE} />
                </Field>
              </div>
              <Field label="Font Family">
                <select className={sel} value={p.lFf || ""} onChange={(e) => u("lFf", e.target.value)}>
                  {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="Font Weight">
                <select className={sel} value={p.lFw || ""} onChange={(e) => u("lFw", e.target.value)}>
                  <option value="">Inherit</option>
                  {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <ResponsiveSlider label="Letter Spacing" value={p.lLs ?? ""} min={-5} max={20} step={0.1} onChange={(v) => u("lLs", v)} />
              <ResponsiveSlider label="Item Gap" value={p.listGap ?? ""} min={0} max={40} onChange={(v) => u("listGap", v)} />
              <ResponsiveBox label="Margin" value={p.listMargin ?? ""} min={0} max={80} units={SPACING_UNITS} onChange={(v) => u("listMargin", v)} />
            </Collapse>

            <Collapse label="Container Style">
              <Field label="Background">
                <ColorField value={p.bg ?? ""} fallback="#ffffff" onChange={(v) => u("bg", v)} />
              </Field>
              <ResponsiveBox label="Border" value={p.bd ?? ""} min={0} max={20} onChange={(v) => u("bd", v)} />
              <Field label="Border Colour">
                <ColorField value={p.bdColor ?? ""} fallback="#e2e8f0" onChange={(v) => u("bdColor", v)} />
              </Field>
              <ResponsiveBox label="Border Radius" value={p.rad ?? ""} min={0} max={200} onChange={(v) => u("rad", v)} />
              <Field label="Shadow">
                <input value={p.shadow ?? ""} placeholder="none" onChange={(e) => u("shadow", e.target.value)} className={`${inp} font-mono text-xs`} />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Any CSS box-shadow, e.g. 0 15px 25px -7px rgba(0,0,0,.1)</p>
              </Field>
            </Collapse>
          </>
        )}

        {tab === "advanced" && (
          <>
            <Collapse label="Structure Settings" defaultOpen>
              <ResponsiveBox label="Padding" value={p.pad ?? ""} min={0} max={80} units={SPACING_UNITS} onChange={(v) => u("pad", v)} />
              <ResponsiveBox label="Margin" value={p.margin ?? ""} min={0} max={80} units={SPACING_UNITS} onChange={(v) => u("margin", v)} />
              <ResponsiveSlider label="Max Width" value={p.maxWidth ?? ""} min={0} max={1400} onChange={(v) => u("maxWidth", v)} />
            </Collapse>

            <Collapse label="Scroll Settings" defaultOpen>
              <Switch checked={p.smoothScroll !== "0"} onChange={(c) => u("smoothScroll", c ? "1" : "0")}
                label="Enable Smooth Scroll to ID" />
              <Switch checked={p.highlightActive === "1"} onChange={(c) => u("highlightActive", c ? "1" : "")}
                label="Enable Highlighting Heading when scrolling in area" />
            </Collapse>

            <Field label="HTML Anchor">
              <input key="tocanchor" className={sel} defaultValue={p.anchor ?? ""} placeholder="contents" onBlur={(e) => u("anchor", e.target.value)} />
            </Field>
            <Field label="Additional CSS Class(es)">
              <input key="toccls" className={sel} defaultValue={p.cssClass ?? ""} placeholder="Separate with spaces" onBlur={(e) => u("cssClass", e.target.value)} />
            </Field>
            <Field label="Additional CSS">
              <textarea key="toccss" className={`${sel} h-24 font-mono`} defaultValue={p.customCss ?? ""}
                placeholder="selector .bmstoc-title { letter-spacing: .02em; }" onBlur={(e) => u("customCss", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this block. Its parts are <code>.bmstoc-title</code>,{" "}
                <code>.bmstoc-list</code>, <code>.bmstoc-item</code> and <code>.bmstoc-link</code>.
              </p>
            </Field>
          </>
        )}
      </div>
    </>
  );
}

function SplitContentSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Image URL">
        <input type="url" className={sel} defaultValue={p.image} placeholder="https://…" onBlur={(e) => u("image", e.target.value)} />
      </Field>
      <Field label="Image Position">
        <ToggleRow value={p.imagePosition || "right"} onChange={(v) => u("imagePosition", v)}
          options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
      </Field>
      <Field label="Heading">
        <input className={sel} defaultValue={p.heading} placeholder="Your heading" onBlur={(e) => u("heading", e.target.value)} />
      </Field>
      <Field label="Body Text">
        <textarea className={`${sel} resize-none`} rows={3} defaultValue={p.text} placeholder="Description…" onBlur={(e) => u("text", e.target.value)} />
      </Field>
      <Field label="Button Label">
        <input className={sel} defaultValue={p.buttonText} placeholder="Learn More" onBlur={(e) => u("buttonText", e.target.value)} />
      </Field>
      <Field label="Button URL">
        <input type="url" className={sel} defaultValue={p.buttonUrl} placeholder="https://…" onBlur={(e) => u("buttonUrl", e.target.value)} />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row Layout — Layout / Style / Advanced, in the shape Kadence users expect
// ─────────────────────────────────────────────────────────────────────────────

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  const arrow = "w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors";
  return (
    <div className="flex items-center rounded border border-slate-200 overflow-hidden">
      <button type="button" className={arrow} disabled={value <= min} onClick={() => step(-1)}>‹</button>
      <span className="flex-1 text-center text-xs font-medium text-slate-700">{value}</span>
      <button type="button" className={arrow} disabled={value >= max} onClick={() => step(1)}>›</button>
    </div>
  );
}

/** Width presets drawn as proportional bars, so the shape is the label. */
function LayoutPicker({ count, value, onChange }: { count: number; value: string; onChange: (v: string) => void }) {
  const presets = presetsFor(count);
  return (
    <div className="grid grid-cols-3 gap-2">
      {presets.map((preset) => {
        const total = preset.fr.reduce((a, b) => a + b, 0);
        const active = (value || "equal") === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            title={preset.label}
            className={`flex gap-0.5 p-1.5 rounded-md border-2 transition-colors ${active ? "border-sky-400 bg-sky-50" : "border-slate-200 hover:border-slate-300"}`}
          >
            {preset.fr.map((f, i) => (
              <span key={i} className={`h-6 rounded-sm ${active ? "bg-sky-400" : "bg-slate-300"}`} style={{ flexGrow: f, flexBasis: `${(f / total) * 100}%` }} />
            ))}
          </button>
        );
      })}
    </div>
  );
}

/** None / SM / MD / LG plus a custom value — the gutter control. */
function GutterRow({
  value, custom, onValue, onCustom,
}: {
  value: string; custom: string;
  onValue: (v: string) => void; onCustom: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex rounded-lg overflow-hidden border border-slate-200">
        {GUTTERS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onValue(g.id)}
            className={`flex-1 py-1.5 text-[10px] font-semibold uppercase transition-colors ${
              value === g.id ? "bg-sky-600 text-white" : "bg-white text-slate-400 hover:text-slate-600"
            }`}
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onValue("custom")}
          title="Custom"
          className={`w-9 py-1.5 text-[11px] border-l border-slate-200 transition-colors ${
            value === "custom" ? "bg-sky-600 text-white" : "bg-white text-slate-400 hover:text-slate-600"
          }`}
        >
          ⇥
        </button>
      </div>
      {value === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="range" min="0" max="120"
            value={parseInt(custom) || 0}
            onChange={(e) => onCustom(e.target.value)}
            className="flex-1 accent-sky-600"
          />
          <input
            type="number" className={`${sel} w-16`}
            value={parseInt(custom) || 0}
            onChange={(e) => onCustom(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function Collapse({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100 -mx-4 px-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600"
      >
        {label}
        <span className="text-slate-400">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && <div className="space-y-4 pt-3 pb-1">{children}</div>}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 py-0.5">
      <span className={`relative h-4 w-7 rounded-full transition-colors ${checked ? "bg-sky-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? "left-3.5" : "left-0.5"}`} />
      </span>
      <span className="text-[11px] text-slate-600">{label}</span>
    </button>
  );
}

/**
 * The colour control used across the block panels.
 *
 * The palette is a disclosure rather than always-on: a panel can carry a dozen
 * colour fields, and eighteen swatches under each would bury the settings
 * between them. The swatch row opens on the well, which is where someone
 * reaches when they want to change the colour anyway.
 */
/**
 * A colour well that also offers the palette.
 *
 * Deliberately the same size and shape as the native `<input type="color">` it
 * replaces, because these sit inside tight rows next to width and offset
 * fields — a taller control would break a dozen panel layouts to add one
 * feature. The swatches open in a popover above the row instead.
 */
function ColorDot({
  value, fallback, onChange, className = "w-8 h-8",
}: {
  value: string;
  fallback: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = value || fallback;
  // Several call sites size the well with `w-full`. A shrink-to-fit wrapper
  // would leave that resolving against nothing, so the wrapper takes the width
  // and lets the button fill it.
  const full = className.includes("w-full");
  return (
    <span className={`relative align-middle ${full ? "block w-full" : "inline-block"}`}>
      <button
        type="button"
        title="Pick a colour"
        onClick={() => setOpen((o) => !o)}
        className={`${className} rounded border p-0.5 transition-colors ${open ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"}`}
      >
        <span className="block h-full w-full rounded-sm" style={{ backgroundColor: shown }} />
      </button>
      {open && (
        <>
          {/* Click-away, so the popover cannot be left open behind the panel. */}
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="absolute left-0 z-50 mt-1 block w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
            <PaletteSwatches value={value} onChange={(c) => { onChange(c); setOpen(false); }} />
            <span className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(shown) ? shown : fallback}
                onChange={(e) => onChange(e.target.value)}
                className="h-6 w-10 shrink-0 cursor-pointer rounded border border-slate-200 p-0.5"
              />
              <input
                className={`${sel} font-mono`}
                value={value}
                placeholder="Custom"
                onChange={(e) => onChange(e.target.value)}
              />
            </span>
          </span>
        </>
      )}
    </span>
  );
}

function ColorField({ value, fallback, onChange }: { value: string; fallback: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Pick a colour"
          onClick={() => setOpen((o) => !o)}
          className={`h-8 w-8 shrink-0 rounded border p-0.5 transition-colors ${
            open ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"
          }`}
        >
          <span
            className="block h-full w-full rounded-sm"
            style={
              value
                ? { backgroundColor: value }
                : {
                    backgroundImage:
                      "linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%),linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)",
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0,4px 4px",
                  }
            }
          />
        </button>
        <span className="text-[11px] text-slate-400">{value || "Not set"}</span>
        {value && <button onClick={() => onChange("")} className="ml-auto text-xs text-red-400 hover:text-red-600">Clear</button>}
      </div>

      {open && (
        <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
          <PaletteSwatches value={value} onChange={(c) => { onChange(c); setOpen(false); }} />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(value) ? value : fallback}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-10 cursor-pointer rounded border border-slate-200 p-0.5"
            />
            <input
              className={`${sel} font-mono`}
              value={value}
              placeholder="Custom"
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Four-sided spacing input. */
function SideBox({
  p, u, keys, labels = ["Top", "Right", "Bottom", "Left"],
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
  keys: [string, string, string, string];
  /** Corner radius and box shadow reuse the grid with their own captions. */
  labels?: [string, string, string, string] | string[];
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {keys.map((k, i) => (
        <label key={k} className="space-y-1">
          <input
            type="number"
            className={`${sel} text-center`}
            defaultValue={p[k]}
            placeholder="0"
            onBlur={(e) => u(k, e.target.value)}
          />
          <span className="block text-center text-[9px] uppercase tracking-wide text-slate-400">{labels[i]}</span>
        </label>
      ))}
    </div>
  );
}

/** Slider paired with a number box — the shape Kadence uses for every length. */
function NumSlider({
  value, onChange, min = 0, max = 100, unit, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  unit?: React.ReactNode;
  placeholder?: string;
}) {
  const n = parseInt(value);
  const current = Number.isFinite(n) ? n : min;
  return (
    <div className="flex items-center gap-2">
      <input
        type="range" min={min} max={max} value={current}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 accent-sky-600"
      />
      <input
        type="number" className={`${sel} w-16`} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
    </div>
  );
}

/** Colour / gradient / image picker shared by the background and its overlay. */
function GradientFields({
  p, u, prefix,
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
  prefix: "" | "ov";
}) {
  const k = (name: string) => (prefix ? `ov${name}` : name.charAt(0).toLowerCase() + name.slice(1));
  return (
    <>
      <Field label="Gradient Type">
        <ToggleRow
          value={p[k("GradType")] || "linear"}
          onChange={(v) => u(k("GradType"), v)}
          options={[{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }]}
        />
      </Field>
      <Field label="From">
        <ColorField value={p[k("GradFrom")] || ""} fallback="#38bdf8" onChange={(v) => u(k("GradFrom"), v)} />
      </Field>
      <Field label="To">
        <ColorField value={p[k("GradTo")] || ""} fallback="#6366f1" onChange={(v) => u(k("GradTo"), v)} />
      </Field>
      {(p[k("GradType")] || "linear") === "linear" && (
        <Field label="Angle (deg)">
          <NumSlider value={p[k("GradAngle")] ?? "160"} onChange={(v) => u(k("GradAngle"), v)} max={360} unit="°" />
        </Field>
      )}
    </>
  );
}

function DividerSettings({ p, u, side }: { p: Record<string, string>; u: (k: string, v: string) => void; side: "Top" | "Bot" }) {
  const k = (name: string) => `div${side}${name}`;
  const style = p[k("Style")] || "none";
  return (
    <>
      <Field label="Style">
        <select className={sel} value={style} onChange={(e) => u(k("Style"), e.target.value)}>
          {DIVIDER_STYLES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </Field>
      {style !== "none" && (
        <>
          <Field label="Color">
            <ColorField value={p[k("Color")] || ""} fallback="#ffffff" onChange={(v) => u(k("Color"), v)} />
          </Field>
          <Field label="Height">
            <NumSlider
              value={p[k("Height")] ?? "60"}
              onChange={(v) => u(k("Height"), v)}
              min={10} max={300} unit="px"
            />
          </Field>
          <Field label="Width">
            <NumSlider
              value={p[k("Width")] ?? "100"}
              onChange={(v) => u(k("Width"), v)}
              min={1} max={100} unit="%"
            />
          </Field>
          <Switch
            checked={p[k("Flip")] === "true"}
            onChange={(v) => u(k("Flip"), String(v))}
            label="Flip horizontally"
          />
        </>
      )}
    </>
  );
}

/**
 * Per-column background, padding and alignment.
 *
 * Written through the row's live handle rather than the panel's `u`, because
 * the panel's copy of `cols` is stale the moment anyone types in a column.
 */
function ColumnStyles({ id, count }: { id: string; count: number }) {
  const [, bump] = useState(0);
  const api = getRowApi(id);

  if (!api) {
    return <p className="text-[11px] text-slate-400">Scroll the row into view to style its columns.</p>;
  }

  const cols = api.getColumns();
  const set = (i: number, patch: Partial<RowColumnData>) => {
    api.setColumnStyle(i, patch);
    bump((n) => n + 1);
  };

  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const col = cols[i] ?? {};
        return (
          <Collapse key={i} label={`Column ${i + 1}`}>
            <Field label="Background">
              <ColorField value={col.bg || ""} fallback="#ffffff" onChange={(v) => set(i, { bg: v })} />
            </Field>
            <Field label="Inner Padding (px)">
              <input
                type="number"
                className={sel}
                defaultValue={col.pad ?? ""}
                placeholder="0"
                onBlur={(e) => set(i, { pad: e.target.value })}
              />
            </Field>
            <Field label="Vertical Align">
              <ToggleRow
                value={col.valign || "top"}
                onChange={(v) => set(i, { valign: v as RowColumnData["valign"] })}
                options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }]}
              />
            </Field>
            <Field label="Corner Radius (px)">
              <input
                type="number"
                className={sel}
                defaultValue={col.radius ?? ""}
                placeholder="0"
                onBlur={(e) => set(i, { radius: e.target.value })}
              />
            </Field>
          </Collapse>
        );
      })}
    </>
  );
}

/* ── Section: a Row Layout column's own settings ──────────────────────────── */

/** Segmented icon row. Clicking the active option clears it back to inherit. */
function Seg({
  value, onChange, options, columns,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label?: string; title: string }[];
  columns?: number;
}) {
  return (
    <div
      className="grid overflow-hidden rounded border border-slate-200"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0,1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          onClick={() => onChange(value === o.id ? "" : o.id)}
          className={`px-1 py-1.5 text-[11px] font-medium transition-colors ${
            value === o.id ? "bg-sky-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {o.label ?? o.title}
        </button>
      ))}
    </div>
  );
}

/** Four-sided number row (padding / margin), per device. */
function SidesRow({
  prefix, sfx, p, u,
}: {
  prefix: string;
  sfx: string;
  p: Record<string, string>;
  u: (k: string, v: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {(["T", "R", "B", "L"] as const).map((s) => {
        const key = `${prefix}${s}${sfx}`;
        return (
          <div key={key}>
            {/* Keyed so switching device re-mounts the uncontrolled input. */}
            <input
              key={key}
              type="number"
              className={inp}
              placeholder="—"
              defaultValue={p[key] ?? ""}
              onBlur={(e) => u(key, e.target.value)}
            />
            <div className="mt-0.5 text-center text-[9px] text-slate-400">{s}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Normal / Hover switch, as Kadence puts above each colour group. */
function StateTabs({ state, setState }: { state: "normal" | "hover"; setState: (s: "normal" | "hover") => void }) {
  return (
    <div className="mb-2 flex gap-1">
      {(["normal", "hover"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setState(s)}
          className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
            state === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** Conditional Display for a Section, over the same rule model blocks use. */
function SectionConditions({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const rules = parseConditions(p.cd) ?? { mode: "show" as const, match: "and" as const, rules: [] };
  const save = (next: typeof rules) => u("cd", serializeConditions(next));
  const setRule = (i: number, patch: Partial<DisplayCondition>) =>
    save({ ...rules, rules: rules.rules.map((r, n) => (n === i ? { ...r, ...patch } : r)) });

  return (
    <>
      {rules.rules.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-slate-400">
          Always shown. Add a rule to limit who sees this section.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Then">
              <select className={sel} value={rules.mode} onChange={(e) => save({ ...rules, mode: e.target.value as "show" | "hide" })}>
                <option value="show">Show section</option>
                <option value="hide">Hide section</option>
              </select>
            </Field>
            <Field label="When">
              <select className={sel} value={rules.match} onChange={(e) => save({ ...rules, match: e.target.value as "and" | "or" })}>
                <option value="and">All rules match</option>
                <option value="or">Any rule matches</option>
              </select>
            </Field>
          </div>
          <div className="mt-2 space-y-2">
            {rules.rules.map((rule, i) => (
              <div key={i} className="rounded border border-slate-200 p-2">
                <div className="flex items-center gap-1.5">
                  <select
                    className={`${sel} flex-1`}
                    value={rule.k}
                    onChange={(e) => setRule(i, { k: e.target.value as DisplayCondition["k"], v: "" })}
                  >
                    {CONDITION_KINDS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="Remove this rule"
                    onClick={() => save({ ...rules, rules: rules.rules.filter((_, n) => n !== i) })}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    X
                  </button>
                </div>
                {rule.k === "role" && (
                  <input className={`${sel} mt-1.5`} placeholder="Any role, or admin / editor" defaultValue={rule.v ?? ""} onBlur={(e) => setRule(i, { v: e.target.value })} />
                )}
                {(rule.k === "after" || rule.k === "before") && (
                  <input type="datetime-local" className={`${sel} mt-1.5`} defaultValue={rule.v ?? ""} onChange={(e) => setRule(i, { v: e.target.value })} />
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => save({ ...rules, rules: [...rules.rules, { k: "login" }] })}
        className="btn-secondary mt-2 w-full text-xs"
      >
        + Add rule
      </button>
    </>
  );
}

/** Saves a Section's settings as the starting point for newly added columns. */
function SectionDefaults({ p }: { p: Record<string, string> }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasDefault, setHasDefault] = useState(false);

  useEffect(() => {
    loadBlockDefaults().then(() => setHasDefault(hasBlockDefault("section")));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setState("saving");
    try {
      await fn();
    } catch (err) {
      // `persist` throws when the server refuses — block defaults are
      // site-wide, so only an administrator may set them. This used to be
      // swallowed: the button said "Saved", the default worked for the rest
      // of the session, and it was gone after a reload.
      setError(err instanceof Error ? err.message : "Could not save the block default.");
      setState("error");
      setTimeout(() => setState("idle"), 4000);
      return;
    }
    setHasDefault(hasBlockDefault("section"));
    setState("saved");
    setTimeout(() => setState("idle"), 1800);
  };

  return (
    <>
      <p className="text-[11px] leading-relaxed text-slate-400">
        Applies to columns added from now on. Columns already on the page are untouched.
      </p>
      <button
        type="button"
        disabled={state === "saving"}
        onClick={() => run(() => saveBlockDefault("section", p))}
        className="btn-secondary mt-2 w-full text-xs disabled:opacity-60"
      >
        {state === "saving" ? "Saving..." : state === "saved" ? "Saved as default" : state === "error" ? "Could not save" : "Save as default"}
      </button>
      {state === "error" && error && (
        <p className="text-[11px] leading-relaxed text-amber-600 mt-1">{error}</p>
      )}
      {hasDefault && (
        <button
          type="button"
          onClick={() => run(() => clearBlockDefault("section"))}
          className="mt-1 w-full text-[11px] text-slate-400 transition-colors hover:text-red-600"
        >
          Clear saved default
        </button>
      )}
    </>
  );
}

function SectionSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  const [bgState, setBgState] = useState<"normal" | "hover">("normal");
  const [bdState, setBdState] = useState<"normal" | "hover">("normal");
  const [txState, setTxState] = useState<"normal" | "hover">("normal");

  // The panel-wide device switch decides which suffix every responsive control
  // writes to, so one toggle puts the whole Section into tablet or mobile.
  const { device } = useDevice();
  const sfx = device === "d" ? "" : device === "t" ? "T" : "M";
  const hv = bgState === "hover" ? "hover" : "";
  const k = (base: string) => (hv ? `${hv}${base[0].toUpperCase()}${base.slice(1)}` : base);

  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as "general" | "style" | "advanced")} options={["general", "style", "advanced"]} />
      <div className="space-y-4 p-4">

        {tab === "general" && (
          <>
            <Field label="Direction">
              <Seg value={p[`dir${sfx}`] || ""} onChange={(v) => u(`dir${sfx}`, v)} options={FLEX_DIRECTIONS.map((d) => ({ id: d.id, label: d.label, title: d.title }))} />
            </Field>
            <Field label="Alignment">
              <Seg value={p[`align${sfx}`] || ""} onChange={(v) => u(`align${sfx}`, v)}
                options={FLEX_ALIGN.map((a) => ({ id: a.id, label: a.title.slice(0, 3), title: a.title }))} />
            </Field>
            <Field label="Vertical Alignment">
              <Seg columns={3} value={p[`valignFlex${sfx}`] || ""} onChange={(v) => u(`valignFlex${sfx}`, v)}
                options={FLEX_JUSTIFY.map((a) => ({ id: a.id, label: a.title.split(" ")[0].slice(0, 6), title: a.title }))} />
            </Field>
            <Field label="Vertical Gap">
              <Seg value={p.vgap || ""} onChange={(v) => u("vgap", v)}
                options={[
                  { id: "none", title: "None" }, { id: "sm", title: "SM" },
                  { id: "md", title: "MD" }, { id: "lg", title: "LG" }, { id: "custom", title: "Custom" },
                ]} />
              {p.vgap === "custom" && (
                <input type="number" className={`${sel} mt-1.5`} placeholder="Gap in px" defaultValue={p.vgapCustom} onBlur={(e) => u("vgapCustom", e.target.value)} />
              )}
            </Field>
            <Field label="Text Alignment">
              <Seg value={p[`textAlign${sfx}`] || ""} onChange={(v) => u(`textAlign${sfx}`, v)}
                options={TEXT_ALIGN.map((a) => ({ id: a.id, label: a.title, title: a.title }))} />
            </Field>

            <Collapse label="Overlay Link">
              <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
                If a link is added, nothing else inside the section will be selectable on the published page.
              </p>
              <Field label="Link Entire Section">
                <input type="url" className={sel} placeholder="https://…" defaultValue={p.linkUrl} onBlur={(e) => u("linkUrl", e.target.value)} />
              </Field>
              <Field label="Link Title">
                <input className={sel} placeholder="Describes the link" defaultValue={p.linkTitle} onBlur={(e) => u("linkTitle", e.target.value)} />
              </Field>
            </Collapse>
          </>
        )}

        {tab === "style" && (
          <>
            <Collapse label="Background" defaultOpen>
              <StateTabs state={bgState} setState={setBgState} />
              <Field label="Type">
                <Seg value={p[k("bgType")] || "color"} onChange={(v) => u(k("bgType"), v)}
                  options={[{ id: "color", title: "Colour" }, { id: "gradient", title: "Gradient" }]} />
              </Field>
              {p[k("bgType")] === "gradient" ? (
                <>
                  <Field label="Gradient From">
                    <ColorField value={p[k("bgGradFrom")] || ""} fallback="#0ea5e9" onChange={(v) => u(k("bgGradFrom"), v)} />
                  </Field>
                  <Field label="Gradient To">
                    <ColorField value={p[k("bgGradTo")] || ""} fallback="#9333ea" onChange={(v) => u(k("bgGradTo"), v)} />
                  </Field>
                  <Field label="Gradient Style">
                    <Seg value={p[k("bgGradType")] || "linear"} onChange={(v) => u(k("bgGradType"), v)}
                      options={[{ id: "linear", title: "Linear" }, { id: "radial", title: "Radial" }]} />
                  </Field>
                  {p[k("bgGradType")] !== "radial" && (
                    <Field label="Angle">
                      <input type="number" className={sel} placeholder="160" defaultValue={p[k("bgGradAngle")]} onBlur={(e) => u(k("bgGradAngle"), e.target.value)} />
                    </Field>
                  )}
                </>
              ) : (
                <Field label="Background Colour">
                  <ColorField value={p[k("bg")] || ""} fallback="#ffffff" onChange={(v) => u(k("bg"), v)} />
                </Field>
              )}
              <Field label="Background Image URL">
                <input className={sel} placeholder="https://…" defaultValue={p[k("bgImage")]} onBlur={(e) => u(k("bgImage"), e.target.value)} />
              </Field>
              {p[k("bgImage")] && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Size">
                    <select className={sel} value={p[k("bgSize")] || "cover"} onChange={(e) => u(k("bgSize"), e.target.value)}>
                      {["cover", "contain", "auto"].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Repeat">
                    <select className={sel} value={p[k("bgRepeat")] || "no-repeat"} onChange={(e) => u(k("bgRepeat"), e.target.value)}>
                      {["no-repeat", "repeat", "repeat-x", "repeat-y"].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Position">
                    <select className={sel} value={p[k("bgPos")] || "center center"} onChange={(e) => u(k("bgPos"), e.target.value)}>
                      {["center center", "top left", "top center", "top right", "center left", "center right", "bottom left", "bottom center", "bottom right"].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Attachment">
                    <select className={sel} value={p[k("bgAttach")] || "scroll"} onChange={(e) => u(k("bgAttach"), e.target.value)}>
                      {["scroll", "fixed", "local"].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </Collapse>

            <Collapse label="Backdrop Filter">
              <Field label="Filter">
                <select className={sel} value={p.backdrop || "none"} onChange={(e) => u("backdrop", e.target.value)}>
                  {BACKDROP_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              {p.backdrop && p.backdrop !== "none" && (
                <Field label="Amount">
                  <input type="number" className={sel} placeholder="Auto" defaultValue={p.backdropAmount} onBlur={(e) => u("backdropAmount", e.target.value)} />
                </Field>
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">Blurs whatever sits behind the section. Not supported in every browser.</p>
            </Collapse>

            <Collapse label="Background Overlay">
              <Field label="Type">
                <Seg value={p.ovType || ""} onChange={(v) => u("ovType", v)}
                  options={[{ id: "color", title: "Colour" }, { id: "gradient", title: "Gradient" }, { id: "image", title: "Image" }]} />
              </Field>
              {p.ovType === "gradient" ? (
                <>
                  <Field label="From"><ColorField value={p.ovGradFrom || ""} fallback="#0ea5e9" onChange={(v) => u("ovGradFrom", v)} /></Field>
                  <Field label="To"><ColorField value={p.ovGradTo || ""} fallback="#9333ea" onChange={(v) => u("ovGradTo", v)} /></Field>
                </>
              ) : p.ovType === "image" ? (
                <Field label="Overlay Image URL">
                  <input className={sel} placeholder="https://…" defaultValue={p.ovImage} onBlur={(e) => u("ovImage", e.target.value)} />
                </Field>
              ) : p.ovType ? (
                <Field label="Overlay Colour"><ColorField value={p.ovColor || ""} fallback="#000000" onChange={(v) => u("ovColor", v)} /></Field>
              ) : null}
              {p.ovType && (
                <>
                  <Field label="Opacity (%)">
                    <input type="number" min="0" max="100" className={sel} placeholder="30" defaultValue={p.ovOpacity} onBlur={(e) => u("ovOpacity", e.target.value)} />
                  </Field>
                  <Field label="Blend Mode">
                    <select className={sel} value={p.ovBlend || "normal"} onChange={(e) => u("ovBlend", e.target.value)}>
                      {BLEND_MODES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </Field>
                  <p className="text-[11px] leading-relaxed text-slate-400">Blend Mode is not supported in every browser.</p>
                </>
              )}
            </Collapse>

            <Collapse label="Border Styles">
              <StateTabs state={bdState} setState={setBdState} />
              {bdState === "normal" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Width (px)">
                      <input type="number" className={inp} placeholder="0" defaultValue={p.bdWidth} onBlur={(e) => u("bdWidth", e.target.value)} />
                    </Field>
                    <Field label="Style">
                      <select className={sel} value={p.bdStyle || "solid"} onChange={(e) => u("bdStyle", e.target.value)}>
                        {["solid", "dashed", "dotted", "double"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Border Colour">
                    <ColorField value={p.bdColor || ""} fallback="#e2e8f0" onChange={(v) => u("bdColor", v)} />
                  </Field>
                </>
              ) : (
                <Field label="Border Colour (hover)">
                  <ColorField value={p.bdColorHover || ""} fallback="#0ea5e9" onChange={(v) => u("bdColorHover", v)} />
                </Field>
              )}
              <Field label="Border Radius (px)">
                <div className="grid grid-cols-4 gap-1.5">
                  {(["radTL", "radTR", "radBR", "radBL"] as const).map((key, i) => (
                    <div key={key}>
                      <input type="number" className={inp} placeholder="0" defaultValue={p[key]} onBlur={(e) => u(key, e.target.value)} />
                      <div className="mt-0.5 text-center text-[9px] text-slate-400">{["TL", "TR", "BR", "BL"][i]}</div>
                    </div>
                  ))}
                </div>
              </Field>
              <Field label="Box Shadow">
                <ToggleRow value={p[bdState === "hover" ? "hoverShadow" : "shadow"] || "false"}
                  onChange={(v) => u(bdState === "hover" ? "hoverShadow" : "shadow", v)}
                  options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} />
                {p[bdState === "hover" ? "hoverShadow" : "shadow"] === "true" && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {([["shX", "X"], ["shY", "Y"], ["shBlur", "Blur"], ["shSpread", "Spread"]] as const).map(([base, lbl]) => {
                      const key = bdState === "hover" ? `hover${base[0].toUpperCase()}${base.slice(1)}` : base;
                      return (
                        <div key={key}>
                          <input type="number" className={inp} placeholder={lbl} defaultValue={p[key]} onBlur={(e) => u(key, e.target.value)} />
                          <div className="mt-0.5 text-center text-[9px] text-slate-400">{lbl}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {p[bdState === "hover" ? "hoverShadow" : "shadow"] === "true" && (
                  <div className="mt-2">
                    <ColorField
                      value={p[bdState === "hover" ? "hoverShColor" : "shColor"] || ""}
                      fallback="#00000026"
                      onChange={(v) => u(bdState === "hover" ? "hoverShColor" : "shColor", v)}
                    />
                  </div>
                )}
              </Field>
            </Collapse>

            <Collapse label="Text Colour Settings">
              <StateTabs state={txState} setState={setTxState} />
              {txState === "normal" ? (
                <>
                  <Field label="Text Colour"><ColorField value={p.textColor || ""} fallback="#1e293b" onChange={(v) => u("textColor", v)} /></Field>
                  <Field label="Link Colour"><ColorField value={p.linkColor || ""} fallback="#0ea5e9" onChange={(v) => u("linkColor", v)} /></Field>
                </>
              ) : (
                <>
                  <Field label="Text Colour (hover)"><ColorField value={p.textColorHover || ""} fallback="#1e293b" onChange={(v) => u("textColorHover", v)} /></Field>
                  <Field label="Link Colour (hover)"><ColorField value={p.linkHoverColor || ""} fallback="#0284c7" onChange={(v) => u("linkHoverColor", v)} /></Field>
                </>
              )}
            </Collapse>
          </>
        )}

        {tab === "advanced" && (
          <>
            <Field label="Padding (px)"><SidesRow prefix="pad" sfx={sfx} p={p} u={u} /></Field>
            <Field label="Margin (px)"><SidesRow prefix="mar" sfx={sfx} p={p} u={u} /></Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Leave a field empty to inherit the wider breakpoint.
            </p>

            <Collapse label="Structure Settings" defaultOpen>
              <Field label="Container HTML Tag">
                <select className={sel} value={p.htmlTag || "div"} onChange={(e) => u("htmlTag", e.target.value)}>
                  {SECTION_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Min Height (px)">
                <input key={`minHeight${sfx}`} type="number" className={sel} placeholder="—" defaultValue={p[`minHeight${sfx}`]} onBlur={(e) => u(`minHeight${sfx}`, e.target.value)} />
              </Field>
              <Field label="Max Width (px)">
                <input key={`maxWidth${sfx}`} type="number" className={sel} placeholder="—" defaultValue={p[`maxWidth${sfx}`]} onBlur={(e) => u(`maxWidth${sfx}`, e.target.value)} />
              </Field>
              <Field label="Z-Index">
                <input type="number" className={sel} placeholder="Auto" defaultValue={p.zIndex} onBlur={(e) => u("zIndex", e.target.value)} />
              </Field>
            </Collapse>

            <Collapse label="Sticky Settings">
              <Field label="Sticky Section">
                <ToggleRow value={p.sticky || "false"} onChange={(v) => u("sticky", v)}
                  options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} />
              </Field>
              {p.sticky === "true" && (
                <Field label="Offset From Top (px)">
                  <input type="number" className={sel} placeholder="0" defaultValue={p.stickyOffset} onBlur={(e) => u("stickyOffset", e.target.value)} />
                </Field>
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">
                A sticky section only travels while its row is on screen — it cannot outlive its parent.
              </p>
            </Collapse>

            <Collapse label="Visibility Settings">
              {([["hideD", "Hide on Desktop"], ["hideT", "Hide on Tablet"], ["hideM", "Hide on Mobile"]] as const).map(([key, lbl]) => (
                <Field key={key} label={lbl}>
                  <ToggleRow value={p[key] || "false"} onChange={(v) => u(key, v)}
                    options={[{ value: "false", label: "Show" }, { value: "true", label: "Hide" }]} />
                </Field>
              ))}
            </Collapse>

            <Collapse label="Custom CSS">
              <textarea
                className={`${sel} resize-y font-mono`}
                rows={5}
                placeholder={"selector {\n  \n}"}
                defaultValue={p.customCss}
                onBlur={(e) => u("customCss", e.target.value)}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Use <span className="font-mono text-slate-500">selector</span> to mean this section.
              </p>
            </Collapse>

            <Collapse label="Animate on Scroll">
              <Field label="Animation">
                <select className={sel} value={p.an || ""} onChange={(e) => u("an", e.target.value)}>
                  {SCROLL_ANIMATIONS.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
              </Field>
              {p.an && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Duration (ms)">
                      <input type="number" className={inp} placeholder="600" defaultValue={p.anD} onBlur={(e) => u("anD", e.target.value)} />
                    </Field>
                    <Field label="Delay (ms)">
                      <input type="number" className={inp} placeholder="0" defaultValue={p.anL} onBlur={(e) => u("anL", e.target.value)} />
                    </Field>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300"
                      checked={p.anR === "1"}
                      onChange={(e) => u("anR", e.target.checked ? "1" : "")}
                    />
                    Replay every time it scrolls into view
                  </label>
                </>
              )}
            </Collapse>

            <Collapse label="Conditional Display">
              <SectionConditions p={p} u={u} />
            </Collapse>

            <Collapse label="Block Defaults">
              <SectionDefaults p={p} />
            </Collapse>

            <Collapse label="Advanced">
              <Field label="HTML Anchor">
                <input className={sel} placeholder="my-section" defaultValue={p.anchor} onBlur={(e) => u("anchor", e.target.value)} />
              </Field>
              <Field label="Additional CSS Class(es)">
                <input className={sel} placeholder="my-class" defaultValue={p.cssClass} onBlur={(e) => u("cssClass", e.target.value)} />
              </Field>
            </Collapse>
          </>
        )}
      </div>
    </>
  );
}

function RowLayoutSettings({ p, u, id }: { p: Record<string, string>; u: (k: string, v: string) => void; id: string }) {
  const [tab, setTab] = useState<"layout" | "style" | "advanced">("layout");
  const count = clampColumns(parseInt(p.columns) || 2);
  const layout = p.layout || p.ratio || "equal";
  const inherit = p.inheritMax !== "false";

  // Column count and width preset move together: a 3-column preset means
  // nothing on a 2-column row.
  const setCount = (n: number) => {
    const next = clampColumns(n);
    u("columns", String(next));
    u("layout", findPreset(next, layout).id);
  };

  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as "layout" | "style" | "advanced")} options={["layout", "style", "advanced"]} />

      {tab === "layout" && (
        <div className="p-4 space-y-4">
          <Field label="Columns">
            <Stepper value={count} min={1} max={MAX_ROW_COLUMNS} onChange={setCount} />
          </Field>

          {count > 1 && (
            <Field label="Column Layout">
              <LayoutPicker count={count} value={layout} onChange={(v) => u("layout", v)} />
            </Field>
          )}

          <Field label="Column Gutter">
            <GutterRow
              value={p.gutter || "md"}
              custom={p.gutterCustom || "24"}
              onValue={(v) => u("gutter", v)}
              onCustom={(v) => u("gutterCustom", v)}
            />
          </Field>

          <Field label="Row Gutter">
            <GutterRow
              value={p.vGutter || "md"}
              custom={p.vGutterCustom || "24"}
              onValue={(v) => u("vGutter", v)}
              onCustom={(v) => u("vGutterCustom", v)}
            />
          </Field>

          <Field label="Vertical Align">
            <ToggleRow
              value={p.valign === "center" ? "middle" : p.valign || "top"}
              onChange={(v) => u("valign", v)}
              options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }]}
            />
          </Field>

          <Collapse label="Content Max Width" defaultOpen>
            <Switch
              checked={inherit}
              onChange={(v) => u("inheritMax", v ? "true" : "false")}
              label="Inherit max width from theme"
            />
            {!inherit && (
              <Field label="Custom Content Max Width">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={p.maxWidthUnit === "%" ? 100 : 1600}
                    value={parseInt(p.maxWidth) || 0}
                    onChange={(e) => u("maxWidth", e.target.value)}
                    className="flex-1 accent-sky-600"
                  />
                  <input
                    type="number"
                    className={`${sel} w-16`}
                    value={parseInt(p.maxWidth) || 0}
                    onChange={(e) => u("maxWidth", e.target.value)}
                  />
                  <select
                    className={`${sel} w-14`}
                    value={p.maxWidthUnit || "px"}
                    onChange={(e) => u("maxWidthUnit", e.target.value)}
                  >
                    <option value="px">px</option>
                    <option value="%">%</option>
                  </select>
                </div>
              </Field>
            )}
          </Collapse>

          <Collapse label="Top Divider">
            <DividerSettings p={p} u={u} side="Top" />
          </Collapse>

          <Collapse label="Bottom Divider">
            <DividerSettings p={p} u={u} side="Bot" />
          </Collapse>
        </div>
      )}

      {tab === "style" && (
        <div className="p-4 space-y-4">
          <Collapse label="Background Settings" defaultOpen>
            <Field label="Type">
              <ToggleRow
                value={p.bgType || "color"}
                onChange={(v) => u("bgType", v)}
                options={[
                  { value: "color", label: "Color" },
                  { value: "gradient", label: "Gradient" },
                  { value: "image", label: "Image" },
                ]}
              />
            </Field>

            {(p.bgType || "color") === "gradient" ? (
              <GradientFields p={p} u={u} prefix="" />
            ) : (
              <Field label="Background Color">
                <ColorField value={p.bgColor || ""} fallback="#ffffff" onChange={(v) => u("bgColor", v)} />
              </Field>
            )}

            {p.bgType === "image" && (
              <>
                <ImageField label="Background Image" value={p.bgImage || ""} onChange={(v) => u("bgImage", v)} />
                <Field label="Size">
                  <select className={sel} value={p.bgSize || "cover"} onChange={(e) => u("bgSize", e.target.value)}>
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                    <option value="auto">Auto</option>
                  </select>
                </Field>
                <Field label="Position">
                  <select className={sel} value={p.bgPos || "center center"} onChange={(e) => u("bgPos", e.target.value)}>
                    {BG_POSITIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </Field>
                <Field label="Repeat">
                  <select className={sel} value={p.bgRepeat || "no-repeat"} onChange={(e) => u("bgRepeat", e.target.value)}>
                    <option value="no-repeat">No Repeat</option>
                    <option value="repeat">Repeat</option>
                    <option value="repeat-x">Repeat X</option>
                    <option value="repeat-y">Repeat Y</option>
                  </select>
                </Field>
                <Field label="Attachment">
                  <ToggleRow
                    value={p.bgAttach || "scroll"}
                    onChange={(v) => u("bgAttach", v)}
                    options={[{ value: "scroll", label: "Scroll" }, { value: "fixed", label: "Fixed" }]}
                  />
                </Field>
              </>
            )}
          </Collapse>

          <Collapse label="Background Overlay">
            <Field label="Overlay Type">
              <ToggleRow
                value={p.ovType || ""}
                onChange={(v) => u("ovType", v)}
                options={[
                  { value: "", label: "None" },
                  { value: "color", label: "Color" },
                  { value: "gradient", label: "Gradient" },
                ]}
              />
            </Field>
            {p.ovType && (
              <>
                {p.ovType === "gradient" ? (
                  <GradientFields p={p} u={u} prefix="ov" />
                ) : (
                  <Field label="Overlay Color">
                    <ColorField value={p.ovColor || ""} fallback="#000000" onChange={(v) => u("ovColor", v)} />
                  </Field>
                )}
                <Field label="Opacity">
                  <NumSlider value={p.ovOpacity ?? "30"} onChange={(v) => u("ovOpacity", v)} max={100} unit="%" />
                </Field>
                <Field label="Blend Mode">
                  <select className={sel} value={p.ovBlend || "normal"} onChange={(e) => u("ovBlend", e.target.value)}>
                    {BLEND_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
                <p className="text-[10px] leading-relaxed text-slate-400">
                  Blend modes other than Normal are not supported in every browser.
                </p>
              </>
            )}
          </Collapse>

          <Collapse label="Border & Shadow">
            <Field label="Border Style">
              <select className={sel} value={p.bdStyle || "solid"} onChange={(e) => u("bdStyle", e.target.value)}>
                {["none", "solid", "dashed", "dotted", "double"].map((v) => (
                  <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                ))}
              </select>
            </Field>
            {(p.bdStyle || "solid") !== "none" && (
              <>
                <Field label="Border Width">
                  <NumSlider value={p.bdWidth ?? ""} onChange={(v) => u("bdWidth", v)} max={20} unit="px" placeholder="0" />
                </Field>
                <Field label="Border Color">
                  <ColorField value={p.bdColor || ""} fallback="#e2e8f0" onChange={(v) => u("bdColor", v)} />
                </Field>
              </>
            )}
            <Field label="Border Radius (px)">
              <SideBox p={p} u={u} keys={["radTL", "radTR", "radBR", "radBL"]} labels={["TL", "TR", "BR", "BL"]} />
            </Field>
            <Switch checked={p.shadow === "true"} onChange={(v) => u("shadow", String(v))} label="Box shadow" />
            {p.shadow === "true" && (
              <>
                <Field label="Offset, Blur & Spread (px)">
                  <SideBox p={p} u={u} keys={["shX", "shY", "shBlur", "shSpread"]} labels={["X", "Y", "Blur", "Spread"]} />
                </Field>
                <Field label="Shadow Color">
                  <ColorField value={p.shColor || ""} fallback="#0f172a" onChange={(v) => u("shColor", v)} />
                </Field>
              </>
            )}
          </Collapse>

          <Collapse label="Text Colors">
            <Field label="Text Color">
              <ColorField value={p.textColor || ""} fallback="#0f172a" onChange={(v) => u("textColor", v)} />
            </Field>
            <Field label="Link Color">
              <ColorField value={p.linkColor || ""} fallback="#0284c7" onChange={(v) => u("linkColor", v)} />
            </Field>
            <Field label="Link Hover Color">
              <ColorField value={p.linkHoverColor || ""} fallback="#0369a1" onChange={(v) => u("linkHoverColor", v)} />
            </Field>
          </Collapse>

          <Collapse label="Spacing & Size" defaultOpen>
            <Field label="Padding (px)">
              <SideBox p={p} u={u} keys={["padT", "padR", "padB", "padL"]} />
            </Field>
            <Field label="Min Height (px)">
              <input type="number" className={sel} defaultValue={p.minHeight} placeholder="0" onBlur={(e) => u("minHeight", e.target.value)} />
            </Field>
          </Collapse>

          <ColumnStyles id={id} count={count} />
        </div>
      )}

      {tab === "advanced" && (
        <div className="p-4 space-y-4">
          <Field label="On Mobile">
            <ToggleRow
              value={p.mobileStack || "stack"}
              onChange={(v) => u("mobileStack", v)}
              options={[{ value: "stack", label: "Stack" }, { value: "keep", label: "Keep Row" }]}
            />
          </Field>

          <Field label="Stacking Order">
            <ToggleRow
              value={p.mobileOrder || "normal"}
              onChange={(v) => u("mobileOrder", v)}
              options={[{ value: "normal", label: "Normal" }, { value: "reverse", label: "Reversed" }]}
            />
          </Field>

          <Collapse label="Structure Settings">
            <Field label="Container HTML Tag">
              <select className={sel} value={p.htmlTag || "div"} onChange={(e) => u("htmlTag", e.target.value)}>
                {ROW_TAGS.map((t) => <option key={t} value={t}>{`<${t}>`}</option>)}
              </select>
            </Field>
            <Switch
              checked={p.fullHeight === "true"}
              onChange={(v) => u("fullHeight", String(v))}
              label="Full viewport height (100vh)"
            />
            <Field label="Maximum Height (px)">
              <NumSlider value={p.maxHeight ?? ""} onChange={(v) => u("maxHeight", v)} max={1200} unit="px" placeholder="Auto" />
            </Field>
            <Field label="Z Index">
              <input
                type="number" className={sel} defaultValue={p.zIndex} placeholder="Auto"
                onBlur={(e) => u("zIndex", e.target.value)}
              />
            </Field>
          </Collapse>

          <Collapse label="User Visibility">
            <Switch
              checked={p.hideLoggedIn === "true"}
              onChange={(v) => u("hideLoggedIn", String(v))}
              label="Hide from logged in users"
            />
            <Switch
              checked={p.hideLoggedOut === "true"}
              onChange={(v) => u("hideLoggedOut", String(v))}
              label="Hide from logged out users"
            />
            <p className="text-[10px] leading-relaxed text-slate-400">
              Applies on the published page only — the editor always shows the row.
            </p>
          </Collapse>

          <Collapse label="Editing">
            <Switch
              checked={p.contentOnly === "true"}
              onChange={(v) => u("contentOnly", String(v))}
              label="Row content only editing"
            />
            <p className="text-[10px] leading-relaxed text-slate-400">
              Hides the row&apos;s toolbar and outline in the editor. Columns stay editable, so a finished layout can be
              handed over without its structure being moved by accident.
            </p>
          </Collapse>

          <Collapse label="Custom CSS">
            <Field label="HTML Anchor">
              <input
                className={sel} defaultValue={p.anchor} placeholder="my-section"
                onBlur={(e) => u("anchor", e.target.value)}
              />
            </Field>
            <Field label="Additional CSS Class(es)">
              <input
                className={sel} defaultValue={p.cssClass} placeholder="hero dark-panel"
                onBlur={(e) => u("cssClass", e.target.value)}
              />
            </Field>
            <Field label="Additional CSS">
              <textarea
                rows={6}
                className={`${sel} font-mono text-[10px] leading-relaxed`}
                defaultValue={p.customCss}
                placeholder={"selector {\n  \n}"}
                onBlur={(e) => u("customCss", e.target.value)}
              />
            </Field>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Use <span className="font-mono text-slate-500">selector</span> to target this row — it is replaced with the
              row&apos;s own class when the page renders.
            </p>
          </Collapse>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Responsive spacing, per-device visibility and hover effects for the row as a whole live in the Box section below.
          </p>
        </div>
      )}
    </>
  );
}

function CalloutSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Emoji">
        <input className={sel} defaultValue={p.emoji} placeholder="💡" onBlur={(e) => u("emoji", e.target.value)} />
      </Field>
      <Field label="Background Color">
        <ColorDot value={p.bgColor} fallback="#fef9c3" onChange={(v) => u("bgColor", v)} className="w-full h-8 rounded border border-slate-200 p-1" />
      </Field>
      <Field label="Message">
        <textarea className={`${sel} resize-none`} rows={3} defaultValue={p.text} placeholder="Callout message…" onBlur={(e) => u("text", e.target.value)} />
      </Field>
    </div>
  );
}

function TextAdvancedSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as any)} options={["general", "style", "advanced"]} />
      <div className="p-4 space-y-4">
        <p className="text-[11px] text-slate-400 -mt-1">Type the text directly in the editor. These controls style it.</p>

        {tab === "general" && (
          <>
            <Field label="HTML Tag">
              <div className="flex gap-1 flex-wrap">
                {["p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "span"].map((t) => (
                  <button key={t} onClick={() => u("tag", t)}
                    className={`px-2 py-0.5 text-xs rounded font-mono font-bold transition-colors ${p.tag === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Alignment">
              <ToggleRow value={p.align || "left"} onChange={(v) => u("align", v)}
                options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }, { value: "justify", label: "Justify" }]} />
            </Field>
            <Field label="Max Width">
              <div className="flex gap-2">
                <input type="number" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none focus:border-sky-400"
                  defaultValue={p.maxWidth} placeholder="e.g. 800" onBlur={(e) => u("maxWidth", e.target.value)} />
                <select className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none" value={p.maxWidthUnit || "%"} onChange={(e) => u("maxWidthUnit", e.target.value)}>
                  {["px", "%", "rem", "vw"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Link URL">
              <input type="url" className={sel} defaultValue={p.linkUrl} placeholder="https://…" onBlur={(e) => u("linkUrl", e.target.value)} />
            </Field>
            <Field label="Link Target">
              <ToggleRow value={p.linkTarget || "_self"} onChange={(v) => u("linkTarget", v)}
                options={[{ value: "_self", label: "Same Tab" }, { value: "_blank", label: "New Tab" }]} />
            </Field>
            <Field label="Font Family">
              <select className={sel} value={p.fontFamily || ""} onChange={(e) => u("fontFamily", e.target.value)}>
                {FONT_FAMILIES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Text Orientation">
              <ToggleRow value={p.orientation || "normal"} onChange={(v) => u("orientation", v)}
                options={[{ value: "normal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }]} />
            </Field>
          </>
        )}

        {tab === "style" && (
          <>
            <Field label="Text Color">
              <div className="flex items-center gap-2">
                <ColorDot value={p.color} fallback="#000000" onChange={(v) => u("color", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
                {p.color && <button onClick={() => u("color", "")} className="text-xs text-red-400 hover:text-red-600">✕ Clear</button>}
              </div>
            </Field>
            <Field label="Background Color">
              <div className="flex items-center gap-2">
                <ColorDot value={p.bgColor} fallback="#ffffff" onChange={(v) => u("bgColor", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
                {p.bgColor && <button onClick={() => u("bgColor", "")} className="text-xs text-red-400 hover:text-red-600">✕ Clear</button>}
              </div>
            </Field>

            <Field label="Text Gradient">
              <ToggleRow value={p.textGradient || "false"} onChange={(v) => u("textGradient", v)}
                options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} />
              {p.textGradient === "true" && (
                <div className="flex items-center gap-2 mt-2">
                  <ColorDot value={p.gradFrom} fallback="#0ea5e9" onChange={(v) => u("gradFrom", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
                  <ColorDot value={p.gradTo} fallback="#9333ea" onChange={(v) => u("gradTo", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
                  <input type="number" placeholder="Angle°" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none" defaultValue={p.gradAngle || "90"} onBlur={(e) => u("gradAngle", e.target.value)} />
                </div>
              )}
            </Field>

            <Field label="Font Size">
              <div className="flex gap-1 flex-wrap mb-1.5">
                {FONT_SIZE_PRESETS.map(([v, l]) => (
                  <button key={l} onClick={() => u("fontSize", v)}
                    className={`px-2 py-0.5 text-[11px] rounded font-semibold transition-colors ${p.fontSize === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <input type="number" className={sel} defaultValue={p.fontSize} placeholder="Custom px" onBlur={(e) => u("fontSize", e.target.value)} />
            </Field>
            <Field label="Font Weight">
              <select className={sel} value={p.fontWeight || "400"} onChange={(e) => u("fontWeight", e.target.value)}>
                {FONT_WEIGHTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Line Height">
              <input className={sel} defaultValue={p.lineHeight} placeholder="1.7" onBlur={(e) => u("lineHeight", e.target.value)} />
            </Field>
            <Field label="Letter Spacing">
              <input className={sel} defaultValue={p.letterSpacing} placeholder="0.05em" onBlur={(e) => u("letterSpacing", e.target.value)} />
            </Field>
            <Field label="Font Style">
              <ToggleRow value={p.fontStyle || "normal"} onChange={(v) => u("fontStyle", v)}
                options={[{ value: "normal", label: "Normal" }, { value: "italic", label: "Italic" }, { value: "oblique", label: "Oblique" }]} />
            </Field>
            <Field label="Transform">
              <ToggleRow value={p.textTransform || "none"} onChange={(v) => u("textTransform", v)}
                options={[{ value: "none", label: "None" }, { value: "uppercase", label: "UPPER" }, { value: "lowercase", label: "lower" }, { value: "capitalize", label: "Cap" }]} />
            </Field>
            <Field label="Decoration">
              <select className={sel} value={p.textDecoration || "none"} onChange={(e) => u("textDecoration", e.target.value)}>
                <option value="none">None</option>
                <option value="underline">Underline</option>
                <option value="overline">Overline</option>
                <option value="line-through">Strikethrough</option>
              </select>
            </Field>
            <Field label="Border">
              <div className="flex gap-2">
                <input type="number" placeholder="Width px" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none"
                  defaultValue={p.borderWidth} onBlur={(e) => u("borderWidth", e.target.value)} />
                <ColorDot value={p.borderColor} fallback="#e2e8f0" onChange={(v) => u("borderColor", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
              </div>
              <div className="flex gap-2 mt-1">
                <select className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none" value={p.borderStyle || "solid"} onChange={(e) => u("borderStyle", e.target.value)}>
                  {["solid", "dashed", "dotted", "double"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" placeholder="Radius px" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none"
                  defaultValue={p.borderRadius} onBlur={(e) => u("borderRadius", e.target.value)} />
              </div>
              {/* Per-side overrides. One colour for all four edges cannot draw a
                  rule under a heading or an accent down one side, which is most
                  of what a border is used for. Anything left blank falls back to
                  the all-sides values above, so this is additive. */}
              <Collapse label="Each side separately">
                {(["Top", "Right", "Bottom", "Left"] as const).map((sd) => {
                  const pr = p as Record<string, string>;
                  return (
                    <div key={sd} className="mb-1.5 flex items-center gap-1.5">
                      <span className="w-11 shrink-0 text-[11px] text-slate-500">{sd}</span>
                      <input type="number" placeholder="Width" title={`${sd} width in px`}
                        className="w-14 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none"
                        defaultValue={pr[`border${sd}Width`] ?? ""}
                        onBlur={(e) => u(`border${sd}Width`, e.target.value)} />
                      <select className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs focus:outline-none"
                        value={pr[`border${sd}Style`] || ""}
                        onChange={(e) => u(`border${sd}Style`, e.target.value)}>
                        <option value="">same</option>
                        {["solid", "dashed", "dotted", "double"].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                      <ColorDot value={pr[`border${sd}Color`]} fallback={p.borderColor || "#e2e8f0"}
                        onChange={(v) => u(`border${sd}Color`, v)}
                        className="h-7 w-7 shrink-0 rounded border border-slate-200 p-0.5" />
                    </div>
                  );
                })}
                <p className="mt-1 text-[11px] text-slate-400">
                  Blank uses the all-sides values above. Set a width on one side only to draw a single rule.
                </p>
              </Collapse>
            </Field>

            <Field label="Text Shadow">
              <ToggleRow value={p.textShadow || "false"} onChange={(v) => u("textShadow", v)}
                options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} />
              {p.textShadow === "true" && (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  <input type="number" title="X" placeholder="X" className={inp} defaultValue={p.shadowX || "0"} onBlur={(e) => u("shadowX", e.target.value)} />
                  <input type="number" title="Y" placeholder="Y" className={inp} defaultValue={p.shadowY || "2"} onBlur={(e) => u("shadowY", e.target.value)} />
                  <input type="number" title="Blur" placeholder="Blur" className={inp} defaultValue={p.shadowBlur || "4"} onBlur={(e) => u("shadowBlur", e.target.value)} />
                  <ColorDot value={p.shadowColor} fallback="#000000" onChange={(v) => u("shadowColor", v)} className="w-full h-7 rounded border border-slate-200 p-0.5" />
                </div>
              )}
            </Field>

            <Field label="Highlight">
              <div className="flex items-center gap-2">
                <ColorDot value={p.highlightColor} fallback="#fde047" onChange={(v) => u("highlightColor", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
                <input type="number" placeholder="Radius px" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none" defaultValue={p.highlightRadius} onBlur={(e) => u("highlightRadius", e.target.value)} />
                {p.highlightColor && <button onClick={() => u("highlightColor", "")} className="text-xs text-red-400 hover:text-red-600">✕</button>}
              </div>
            </Field>
          </>
        )}

        {tab === "advanced" && (
          <>
            <Field label="Padding (px)">
              <div className="grid grid-cols-2 gap-2">
                {[["paddingTop", "Top"], ["paddingRight", "Right"], ["paddingBottom", "Bottom"], ["paddingLeft", "Left"]].map(([k, l]) => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-400 mb-0.5">{l}</div>
                    <input type="number" className={inp} defaultValue={p[k]} placeholder="0" min="0" onBlur={(e) => u(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Margin (px)">
              <div className="grid grid-cols-2 gap-2">
                {[["marginTop", "Top"], ["marginBottom", "Bottom"]].map(([k, l]) => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-400 mb-0.5">{l}</div>
                    <input type="number" className={inp} defaultValue={p[k]} placeholder="0" onBlur={(e) => u(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </Field>

            <Field label="Icon">
              <div className="flex flex-wrap gap-1 mb-1.5">
                {ICON_OPTIONS.map((ic) => (
                  <button key={ic} onClick={() => u("iconChar", ic)}
                    className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${p.iconChar === ic ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
                    {ic}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={inp} placeholder="Or type icon/emoji" defaultValue={p.iconChar} onBlur={(e) => u("iconChar", e.target.value)} />
                {p.iconChar && <button onClick={() => u("iconChar", "")} className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>}
              </div>
              {p.iconChar && (
                <div className="space-y-1.5 mt-2">
                  <ToggleRow value={p.iconPos || "left"} onChange={(v) => u("iconPos", v)}
                    options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
                  <div className="flex gap-2">
                    <input type="number" placeholder="Size px" className={inp} defaultValue={p.iconSize} onBlur={(e) => u("iconSize", e.target.value)} />
                    <ColorDot value={p.iconColor} fallback="#0ea5e9" onChange={(v) => u("iconColor", v)} className="w-9 h-8 rounded border border-slate-200 p-0.5 shrink-0" />
                  </div>
                </div>
              )}
            </Field>

            <button
              onClick={() =>
                updateActiveBlockProps({ ...p, color: "", bgColor: "", fontFamily: "", fontSize: "", fontWeight: "400", fontStyle: "normal", lineHeight: "", letterSpacing: "", textTransform: "none", textDecoration: "none", orientation: "normal", textGradient: "false", textShadow: "false", highlightColor: "", highlightRadius: "", iconChar: "", borderWidth: "", borderRadius: "", borderTopWidth: "", borderTopColor: "", borderTopStyle: "", borderRightWidth: "", borderRightColor: "", borderRightStyle: "", borderBottomWidth: "", borderBottomColor: "", borderBottomStyle: "", borderLeftWidth: "", borderLeftColor: "", borderLeftStyle: "", paddingTop: "", paddingRight: "", paddingBottom: "", paddingLeft: "", marginTop: "", marginBottom: "" })
              }
              className="text-xs text-red-400 hover:text-red-600 underline"
            >
              Reset styles to default
            </button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Advanced Table panel.
 *
 * General holds the grid itself and the three structural switches; Style holds
 * the look; Advanced holds anchor / class / CSS. Padding, margin, animation,
 * conditional display and block defaults come from `bx` via `BoxSettings`.
 */
function TableAdvancedSettings({
  p, u,
}: {
  p: Record<string, string>;
  u: (k: string, v: string) => void;
}) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  const { device } = useDevice();

  const rows = normalizeRows(parseRows(p.rows));
  const cols = columnCount(rows);
  const write = (next: string[][]) => u("rows", serializeRows(next));

  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as "general" | "style" | "advanced")}
        options={["general", "style", "advanced"]} />

      <div className="space-y-4 p-4">
        {/* ── General ─────────────────────────────────────────────────────── */}
        {tab === "general" && (
          <>
            <Field label="Grid">
              <div className="mb-2 text-[11px] text-slate-500">
                {rows.length} {rows.length === 1 ? "row" : "rows"} × {cols}{" "}
                {cols === 1 ? "column" : "columns"}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => write(addRow(rows))}
                  className="rounded border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-700">
                  + Row
                </button>
                <button type="button" onClick={() => write(addColumn(rows))}
                  className="rounded border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-700">
                  + Column
                </button>
                <button type="button" disabled={rows.length <= 1}
                  onClick={() => write(removeRow(rows, rows.length - 1))}
                  className="rounded border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                  − Row
                </button>
                <button type="button" disabled={cols <= 1}
                  onClick={() => write(removeColumn(rows, cols - 1))}
                  className="rounded border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                  − Column
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                Type into the cells on the canvas. Rows and columns are added and removed from the end — the last
                one always goes.
              </p>
            </Field>

            <Switch checked={p.head === "1"} onChange={(c) => u("head", c ? "1" : "")}
              label="Header section" />
            <Switch checked={p.foot === "1"} onChange={(c) => u("foot", c ? "1" : "")}
              label="Footer section" />
            <Switch checked={p.fixed !== "0"} onChange={(c) => u("fixed", c ? "1" : "0")}
              label="Fixed width table cells" />
            <p className="-mt-2 text-[11px] leading-relaxed text-slate-400">
              Fixed width gives every column the same share of the table. Turn it off to let each column size to
              its longest cell.
            </p>

            <Field label="Caption">
              <input key="tcap" className={sel} defaultValue={p.caption ?? ""}
                placeholder="Describes the table" onBlur={(e) => u("caption", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Rendered under the table, and read out before it by screen readers.
              </p>
            </Field>

            <Field label="Cell Alignment">
              <Seg value={p.align || ""} onChange={(v) => u("align", v)} options={TBL_ALIGN} />
            </Field>

            <ResponsiveSlider label="Table Width" value={p.width ?? ""} min={0} max={1400}
              onChange={(v) => u("width", v)} />
          </>
        )}

        {/* ── Style ───────────────────────────────────────────────────────── */}
        {tab === "style" && (
          <>
            <Field label="Style">
              <Seg columns={2} value={p.style || "default"} onChange={(v) => u("style", v || "default")}
                options={TBL_STYLES} />
            </Field>

            <Collapse label="Typography" defaultOpen>
              <Field label="Colour">
                <ColorField value={p.color ?? ""} fallback="#0f172a" onChange={(v) => u("color", v)} />
              </Field>
              <Field label="Font Size">
                <div className="mb-1.5 grid grid-cols-5 gap-1">
                  {TBL_FONT_SIZES.map(([px_, lbl]) => (
                    <button key={lbl} type="button"
                      onClick={() => u("fs", serializeScalar({ ...parseScalar(p.fs), [device]: px_ }))}
                      className="rounded border border-slate-200 bg-white py-1 text-[10px] font-semibold text-slate-500 hover:bg-sky-50 hover:text-sky-600">
                      {lbl}
                    </button>
                  ))}
                </div>
                <ResponsiveSlider label="Size" value={p.fs ?? ""} min={8} max={40} onChange={(v) => u("fs", v)} />
              </Field>
              <Field label="Font Family">
                <select className={sel} value={p.ff || ""} onChange={(e) => u("ff", e.target.value)}>
                  {FONT_FAMILIES.map(([val, lbl]) => <option key={lbl} value={val}>{lbl}</option>)}
                </select>
              </Field>
            </Collapse>

            <Collapse label="Background">
              <Field label="Type">
                <Seg value={p.bgType || "color"} onChange={(v) => u("bgType", v || "color")}
                  options={[{ id: "color", title: "Colour" }, { id: "gradient", title: "Gradient" }]} />
              </Field>
              {p.bgType === "gradient" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="From">
                      <ColorField value={p.bgGradFrom ?? ""} fallback="#0ea5e9"
                        onChange={(v) => u("bgGradFrom", v)} />
                    </Field>
                    <Field label="To">
                      <ColorField value={p.bgGradTo ?? ""} fallback="#9333ea"
                        onChange={(v) => u("bgGradTo", v)} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Style">
                      <Seg value={p.bgGradType || "linear"} onChange={(v) => u("bgGradType", v || "linear")}
                        options={[{ id: "linear", title: "Linear" }, { id: "radial", title: "Radial" }]} />
                    </Field>
                    <Field label="Angle">
                      <input key="tang" type="number" className={sel} placeholder="160"
                        defaultValue={p.bgGradAngle ?? ""} onBlur={(e) => u("bgGradAngle", e.target.value)} />
                    </Field>
                  </div>
                </>
              ) : (
                <Field label="Colour">
                  <ColorField value={p.bg ?? ""} fallback="#ffffff" onChange={(v) => u("bg", v)} />
                </Field>
              )}
            </Collapse>

            <Collapse label="Header &amp; Footer">
              <Field label="Header Background">
                <ColorField value={p.headBg ?? ""} fallback="#f1f5f9" onChange={(v) => u("headBg", v)} />
              </Field>
              <Field label="Header Text">
                <ColorField value={p.headColor ?? ""} fallback="#0f172a" onChange={(v) => u("headColor", v)} />
              </Field>
              <Field label="Header Weight">
                <select className={sel} value={p.headWeight || ""} onChange={(e) => u("headWeight", e.target.value)}>
                  <option value="">Inherit</option>
                  {FONT_WEIGHTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="Footer Background">
                <ColorField value={p.footBg ?? ""} fallback="#f8fafc" onChange={(v) => u("footBg", v)} />
              </Field>
              <p className="text-[11px] leading-relaxed text-slate-400">
                These only show once the matching section is switched on under General.
              </p>
            </Collapse>

            <Collapse label="Rows">
              <Field label="Stripe Colour">
                <ColorField value={p.stripeColor ?? ""} fallback="#f1f5f9"
                  onChange={(v) => u("stripeColor", v)} />
                <p className="mt-1 text-[11px] text-slate-400">Applies with the Stripes style.</p>
              </Field>
              <Field label="Row Hover Background">
                <ColorField value={p.rowHoverBg ?? ""} fallback="#e0f2fe"
                  onChange={(v) => u("rowHoverBg", v)} />
              </Field>
            </Collapse>

            <Collapse label="Dimensions">
              <ResponsiveBox label="Border" value={p.bd ?? ""} min={0} max={12}
                onChange={(v) => u("bd", v)} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Border Style">
                  <Seg value={p.bdStyle || "solid"} onChange={(v) => u("bdStyle", v || "solid")}
                    options={[
                      { id: "solid", title: "Solid" },
                      { id: "dashed", title: "Dashed" },
                      { id: "dotted", title: "Dotted" },
                    ]} />
                </Field>
                <Field label="Border Colour">
                  <ColorField value={p.bdColor ?? ""} fallback="#e2e8f0" onChange={(v) => u("bdColor", v)} />
                </Field>
              </div>
              <ResponsiveBox label="Cell Padding" value={p.cellPad ?? ""} min={0} max={60}
                units={SPACING_UNITS} onChange={(v) => u("cellPad", v)} />
            </Collapse>
          </>
        )}

        {/* ── Advanced ────────────────────────────────────────────────────── */}
        {tab === "advanced" && (
          <>
            <Field label="HTML Anchor">
              <input key="tanchor" className={sel} defaultValue={p.anchor ?? ""} placeholder="specs"
                onBlur={(e) => u("anchor", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                One word, no spaces. Other links can then point at <code>#{p.anchor || "your-anchor"}</code>.
              </p>
            </Field>
            <Field label="Additional CSS Class(es)">
              <input key="tcls" className={sel} defaultValue={p.cssClass ?? ""}
                placeholder="Separate with spaces" onBlur={(e) => u("cssClass", e.target.value)} />
            </Field>
            <Field label="Additional CSS">
              <textarea key="tcss" className={`${sel} h-24 font-mono`} defaultValue={p.customCss ?? ""}
                placeholder="selector td:first-child { font-weight: 600; }"
                onBlur={(e) => u("customCss", e.target.value)} />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                <code>selector</code> stands for this table&apos;s wrapper. Its parts are{" "}
                <code>.bmstbl-table</code>, plus the usual <code>th</code>, <code>td</code> and{" "}
                <code>tr</code>.
              </p>
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Padding, margin, visibility, scroll animation and conditional display are in the sections below —
              they work the same on every block.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function ImageAdvancedSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"general" | "style" | "advanced">("general");
  const [showMedia, setShowMedia] = useState(false);
  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as any)} options={["general", "style", "advanced"]} />
      <div className="p-4 space-y-4">

        {tab === "general" && (
          <>
            <Field label="Image">
              {p.src ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="w-full rounded-lg border border-slate-200 object-cover max-h-32" />
                  <div className="flex gap-2">
                    <button onClick={() => setShowMedia(true)} className="btn-secondary text-xs flex-1">Replace</button>
                    <button onClick={() => u("src", "")} className="text-xs text-red-400 hover:text-red-600 px-2">Remove</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowMedia(true)} className="w-full py-6 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-sky-300 hover:text-sky-500 text-xs font-medium">
                  + Select image
                </button>
              )}
              <input className={`${sel} mt-2`} placeholder="…or paste image URL" defaultValue={p.src} onBlur={(e) => u("src", e.target.value)} />
            </Field>
            <Field label="Alt Text (alternative text)">
              <textarea className={`${sel} resize-none`} rows={2} defaultValue={p.alt} placeholder="Describe the image for SEO & accessibility" onBlur={(e) => u("alt", e.target.value)} />
            </Field>
            <Field label="Caption">
              <input className={sel} defaultValue={p.caption} placeholder="Optional caption" onBlur={(e) => u("caption", e.target.value)} />
            </Field>
            <Field label="Alignment">
              <ToggleRow value={p.align || "center"} onChange={(v) => u("align", v)}
                options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
            </Field>
            <Field label="Max Width">
              <div className="flex gap-2">
                {/* Keyed on the value so dragging the canvas resize rails is
                    reflected here — an uncontrolled input ignores re-renders. */}
                <input key={p.width} type="number" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none" defaultValue={p.width} placeholder="100" onBlur={(e) => u("width", e.target.value)} />
                <select className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none" value={p.widthUnit || "%"} onChange={(e) => u("widthUnit", e.target.value)}>
                  {["%", "px", "rem", "vw"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Height (px) — optional crop">
              <input type="number" className={sel} defaultValue={p.height} placeholder="Auto" onBlur={(e) => u("height", e.target.value)} />
            </Field>
            <Field label="Object Fit">
              <ToggleRow value={p.objectFit || "cover"} onChange={(v) => u("objectFit", v)}
                options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "fill", label: "Fill" }]} />
            </Field>
            <Field label="Link URL">
              <input type="url" className={sel} defaultValue={p.linkUrl} placeholder="https://…" onBlur={(e) => u("linkUrl", e.target.value)} />
            </Field>
            <Field label="Link Target">
              <ToggleRow value={p.linkTarget || "_self"} onChange={(v) => u("linkTarget", v)}
                options={[{ value: "_self", label: "Same Tab" }, { value: "_blank", label: "New Tab" }]} />
            </Field>
            <Field label="Loading">
              <ToggleRow value={p.loadMode || "auto"} onChange={(v) => u("loadMode", v)}
                options={[{ value: "auto", label: "Automatic" }, { value: "priority", label: "Main image" }, { value: "eager", label: "Immediately" }]} />
              <p className="text-[11px] text-slate-400 mt-1">
                {p.loadMode === "priority"
                  ? "Fetched first, at high priority — the image a visitor sees on arrival. Use it once per page; the automatic pick is then switched off."
                  : p.loadMode === "eager"
                    ? "Never lazy-loaded, but at normal priority. For an image near the top that is not the main one."
                    : "Lazy unless it is the first image near the top of the page (Speed → Media)."}
              </p>
            </Field>
          </>
        )}

        {tab === "style" && (
          <>
            <Field label="Background Color">
              <div className="flex items-center gap-2">
                <ColorDot value={p.bgColor} fallback="#ffffff" onChange={(v) => u("bgColor", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
                {p.bgColor && <button onClick={() => u("bgColor", "")} className="text-xs text-red-400 hover:text-red-600">✕ Clear</button>}
              </div>
            </Field>
            <Field label="Border">
              <div className="flex gap-2">
                <input type="number" placeholder="Width px" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none" defaultValue={p.borderWidth} onBlur={(e) => u("borderWidth", e.target.value)} />
                <ColorDot value={p.borderColor} fallback="#e2e8f0" onChange={(v) => u("borderColor", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
              </div>
              <div className="flex gap-2 mt-1">
                <select className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none" value={p.borderStyle || "solid"} onChange={(e) => u("borderStyle", e.target.value)}>
                  {["solid", "dashed", "dotted", "double"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" placeholder="Radius px" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none" defaultValue={p.borderRadius} onBlur={(e) => u("borderRadius", e.target.value)} />
              </div>
            </Field>
            <Field label="Box Shadow">
              <ToggleRow value={p.boxShadow || "false"} onChange={(v) => u("boxShadow", v)}
                options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} />
              {p.boxShadow === "true" && (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  <input type="number" title="X" placeholder="X" className={inp} defaultValue={p.shadowX || "0"} onBlur={(e) => u("shadowX", e.target.value)} />
                  <input type="number" title="Y" placeholder="Y" className={inp} defaultValue={p.shadowY || "8"} onBlur={(e) => u("shadowY", e.target.value)} />
                  <input type="number" title="Blur" placeholder="Blur" className={inp} defaultValue={p.shadowBlur || "24"} onBlur={(e) => u("shadowBlur", e.target.value)} />
                  <ColorDot value={p.shadowColor} fallback="#000000" onChange={(v) => u("shadowColor", v)} className="w-full h-7 rounded border border-slate-200 p-0.5" />
                </div>
              )}
            </Field>
            <Field label="Image Filter">
              <select className={sel} value={p.filter || "none"} onChange={(e) => u("filter", e.target.value)}>
                {["none", "grayscale", "sepia", "blur", "brightness", "contrast", "saturate", "invert"].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              {p.filter && p.filter !== "none" && (
                <input type="number" className={`${sel} mt-1.5`} placeholder="Amount (e.g. 100)" defaultValue={p.filterAmount} onBlur={(e) => u("filterAmount", e.target.value)} />
              )}
            </Field>
            <Field label="Overlay">
              <div className="flex items-center gap-2">
                <ColorDot value={p.overlayColor} fallback="#000000" onChange={(v) => u("overlayColor", v)} className="w-8 h-8 rounded border border-slate-200 p-0.5" />
                <input type="number" min="0" max="100" placeholder="Opacity %" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white outline-none" defaultValue={p.overlayOpacity || "30"} onBlur={(e) => u("overlayOpacity", e.target.value)} />
                {p.overlayColor && <button onClick={() => u("overlayColor", "")} className="text-xs text-red-400 hover:text-red-600">✕</button>}
              </div>
            </Field>
            <Field label="Hover Effect">
              <ToggleRow value={p.hoverEffect || "none"} onChange={(v) => u("hoverEffect", v)}
                options={[{ value: "none", label: "None" }, { value: "zoom", label: "Zoom" }, { value: "lift", label: "Lift" }]} />
            </Field>
          </>
        )}

        {tab === "advanced" && (
          <>
            <Field label="Padding (px)">
              <div className="grid grid-cols-2 gap-2">
                {[["paddingTop", "Top"], ["paddingRight", "Right"], ["paddingBottom", "Bottom"], ["paddingLeft", "Left"]].map(([k, l]) => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-400 mb-0.5">{l}</div>
                    <input type="number" className={inp} defaultValue={p[k]} placeholder="0" onBlur={(e) => u(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Margin (px)">
              <div className="grid grid-cols-2 gap-2">
                {[["marginTop", "Top"], ["marginBottom", "Bottom"]].map(([k, l]) => (
                  <div key={k}>
                    <div className="text-[10px] text-slate-400 mb-0.5">{l}</div>
                    <input type="number" className={inp} defaultValue={p[k]} placeholder="0" onBlur={(e) => u(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Additional CSS Class">
              <input className={sel} defaultValue={p.cssClass} placeholder="my-class" onBlur={(e) => u("cssClass", e.target.value)} />
            </Field>
          </>
        )}
      </div>

      {showMedia && (
        <MediaPicker onSelect={(url) => u("src", url)} onClose={() => setShowMedia(false)} />
      )}
    </>
  );
}

// ── Built-in blocks (paragraph / heading / lists / quote) ────────────────────
const NAMED_COLORS: { name: string; hex: string }[] = [
  { name: "default", hex: "#1e293b" }, { name: "gray", hex: "#9ca3af" }, { name: "brown", hex: "#92400e" },
  { name: "red", hex: "#ef4444" }, { name: "orange", hex: "#f97316" }, { name: "yellow", hex: "#eab308" },
  { name: "green", hex: "#22c55e" }, { name: "blue", hex: "#3b82f6" }, { name: "purple", hex: "#a855f7" },
  { name: "pink", hex: "#ec4899" },
];

function ColorSwatches({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-f]{3,8}$/i.test(value);
  const [draft, setDraft] = useState(isHex ? value : "");
  useEffect(() => setDraft(/^#[0-9a-f]{3,8}$/i.test(value) ? value : ""), [value]);
  const commit = (raw: string) => {
    let v = raw.trim();
    if (v && !v.startsWith("#")) v = `#${v}`;
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) onChange(v.toLowerCase());
    // Cleared = no colour. It used to store the word "default", which then
    // reached the page as `color:default` — not a CSS colour.
    else if (!v) onChange("");
  };
  return (
    <div className="space-y-2">
    <div className="flex flex-wrap gap-1.5">
      {NAMED_COLORS.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onChange(c.name === "default" ? "" : c.name)}
          title={c.name}
          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${value === c.name ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"}`}
          style={{ backgroundColor: c.name === "default" ? "#fff" : c.hex }}
        >
          {c.name === "default" && <span className="text-[9px] text-slate-400">A</span>}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={isHex && value.length === 7 ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className={`h-7 w-9 shrink-0 cursor-pointer rounded border p-0.5 ${isHex ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"}`}
        title="Any colour"
      />
      <input
        className={`${sel} font-mono`}
        value={draft}
        placeholder="#1e293b"
        maxLength={7}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
      />
    </div>
    </div>
  );
}

const BUILTIN_TEXT_TYPES = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "quote"]);

function BuiltinTextSettings({ type, p }: { type: string; p: Record<string, string> }) {
  const u = (k: string, v: string) => updateActiveBlockProp(k, v);
  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] text-slate-400 -mt-1">Edit the text in the canvas. Select text for bold/italic/links.</p>
      {type === "heading" && (
        <Field label="Heading Level">
          <ToggleRow value={String(p.level || "1")} onChange={(v) => updateActiveBlockProps({ ...p, level: Number(v) } as any)}
            options={[{ value: "1", label: "H1" }, { value: "2", label: "H2" }, { value: "3", label: "H3" }]} />
        </Field>
      )}
      <Field label="Alignment">
        <ToggleRow value={p.textAlignment || "left"} onChange={(v) => u("textAlignment", v)}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }, { value: "justify", label: "Justify" }]} />
      </Field>
      <Field label="Text Color">
        <ColorSwatches value={p.textColor || "default"} onChange={(v) => u("textColor", v)} />
      </Field>
      <Field label="Background Color">
        <ColorSwatches value={p.backgroundColor || "default"} onChange={(v) => u("backgroundColor", v)} />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main BlockPanel
// ─────────────────────────────────────────────────────────────────────────────

// Names come from the block library rather than a second list here, so a block
// is called the same thing in the picker, the slash menu and this panel.
const BLOCK_LABELS: Record<string, string> = Object.fromEntries(
  PANEL_TYPES.map((t) => [t, BLOCK_LIBRARY.find((b) => b.type === t)?.label ?? t])
);

const BUILTIN_LABELS: Record<string, string> = {
  paragraph: "Paragraph",
  heading: "Heading",
  bulletListItem: "Bullet List",
  numberedListItem: "Numbered List",
  checkListItem: "Check List",
  quote: "Quote",
  codeBlock: "Code Block",
  table: "Table",
  image: "Image",
  video: "Video",
  audio: "Audio",
  file: "File",
};

/* ── New blocks ───────────────────────────────────────────────────────────── */

/**
 * Edits a JSON array prop as a list of rows.
 *
 * Every repeating block — gallery images, social links, pricing plans, team
 * links — needs add/remove/reorder over a JSON string. Writing that once here
 * is the difference between four small panels and four near-identical ones.
 */
function Repeater<T extends Record<string, unknown>>({
  label, value, onChange, blank, render, addLabel = "Add", max,
}: {
  label: string;
  value: string;
  onChange: (json: string) => void;
  blank: () => T;
  render: (row: T, patch: (r: Partial<T>) => void) => React.ReactNode;
  addLabel?: string;
  /** The most rows allowed; the add button goes once it is reached. */
  max?: number;
}) {
  let rows: T[] = [];
  try { const v = JSON.parse(value || "[]"); if (Array.isArray(v)) rows = v; } catch {}

  const write = (next: T[]) => onChange(JSON.stringify(next));
  const patchAt = (i: number) => (r: Partial<T>) =>
    write(rows.map((row, ri) => (ri === i ? { ...row, ...r } : row)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    write(next);
  };

  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 mb-1.5">{label}</div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 space-y-1.5 bg-slate-50/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400">#{i + 1}</span>
              <div className="flex gap-0.5">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="w-5 h-5 rounded text-slate-400 hover:bg-white disabled:opacity-25 text-xs">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                  className="w-5 h-5 rounded text-slate-400 hover:bg-white disabled:opacity-25 text-xs">↓</button>
                <button type="button" onClick={() => write(rows.filter((_, ri) => ri !== i))}
                  className="w-5 h-5 rounded text-slate-400 hover:bg-white hover:text-red-600 text-xs">✕</button>
              </div>
            </div>
            {render(row, patchAt(i))}
          </div>
        ))}
      </div>
      {max !== undefined && rows.length >= max ? (
        <p className="mt-2 text-center text-[11px] text-slate-400">{max} is the most this block holds.</p>
      ) : (
        <button
          type="button"
          onClick={() => write([...rows, blank()])}
          className="mt-2 w-full py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-sky-400 hover:text-sky-600"
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}

/** An image field with a Media Library button beside it. */
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Field label={label}>
        <div className="flex gap-1.5">
          <input className={sel} value={value} placeholder="https://…" onChange={(e) => onChange(e.target.value)} />
          <button type="button" onClick={() => setOpen(true)}
            className="shrink-0 px-2 rounded border border-slate-200 text-xs text-slate-500 hover:border-sky-400 hover:text-sky-600">
            Pick
          </button>
        </div>
      </Field>
      {open && <MediaPicker onSelect={(url) => { onChange(url); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

function NetworkSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
      {SOCIAL_NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
    </select>
  );
}

function GallerySettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [picking, setPicking] = useState(false);
  let imgs: { src: string; alt?: string; caption?: string }[] = [];
  try { imgs = JSON.parse(p.images || "[]"); } catch {}

  return (
    <div className="p-4 space-y-4">
      <Repeater
        label="Images"
        addLabel="Add by URL"
        value={p.images || "[]"}
        onChange={(v) => u("images", v)}
        blank={() => ({ src: "", alt: "", caption: "" })}
        render={(row, patch) => (
          <>
            <input className={sel} value={row.src as string} placeholder="Image URL"
              onChange={(e) => patch({ src: e.target.value })} />
            <input className={sel} value={(row.alt as string) ?? ""} placeholder="Alt text"
              onChange={(e) => patch({ alt: e.target.value })} />
            <input className={sel} value={(row.caption as string) ?? ""} placeholder="Caption"
              onChange={(e) => patch({ caption: e.target.value })} />
          </>
        )}
      />
      <button type="button" onClick={() => setPicking(true)}
        className="w-full py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-sky-400 hover:text-sky-600">
        + Add from Media Library
      </button>
      {picking && (
        <MediaPicker
          onSelect={(url) => { u("images", JSON.stringify([...imgs, { src: url, alt: "", caption: "" }])); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}

      <Field label="Columns">
        <select className={sel} value={p.columns || "3"} onChange={(e) => u("columns", e.target.value)}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Shape">
        <select className={sel} value={p.ratio || "square"} onChange={(e) => u("ratio", e.target.value)}>
          <option value="square">Square</option>
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
          <option value="auto">Original</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Gap (px)">
          <input className={inp} value={p.gap || "12"} onChange={(e) => u("gap", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Radius (px)">
          <input className={inp} value={p.radius || "10"} onChange={(e) => u("radius", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
        <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
          checked={p.captions === "true"} onChange={(e) => u("captions", String(e.target.checked))} />
        Show captions
      </label>
    </div>
  );
}

function IconSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Icon (emoji or character)">
        <input className={sel} defaultValue={p.icon} placeholder="★" onBlur={(e) => u("icon", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size (px)">
          <input className={inp} value={p.size || "40"} onChange={(e) => u("size", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Colour">
          <ColorDot value={p.color} fallback="#0ea5e9" onChange={(v) => u("color", v)} className="w-full h-7 rounded border border-slate-200" />
        </Field>
      </div>
      <Field label="Shape">
        <ToggleRow value={p.shape || "none"} onChange={(v) => u("shape", v)}
          options={[{ value: "none", label: "None" }, { value: "circle", label: "Circle" }, { value: "square", label: "Square" }]} />
      </Field>
      {p.shape !== "none" && (
        <Field label="Background">
          <ColorDot value={p.bg} fallback="#e2e8f0" onChange={(v) => u("bg", v)} className="w-full h-7 rounded border border-slate-200" />
        </Field>
      )}
      <Field label="Alignment">
        <ToggleRow value={p.align || "left"} onChange={(v) => u("align", v)}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      </Field>
      <Field label="Link (optional)">
        <input className={sel} defaultValue={p.url} placeholder="https://…" onBlur={(e) => u("url", e.target.value)} />
      </Field>
      <Field label="Accessible label">
        <input className={sel} defaultValue={p.label} placeholder="Left empty, the icon is decorative"
          onBlur={(e) => u("label", e.target.value)} />
      </Field>
    </div>
  );
}

function SocialIconsSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Repeater
        label="Profiles"
        addLabel="Add profile"
        value={p.items || "[]"}
        onChange={(v) => u("items", v)}
        blank={() => ({ network: "x", url: "" })}
        render={(row, patch) => (
          <>
            <NetworkSelect value={row.network as string} onChange={(v) => patch({ network: v })} />
            <input className={sel} value={row.url as string} placeholder="URL or @handle"
              onChange={(e) => patch({ url: e.target.value })} />
          </>
        )}
      />
      <Field label="Style">
        <ToggleRow value={p.style || "plain"} onChange={(v) => u("style", v)}
          options={[{ value: "plain", label: "Plain" }, { value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }]} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size (px)">
          <input className={inp} value={p.size || "20"} onChange={(e) => u("size", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Gap (px)">
          <input className={inp} value={p.gap || "10"} onChange={(e) => u("gap", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </div>
      <Field label="Colour override">
        <input className={sel} value={p.color} placeholder="Leave empty for brand colours"
          onChange={(e) => u("color", e.target.value)} />
      </Field>
      <Field label="Alignment">
        <ToggleRow value={p.align || "left"} onChange={(v) => u("align", v)}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      </Field>
    </div>
  );
}

function DownloadBoxSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"design" | "content" | "button" | "style">("design");
  const preset = presetById(p.preset);
  const presetStyle = (k: StyleKey) => (preset.style[k] ?? "") as string;
  const shown = new Set(String(p.show ?? DLB_DEFAULTS.show).split(",").filter(Boolean));
  const toggleShow = (k: string, on: boolean) => u("show", [...DLB_META_FIELDS.map((f) => f.key).filter((x) => (x === k ? on : shown.has(x)))].join(","));
  const overrides = DLB_STYLE_KEYS.filter((k) => (p[k] ?? "") !== "");

  const colour = (label: string, k: StyleKey, fallback: string) => (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <ColorDot value={p[k]} fallback={presetStyle(k) || fallback} onChange={(v) => u(k, v)} className="h-7 w-10 shrink-0 rounded border border-slate-200" />
        <input className={sel} value={p[k] || ""} placeholder={presetStyle(k) || fallback} onChange={(e) => u(k, e.target.value)} />
      </div>
    </Field>
  );
  const num = (label: string, k: StyleKey, fallback: string, unit = "px") => (
    <Field label={`${label}${unit ? ` (${unit})` : ""}`}>
      <input className={inp} value={p[k] || ""} placeholder={presetStyle(k) || fallback} onChange={(e) => u(k, e.target.value.replace(/[^0-9.]/g, ""))} />
    </Field>
  );
  const choice = (label: string, k: StyleKey, options: { value: string; label: string }[], fallback: string) => (
    <Field label={label}>
      <ToggleRow value={p[k] || presetStyle(k) || fallback} onChange={(v) => u(k, v)} options={options} />
    </Field>
  );

  return (
    <div>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as typeof tab)} options={["design", "content", "button", "style"]} />
      <div className="p-4 space-y-4">
        {tab === "design" && (
          <>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Pick a design. Your text and settings stay; colours and sizes follow the design unless you changed them under Style.
            </p>
            <style dangerouslySetInnerHTML={{ __html: DOWNLOAD_BOX_CSS }} />
            <div className="grid grid-cols-1 gap-3">
              {DLB_PRESETS.map((pr) => {
                // The real box, this block's content, the preset's own look.
                const sample = resolveDownloadBox({ ...p, ...Object.fromEntries(DLB_STYLE_KEYS.map((k) => [k, ""])), preset: pr.id, countdown: "off" });
                const active = preset.id === pr.id;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => u("preset", pr.id)}
                    className={`group relative overflow-hidden rounded-lg border-2 bg-slate-50 text-left transition ${active ? "border-sky-500" : "border-transparent hover:border-slate-300"}`}
                  >
                    <div className="pointer-events-none h-[132px] overflow-hidden">
                      <div style={{ width: "250%", transform: "scale(.4)", transformOrigin: "top left", padding: "12px" }}>
                        <DownloadBoxView box={sample} inert />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-slate-700">{pr.label}</span>
                      {active && <span className="text-[10px] font-bold uppercase text-sky-600">In use</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            {overrides.length > 0 && (
              <button type="button" onClick={() => DLB_STYLE_KEYS.forEach((k) => (p[k] ? u(k, "") : null))}
                className="w-full rounded border border-slate-200 py-1.5 text-[11px] text-slate-500 hover:border-red-300 hover:text-red-600">
                Reset {overrides.length} style change{overrides.length === 1 ? "" : "s"} to the design&apos;s defaults
              </button>
            )}
          </>
        )}

        {tab === "content" && (
          <>
            <Field label="Title"><input className={sel} defaultValue={p.title} onBlur={(e) => u("title", e.target.value)} /></Field>
            <Field label="Description"><textarea className={`${sel} resize-none`} rows={2} defaultValue={p.subtitle} onBlur={(e) => u("subtitle", e.target.value)} /></Field>
            <ImageField label="Icon / logo" value={p.icon || ""} onChange={(v) => u("icon", v)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Badge"><input className={sel} defaultValue={p.badge} placeholder="Latest, Safe, Mod…" onBlur={(e) => u("badge", e.target.value)} /></Field>
              <Field label="File type"><input className={sel} defaultValue={p.fileType} placeholder="APK" onBlur={(e) => u("fileType", e.target.value)} /></Field>
            </div>
            <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Details — tick to show</p>
            <div className="space-y-1.5">
              {DLB_META_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <input type="checkbox" className="h-3.5 w-3.5 shrink-0 rounded border-slate-300" checked={shown.has(f.key)} onChange={(e) => toggleShow(f.key, e.target.checked)} title={`Show ${f.label}`} />
                  <span className="w-20 shrink-0 text-[11px] text-slate-500">{f.label}</span>
                  <input className={sel} defaultValue={p[f.key]} key={`${f.key}-${p.preset}`}
                    placeholder={{ version: "v5.5.1", size: "32 MB", requires: "Android 5.0+", updated: "14 Sep 2026", developer: "Yacine", downloads: "10M+", rating: "4.6", license: "Free", arch: "arm64-v8a" }[f.key]}
                    onBlur={(e) => { u(f.key, e.target.value); if (e.target.value && !shown.has(f.key)) toggleShow(f.key, true); }} />
                </div>
              ))}
            </div>
            {p.rating && (
              <Field label="Number of ratings (for Google stars)" hint="Only ratings visitors gave on this site. A rating copied from an app store, or invented, is self-serving review markup — Google can drop rich results site-wide for it.">
                <input className={inp} defaultValue={p.ratingCount} placeholder="e.g. 12840" onBlur={(e) => u("ratingCount", e.target.value.replace(/[^0-9]/g, ""))} />
              </Field>
            )}
            <OnOff p={p} u={u} k="metaLabels" label="Show labels (Version, Size…)" def="true" />
            <Repeater
              label="More details"
              addLabel="Add detail"
              value={p.extra || "[]"}
              onChange={(v) => u("extra", v)}
              blank={() => ({ label: "", value: "" })}
              render={(row, patch) => (
                <div className="grid grid-cols-2 gap-1.5">
                  <input className={sel} value={(row.label as string) ?? ""} placeholder="Label" onChange={(e) => patch({ label: e.target.value })} />
                  <input className={sel} value={(row.value as string) ?? ""} placeholder="Value" onChange={(e) => patch({ value: e.target.value })} />
                </div>
              )}
            />
            <Field label="Features (one per line)"><textarea className={`${sel} resize-none`} rows={3} defaultValue={p.features} placeholder={"No ads\nWorks on Android TV"} onBlur={(e) => u("features", e.target.value)} /></Field>
            <Field label="Small print"><input className={sel} defaultValue={p.note} placeholder="Scanned with VirusTotal · 100% safe" onBlur={(e) => u("note", e.target.value)} /></Field>
          </>
        )}

        {tab === "button" && (
          <>
            <Field label="Button text"><input className={sel} defaultValue={p.buttonLabel} onBlur={(e) => u("buttonLabel", e.target.value)} /></Field>
            <Field label="Second line (optional)"><input className={sel} defaultValue={p.buttonSub} placeholder="32 MB · v5.5.1" onBlur={(e) => u("buttonSub", e.target.value)} /></Field>
            <Field label="Download link"><input className={sel} defaultValue={p.buttonUrl} placeholder="https://… or /uploads/app.apk" onBlur={(e) => u("buttonUrl", e.target.value)} /></Field>
            <div className="space-y-1.5">
              <OnOff p={p} u={u} k="buttonIcon" label="Download icon on the button" def="true" />
              <OnOff p={p} u={u} k="btnFullMobile" label="Full-width button on phones" def="true" />
              <OnOff p={p} u={u} k="newTab" label="Open in a new tab" />
              <OnOff p={p} u={u} k="nofollow" label="rel=nofollow" />
              <OnOff p={p} u={u} k="downloadAttr" label="Force download (same-site files)" />
            </div>
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Second link</p>
            <div className="grid grid-cols-2 gap-1.5">
              <input className={sel} defaultValue={p.button2Label} placeholder="Mirror / Telegram" onBlur={(e) => u("button2Label", e.target.value)} />
              <input className={sel} defaultValue={p.button2Url} placeholder="https://…" onBlur={(e) => u("button2Url", e.target.value)} />
            </div>
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Countdown</p>
            <Field label="Mode">
              <ToggleRow value={p.countdown || "off"} onChange={(v) => u("countdown", v)}
                options={[{ value: "off", label: "Off" }, { value: "click", label: "After click" }, { value: "reveal", label: "Before button" }]} />
            </Field>
            {p.countdown && p.countdown !== "off" && (
              <>
                <Field label="Seconds"><input className={inp} value={p.countdownSeconds || "5"} onChange={(e) => u("countdownSeconds", e.target.value.replace(/[^0-9]/g, ""))} /></Field>
                <Field label="Text ({s} = seconds left)"><input className={sel} defaultValue={p.countdownText} onBlur={(e) => u("countdownText", e.target.value)} /></Field>
                <p className="text-[11px] text-slate-400">
                  {p.countdown === "click" ? "The countdown starts when the button is clicked, then the download begins in the same tab." : "The countdown runs when the box scrolls into view; the button appears when it ends."}
                </p>
              </>
            )}
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Search engines</p>
            <OnOff p={p} u={u} k="schema" label="Add app schema (SoftwareApplication)" />
            <p className="text-[11px] text-slate-400">
              Built from this box: name, icon, version, size, updated date, developer, rating and link. The operating system comes from
              “Requires” and the category from the title and description. Leave it off if the page already has an App Info block.
            </p>
          </>
        )}

        {tab === "style" && (
          <>
            <p className="text-[11px] leading-relaxed text-slate-400">Empty fields follow the <strong>{preset.label}</strong> design (shown as the placeholder).</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Colours</p>
            {colour("Accent", "accent", "#16a34a")}
            <div className="grid grid-cols-2 gap-2">
              {colour("Background", "bg", "#ffffff")}
              {colour("Gradient to", "bgTo", "")}
            </div>
            {(p.bgTo || presetStyle("bgTo")) && num("Gradient angle", "gradAngle", "135", "deg")}
            <div className="grid grid-cols-2 gap-2">
              {colour("Text", "text", "#0f172a")}
              {colour("Muted text", "muted", "#64748b")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {colour("Border", "border", "#e2e8f0")}
              {colour("Details background", "specBg", "#f8fafc")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {colour("Badge", "badgeBg", "")}
              {colour("Badge text", "badgeText", "#ffffff")}
            </div>
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Box</p>
            <div className="grid grid-cols-2 gap-2">
              {num("Border width", "borderWidth", "1")}
              {num("Corner radius", "radius", "16")}
              {num("Padding", "padding", "24")}
              {num("Max width", "maxWidth", "full")}
            </div>
            {choice("Shadow", "shadow", [{ value: "none", label: "None" }, { value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "glow", label: "Glow" }], "sm")}
            {(preset.layout === "hero") && choice("Alignment", "align", [{ value: "left", label: "Left" }, { value: "center", label: "Center" }], "left")}
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Icon &amp; title</p>
            <div className="grid grid-cols-3 gap-2">
              {num("Icon", "iconSize", "72")}
              {num("Icon radius", "iconRadius", "18")}
              {num("Title", "titleSize", "22")}
            </div>
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Details</p>
            {choice("Details style", "metaStyle", [{ value: "chips", label: "Chips" }, { value: "grid", label: "Grid" }, { value: "list", label: "Inline" }], "chips")}
            {(p.metaStyle || presetStyle("metaStyle")) === "grid" && choice("Grid columns (desktop)", "metaCols", [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }], "3")}
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Button</p>
            {choice("Button style", "btnStyle", [{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "outline", label: "Outline" }, { value: "soft", label: "Soft" }], "solid")}
            {choice("Button size", "btnSize", [{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }], "md")}
            <div className="grid grid-cols-2 gap-2">
              {colour("Button", "btnBg", "")}
              {colour("Button text", "btnText", "#ffffff")}
              {colour("Button hover", "btnHoverBg", "")}
              {num("Button radius", "btnRadius", "12")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OnOff({ p, u, k, label, def = "false" }: { p: Record<string, string>; u: (k: string, v: string) => void; k: string; label: string; def?: string }) {
  return <Switch checked={(p[k] ?? def) === "true"} onChange={(v) => u(k, v ? "true" : "false")} label={label} />;
}

function SliderSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const num = (k: string, fallback: string) => (
    <select className={sel} value={p[k] || fallback} onChange={(e) => u(k, e.target.value)}>
      {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
  return (
    <div className="p-4 space-y-4">
      <Repeater
        label="Slides"
        addLabel="Add slide"
        value={p.slides || "[]"}
        onChange={(v) => u("slides", v)}
        blank={() => ({ image: "", alt: "", title: "", text: "", buttonLabel: "", buttonUrl: "" })}
        render={(row, patch) => (
          <>
            <ImageField label="Image" value={(row.image as string) ?? ""} onChange={(v) => patch({ image: v })} />
            <input className={sel} value={(row.alt as string) ?? ""} placeholder="Alt text" onChange={(e) => patch({ alt: e.target.value })} />
            <input className={sel} value={(row.title as string) ?? ""} placeholder="Title (optional)" onChange={(e) => patch({ title: e.target.value })} />
            <textarea className={`${sel} resize-none`} rows={2} value={(row.text as string) ?? ""} placeholder="Text (optional)" onChange={(e) => patch({ text: e.target.value })} />
            <div className="grid grid-cols-2 gap-1.5">
              <input className={sel} value={(row.buttonLabel as string) ?? ""} placeholder="Button text" onChange={(e) => patch({ buttonLabel: e.target.value })} />
              <input className={sel} value={(row.buttonUrl as string) ?? ""} placeholder="Button link" onChange={(e) => patch({ buttonUrl: e.target.value })} />
            </div>
          </>
        )}
      />
      <Field label="Slides visible (desktop / tablet / mobile)">
        <div className="grid grid-cols-3 gap-1.5">{num("perDesktop", "1")}{num("perTablet", "1")}{num("perMobile", "1")}</div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Gap (px)"><input className={inp} value={p.gap || "16"} onChange={(e) => u("gap", e.target.value.replace(/[^0-9]/g, ""))} /></Field>
        <Field label="Corner radius (px)"><input className={inp} value={p.radius || "12"} onChange={(e) => u("radius", e.target.value.replace(/[^0-9]/g, ""))} /></Field>
      </div>
      <Field label="Image shape">
        <select className={sel} value={p.ratio || "16/9"} onChange={(e) => u("ratio", e.target.value)}>
          <option value="16/9">Wide 16:9</option>
          <option value="21/9">Banner 21:9</option>
          <option value="4/3">4:3</option>
          <option value="1/1">Square</option>
          <option value="3/4">Portrait 3:4</option>
          <option value="auto">Image&apos;s own shape</option>
        </select>
      </Field>
      <div className="space-y-1.5">
        <OnOff p={p} u={u} k="autoplay" label="Autoplay" def="true" />
        {p.autoplay !== "false" && (
          <Field label="Seconds per slide">
            <input className={inp} value={String((parseInt(p.interval) || 5000) / 1000)} onChange={(e) => u("interval", String(Math.max(1.5, parseFloat(e.target.value) || 5) * 1000))} />
          </Field>
        )}
        {p.autoplay !== "false" && <OnOff p={p} u={u} k="pauseOnHover" label="Pause on hover" def="true" />}
        <OnOff p={p} u={u} k="loop" label="Loop back to the start" def="true" />
        <OnOff p={p} u={u} k="arrows" label="Arrows" def="true" />
        <OnOff p={p} u={u} k="dots" label="Dots" def="true" />
        <OnOff p={p} u={u} k="captions" label="Show titles and text" def="true" />
        {p.captions !== "false" && <OnOff p={p} u={u} k="overlay" label="Text over the image" def="true" />}
      </div>
    </div>
  );
}

function ModalSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const trigger = p.trigger || "button";
  return (
    <div className="p-4 space-y-4">
      <Field label="Opens from">
        <ToggleRow value={trigger} onChange={(v) => u("trigger", v)}
          options={[{ value: "button", label: "Button" }, { value: "text", label: "Link" }, { value: "image", label: "Image" }, { value: "none", label: "Nothing" }]} />
      </Field>
      {trigger !== "none" && (
        <Field label={trigger === "image" ? "Image label (alt)" : "Trigger text"}>
          <input className={sel} defaultValue={p.triggerLabel} onBlur={(e) => u("triggerLabel", e.target.value)} />
        </Field>
      )}
      {trigger === "image" && <ImageField label="Trigger image" value={p.triggerImage || ""} onChange={(v) => u("triggerImage", v)} />}
      {trigger !== "none" && (
        <Field label="Trigger alignment">
          <ToggleRow value={p.triggerAlign || "left"} onChange={(v) => u("triggerAlign", v)}
            options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
        </Field>
      )}
      <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Popup content</p>
      <Field label="Title"><input className={sel} defaultValue={p.title} onBlur={(e) => u("title", e.target.value)} /></Field>
      <Field label="Text"><textarea className={`${sel} resize-none`} rows={4} defaultValue={p.text} onBlur={(e) => u("text", e.target.value)} /></Field>
      <Field label="Video (YouTube / Vimeo URL)">
        <input className={sel} defaultValue={p.video} placeholder="Plays inside the popup; stops when closed" onBlur={(e) => u("video", e.target.value)} />
      </Field>
      {!p.video && <ImageField label="Image" value={p.image || ""} onChange={(v) => u("image", v)} />}
      <div className="grid grid-cols-2 gap-1.5">
        <input className={sel} defaultValue={p.buttonLabel} placeholder="Button text" onBlur={(e) => u("buttonLabel", e.target.value)} />
        <input className={sel} defaultValue={p.buttonUrl} placeholder="Button link" onBlur={(e) => u("buttonUrl", e.target.value)} />
      </div>
      <Field label="Width">
        <ToggleRow value={p.width || "md"} onChange={(v) => u("width", v)}
          options={[{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }]} />
      </Field>
      <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Behaviour</p>
      <div className="space-y-1.5">
        <OnOff p={p} u={u} k="autoOpen" label="Open by itself after a delay" />
        {p.autoOpen === "true" && (
          <Field label="Delay (seconds)">
            <input className={inp} value={p.delay || "5"} onChange={(e) => u("delay", e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
        )}
        <OnOff p={p} u={u} k="exitIntent" label="Open when the visitor moves to leave (desktop)" />
        {(p.autoOpen === "true" || p.exitIntent === "true") && <OnOff p={p} u={u} k="oncePerVisitor" label="Only once per visitor" def="true" />}
        <OnOff p={p} u={u} k="closeOnBackdrop" label="Close when clicking outside" def="true" />
      </div>
      {trigger === "none" && p.autoOpen !== "true" && p.exitIntent !== "true" && (
        <p className="text-[11px] text-amber-600">With no trigger and nothing opening it automatically, this popup never shows.</p>
      )}
    </div>
  );
}

function LottieSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4 space-y-4">
      <Field label="Animation file (.json)">
        <div className="flex gap-1.5">
          <input className={sel} value={p.src || ""} placeholder="https://… or upload a .json" onChange={(e) => u("src", e.target.value)} />
          <button type="button" onClick={() => setOpen(true)}
            className="shrink-0 px-2 rounded border border-slate-200 text-xs text-slate-500 hover:border-sky-400 hover:text-sky-600">Pick</button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Download the Lottie JSON from LottieFiles, upload it in Media, then pick it here.</p>
      </Field>
      {open && <MediaPicker onSelect={(url) => { u("src", url); setOpen(false); }} onClose={() => setOpen(false)} />}
      <Field label="Play">
        <select className={sel} value={p.trigger || "autoplay"} onChange={(e) => u("trigger", e.target.value)}>
          <option value="autoplay">Immediately</option>
          <option value="inview">When scrolled into view</option>
          <option value="hover">On hover</option>
          <option value="click">On click (toggle)</option>
          <option value="scroll">Follow the scroll position</option>
        </select>
      </Field>
      {p.trigger !== "scroll" && <OnOff p={p} u={u} k="loop" label="Loop" def="true" />}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Speed"><input className={inp} value={p.speed || "1"} onChange={(e) => u("speed", e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
        <Field label="Max width (px)"><input className={inp} value={p.width || "400"} onChange={(e) => u("width", e.target.value.replace(/[^0-9]/g, ""))} /></Field>
      </div>
      <Field label="Alignment">
        <ToggleRow value={p.align || "center"} onChange={(v) => u("align", v)}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      </Field>
      <Field label="Description (for screen readers)"><input className={sel} defaultValue={p.label} onBlur={(e) => u("label", e.target.value)} /></Field>
    </div>
  );
}

/** A text setting that saves as you type, so nothing is lost if you save with the cursor still in it. */
function TextSet({ p, u, k, label, placeholder, rows, type = "text", hint }: {
  p: Record<string, string>; u: (k: string, v: string) => void; k: string; label: string;
  placeholder?: string; rows?: number; type?: string; hint?: string;
}) {
  return (
    <Field label={label}>
      {rows ? (
        <textarea className={`${sel} resize-y`} rows={rows} value={p[k] ?? ""} placeholder={placeholder} onChange={(e) => u(k, e.target.value)} />
      ) : (
        <input type={type} className={sel} value={p[k] ?? ""} placeholder={placeholder} onChange={(e) => u(k, e.target.value)} />
      )}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </Field>
  );
}

/** A colour setting with its well. */
function ColorSet({ p, u, k, label, fallback }: { p: Record<string, string>; u: (k: string, v: string) => void; k: string; label: string; fallback: string }) {
  return (
    <Field label={label}>
      <ColorDot value={p[k]} fallback={fallback} onChange={(v) => u(k, v)} className="w-full h-7 rounded border border-slate-200" />
    </Field>
  );
}

function IframeEmbedSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"content" | "style" | "advanced">("content");
  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as typeof tab)} options={["content", "style", "advanced"]} />
      <div className="p-4 space-y-4">
        {tab === "content" && (
          <>
            <TextSet p={p} u={u} k="url" type="url" label="Page to embed (URL)" placeholder="https://…"
              hint="Some sites refuse to be shown inside another page. They then appear blank here and on the site — the button below is the way in for visitors." />
            <p className="text-[11px] text-slate-400">Click the title, badge, notice, footer text or button on the page to type in them.</p>
            <Collapse label="Tags (for SEO and screen readers)">
              <SelectSet p={p} u={u} k="headingTag" label="Title" def="h2" options={tagOptions(["h2", "h3", "h4", "h5", "h6", "p", "div", "span"])} />
              <SelectSet p={p} u={u} k="footerTag" label="Footer text" def="p" options={tagOptions(["p", "div", "span"])} />
            </Collapse>
            <Collapse label="Header" defaultOpen>
              <OnOff p={p} u={u} k="showHeader" label="Show the header" def="true" />
              <TextSet p={p} u={u} k="heading" label="Title" placeholder="Check by national ID" />
              <OnOff p={p} u={u} k="showBadge" label="Show the badge" def="true" />
              <TextSet p={p} u={u} k="badge" label="Badge text" placeholder="Official service" />
            </Collapse>
            <Collapse label="Notice" defaultOpen>
              <OnOff p={p} u={u} k="showNotice" label="Show the notice" def="true" />
              <TextSet p={p} u={u} k="noticeIcon" label="Icon (emoji or symbol)" placeholder="⚠" />
              <TextSet p={p} u={u} k="notice" label="Notice text" rows={3} />
            </Collapse>
            <Collapse label="Footer and button" defaultOpen>
              <OnOff p={p} u={u} k="showFooter" label="Show the footer" def="true" />
              <TextSet p={p} u={u} k="footerText" label="Footer text" rows={2} />
              <OnOff p={p} u={u} k="showButton" label="Show the button" def="true" />
              <TextSet p={p} u={u} k="buttonLabel" label="Button label" placeholder="Open official portal" />
              <TextSet p={p} u={u} k="buttonUrl" type="url" label="Button link" placeholder="Empty = the embedded page" />
              <OnOff p={p} u={u} k="buttonNewTab" label="Open in a new tab" def="true" />
              <Field label="Footer layout">
                <ToggleRow value={p.footerAlign || "split"} onChange={(v) => u("footerAlign", v)}
                  options={[{ value: "split", label: "Text + button" }, { value: "center", label: "Centered" }]} />
              </Field>
            </Collapse>
          </>
        )}

        {tab === "style" && (
          <>
            <Collapse label="Card" defaultOpen>
              <div className="grid grid-cols-2 gap-2">
                <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="18" />
                <ColorSet p={p} u={u} k="borderColor" label="Border" fallback="#e2e8f0" />
              </div>
              <OnOff p={p} u={u} k="shadow" label="Shadow" def="true" />
            </Collapse>
            <Collapse label="Header" defaultOpen>
              <div className="grid grid-cols-2 gap-2">
                <ColorSet p={p} u={u} k="headerBg" label="Background" fallback="#0b3d2e" />
                <ColorSet p={p} u={u} k="headerText" label="Title colour" fallback="#ffffff" />
                <ColorSet p={p} u={u} k="badgeBg" label="Badge background" fallback="transparent" />
                <ColorSet p={p} u={u} k="badgeText" label="Badge text" fallback="#ffffff" />
                <ColorSet p={p} u={u} k="badgeBorder" label="Badge border" fallback="#ffffff66" />
                <TextSet p={p} u={u} k="headingSize" type="number" label="Title size (px)" placeholder="Auto" />
              </div>
            </Collapse>
            <Collapse label="Notice">
              <div className="grid grid-cols-2 gap-2">
                <ColorSet p={p} u={u} k="noticeBg" label="Background" fallback="#fdf0e0" />
                <ColorSet p={p} u={u} k="noticeText" label="Text" fallback="#9a3412" />
              </div>
            </Collapse>
            <Collapse label="Embed area">
              <ColorSet p={p} u={u} k="frameBg" label="Background (while loading)" fallback="#e5e7eb" />
            </Collapse>
            <Collapse label="Footer and button">
              <div className="grid grid-cols-2 gap-2">
                <ColorSet p={p} u={u} k="footerBg" label="Footer background" fallback="#ffffff" />
                <ColorSet p={p} u={u} k="footerTextColor" label="Footer text" fallback="#475569" />
                <ColorSet p={p} u={u} k="buttonBg" label="Button background" fallback="#0b3d2e" />
                <ColorSet p={p} u={u} k="buttonText" label="Button text" fallback="#ffffff" />
                <TextSet p={p} u={u} k="buttonRadius" type="number" label="Button radius (px)" placeholder="10" />
              </div>
            </Collapse>
          </>
        )}

        {tab === "advanced" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <TextSet p={p} u={u} k="height" type="number" label="Height, desktop (px)" placeholder="600" />
              <TextSet p={p} u={u} k="heightMobile" type="number" label="Height, phone (px)" placeholder="520" />
            </div>
            <TextSet p={p} u={u} k="frameTitle" label="Embed title (screen readers)" placeholder="Empty = the header title" />
            <OnOff p={p} u={u} k="lazy" label="Load the embed only when scrolled near" def="true" />
            <OnOff p={p} u={u} k="allowFullscreen" label="Allow full screen" def="true" />
          </>
        )}
      </div>
    </>
  );
}

/** A choice from a short list, as a dropdown — for tag pickers with many options. */
function SelectSet({ p, u, k, label, options, def }: {
  p: Record<string, string>; u: (k: string, v: string) => void; k: string; label: string;
  options: { value: string; label: string }[]; def: string;
}) {
  return (
    <Field label={label}>
      <select className={sel} value={p[k] || def} onChange={(e) => u(k, e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

const TAG_LABEL: Record<string, string> = {
  h2: "H2 — section heading", h3: "H3 — sub-heading", h4: "H4", h5: "H5", h6: "H6",
  p: "P — paragraph", div: "DIV — plain box", span: "SPAN — inline text", strong: "STRONG — bold text",
};
const tagOptions = (tags: readonly string[]) => tags.map((t) => ({ value: t, label: TAG_LABEL[t] ?? t.toUpperCase() }));

function StepsGridSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"content" | "style">("content");
  const custom = p.numbering === "custom";
  const cards = (p.layout || "joined") === "cards";
  const perRow = (k: string, def: string, max: number) => (
    <select className={sel} value={p[k] || def} onChange={(e) => u(k, e.target.value)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} per row</option>)}
    </select>
  );
  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as typeof tab)} options={["content", "style"]} />
      <div className="p-4 space-y-4">
        {tab === "content" && (
          <>
            <p className="text-[11px] text-slate-400 -mt-1">Click a title or description on the page to type in it. Settings below control the rest.</p>

            <Collapse label="Layout" defaultOpen>
              <Field label="Look">
                <ToggleRow value={p.layout || "joined"} onChange={(v) => u("layout", v)}
                  options={[{ value: "joined", label: "Joined grid" }, { value: "cards", label: "Separate cards" }]} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Desktop">{perRow("columns", "4", 6)}</Field>
                <Field label="Tablet">{perRow("columnsTablet", "2", 4)}</Field>
                <Field label="Phone">{perRow("columnsMobile", "1", 2)}</Field>
              </div>
              {cards ? (
                <div className="grid grid-cols-2 gap-2">
                  <TextSet p={p} u={u} k="colGap" type="number" label="Space side by side (px)" placeholder={p.gap || "20"} />
                  <TextSet p={p} u={u} k="rowGap" type="number" label="Space between rows (px)" placeholder={p.gap || "20"} />
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">A joined grid shares its borders, so there is no space between steps. Choose <b>Separate cards</b> to set the gaps.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <TextSet p={p} u={u} k="itemPadding" type="number" label="Space inside a step (px)" placeholder="24" />
                <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="14" />
              </div>
              <Field label="Alignment">
                <ToggleRow value={p.align || "start"} onChange={(v) => u("align", v)}
                  options={[{ value: "start", label: "Start" }, { value: "center", label: "Center" }]} />
              </Field>
              {cards && <OnOff p={p} u={u} k="hoverLift" label="Lift cards on hover" def="true" />}
            </Collapse>

            <Collapse label="Tags (for SEO and screen readers)" defaultOpen>
              <SelectSet p={p} u={u} k="titleTag" label="Step title" def="h3" options={tagOptions(["h2", "h3", "h4", "h5", "h6", "p", "div", "span"])} />
              <SelectSet p={p} u={u} k="textTag" label="Step description" def="p" options={tagOptions(["p", "div", "span"])} />
              <SelectSet p={p} u={u} k="numberTag" label="Step number" def="span" options={tagOptions(["span", "div", "strong"])} />
              <p className="text-[11px] text-slate-400">Use one level below the heading above this grid — under an H2 section, step titles are H3. Choose P or DIV when the steps are not headings.</p>
            </Collapse>

            <Collapse label="Steps" defaultOpen>
              <Repeater
                label="Steps (up to 25)"
                addLabel="Add step"
                max={25}
                value={p.steps || "[]"}
                onChange={(v) => u("steps", v)}
                blank={() => ({ title: "", text: "", number: "", url: "" })}
                render={(row, patch) => (
                  <>
                    {custom && (
                      <input className={sel} value={(row.number as string) ?? ""} placeholder="Number / label (e.g. A, Step 1)" onChange={(e) => patch({ number: e.target.value })} />
                    )}
                    <input className={sel} value={(row.title as string) ?? ""} placeholder="Title" onChange={(e) => patch({ title: e.target.value })} />
                    <textarea className={`${sel} resize-y`} rows={2} value={(row.text as string) ?? ""} placeholder="Description" onChange={(e) => patch({ text: e.target.value })} />
                    <input className={sel} value={(row.url as string) ?? ""} placeholder="Link (optional) — makes the step clickable" onChange={(e) => patch({ url: e.target.value })} />
                  </>
                )}
              />
            </Collapse>

            <Collapse label="Numbering" defaultOpen>
              <ToggleRow value={p.numbering || "padded"} onChange={(v) => u("numbering", v)}
                options={[{ value: "padded", label: "01" }, { value: "plain", label: "1" }, { value: "custom", label: "Custom" }, { value: "none", label: "None" }]} />
              {(p.numbering || "padded") !== "custom" && (p.numbering || "padded") !== "none" && (
                <div className="grid grid-cols-2 gap-2">
                  <TextSet p={p} u={u} k="start" type="number" label="Start at" placeholder="1" />
                  <TextSet p={p} u={u} k="numberPrefix" label="Before the number" placeholder="e.g. Step " />
                </div>
              )}
              {custom && <p className="text-[11px] text-slate-400">Each step now has its own number field above its title.</p>}
            </Collapse>
          </>
        )}

        {tab === "style" && (
          <>
            <Field label="Number style">
              <ToggleRow value={p.numberStyle || "badge"} onChange={(v) => u("numberStyle", v)}
                options={[{ value: "badge", label: "Badge" }, { value: "text", label: "Plain" }]} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <TextSet p={p} u={u} k="titleSize" type="number" label="Title size (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text size (px)" placeholder="Auto" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ColorSet p={p} u={u} k="cardBg" label="Card background" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="borderColor" label="Border" fallback="#e2e8f0" />
              <ColorSet p={p} u={u} k="numberColor" label="Number" fallback="#c2410c" />
              <ColorSet p={p} u={u} k="numberBg" label="Number badge" fallback="#fff7ed" />
              <ColorSet p={p} u={u} k="titleColor" label="Title" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="textColor" label="Text" fallback="#475569" />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function HighlightPanelSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [tab, setTab] = useState<"content" | "style">("content");
  const perRow = (k: string, def: string, max: number) => (
    <select className={sel} value={p[k] || def} onChange={(e) => u(k, e.target.value)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} per row</option>)}
    </select>
  );
  return (
    <>
      <Tabs3 tab={tab} setTab={(t) => setTab(t as typeof tab)} options={["content", "style"]} />
      <div className="p-4 space-y-4">
        {tab === "content" && (
          <>
            <p className="text-[11px] text-slate-400 -mt-1">Click the heading, the intro or any point on the page to type in it.</p>

            <Collapse label="Layout" defaultOpen>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Desktop">{perRow("columns", "3", 6)}</Field>
                <Field label="Tablet">{perRow("columnsTablet", "2", 4)}</Field>
                <Field label="Phone">{perRow("columnsMobile", "1", 2)}</Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextSet p={p} u={u} k="colGap" type="number" label="Space side by side (px)" placeholder="32" />
                <TextSet p={p} u={u} k="rowGap" type="number" label="Space between rows (px)" placeholder="28" />
                <TextSet p={p} u={u} k="padding" type="number" label="Inner space (px)" placeholder="48" />
                <TextSet p={p} u={u} k="paddingMobile" type="number" label="Inner space, phone (px)" placeholder="24" />
                <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="24" />
              </div>
              <Field label="Alignment">
                <ToggleRow value={p.align || "start"} onChange={(v) => u("align", v)}
                  options={[{ value: "start", label: "Start" }, { value: "center", label: "Center" }]} />
              </Field>
              <OnOff p={p} u={u} k="divider" label="Line above each point" def="false" />
            </Collapse>

            <Collapse label="Tags (for SEO and screen readers)" defaultOpen>
              <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(["h2", "h3", "h4", "p", "div"])} />
              <SelectSet p={p} u={u} k="introTag" label="Intro line" def="p" options={tagOptions(["p", "div"])} />
              <SelectSet p={p} u={u} k="titleTag" label="Point title" def="strong" options={tagOptions(["strong", "h3", "h4", "h5", "p", "div", "span"])} />
              <SelectSet p={p} u={u} k="textTag" label="Point text" def="p" options={tagOptions(["p", "div", "span"])} />
              <p className="text-[11px] text-slate-400">Under an H2 heading, use H3 for point titles when they are real sub-topics, or STRONG when they are short labels (as in most panels).</p>
            </Collapse>

            <Collapse label="Points" defaultOpen>
              <Repeater
                label="Points (up to 12)"
                addLabel="Add point"
                max={12}
                value={p.points || "[]"}
                onChange={(v) => u("points", v)}
                blank={() => ({ title: "", text: "", icon: "", url: "", linkText: "" })}
                render={(row, patch) => (
                  <>
                    <input className={sel} value={(row.icon as string) ?? ""} placeholder="Icon — an emoji (optional)" onChange={(e) => patch({ icon: e.target.value })} />
                    <input className={sel} value={(row.title as string) ?? ""} placeholder="Title" onChange={(e) => patch({ title: e.target.value })} />
                    <textarea className={`${sel} resize-y`} rows={2} value={(row.text as string) ?? ""} placeholder="Text" onChange={(e) => patch({ text: e.target.value })} />
                    <input className={sel} value={(row.url as string) ?? ""} placeholder="Link (optional)" onChange={(e) => patch({ url: e.target.value })} />
                    {(row.url as string) && (
                      <input className={sel} value={(row.linkText as string) ?? ""} placeholder="Link text (empty = the block's link text)" onChange={(e) => patch({ linkText: e.target.value })} />
                    )}
                  </>
                )}
              />
              <TextSet p={p} u={u} k="linkLabel" label="Link text (for points with a link)" placeholder="Learn more" />
            </Collapse>
          </>
        )}

        {tab === "style" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="titleSize" type="number" label="Titles (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#0b3d2e" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="introColor" label="Intro" fallback="#d1e7df" />
              <ColorSet p={p} u={u} k="titleColor" label="Point titles" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="textColor" label="Point text" fallback="#d1e7df" />
              <ColorSet p={p} u={u} k="iconColor" label="Icons" fallback="#fbbf24" />
              <ColorSet p={p} u={u} k="linkColor" label="Links" fallback="#fbbf24" />
              <ColorSet p={p} u={u} k="dividerColor" label="Lines" fallback="#ffffff33" />
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── The hookless view blocks (components/frontend/blocks/blockKit.tsx) ──────

type SetProps = { p: Record<string, string>; u: (k: string, v: string) => void };

/** Two buttons: the main one and an optional outlined one. */
function ButtonPair({ p, u, firstPlaceholder }: SetProps & { firstPlaceholder: string }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <TextSet p={p} u={u} k="btn1Label" label="Button" placeholder={firstPlaceholder} />
        <TextSet p={p} u={u} k="btn1Url" label="Goes to" placeholder="/contact" />
        <TextSet p={p} u={u} k="btn2Label" label="Second button" placeholder="Optional" />
        <TextSet p={p} u={u} k="btn2Url" label="Goes to" placeholder="/services" />
      </div>
      <p className="text-[11px] text-slate-400">A page (/contact), a full link, or tel:+15551234567 for a call button. A button with no address is not shown on the page.</p>
    </>
  );
}

/**
 * The Content / Style tabs every one of these panels has, as Iframe Embed,
 * Steps Grid and Highlight Panel do: what the block says and how it is laid
 * out on the first, sizes and colours on the second. Spacing, hover, scroll
 * animation and display conditions follow below from BoxSettings, as for
 * every block.
 */
function PanelTabs({ content, style }: { content: React.ReactNode; style: React.ReactNode }) {
  const [tab, setTab] = useState("content");
  return (
    <>
      <Tabs3 tab={tab} setTab={setTab} options={["content", "style"]} />
      <div className="p-4 space-y-4">{tab === "content" ? content : style}</div>
    </>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] leading-relaxed text-slate-400">{children}</p>;
const Two = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-2">{children}</div>;
const START_CENTER = [{ value: "start", label: "Start" }, { value: "center", label: "Center" }];
const HEADING_TAGS = ["h2", "h3", "h4", "p", "div"];

/** Desktop / Tablet / Phone "per row" pickers, as on Steps Grid and Highlight Panel. */
function PerRow({ p, u, d, t, m }: SetProps & { d: [string, number]; t: [string, number]; m: [string, number] }) {
  const one = (k: string, [def, max]: [string, number]) => (
    <select className={sel} value={p[k] || def} onChange={(e) => u(k, e.target.value)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} per row</option>)}
    </select>
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      <Field label="Desktop">{one("columns", d)}</Field>
      <Field label="Tablet">{one("columnsTablet", t)}</Field>
      <Field label="Phone">{one("columnsMobile", m)}</Field>
    </div>
  );
}

function HeroSettings({ p, u }: SetProps) {
  const layout = p.layout || "split";
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the small label, the heading or the text on the page to type in it.</Note>
          <Collapse label="Layout" defaultOpen>
            <Field label="Layout">
              <ToggleRow value={layout} onChange={(v) => u("layout", v)}
                options={[{ value: "split", label: "Beside photo" }, { value: "cover", label: "Over photo" }, { value: "plain", label: "No photo" }]} />
            </Field>
            <Field label="Alignment">
              <ToggleRow value={p.align || "start"} onChange={(v) => u("align", v)} options={START_CENTER} />
            </Field>
            <OnOff p={p} u={u} k="flush" label="No space above or below (touch the neighbouring blocks)" def="false" />
          </Collapse>
          {layout !== "plain" && (
            <Collapse label="Photo" defaultOpen>
              <ImageField label="Photo" value={p.image ?? ""} onChange={(v) => u("image", v)} />
              <TextSet p={p} u={u} k="imageAlt" label="What the photo shows (alt text)" placeholder="A plumber fitting a kitchen tap" hint="Read out by screen readers and used by image search. Leave empty only for pure decoration." />
              {layout === "split" && (
                <Field label="Photo side">
                  <ToggleRow value={p.imageSide || "right"} onChange={(v) => u("imageSide", v)} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
                </Field>
              )}
              {layout === "cover" && <TextSet p={p} u={u} k="overlay" type="number" label="Colour over the photo (%)" placeholder="60" hint="How much of the background colour covers the photo, so the text stays readable." />}
            </Collapse>
          )}
          <Collapse label="Ticks and buttons" defaultOpen>
            <TextSet p={p} u={u} k="ticks" rows={3} label="Ticks (one per line, up to 6)" placeholder={"Licensed and insured\nSame-week appointments"} />
            <ButtonPair p={p} u={u} firstPlaceholder="Get started" />
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(["h1", "h2", "h3", "p", "div"])} />
            <Note>A page should have one H1. Choose H1 here only when the page&rsquo;s own title is hidden (Design tab → Title).</Note>
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="padding" type="number" label="Space above and below (px)" placeholder="72" />
              <TextSet p={p} u={u} k="paddingMobile" type="number" label="The same, phone (px)" placeholder="40" />
              <TextSet p={p} u={u} k="minHeight" type="number" label="Least height (px)" placeholder="0" />
              <TextSet p={p} u={u} k="innerWidth" type="number" label="Content width (px)" placeholder="1152" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="0" />
              <TextSet p={p} u={u} k="imageRadius" type="number" label="Photo corners (px)" placeholder="16" />
              <TextSet p={p} u={u} k="btnRadius" type="number" label="Button corners (px)" placeholder="10" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="bg2" label="Fade to (optional)" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="copyColor" label="Text" fallback="#dbe5f1" />
              <ColorSet p={p} u={u} k="eyebrowColor" label="Small label" fallback="#f5a623" />
              <ColorSet p={p} u={u} k="tickColor" label="Tick marks" fallback="#f5a623" />
            </Two>
          </Collapse>
          <Collapse label="Buttons">
            <Two>
              <ColorSet p={p} u={u} k="btnBg" label="Button" fallback="#f5a623" />
              <ColorSet p={p} u={u} k="btnColor" label="Button text" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="btn2Color" label="Second button" fallback="#ffffff" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function CtaBandSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the heading or the text on the page to type in it.</Note>
          <Collapse label="Layout" defaultOpen>
            <Field label="Layout">
              <ToggleRow value={p.layout || "center"} onChange={(v) => u("layout", v)} options={[{ value: "center", label: "Centred" }, { value: "split", label: "Buttons to the side" }]} />
            </Field>
            <OnOff p={p} u={u} k="flush" label="No space above or below (touch the neighbouring blocks)" def="false" />
          </Collapse>
          <Collapse label="Buttons" defaultOpen>
            <ButtonPair p={p} u={u} firstPlaceholder="Get in touch" />
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(HEADING_TAGS)} />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="padding" type="number" label="Space above and below (px)" placeholder="56" />
              <TextSet p={p} u={u} k="paddingMobile" type="number" label="The same, phone (px)" placeholder="36" />
              <TextSet p={p} u={u} k="innerWidth" type="number" label="Content width (px)" placeholder="1152" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="16" />
              <TextSet p={p} u={u} k="btnRadius" type="number" label="Button corners (px)" placeholder="10" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="bg2" label="Fade to (optional)" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="copyColor" label="Text" fallback="#dbe5f1" />
              <ColorSet p={p} u={u} k="btnBg" label="Button" fallback="#f5a623" />
              <ColorSet p={p} u={u} k="btnColor" label="Button text" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="btn2Color" label="Second button" fallback="#ffffff" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function CardGridSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the heading, the intro or a card&rsquo;s title or text on the page to type in it.</Note>
          <Collapse label="Layout" defaultOpen>
            <PerRow p={p} u={u} d={["3", 6]} t={["2", 4]} m={["1", 2]} />
            <Two>
              <TextSet p={p} u={u} k="gap" type="number" label="Space between cards (px)" placeholder="24" />
              <SelectSet p={p} u={u} k="ratio" label="Photo shape" def="16/9" options={[{ value: "16/9", label: "Wide (16:9)" }, { value: "4/3", label: "Classic (4:3)" }, { value: "1/1", label: "Square" }, { value: "3/4", label: "Tall (3:4)" }]} />
            </Two>
            <Field label="Alignment">
              <ToggleRow value={p.align || "start"} onChange={(v) => u("align", v)} options={START_CENTER} />
            </Field>
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(HEADING_TAGS)} />
            <SelectSet p={p} u={u} k="titleTag" label="Card title" def="h3" options={tagOptions(["h2", "h3", "h4", "h5", "strong", "p", "div"])} />
            <Note>Card titles sit one level below the heading above them: H3 under an H2.</Note>
          </Collapse>
          <Collapse label="Cards" defaultOpen>
            <Repeater
              label="Cards (up to 24)"
              addLabel="Add card"
              max={24}
              value={p.cards || "[]"}
              onChange={(v) => u("cards", v)}
              blank={() => ({ image: "", alt: "", icon: "", title: "", text: "", url: "" })}
              render={(row, patch) => (
                <>
                  <input className={sel} value={(row.title as string) ?? ""} placeholder="Title" onChange={(e) => patch({ title: e.target.value })} />
                  <textarea className={`${sel} resize-y`} rows={2} value={(row.text as string) ?? ""} placeholder="Text" onChange={(e) => patch({ text: e.target.value })} />
                  <input className={sel} value={(row.url as string) ?? ""} placeholder="Link (optional) — the whole card becomes clickable" onChange={(e) => patch({ url: e.target.value })} />
                  <ImageField label="Photo (optional)" value={(row.image as string) ?? ""} onChange={(v) => patch({ image: v })} />
                  {(row.image as string) ? (
                    <input className={sel} value={(row.alt as string) ?? ""} placeholder="What the photo shows (alt text)" onChange={(e) => patch({ alt: e.target.value })} />
                  ) : (
                    <input className={sel} value={(row.icon as string) ?? ""} placeholder="Or an icon — an emoji" onChange={(e) => patch({ icon: e.target.value })} />
                  )}
                </>
              )}
            />
            <Note>A card&rsquo;s link is carried by its title, so a linked card needs a title.</Note>
            <OnOff p={p} u={u} k="showLink" label="Show a “Learn more” line on linked cards" def="true" />
            {p.showLink !== "false" && <TextSet p={p} u={u} k="linkLabel" label="Its words" placeholder="Learn more" />}
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <div className="grid grid-cols-3 gap-2">
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="titleSize" type="number" label="Titles (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
            </div>
            <Two>
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="14" />
              <TextSet p={p} u={u} k="padding" type="number" label="Inner space (px)" placeholder="22" />
            </Two>
            <OnOff p={p} u={u} k="shadow" label="Shadow" def="true" />
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="cardBg" label="Card" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="borderColor" label="Border" fallback="#e2e8f0" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="introColor" label="Intro" fallback="#475569" />
              <ColorSet p={p} u={u} k="titleColor" label="Card titles" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="copyColor" label="Card text" fallback="#475569" />
              <ColorSet p={p} u={u} k="iconColor" label="Icons" fallback="#0b6fb8" />
              <ColorSet p={p} u={u} k="linkColor" label="Links" fallback="#0b6fb8" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function StatsStripSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click a figure or its label on the page to type in it.</Note>
          <Collapse label="Figures" defaultOpen>
            <Repeater
              label="Figures (up to 6)"
              addLabel="Add figure"
              max={6}
              value={p.items || "[]"}
              onChange={(v) => u("items", v)}
              blank={() => ({ value: "", label: "" })}
              render={(row, patch) => (
                <div className="grid grid-cols-2 gap-1.5">
                  <input className={sel} value={(row.value as string) ?? ""} placeholder="24/7" onChange={(e) => patch({ value: e.target.value })} />
                  <input className={sel} value={(row.label as string) ?? ""} placeholder="Available" onChange={(e) => patch({ label: e.target.value })} />
                </div>
              )}
            />
            <Note>Use figures you can stand behind. Visitors and search engines both read them as facts about the business.</Note>
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <OnOff p={p} u={u} k="dividers" label="Lines between the figures" def="true" />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="valueSize" type="number" label="Figures (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="labelSize" type="number" label="Labels (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="padding" type="number" label="Inner space (px)" placeholder="32" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="16" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#f4f8fb" />
              <ColorSet p={p} u={u} k="valueColor" label="Figures" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="labelColor" label="Labels" fallback="#55708c" />
              <ColorSet p={p} u={u} k="dividerColor" label="Lines" fallback="#c7d5e3" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function ProsConsSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>One point per line. Click a column&rsquo;s title on the page to rename it.</Note>
          <Collapse label="Points" defaultOpen>
            <TextSet p={p} u={u} k="pros" rows={5} label="Pros" placeholder={"Easy to set up\nFree to start"} />
            <TextSet p={p} u={u} k="cons" rows={5} label="Cons" placeholder={"Needs an account"} />
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="titleTag" label="Column title" def="h3" options={tagOptions(["h2", "h3", "h4", "strong", "p", "div"])} />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="titleSize" type="number" label="Titles (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="14" />
              <TextSet p={p} u={u} k="padding" type="number" label="Inner space (px)" placeholder="22" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="prosColor" label="Pros colour" fallback="#15803d" />
              <ColorSet p={p} u={u} k="prosBg" label="Pros background" fallback="#f0fdf4" />
              <ColorSet p={p} u={u} k="consColor" label="Cons colour" fallback="#b91c1c" />
              <ColorSet p={p} u={u} k="consBg" label="Cons background" fallback="#fef2f2" />
              <ColorSet p={p} u={u} k="copyColor" label="Text" fallback="#1f2937" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function CallBarSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>
            A call button that stays at the bottom of the screen. Put one on a page, or in a footer Element to have it on every page. Where it sits in the content does not change where it shows.
          </Note>
          <Collapse label="Call button" defaultOpen>
            <TextSet p={p} u={u} k="phone" label="Phone number" placeholder="+1 555 123 4567" hint="Leave empty to use the number in SEO → Local SEO. With no number anywhere, the bar is not shown." />
            <TextSet p={p} u={u} k="label" label="Button words" placeholder="Call now" />
            <OnOff p={p} u={u} k="showNumber" label="Show the number on the button" def="true" />
          </Collapse>
          <Collapse label="Text and second button">
            <TextSet p={p} u={u} k="text" label="Line beside the button (optional)" placeholder="Speak to a local expert today" hint="Shown on wider screens only: a phone has room for the buttons alone." />
            <Two>
              <TextSet p={p} u={u} k="btn2Label" label="Second button" placeholder="Optional" />
              <TextSet p={p} u={u} k="btn2Url" label="Goes to" placeholder="/contact" />
            </Two>
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <Field label="Show on">
              <ToggleRow value={p.show || "mobile"} onChange={(v) => u("show", v)} options={[{ value: "mobile", label: "Phones only" }, { value: "all", label: "Every screen" }]} />
            </Field>
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <TextSet p={p} u={u} k="radius" type="number" label="Button corners (px)" placeholder="10" />
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Bar" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="copyColor" label="Text" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="btnBg" label="Call button" fallback="#f5a623" />
              <ColorSet p={p} u={u} k="btnColor" label="Its text" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="btn2Color" label="Second button" fallback="#ffffff" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function LogoStripSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the line above the logos on the page to type in it.</Note>
          <Collapse label="Logos" defaultOpen>
            <Repeater
              label="Logos (up to 16)"
              addLabel="Add logo"
              max={16}
              value={p.logos || "[]"}
              onChange={(v) => u("logos", v)}
              blank={() => ({ src: "", alt: "", url: "" })}
              render={(row, patch) => (
                <>
                  <ImageField label="Logo" value={(row.src as string) ?? ""} onChange={(v) => patch({ src: v })} />
                  <input className={sel} value={(row.alt as string) ?? ""} placeholder="Whose logo it is (alt text)" onChange={(e) => patch({ alt: e.target.value })} />
                  <input className={sel} value={(row.url as string) ?? ""} placeholder="Link (optional)" onChange={(e) => patch({ url: e.target.value })} />
                </>
              )}
            />
            <Note>Show only logos you have the right to show: real clients, partners or publications.</Note>
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <Field label="Alignment">
              <ToggleRow value={p.align || "center"} onChange={(v) => u("align", v)} options={START_CENTER} />
            </Field>
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="height" type="number" label="Logo height (px)" placeholder="40" />
              <TextSet p={p} u={u} k="gap" type="number" label="Space between (px)" placeholder="40" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <OnOff p={p} u={u} k="gray" label="Grey until hovered" def="true" />
            <ColorSet p={p} u={u} k="headingColor" label="Line above" fallback="#64748b" />
          </Collapse>
        </>
      }
    />
  );
}

function NoticeBarSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the text on the page to type in it. To show it on every page, put it in a header Element.</Note>
          <Collapse label="Icon and link" defaultOpen>
            <TextSet p={p} u={u} k="icon" label="Icon — an emoji (optional)" placeholder="📣" />
            <Two>
              <TextSet p={p} u={u} k="linkLabel" label="Link words (optional)" placeholder="See the offer" />
              <TextSet p={p} u={u} k="url" label="Goes to" placeholder="/offers" />
            </Two>
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <Field label="Alignment">
              <ToggleRow value={p.align || "center"} onChange={(v) => u("align", v)} options={START_CENTER} />
            </Field>
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <div className="grid grid-cols-3 gap-2">
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="padding" type="number" label="Height (px)" placeholder="12" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corners (px)" placeholder="10" />
            </div>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#fef3c7" />
              <ColorSet p={p} u={u} k="copyColor" label="Text" fallback="#78350f" />
              <ColorSet p={p} u={u} k="linkColor" label="Link" fallback="#78350f" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function ComparisonTableSettings({ p, u }: SetProps) {
  const { cols, rows } = parseComparison(p.cols ?? COMPARISON_TABLE_DEFAULTS.cols, p.rows ?? COMPARISON_TABLE_DEFAULTS.rows);
  // One write for both: a column change alters every row, and two writes would race.
  const write = (nextCols: string[], nextRows: string[][], highlight = p.highlight ?? "0") =>
    updateActiveBlockProps({ ...p, cols: JSON.stringify(nextCols), rows: JSON.stringify(nextRows), highlight });
  const btn = "flex-1 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-sky-400 hover:text-sky-600 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600";
  return (
    <PanelTabs
      content={
        <>
          <Note>
            Click any cell on the page to type in it. Type <strong>yes</strong> or <strong>no</strong> in a cell for a tick or a cross; anything else is shown as written.
          </Note>
          <Collapse label="Options and rows" defaultOpen>
            <Field label={`Options: ${cols.length - 1}`}>
              <div className="flex gap-2">
                <button type="button" className={btn} disabled={cols.length >= MAX_COMPARE_COLS} onClick={() => write([...cols, `Option ${cols.length}`], rows.map((r) => [...r, ""]))}>+ Add option</button>
                <button type="button" className={btn} disabled={cols.length <= 2} onClick={() => write(cols.slice(0, -1), rows.map((r) => r.slice(0, -1)), Number(p.highlight) >= cols.length - 1 ? "0" : p.highlight)}>− Remove last</button>
              </div>
            </Field>
            <Field label={`Rows: ${rows.length}`}>
              <div className="flex gap-2">
                <button type="button" className={btn} disabled={rows.length >= MAX_COMPARE_ROWS} onClick={() => u("rows", JSON.stringify([...rows, cols.map(() => "")]))}>+ Add row</button>
                <button type="button" className={btn} disabled={rows.length <= 1} onClick={() => u("rows", JSON.stringify(rows.slice(0, -1)))}>− Remove last</button>
              </div>
            </Field>
            <SelectSet p={p} u={u} k="highlight" label="Recommended option" def="0"
              options={[{ value: "0", label: "None" }, ...cols.slice(1).map((c, i) => ({ value: String(i + 1), label: c.trim() || `Option ${i + 1}` }))]} />
          </Collapse>
          <Collapse label="For SEO and screen readers" defaultOpen>
            <TextSet p={p} u={u} k="caption" label="Caption (optional)" placeholder="Free plan compared with Pro" hint="A line above the table saying what it compares. Screen readers announce it first." />
            <Two>
              <TextSet p={p} u={u} k="yesLabel" label="A tick is read as" placeholder="Yes" />
              <TextSet p={p} u={u} k="noLabel" label="A cross is read as" placeholder="No" />
            </Two>
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="12" />
            </Two>
            <OnOff p={p} u={u} k="stripes" label="Shade every other row" def="true" />
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="headBg" label="Header" fallback="#0b2545" />
              <ColorSet p={p} u={u} k="headColor" label="Header text" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="highlightBg" label="Recommended" fallback="#fff7e6" />
              <ColorSet p={p} u={u} k="borderColor" label="Lines" fallback="#e2e8f0" />
              <ColorSet p={p} u={u} k="copyColor" label="Text" fallback="#1f2937" />
              <ColorSet p={p} u={u} k="yesColor" label="Tick" fallback="#15803d" />
              <ColorSet p={p} u={u} k="noColor" label="Cross" fallback="#b91c1c" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function VersionHistorySettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Newest release first. Click the heading on the page to type in it.</Note>
          <Collapse label="Releases" defaultOpen>
            <Repeater
              label="Releases (up to 40)"
              addLabel="Add release"
              max={40}
              value={p.versions || "[]"}
              onChange={(v) => u("versions", v)}
              blank={() => ({ version: "", date: "", changes: "" })}
              render={(row, patch) => (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className={sel} value={(row.version as string) ?? ""} placeholder="Version — 2.1.0" onChange={(e) => patch({ version: e.target.value })} />
                    <input type="date" className={sel} value={/^\d{4}-\d{2}-\d{2}$/.test((row.date as string) ?? "") ? (row.date as string) : ""} onChange={(e) => patch({ date: e.target.value })} />
                  </div>
                  <textarea className={`${sel} resize-y`} rows={3} value={(row.changes as string) ?? ""} placeholder="What changed, one per line" onChange={(e) => patch({ changes: e.target.value })} />
                </>
              )}
            />
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <OnOff p={p} u={u} k="fold" label="Fold each release (the newest stays open)" def="true" />
            <TextSet p={p} u={u} k="latestLabel" label="Badge on the newest (empty = none)" placeholder="Latest" />
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(HEADING_TAGS)} />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <div className="grid grid-cols-3 gap-2">
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corners (px)" placeholder="12" />
            </div>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="accent" label="Accent" fallback="#0b6fb8" />
              <ColorSet p={p} u={u} k="borderColor" label="Border" fallback="#e2e8f0" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading and versions" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="copyColor" label="Changes" fallback="#334155" />
              <ColorSet p={p} u={u} k="mutedColor" label="Dates" fallback="#64748b" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function LinkGridSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the heading or the intro on the page to type in it.</Note>
          <Collapse label="Links" defaultOpen>
            <TextSet p={p} u={u} k="links" rows={8} label="Links (one per line, up to 150)" placeholder={"Round Rock | /plumber-round-rock\nCedar Park | /plumber-cedar-park"} />
            <Note>Write each as <strong>Name | address</strong>. A line with no address is shown as plain text, so a town with no page of its own can still be listed.</Note>
            <TextSet p={p} u={u} k="icon" label="Icon before each — an emoji (optional)" placeholder="📍" />
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <PerRow p={p} u={u} d={["4", 6]} t={["3", 4]} m={["2", 3]} />
            <Field label="Look">
              <ToggleRow value={p.look || "plain"} onChange={(v) => u("look", v)} options={[{ value: "plain", label: "Plain" }, { value: "pills", label: "Pills" }, { value: "boxes", label: "Boxes" }]} />
            </Field>
            <Field label="Heading alignment">
              <ToggleRow value={p.align || "start"} onChange={(v) => u("align", v)} options={START_CENTER} />
            </Field>
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(HEADING_TAGS)} />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Links (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="gap" type="number" label="Space between (px)" placeholder="12" />
              <TextSet p={p} u={u} k="radius" type="number" label="Box corners (px)" placeholder="10" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="introColor" label="Intro" fallback="#475569" />
              <ColorSet p={p} u={u} k="linkColor" label="Links" fallback="#0b6fb8" />
              <ColorSet p={p} u={u} k="copyColor" label="Plain names" fallback="#334155" />
              <ColorSet p={p} u={u} k="itemBg" label="Pill / box" fallback="#f4f8fb" />
              <ColorSet p={p} u={u} k="borderColor" label="Border" fallback="#e2e8f0" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function ReviewGridSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the heading on the page to type in it.</Note>
          <Collapse label="Reviews" defaultOpen>
            <Repeater
              label="Reviews (up to 12)"
              addLabel="Add review"
              max={12}
              value={p.reviews || "[]"}
              onChange={(v) => u("reviews", v)}
              blank={() => ({ quote: "", name: "", detail: "", rating: "5", source: "" })}
              render={(row, patch) => (
                <>
                  <textarea className={`${sel} resize-y`} rows={3} value={(row.quote as string) ?? ""} placeholder="What the customer wrote, word for word" onChange={(e) => patch({ quote: e.target.value })} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className={sel} value={(row.name as string) ?? ""} placeholder="Their name" onChange={(e) => patch({ name: e.target.value })} />
                    <input className={sel} value={(row.detail as string) ?? ""} placeholder="Town or job (optional)" onChange={(e) => patch({ detail: e.target.value })} />
                    <select className={sel} value={String(row.rating ?? "5")} onChange={(e) => patch({ rating: e.target.value })}>
                      <option value="0">No stars</option>
                      {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 1 ? "star" : "stars"}</option>)}
                    </select>
                    <input className={sel} value={(row.source as string) ?? ""} placeholder="Where — Google…" onChange={(e) => patch({ source: e.target.value })} />
                  </div>
                </>
              )}
            />
            <Note>Only reviews you really received, in the customer&rsquo;s own words. An invented review is against the law in most countries and gets a site removed from search.</Note>
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <PerRow p={p} u={u} d={["3", 4]} t={["2", 3]} m={["1", 2]} />
            <Field label="Heading alignment">
              <ToggleRow value={p.align || "start"} onChange={(v) => u("align", v)} options={START_CENTER} />
            </Field>
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(HEADING_TAGS)} />
            <TextSet p={p} u={u} k="ratedLabel" label="Stars are read as" placeholder="Rated {n} out of 5" hint="{n} becomes the number of stars." />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Review text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="gap" type="number" label="Space between (px)" placeholder="20" />
              <TextSet p={p} u={u} k="padding" type="number" label="Inner space (px)" placeholder="22" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="14" />
            </Two>
            <OnOff p={p} u={u} k="shadow" label="Shadow" def="true" />
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="cardBg" label="Card" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="borderColor" label="Border" fallback="#e2e8f0" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="quoteColor" label="Review text" fallback="#1f2937" />
              <ColorSet p={p} u={u} k="nameColor" label="Names" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="mutedColor" label="Details" fallback="#64748b" />
              <ColorSet p={p} u={u} k="starColor" label="Stars" fallback="#f59e0b" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function PriceListSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the heading, a name, a price or the small print on the page to type in it.</Note>
          <Collapse label="Items" defaultOpen>
            <Repeater
              label="Items (up to 60)"
              addLabel="Add item"
              max={60}
              value={p.items || "[]"}
              onChange={(v) => u("items", v)}
              blank={() => ({ name: "", note: "", price: "" })}
              render={(row, patch) => (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input className={`${sel} col-span-2`} value={(row.name as string) ?? ""} placeholder="Name" onChange={(e) => patch({ name: e.target.value })} />
                    <input className={sel} value={(row.price as string) ?? ""} placeholder="$40" onChange={(e) => patch({ price: e.target.value })} />
                  </div>
                  <input className={sel} value={(row.note as string) ?? ""} placeholder="Detail (optional)" onChange={(e) => patch({ note: e.target.value })} />
                </>
              )}
            />
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <OnOff p={p} u={u} k="leader" label="Dotted line from the name to the price" def="true" />
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(HEADING_TAGS)} />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Names and prices (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="padding" type="number" label="Inner space (px)" placeholder="24" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="14" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="borderColor" label="Lines" fallback="#e2e8f0" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="nameColor" label="Names" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="noteColor" label="Details" fallback="#64748b" />
              <ColorSet p={p} u={u} k="priceColor" label="Prices" fallback="#0b6fb8" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function KeyTakeawaysSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the title on the page to type in it.</Note>
          <Collapse label="Points" defaultOpen>
            <TextSet p={p} u={u} k="points" rows={6} label="Points (one per line, up to 12)" placeholder={"The first thing to remember\nThe second thing"} />
            <TextSet p={p} u={u} k="icon" label="Icon beside the title — an emoji (optional)" placeholder="💡" />
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <Field label="Marker">
              <ToggleRow value={p.marker || "tick"} onChange={(v) => u("marker", v)} options={[{ value: "tick", label: "Tick" }, { value: "dot", label: "Dot" }, { value: "number", label: "Number" }]} />
            </Field>
            <OnOff p={p} u={u} k="bar" label="Coloured bar down the side" def="true" />
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="titleTag" label="Title" def="h2" options={tagOptions(["h2", "h3", "h4", "strong", "p", "div"])} />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="titleSize" type="number" label="Title (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="padding" type="number" label="Inner space (px)" placeholder="24" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="14" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#f4f8fb" />
              <ColorSet p={p} u={u} k="accent" label="Bar and markers" fallback="#0b6fb8" />
              <ColorSet p={p} u={u} k="titleColor" label="Title" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="copyColor" label="Text" fallback="#1f2937" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function FactSheetSettings({ p, u }: SetProps) {
  return (
    <PanelTabs
      content={
        <>
          <Note>Click the heading on the page to type in it.</Note>
          <Collapse label="Facts" defaultOpen>
            <TextSet p={p} u={u} k="rows" rows={8} label="Facts (one per line, up to 60)" placeholder={"Size | 24 MB\nVersion | 2.1.0"} />
            <Note>Write each as <strong>Label | Value</strong>. A line with no value is left out.</Note>
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <Field label="Columns">
              <ToggleRow value={p.columns || "1"} onChange={(v) => u("columns", v)} options={[{ value: "1", label: "One" }, { value: "2", label: "Two" }]} />
            </Field>
            <OnOff p={p} u={u} k="stripes" label="Shade every other row (one column)" def="true" />
          </Collapse>
          <Collapse label="Tags (for SEO and screen readers)">
            <SelectSet p={p} u={u} k="headingTag" label="Heading" def="h2" options={tagOptions(HEADING_TAGS)} />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <div className="grid grid-cols-3 gap-2">
              <TextSet p={p} u={u} k="headingSize" type="number" label="Heading (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="textSize" type="number" label="Text (px)" placeholder="Auto" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corners (px)" placeholder="12" />
            </div>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <Two>
              <ColorSet p={p} u={u} k="bg" label="Background" fallback="#ffffff" />
              <ColorSet p={p} u={u} k="stripeBg" label="Shaded rows" fallback="#f4f8fb" />
              <ColorSet p={p} u={u} k="borderColor" label="Lines" fallback="#e2e8f0" />
              <ColorSet p={p} u={u} k="headingColor" label="Heading" fallback="#0f172a" />
              <ColorSet p={p} u={u} k="labelColor" label="Labels" fallback="#475569" />
              <ColorSet p={p} u={u} k="valueColor" label="Values" fallback="#0f172a" />
            </Two>
          </Collapse>
        </>
      }
    />
  );
}

function ShareButtonsSettings({ p, u }: SetProps) {
  const chosen = String(p.show ?? "facebook,x,whatsapp,email").split(",").filter(Boolean);
  // Kept in the networks' own order, whatever order they were ticked in.
  const toggle = (id: string, on: boolean) => u("show", SHARE_NETWORKS.map((n) => n.id).filter((n) => (n === id ? on : chosen.includes(n))).join(","));
  return (
    <PanelTabs
      content={
        <>
          <Note>These are plain links to each network&rsquo;s share page for the page this block is on. No network&rsquo;s script is loaded, so nothing tracks your visitors and nothing slows the page.</Note>
          <Collapse label="Networks" defaultOpen>
            <div className="grid grid-cols-2 gap-1.5">
              {SHARE_NETWORKS.map((n) => (
                <label key={n.id} className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={chosen.includes(n.id)} onChange={(e) => toggle(n.id, e.target.checked)} />
                  {n.label}
                </label>
              ))}
            </div>
          </Collapse>
          <Collapse label="Layout" defaultOpen>
            <Field label="Look">
              <ToggleRow value={p.look || "solid"} onChange={(v) => u("look", v)} options={[{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }, { value: "plain", label: "Plain" }]} />
            </Field>
            <OnOff p={p} u={u} k="names" label="Show each network&rsquo;s name" def="true" />
            <Field label="Alignment">
              <ToggleRow value={p.align || "start"} onChange={(v) => u("align", v)} options={START_CENTER} />
            </Field>
          </Collapse>
          <Collapse label="For screen readers">
            <TextSet p={p} u={u} k="shareWord" label="Each button is read as" placeholder="Share on" hint="Followed by the network&rsquo;s name: “Share on Facebook”." />
          </Collapse>
        </>
      }
      style={
        <>
          <Collapse label="Sizes" defaultOpen>
            <Two>
              <TextSet p={p} u={u} k="size" type="number" label="Button height (px)" placeholder="40" />
              <TextSet p={p} u={u} k="radius" type="number" label="Corner radius (px)" placeholder="10" />
            </Two>
          </Collapse>
          <Collapse label="Colours" defaultOpen>
            <ColorSet p={p} u={u} k="labelColor" label="“Share this” text" fallback="#475569" />
            <Note>Each button keeps its network&rsquo;s own colour, which is how people recognise it.</Note>
          </Collapse>
        </>
      }
    />
  );
}

function TimelineSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Repeater
        label="Items"
        addLabel="Add item"
        value={p.items || "[]"}
        onChange={(v) => u("items", v)}
        blank={() => ({ date: "", title: "", text: "", icon: "" })}
        render={(row, patch) => (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <input className={sel} value={(row.date as string) ?? ""} placeholder="Date / label" onChange={(e) => patch({ date: e.target.value })} />
              <input className={sel} value={(row.icon as string) ?? ""} placeholder="Emoji (optional)" onChange={(e) => patch({ icon: e.target.value })} />
            </div>
            <input className={sel} value={(row.title as string) ?? ""} placeholder="Title" onChange={(e) => patch({ title: e.target.value })} />
            <textarea className={`${sel} resize-none`} rows={2} value={(row.text as string) ?? ""} placeholder="Description" onChange={(e) => patch({ text: e.target.value })} />
          </>
        )}
      />
      <Field label="Layout">
        <ToggleRow value={p.layout || "left"} onChange={(v) => u("layout", v)}
          options={[{ value: "left", label: "Line left" }, { value: "alternate", label: "Alternate" }, { value: "right", label: "Line right" }]} />
      </Field>
      <Field label="Marker">
        <ToggleRow value={p.marker || "number"} onChange={(v) => u("marker", v)}
          options={[{ value: "number", label: "Number" }, { value: "dot", label: "Dot" }, { value: "icon", label: "Emoji" }]} />
      </Field>
      <Field label="Item title tag">
        <ToggleRow value={p.titleTag || "h3"} onChange={(v) => u("titleTag", v)}
          options={[{ value: "h2", label: "H2" }, { value: "h3", label: "H3" }, { value: "h4", label: "H4" }, { value: "p", label: "Text" }]} />
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          One level below the heading above the timeline. With no H2 above it, use H2 — skipping a level is flagged by accessibility checks. Looks the same either way.
        </p>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Line colour"><ColorDot value={p.lineColor} fallback="#e2e8f0" onChange={(v) => u("lineColor", v)} className="w-full h-7 rounded border border-slate-200" /></Field>
        <Field label="Marker colour"><ColorDot value={p.markerColor} fallback="#0ea5e9" onChange={(v) => u("markerColor", v)} className="w-full h-7 rounded border border-slate-200" /></Field>
      </div>
      <div className="space-y-1.5">
        <OnOff p={p} u={u} k="showDates" label="Show dates / labels" def="true" />
        <OnOff p={p} u={u} k="animate" label="Fade items in on scroll" />
      </div>
    </div>
  );
}

function AuthorBioSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const parts = String(p.show ?? "avatar,name,bio,social").split(",").filter(Boolean);
  const toggle = (key: string, on: boolean) => u("show", (on ? [...parts.filter((x) => x !== key), key] : parts.filter((x) => x !== key)).join(","));
  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-400">
        The photo, name, biography and social links come from this account&rsquo;s own profile —
        edit those in <strong>Users</strong>, not here. This panel only controls how they look.
      </p>
      <Field label="Show">
        <div className="space-y-1.5">
          {AUTHOR_BIO_PARTS.map(({ id, title }) => (
            <label key={id} className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={parts.includes(id)} onChange={(e) => toggle(id, e.target.checked)} /> {title}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Alignment">
        <ToggleRow value={p.align || "center"} onChange={(v) => u("align", v)}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }]} />
      </Field>
      {parts.includes("avatar") && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Avatar size (px)">
              <input className={inp} value={p.avatarSize || "96"} onChange={(e) => u("avatarSize", e.target.value.replace(/[^0-9]/g, ""))} />
            </Field>
            <Field label="Shape">
              <select className={sel} value={p.avatarShape || "circle"} onChange={(e) => u("avatarShape", e.target.value)}>
                {AVATAR_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </Field>
          </div>
        </>
      )}
      {parts.includes("name") && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name tag">
            <select className={sel} value={p.nameTag || "h2"} onChange={(e) => u("nameTag", e.target.value)}>
              {NAME_TAGS.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
          <Field label="Colour">
            <ColorDot value={p.nameColor} fallback="#0f172a" onChange={(v) => u("nameColor", v)} className="w-full h-7 rounded border border-slate-200" />
          </Field>
        </div>
      )}
      {parts.includes("bio") && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bio size (px)">
            <input className={inp} value={p.bioFs} placeholder="16" onChange={(e) => u("bioFs", e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="Bio colour">
            <ColorDot value={p.bioColor} fallback="#475569" onChange={(v) => u("bioColor", v)} className="w-full h-7 rounded border border-slate-200" />
          </Field>
        </div>
      )}
      {parts.includes("social") && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Icon size (px)">
            <input className={inp} value={p.socialSize} placeholder="32" onChange={(e) => u("socialSize", e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="Icon colour">
            <ColorDot value={p.socialColor} fallback="#0f172a" onChange={(v) => u("socialColor", v)} className="w-full h-7 rounded border border-slate-200" />
          </Field>
        </div>
      )}
      <Field label="Max width (px)">
        <input className={inp} value={p.maxWidth} placeholder="No limit" onChange={(e) => u("maxWidth", e.target.value.replace(/[^0-9]/g, ""))} />
      </Field>
      <Field label="Background">
        <ColorDot value={p.bg} fallback="transparent" onChange={(v) => u("bg", v)} className="w-full h-7 rounded border border-slate-200" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Padding">
          <input className={inp} value={p.pad} placeholder="e.g. 24px" onChange={(e) => u("pad", e.target.value)} />
        </Field>
        <Field label="Radius (px)">
          <input className={inp} value={p.rad} onChange={(e) => u("rad", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </div>
    </div>
  );
}

function BusinessInfoSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const parts = String(p.show ?? "address,phone,email,hours").split(",").filter(Boolean);
  const toggle = (key: string, on: boolean) => u("show", (on ? [...parts.filter((x) => x !== key), key] : parts.filter((x) => x !== key)).join(","));
  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-400">
        The details come from <strong>SEO → Local SEO</strong>; edit them there once and every Business Info block updates.
      </p>
      <Field label="Heading">
        <input className={sel} defaultValue={p.title} placeholder="e.g. Visit us" onBlur={(e) => u("title", e.target.value)} />
      </Field>
      <Field label="Show">
        <div className="space-y-1.5">
          {[["address", "Address"], ["phone", "Phone"], ["email", "Email"], ["hours", "Opening hours"], ["map", "Map"]].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={parts.includes(k)} onChange={(e) => toggle(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Layout">
        <ToggleRow value={p.layout || "stack"} onChange={(v) => u("layout", v)}
          options={[{ value: "stack", label: "Stacked" }, { value: "columns", label: "Two columns" }]} />
      </Field>
      {parts.includes("map") && (
        <Field label="Map height (px)">
          <input className={inp} value={p.mapHeight || "260"} onChange={(e) => u("mapHeight", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      )}
    </div>
  );
}

function StarRatingSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rating">
          <input className={inp} value={p.value || "4.5"} onChange={(e) => u("value", e.target.value.replace(/[^0-9.]/g, ""))} />
        </Field>
        <Field label="Out of">
          <input className={inp} value={p.max || "5"} onChange={(e) => u("max", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size (px)">
          <input className={inp} value={p.size || "22"} onChange={(e) => u("size", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Colour">
          <ColorDot value={p.color} fallback="#f59e0b" onChange={(v) => u("color", v)} className="w-full h-7 rounded border border-slate-200" />
        </Field>
      </div>
      <Field label="Label">
        <input className={sel} defaultValue={p.label} placeholder="e.g. 128 reviews" onBlur={(e) => u("label", e.target.value)} />
      </Field>
      <Field label="Alignment">
        <ToggleRow value={p.align || "left"} onChange={(v) => u("align", v)}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      </Field>
    </div>
  );
}

function PricingTableSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Repeater
        label="Plans"
        addLabel="Add plan"
        value={p.plans || "[]"}
        onChange={(v) => u("plans", v)}
        blank={() => ({ name: "Plan", price: "$0", period: "/mo", features: "", cta: "Choose", url: "#", featured: false })}
        render={(row, patch) => (
          <>
            <input className={sel} value={row.name as string} placeholder="Plan name"
              onChange={(e) => patch({ name: e.target.value })} />
            <div className="grid grid-cols-2 gap-1.5">
              <input className={sel} value={row.price as string} placeholder="$9"
                onChange={(e) => patch({ price: e.target.value })} />
              <input className={sel} value={(row.period as string) ?? ""} placeholder="/mo"
                onChange={(e) => patch({ period: e.target.value })} />
            </div>
            <textarea className={`${sel} resize-none`} rows={3} value={(row.features as string) ?? ""}
              placeholder="One feature per line" onChange={(e) => patch({ features: e.target.value })} />
            <div className="grid grid-cols-2 gap-1.5">
              <input className={sel} value={(row.cta as string) ?? ""} placeholder="Button text"
                onChange={(e) => patch({ cta: e.target.value })} />
              <input className={sel} value={(row.url as string) ?? ""} placeholder="Button link"
                onChange={(e) => patch({ url: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                checked={!!row.featured} onChange={(e) => patch({ featured: e.target.checked } as never)} />
              Highlight this plan
            </label>
          </>
        )}
      />
      <Field label="Columns">
        <select className={sel} value={p.columns || "3"} onChange={(e) => u("columns", e.target.value)}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
    </div>
  );
}

function TeamMemberSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <ImageField label="Photo" value={p.photo || ""} onChange={(v) => u("photo", v)} />
      <Field label="Name">
        <input className={sel} defaultValue={p.name} placeholder="Full name" onBlur={(e) => u("name", e.target.value)} />
      </Field>
      <Field label="Role">
        <input className={sel} defaultValue={p.role} placeholder="Job title" onBlur={(e) => u("role", e.target.value)} />
      </Field>
      <Field label="Bio">
        <textarea className={`${sel} resize-none`} rows={3} defaultValue={p.bio} placeholder="Short bio…"
          onBlur={(e) => u("bio", e.target.value)} />
      </Field>
      <Repeater
        label="Links"
        addLabel="Add link"
        value={p.links || "[]"}
        onChange={(v) => u("links", v)}
        blank={() => ({ network: "linkedin", url: "" })}
        render={(row, patch) => (
          <>
            <NetworkSelect value={row.network as string} onChange={(v) => patch({ network: v })} />
            <input className={sel} value={row.url as string} placeholder="URL or @handle"
              onChange={(e) => patch({ url: e.target.value })} />
          </>
        )}
      />
      <Field label="Layout">
        <ToggleRow value={p.layout || "stacked"} onChange={(v) => u("layout", v)}
          options={[{ value: "stacked", label: "Stacked" }, { value: "side", label: "Side by side" }]} />
      </Field>
      <Field label="Photo shape">
        <ToggleRow value={p.shape || "circle"} onChange={(v) => u("shape", v)}
          options={[{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }]} />
      </Field>
      <Field label="Alignment">
        <ToggleRow value={p.align || "center"} onChange={(v) => u("align", v)}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
      </Field>
    </div>
  );
}

function ShowMoreSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <Field label="Text">
        <textarea className={`${sel} resize-none`} rows={7} defaultValue={p.text}
          placeholder="The full text. Everything stays in the page for search engines — only the height is clipped."
          onBlur={(e) => u("text", e.target.value)} />
      </Field>
      <Field label="Collapsed height (px)">
        <input className={inp} value={p.height || "160"} onChange={(e) => u("height", e.target.value.replace(/[^0-9]/g, ""))} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Expand label">
          <input className={sel} defaultValue={p.moreLabel} placeholder="Show more" onBlur={(e) => u("moreLabel", e.target.value)} />
        </Field>
        <Field label="Collapse label">
          <input className={sel} defaultValue={p.lessLabel} placeholder="Show less" onBlur={(e) => u("lessLabel", e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
        <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
          checked={p.fade !== "false"} onChange={(e) => u("fade", String(e.target.checked))} />
        Fade the clipped edge
      </label>
    </div>
  );
}

function HtmlEmbedSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-3">
      <Field label="HTML">
        <textarea className={`${sel} resize-none font-mono text-[11px]`} rows={10} defaultValue={p.html}
          placeholder="<iframe src=… ></iframe>" onBlur={(e) => u("html", e.target.value)} />
      </Field>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        This markup is inserted into the page exactly as written. Only paste code you trust — it runs with
        the same access as the rest of your site.
      </p>
    </div>
  );
}

function ImageCompareSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  return (
    <div className="p-4 space-y-4">
      <ImageField label="Before image" value={p.before || ""} onChange={(v) => u("before", v)} />
      <ImageField label="After image" value={p.after || ""} onChange={(v) => u("after", v)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Before label">
          <input className={sel} defaultValue={p.beforeLabel} placeholder="Before" onBlur={(e) => u("beforeLabel", e.target.value)} />
        </Field>
        <Field label="After label">
          <input className={sel} defaultValue={p.afterLabel} placeholder="After" onBlur={(e) => u("afterLabel", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start position (%)">
          <input className={inp} value={p.start || "50"} onChange={(e) => u("start", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Radius (px)">
          <input className={inp} value={p.radius || "10"} onChange={(e) => u("radius", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Use two images the same size, or the slider will not line up.
      </p>
    </div>
  );
}

function PostGridSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => setCats(d.categories ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-4 space-y-4">
      <Field label="Heading">
        <input className={sel} defaultValue={p.heading} placeholder="e.g. Latest posts" onBlur={(e) => u("heading", e.target.value)} />
      </Field>
      <Field label="Category">
        <select className={sel} value={p.categoryId || ""} onChange={(e) => u("categoryId", e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="How many">
          <input className={inp} value={p.count || "3"} onChange={(e) => u("count", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Columns">
          <select className={sel} value={p.columns || "3"} onChange={(e) => u("columns", e.target.value)}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Order">
        <select className={sel} value={p.orderBy || "recent"} onChange={(e) => u("orderBy", e.target.value)}>
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">By title</option>
        </select>
      </Field>
      <div className="space-y-1.5">
        {[
          ["showImage", "Featured image"],
          ["showDate", "Date"],
          ["showExcerpt", "Excerpt"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
              checked={p[key] !== "false"} onChange={(e) => u(key, String(e.target.checked))} />
            Show {label.toLowerCase()}
          </label>
        ))}
      </div>
    </div>
  );
}

function ContactFormSettings({ p, u }: { p: Record<string, string>; u: (k: string, v: string) => void }) {
  // An empty prop means "use the defaults"; materialise them on first edit so
  // the repeater has something concrete to work with.
  const fieldsJson = p.fields && p.fields.trim() ? p.fields : JSON.stringify(DEFAULT_FIELDS);

  return (
    <div className="p-4 space-y-4">
      <Field label="Form name">
        <input className={sel} defaultValue={p.formName} placeholder="Contact"
          onBlur={(e) => u("formName", e.target.value)} />
      </Field>
      <p className="text-[11px] text-slate-400 -mt-2 leading-snug">
        Shown in the Forms inbox, so several forms can be told apart.
      </p>

      <Repeater
        label="Fields"
        addLabel="Add field"
        value={fieldsJson}
        onChange={(v) => u("fields", v)}
        blank={() => ({ name: "", label: "New field", type: "text", required: false, placeholder: "", options: "", half: false })}
        render={(row, patch) => (
          <>
            <input className={sel} value={row.label as string} placeholder="Label"
              onChange={(e) => patch({ label: e.target.value })} />
            <div className="grid grid-cols-2 gap-1.5">
              <select className={sel} value={row.type as string} onChange={(e) => patch({ type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input className={sel} value={(row.name as string) ?? ""} placeholder="key (auto)"
                onChange={(e) => patch({ name: e.target.value })}
                onBlur={(e) => patch({ name: fieldKey(e.target.value || (row.label as string), 0) })} />
            </div>
            {row.type !== "checkbox" && (
              <input className={sel} value={(row.placeholder as string) ?? ""} placeholder="Placeholder"
                onChange={(e) => patch({ placeholder: e.target.value })} />
            )}
            {row.type === "select" && (
              <textarea className={`${sel} resize-none`} rows={3} value={(row.options as string) ?? ""}
                placeholder="One choice per line" onChange={(e) => patch({ options: e.target.value })} />
            )}
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                  checked={!!row.required} onChange={(e) => patch({ required: e.target.checked } as never)} />
                Required
              </label>
              {row.type !== "textarea" && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300"
                    checked={!!row.half} onChange={(e) => patch({ half: e.target.checked } as never)} />
                  Half width
                </label>
              )}
            </div>
          </>
        )}
      />

      <Field label="Button text">
        <input className={sel} defaultValue={p.submitLabel} placeholder="Send message"
          onBlur={(e) => u("submitLabel", e.target.value)} />
      </Field>
      <Field label="Thank-you message">
        <textarea className={`${sel} resize-none`} rows={2} defaultValue={p.successMessage}
          placeholder="Thanks — your message has been sent."
          onBlur={(e) => u("successMessage", e.target.value)} />
      </Field>
      <Field label="Or redirect to">
        <input className={sel} defaultValue={p.redirectUrl} placeholder="/thank-you"
          onBlur={(e) => u("redirectUrl", e.target.value)} />
      </Field>
      <p className="text-[11px] text-slate-400 -mt-2 leading-snug">
        A redirect replaces the thank-you message.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Max width (px)">
          <input className={inp} value={p.width || "640"}
            onChange={(e) => u("width", e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="Alignment">
          <select className={sel} value={p.align || "left"} onChange={(e) => u("align", e.target.value)}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
        Submissions arrive in <span className="font-medium text-slate-500">Forms</span> in the sidebar.
        A hidden field and a minimum fill time block most bots — no captcha needed.
      </p>
    </div>
  );
}

/* ── Spacing & visibility, shared by every block ──────────────────────────── */

/**
 * One control set for all blocks, rather than each block redeclaring spacing.
 * Values live in a single `bx` JSON prop; empty means "inherit the breakpoint
 * above", which is what the CSS fallback chain expects.
 *
 * Writing through `upgradeBox` means the first edit of an old block quietly
 * migrates its top/bottom-only spacing onto the four-sided keys — no backfill.
 */
function BoxSettings({ p, u, active }: { p: Record<string, string>; u: (k: string, v: string) => void; active: ActiveBlock }) {
  const { device } = useDevice();
  const box = parseBox(p.bx);

  const write = (patch: Partial<BlockBox>) => {
    const next = { ...upgradeBox(box), ...patch };
    // Drop empties so the stored JSON stays small and "unset" is unambiguous.
    for (const k of Object.keys(next) as (keyof BlockBox)[]) {
      const v = next[k];
      if (v === "" || v === undefined || v === false) delete next[k];
    }
    u("bx", Object.keys(next).length ? JSON.stringify(next) : "");
  };

  const hideKey = device === "d" ? "hd" : device === "t" ? "ht" : "hm";
  const hidden = !!box[hideKey as keyof BlockBox];
  const deviceName = DEVICES.find((d) => d.id === device)!.title.toLowerCase();

  return (
    <>
      <PanelSection label="Spacing" defaultOpen>
        <ResponsiveBox
          label="Padding"
          value={serializeSides(boxPadding(box))}
          onChange={(v) => write({ pad: v })}
          min={0}
          units={SPACING_UNITS}
        />
        <ResponsiveBox
          label="Margin"
          value={serializeSides(boxMargin(box))}
          onChange={(v) => write({ mar: v })}
          units={SPACING_UNITS}
        />
        <p className="text-[10px] leading-relaxed text-slate-400">
          Leave a field empty to inherit the wider breakpoint — its placeholder shows what you&apos;ll get.
        </p>
      </PanelSection>

      <PanelSection label="Visibility &amp; hover">
        <Field label="Hover effect">
          <select className={sel} value={box.hv ?? ""} onChange={(e) => write({ hv: e.target.value })}>
            {HOVER_EFFECTS.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
        </Field>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300"
              checked={hidden}
              onChange={(e) => write({ [hideKey]: e.target.checked || undefined } as Partial<BlockBox>)}
            />
            Hide on {deviceName}
          </label>
          <span className="ml-auto">
            <DeviceToggle compact />
          </span>
        </div>
      </PanelSection>

      <PanelSection label="Animate on scroll">
        <Field label="Animation">
          <select className={sel} value={box.an ?? ""} onChange={(e) => write({ an: e.target.value })}>
            {SCROLL_ANIMATIONS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
        {box.an && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Duration (ms)">
                <input type="number" className={inp} placeholder="600" defaultValue={box.anD ?? ""} onBlur={(e) => write({ anD: e.target.value })} />
              </Field>
              <Field label="Delay (ms)">
                <input type="number" className={inp} placeholder="0" defaultValue={box.anL ?? ""} onBlur={(e) => write({ anL: e.target.value })} />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300"
                checked={box.anR === "1"}
                onChange={(e) => write({ anR: e.target.checked ? "1" : undefined })}
              />
              Replay every time it scrolls into view
            </label>
            <p className="text-[10px] leading-relaxed text-slate-400">
              Skipped entirely for visitors who ask for reduced motion.
            </p>
          </>
        )}
      </PanelSection>

      <ConditionalDisplaySection box={box} write={write} />
      <BlockDefaultsSection active={active} />
    </>
  );
}

/* -- Conditional display -------------------------------------------------- */

function ConditionalDisplaySection({
  box, write,
}: {
  box: BlockBox;
  write: (patch: Partial<BlockBox>) => void;
}) {
  const rules = parseConditions(box.cd) ?? { mode: "show" as const, match: "and" as const, rules: [] };
  const save = (next: typeof rules) => write({ cd: serializeConditions(next) || undefined });

  const setRule = (i: number, patch: Partial<DisplayCondition>) => {
    save({ ...rules, rules: rules.rules.map((r, n) => (n === i ? { ...r, ...patch } : r)) });
  };

  return (
    <PanelSection label="Conditional display">
      {rules.rules.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-slate-400">
          Always shown. Add a rule to limit who sees this block.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Then">
              <select className={sel} value={rules.mode} onChange={(e) => save({ ...rules, mode: e.target.value as "show" | "hide" })}>
                <option value="show">Show block</option>
                <option value="hide">Hide block</option>
              </select>
            </Field>
            <Field label="When">
              <select className={sel} value={rules.match} onChange={(e) => save({ ...rules, match: e.target.value as "and" | "or" })}>
                <option value="and">All rules match</option>
                <option value="or">Any rule matches</option>
              </select>
            </Field>
          </div>

          <div className="space-y-2">
            {rules.rules.map((rule, i) => (
              <div key={i} className="rounded border border-slate-200 p-2">
                <div className="flex items-center gap-1.5">
                  <select
                    className={`${sel} flex-1`}
                    value={rule.k}
                    onChange={(e) => setRule(i, { k: e.target.value as DisplayCondition["k"], v: "" })}
                  >
                    {CONDITION_KINDS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="Remove this rule"
                    onClick={() => save({ ...rules, rules: rules.rules.filter((_, n) => n !== i) })}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    X
                  </button>
                </div>
                {rule.k === "role" && (
                  <input
                    className={`${sel} mt-1.5`}
                    placeholder="Any role, or admin / editor"
                    defaultValue={rule.v ?? ""}
                    onBlur={(e) => setRule(i, { v: e.target.value })}
                  />
                )}
                {(rule.k === "after" || rule.k === "before") && (
                  <input
                    type="datetime-local"
                    className={`${sel} mt-1.5`}
                    defaultValue={rule.v ?? ""}
                    onChange={(e) => setRule(i, { v: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => save({ ...rules, rules: [...rules.rules, { k: "login" }] })}
        className="btn-secondary w-full text-xs"
      >
        + Add rule
      </button>
      <p className="text-[10px] leading-relaxed text-slate-400">
        Checked on the server, so a hidden block is left out of the page rather than
        hidden inside it, and never reaches the browser or a search engine.
      </p>
    </PanelSection>
  );
}

/* -- Block defaults ------------------------------------------------------- */

function BlockDefaultsSection({ active }: { active: ActiveBlock }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasDefault, setHasDefault] = useState(false);

  useEffect(() => {
    loadBlockDefaults().then(() => setHasDefault(hasBlockDefault(active.type)));
  }, [active.type]);

  const run = async (fn: () => Promise<void>) => {
    setState("saving");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the block default.");
      setState("error");
      setTimeout(() => setState("idle"), 4000);
      return;
    }
    setHasDefault(hasBlockDefault(active.type));
    setState("saved");
    setTimeout(() => setState("idle"), 1800);
  };

  return (
    <PanelSection label="Block defaults">
      <p className="text-[11px] leading-relaxed text-slate-400">
        Stores these settings as the starting point for every new{" "}
        {blockMeta(active.type).label} block. Blocks already on the page are untouched.
      </p>
      <button
        type="button"
        disabled={state === "saving"}
        onClick={() => run(() => saveBlockDefault(active.type, active.props))}
        className="btn-secondary w-full text-xs disabled:opacity-60"
      >
        {state === "saving" ? "Saving..." : state === "saved" ? "Saved as default" : state === "error" ? "Could not save" : "Save as default"}
      </button>
      {state === "error" && error && (
        <p className="text-[11px] leading-relaxed text-amber-600 mt-1">{error}</p>
      )}
      {hasDefault && (
        <button
          type="button"
          onClick={() => run(() => clearBlockDefault(active.type))}
          className="w-full text-[11px] text-slate-400 transition-colors hover:text-red-600"
        >
          Clear saved default
        </button>
      )}
    </PanelSection>
  );
}

export default function BlockPanel() {
  const [active, setActive] = useState<ActiveBlock | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let prevId: string | null = null;
    return subscribeActiveBlock((block) => {
      setActive(block);
      // Only remount (refresh uncontrolled inputs) when switching to a different block.
      if (block?.id !== prevId) {
        setResetKey((k) => k + 1);
        prevId = block?.id ?? null;
      }
    });
  }, []);

  if (!active) {
    return (
      <div className="p-6 text-center text-slate-400">
        <div className="text-3xl mb-3 opacity-40">⊞</div>
        <p className="text-sm font-medium">Block Settings</p>
        <p className="text-xs mt-1">Click any block in the editor to configure it</p>
      </div>
    );
  }

  const u = (k: string, v: string) => updateActiveBlockProp(k, v);
  const p = active.props;

  const meta = blockMeta(active.type);
  // A Section has no library entry, so the block-meta name is the fallback
  // rather than the raw type string.
  const label = BLOCK_LABELS[active.type] ?? BUILTIN_LABELS[active.type] ?? meta.label;
  // Headings share a type, so match the label first: "Heading 2" and "Heading 3"
  // describe themselves differently.
  const hint =
    (BLOCK_LIBRARY.find((b) => b.label === label) ?? BLOCK_LIBRARY.find((b) => b.type === active.type))?.hint ??
    BUILTIN_HINTS[active.type];

  const settings: Record<string, React.ReactNode> = {
    button: <ButtonSettings p={p} u={u} />,
    spacer: <SpacerSettings p={p} u={u} />,
    infoBox: <InfoBoxSettings p={p} u={u} />,
    progressBar: <ProgressBarSettings p={p} u={u} />,
    countUp: <CountUpSettings p={p} u={u} />,
    countdown: <CountdownSettings p={p} u={u} />,
    appInfo: <AppInfoSettings p={p} u={u} />,
    plugin: <PluginSettings p={p} u={u} />,
    testimonial: <TestimonialSettings p={p} u={u} />,
    videoEmbed: <VideoEmbedSettings p={p} u={u} />,
    googleMap: <GoogleMapSettings p={p} u={u} />,
    accordion: <AccordionSettings p={p} u={u} id={active.id} />,
    tabs: <TabsSettings p={p} u={u} />,
    iconList: <IconListSettings p={p} u={u} id={active.id} />,
    tableOfContents: <TableOfContentsSettings p={p} u={u} />,
    splitContent: <SplitContentSettings p={p} u={u} />,
    rowLayout: <RowLayoutSettings p={p} u={u} id={active.id} />,
    section: <SectionSettings p={p} u={u} />,
    callout: <CalloutSettings p={p} u={u} />,
    textAdvanced: <TextAdvancedSettings p={p} u={u} />,
    imageAdvanced: <ImageAdvancedSettings p={p} u={u} />,
    tableAdvanced: <TableAdvancedSettings p={p} u={u} />,
    gallery: <GallerySettings p={p} u={u} />,
    icon: <IconSettings p={p} u={u} />,
    socialIcons: <SocialIconsSettings p={p} u={u} />,
    starRating: <StarRatingSettings p={p} u={u} />,
    businessInfo: <BusinessInfoSettings p={p} u={u} />,
    authorBio: <AuthorBioSettings p={p} u={u} />,
    slider: <SliderSettings p={p} u={u} />,
    modal: <ModalSettings p={p} u={u} />,
    lottie: <LottieSettings p={p} u={u} />,
    timeline: <TimelineSettings p={p} u={u} />,
    iframeEmbedAdvanced: <IframeEmbedSettings p={p} u={u} />,
    stepsGrid: <StepsGridSettings p={p} u={u} />,
    highlightPanel: <HighlightPanelSettings p={p} u={u} />,
    hero: <HeroSettings p={p} u={u} />,
    ctaBand: <CtaBandSettings p={p} u={u} />,
    cardGrid: <CardGridSettings p={p} u={u} />,
    statsStrip: <StatsStripSettings p={p} u={u} />,
    prosCons: <ProsConsSettings p={p} u={u} />,
    callBar: <CallBarSettings p={p} u={u} />,
    logoStrip: <LogoStripSettings p={p} u={u} />,
    noticeBar: <NoticeBarSettings p={p} u={u} />,
    comparisonTable: <ComparisonTableSettings p={p} u={u} />,
    versionHistory: <VersionHistorySettings p={p} u={u} />,
    linkGrid: <LinkGridSettings p={p} u={u} />,
    reviewGrid: <ReviewGridSettings p={p} u={u} />,
    priceList: <PriceListSettings p={p} u={u} />,
    keyTakeaways: <KeyTakeawaysSettings p={p} u={u} />,
    factSheet: <FactSheetSettings p={p} u={u} />,
    shareButtons: <ShareButtonsSettings p={p} u={u} />,
    downloadBox: <DownloadBoxSettings p={p} u={u} />,
    pricingTable: <PricingTableSettings p={p} u={u} />,
    teamMember: <TeamMemberSettings p={p} u={u} />,
    showMore: <ShowMoreSettings p={p} u={u} />,
    htmlEmbed: <HtmlEmbedSettings p={p} u={u} />,
    imageCompare: <ImageCompareSettings p={p} u={u} />,
    postGrid: <PostGridSettings p={p} u={u} />,
    contactForm: <ContactFormSettings p={p} u={u} />,
  };

  return (
    <DeviceProvider key={resetKey}>
      {/* Block identity: what is selected, and what it is for */}
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-5 w-7 items-center justify-center rounded text-[9px] font-bold"
            style={{ backgroundColor: meta.color + "20", color: meta.color }}
          >
            {meta.badge}
          </span>
          <span className="truncate text-xs font-semibold text-slate-700">{label}</span>
          {/* Panel-wide device switch: every control below follows it. */}
          <span className="ml-auto shrink-0">
            <DeviceToggle />
          </span>
          {/* A Section is a column, not a block — it is created and removed by
              the row's column count, so deleting it here would take the whole
              row with it. */}
          {active.type !== "section" && (
            <button
              type="button"
              onClick={() => deleteBlockById(active.id)}
              title={`Delete this ${label} block`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
      </div>
      {/* Keyed by the block, so selecting another block of the same type
          remounts the panel. Many fields are uncontrolled (defaultValue +
          onBlur); without the key, React reused them and a freshly duplicated
          or pasted block showed — and on blur wrote back — the previous
          block's text. */}
      <React.Fragment key={`${active.id}:${active.type}:${p.__index ?? ""}`}>
      {settings[active.type] ?? (
        BUILTIN_TEXT_TYPES.has(active.type) ? (
          <BuiltinTextSettings type={active.type} p={p} />
        ) : (
          <div className="p-4 text-xs text-slate-400 leading-relaxed">
            This is a <span className="font-semibold text-slate-500">{label}</span> block. Edit its text and formatting directly in the editor — use the toolbar that appears when you select text.
          </div>
        )
      )}

      {/* Only custom blocks carry the `bx` prop; built-ins have no schema slot. */}
      {"bx" in p && <BoxSettings p={p} u={u} active={active} />}
      </React.Fragment>
    </DeviceProvider>
  );
}
