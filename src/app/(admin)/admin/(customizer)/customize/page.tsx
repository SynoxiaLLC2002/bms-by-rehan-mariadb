"use client";
import ColorInput from "@/components/admin/customizer/ColorInput";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { itemLabel as headerItemLabel, footerItemLabel } from "@/lib/builderItems";
import type { DockDevice } from "@/components/admin/customizer/HeaderDock";
// Panels are loaded when they are first opened — see ./lazy.
import {
  CustomFontsManager, FooterDock, FooterPanel, HeaderDock, HeaderPanel,
  ItemPanel, MediaPicker, SearchPanel,
} from "@/components/admin/customizer/lazy";
import type { CustomizerSettings as CS } from "@/lib/appearanceSettings";
import { contentLanguages, languageName } from "@/lib/locale";
import { STRUCTURAL_KEYS } from "@/lib/siteCss";
import { migrateFooterCols, parseWidgets } from "@/lib/appearanceSettings";
import { customFontFamilies, parseCustomFonts } from "@/lib/customFonts";
import {
  CHECKED_SCRIPTS,
  customizerDefaults,
  fontLacksScript,
  fontsForScript,
  GOOGLE_FONTS,
  type CustomizerSettings,
} from "@/lib/appearanceSettings";
import { subsetForLanguage } from "@/lib/fontPreload";
import {
  X, ChevronRight, ChevronLeft, Monitor, Tablet, Smartphone, Eye, EyeOff,
  RefreshCw, Check, Palette, Layout, PanelBottom, Settings2, FileText,
  Search, BadgeInfo, Menu as MenuIcon, Home, Code2, Braces, Loader2, Gauge,
} from "lucide-react";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

type SectionId =
  | "identity" | "colors" | "header" | "footer" | "general"
  | "layout" | "search" | "menus" | "homepage" | "css" | "scripts" | "speed";

const SECTIONS: { id: SectionId; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "colors",   label: "Colors & Fonts",     icon: Palette,     hint: "Palette, typography, dark mode" },
  { id: "header",   label: "Header",             icon: Layout,      hint: "Drag-and-drop header builder" },
  { id: "footer",   label: "Footer",             icon: PanelBottom, hint: "Columns, colors, bottom bar" },
  { id: "general",  label: "General",            icon: Settings2,   hint: "Maintenance mode" },
  { id: "layout",   label: "Posts/Pages Layout", icon: FileText,    hint: "Default width and spacing" },
  { id: "search",   label: "Search Results",     icon: Search,      hint: "Results page options" },
  { id: "identity", label: "Site Identity",      icon: BadgeInfo,   hint: "Name, tagline, logo, favicon" },
  { id: "menus",    label: "Menus",              icon: MenuIcon,    hint: "Navigation items" },
  { id: "homepage", label: "Homepage Settings",  icon: Home,        hint: "What the front page shows" },
  { id: "css",      label: "Additional CSS",     icon: Braces,      hint: "Custom stylesheet" },
  { id: "scripts",  label: "Custom Scripts",     icon: Code2,       hint: "Head and body-end injection" },
  { id: "speed",    label: "Speed",              icon: Gauge,       hint: "Moved to Admin → Speed; two shortcuts remain" },
];

const BUTTON_PANELS: { id: string; label: string; hint: string }[] = [
  { id: "base",      label: "Base Button Styles", hint: "Primary buttons everywhere" },
  { id: "secondary", label: "Secondary Button",   hint: "The muted variant" },
  { id: "outline",   label: "Outline Button",     hint: "Border-only variant" },
];

const STATE_PANELS: Record<string, { id: string; label: string; hint: string }[]> = {
  header: [
    { id: "hrow-topbar",    label: "Top Row",    hint: "Layout, height, background, border" },
    { id: "hrow-main",      label: "Main Row",   hint: "Layout, height, background, border" },
    { id: "hrow-bottombar", label: "Bottom Row", hint: "Layout, height, background, border" },
    { id: "transparent", label: "Transparent Header", hint: "Floats over the page content" },
    { id: "conditional", label: "Conditional Headers", hint: "Change the header per page type" },
    { id: "sticky",      label: "Sticky Header",      hint: "Behaviour and stuck appearance" },
  ],
  footer: [
    { id: "footer-toprow",    label: "Footer Top Row",    hint: "Colours and padding" },
    { id: "footer-main",      label: "Footer Middle Row", hint: "Colours and padding" },
    { id: "footer-bottomrow", label: "Footer Bottom Row", hint: "Colours and padding" },
  ],
  general: [
    { id: "darkmode", label: "Color Switch (Dark Mode)", hint: "Mode and dark palette" },
    { id: "spacing",   label: "Block Spacing",       hint: "Default gap between blocks" },
    { id: "scrolltop", label: "Scroll to Top",       hint: "Back-to-top button" },
    { id: "reading",   label: "Reading Experience",  hint: "Progress bar and reading time" },
  ],
  colors: [
    { id: "surfaces",   label: "Backgrounds",             hint: "Site and content — colour, gradient or image" },
    { id: "typeextras", label: "Links & Font Rendering",  hint: "Link style, smoothing, font subsets" },
  ],
};

/** Sub-screens are grouped by behaviour, not by the section they hang off. */
function scopeFor(section: SectionId | null, id: string): "header" | "footer" | "identity" | "layout" | "state" | "buttons" {
  if (BUTTON_PANELS.some((p) => p.id === id) && section === "colors") return "buttons";
  if (Object.values(STATE_PANELS).some((list) => list.some((p) => p.id === id))) return "state";
  if (section === "identity") return "identity";
  if (section === "layout") return "layout";
  return section === "footer" ? "footer" : "header";
}

const LAYOUT_PANELS: { id: string; label: string; hint: string }[] = [
  { id: "page",    label: "Page Layout",        hint: "Default layout for all pages" },
  { id: "post",    label: "Single Post Layout", hint: "Default layout for single posts" },
  { id: "archive", label: "Category Pages",     hint: "Blog and category listings" },
  { id: "sidebar", label: "Sidebar Widgets",    hint: "What the sidebar shows" },
];

const IDENTITY_PANELS: { id: string; label: string; hint: string }[] = [
  { id: "title-logo", label: "Site Title and Logo", hint: "Logo, title, tagline and sizing" },
  { id: "site-icon",  label: "Site Icon",           hint: "Browser tab and bookmark icon" },
];

/** Human label for whichever sub-screen is open. */
function subPanelLabel(section: SectionId | null, id: string): string {
  if (section === "identity") return IDENTITY_PANELS.find((p) => p.id === id)?.label ?? id;
  if (section === "layout") return LAYOUT_PANELS.find((p) => p.id === id)?.label ?? id;
  const button = BUTTON_PANELS.find((p) => p.id === id);
  if (button && section === "colors") return button.label;
  for (const list of Object.values(STATE_PANELS)) {
    const hit = list.find((p) => p.id === id);
    if (hit) return hit.label;
  }
  if (section === "footer") return `Footer ${footerItemLabel(id)}`;
  // The header's Logo chip opens the identity controls, so name the screen for
  // what it edits rather than for the chip that was clicked.
  if (id === "logo") return "Site Identity";
  return `Header ${headerItemLabel(id)}`;
}

function PanelRows({
  panels, onOpen,
}: { panels: { id: string; label: string; hint: string }[]; onOpen: (id: string) => void }) {
  return (
    <>
      {panels.map((panel) => (
        <button
          key={panel.id}
          onClick={() => onOpen(panel.id)}
          className="w-full flex items-center justify-between gap-3 px-3 py-3 mb-2 border border-slate-200 rounded-lg text-left hover:bg-slate-50 hover:border-brand-300 transition-colors"
        >
          <span className="min-w-0">
            <span className="block text-sm text-slate-800">{panel.label}</span>
            <span className="block text-[11px] text-slate-400 truncate">{panel.hint}</span>
          </span>
          <ChevronRight size={14} className="text-slate-400 shrink-0" />
        </button>
      ))}
    </>
  );
}

/* ── Small control primitives ─────────────────────────────────────────────── */

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</label>
      {children}
      {help && <p className="text-[11px] text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

function TextIn({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
    />
  );
}

function TextArea({ value, onChange, rows = 8, mono, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; mono?: boolean; placeholder?: string }) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500",
        mono && "font-mono text-xs leading-relaxed"
      )}
    />
  );
}

function ColorIn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <ColorInput value={value} onChange={onChange} fallback="#000000" />;
}

function SelectIn({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const on = value === "true";
  return (
    <button
      type="button"
      onClick={() => onChange(on ? "false" : "true")}
      className="w-full flex items-center justify-between py-2.5 group"
    >
      <span className="text-sm text-slate-700 group-hover:text-slate-900">{label}</span>
      <span className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", on ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function RangeIn({ value, onChange, min, max, unit }: { value: string; onChange: (v: string) => void; min: number; max: number; unit: string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={min} max={max}
        value={parseInt(value) || min}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 accent-brand-600"
      />
      <span className="text-xs font-mono text-slate-500 w-14 text-right shrink-0">{value}{unit}</span>
    </div>
  );
}

function LinkOut({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-400 hover:text-brand-700 transition-colors">
      {children}
      <ChevronRight size={14} />
    </Link>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function CustomizePage() {
  const router = useRouter();
  const [settings, setSettings] = useState<CustomizerSettings>(customizerDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<SectionId | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [hideControls, setHideControls] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [mediaTarget, setMediaTarget] = useState<null | "site_logo" | "site_favicon">(null);
  // A generic picker for controls that need any image, not a fixed setting key.
  const [imagePick, setImagePick] = useState<null | ((url: string) => void)>(null);
  const [pages, setPages] = useState<{ id: number; title: string; language?: string }[]>([]);
  const [dockDevice, setDockDevice] = useState<DockDevice>("desktop");
  const [dockOpen, setDockOpen] = useState(true);
  const [drag, setDrag] = useState<{ item: string; from: keyof CS | null } | null>(null);
  const [focusItem, setFocusItem] = useState<string | null>(null);
  // Keys touched since the last publish that CSS alone can't preview.
  const [pendingStructural, setPendingStructural] = useState<Set<string>>(new Set());
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // The keys this session actually changed. Publish sends only these: it used
  // to send the whole table as it was when the Customizer opened, so anything
  // saved elsewhere in the meantime (SEO, permalinks, the homepage choice,
  // another admin's edit) was quietly put back to the old value.
  const changedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const loaded = { ...customizerDefaults, ...d.settings };
        // Legacy footers stored columns in footer_cols; fold them into widgets
        // once so an existing footer survives the move to zone-based building.
        if (Object.keys(parseWidgets(loaded.footer_widgets)).length === 0 && loaded.footer_cols) {
          const migrated = migrateFooterCols(loaded.footer_cols);
          if (Object.keys(migrated).length > 0) {
            loaded.footer_widgets = JSON.stringify(migrated);
            const ids = Object.keys(migrated);
            loaded.footer_main_left = JSON.stringify(ids.slice(0, 1));
            loaded.footer_main_center = JSON.stringify(ids.slice(1, 2));
            loaded.footer_main_right = JSON.stringify(ids.slice(2));
            for (const k of ["footer_widgets", "footer_main_left", "footer_main_center", "footer_main_right"]) changedRef.current.add(k);
          }
        }
        setSettings(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/pages")
      .then((r) => r.json())
      .then((d) => setPages(d.pages ?? []))
      .catch(() => {});
  }, []);

  function set(key: keyof CustomizerSettings, value: string) {
    setSettings((p) => ({ ...p, [key]: value }));
    changedRef.current.add(key as string);
    setDirty(true);
    if (STRUCTURAL_KEYS.has(key as string)) {
      setPendingStructural((prev) => new Set(prev).add(key as string));
    }
  }

  // Push the draft into the preview iframe so changes show without publishing.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { __bms: "preview", settings },
        window.location.origin
      );
    }, 60);
    return () => clearTimeout(t);
  }, [settings, loading]);

  // The iframe announces itself on load; send it the current draft straight away.
  useEffect(() => {
    function onReady(e: MessageEvent) {
      if (loading) return; // the load effect will push as soon as settings arrive
      if (e.origin !== window.location.origin || e.data?.__bms !== "ready") return;
      iframeRef.current?.contentWindow?.postMessage(
        { __bms: "preview", settings },
        window.location.origin
      );
    }
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [settings, loading]);

  async function publish() {
    setSaving(true);
    const sent = [...changedRef.current];
    const body = Object.fromEntries(sent.map((k) => [k, (settings as unknown as Record<string, string>)[k] ?? ""]));
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      // Said out loud: a refused publish used to leave the button lit and
      // nothing else, which reads as "it worked".
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "Could not publish — your changes are still here. Try again.");
      return;
    }
    if (res.ok) {
      for (const k of sent) changedRef.current.delete(k);
      setDirty(false);
      setPendingStructural(new Set());
      setPreviewKey((k) => k + 1); // reload preview so it reflects what was just saved
    }
  }

  /** Open a sub-screen, moving to its owning section when it has one. */
  function openSubPanel(id: string) {
    if (IDENTITY_PANELS.some((p) => p.id === id)) setSection("identity");
    setFocusItem(id);
  }

  const current = SECTIONS.find((s) => s.id === section);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* ── Control panel ── */}
      <aside
        className={cn(
          "bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300",
          hideControls ? "w-0 overflow-hidden" : "w-[360px]"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <button
            onClick={() => router.push("/admin")}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            title="Close customizer"
          >
            <X size={18} />
          </button>
          <button
            onClick={publish}
            disabled={saving || !dirty}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2",
              dirty ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-slate-100 text-slate-400 cursor-default"
            )}
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : dirty ? "Publish"
              : <><Check size={14} /> Published</>}
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 shrink-0">
          <p className="text-[11px] text-slate-400">You are customizing</p>
          <p className="text-sm font-semibold text-slate-900 truncate">
            {settings.site_name || "Your site"}
          </p>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400 gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading settings…
          </div>
        ) : section === null ? (
          <div className="flex-1 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSection(s.id); setFocusItem(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors group"
              >
                <s.icon size={16} className="text-slate-400 group-hover:text-brand-600 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800">{s.label}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{s.hint}</span>
                </span>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {focusItem ? (
              <button
                onClick={() => setFocusItem(null)}
                className="flex items-start gap-2 px-4 py-2 border-b border-slate-200 text-left hover:bg-slate-50 shrink-0"
              >
                <ChevronLeft size={15} className="mt-2.5 text-slate-400 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[11px] text-slate-400">Customizing › {current?.label}</span>
                  <span className="block text-sm font-medium text-slate-800 truncate">
                    {subPanelLabel(section, focusItem)}
                  </span>
                </span>
              </button>
            ) : (
              <button
                onClick={() => { setSection(null); setFocusItem(null); }}
                className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 shrink-0"
              >
                <ChevronLeft size={15} /> {current?.label}
              </button>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              {focusItem ? (
                <ItemPanel
                  scope={scopeFor(section, focusItem)}
                  id={focusItem}
                  label={subPanelLabel(section, focusItem)}
                  s={settings}
                  set={set}
                  openMedia={setMediaTarget}
                  pickImage={(apply) => setImagePick(() => apply)}
                  onOpen={openSubPanel}
                />
              ) : (
              <SectionBody
                id={section}
                s={settings}
                set={set}
                pages={pages}
                dockDevice={dockDevice}
                drag={drag}
                setDrag={setDrag}
                setFocusItem={setFocusItem}
              />
              )}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 px-3 py-2 flex items-center justify-between shrink-0">
          <button
            onClick={() => setHideControls(true)}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1"
          >
            <EyeOff size={13} /> Hide Controls
          </button>
          <div className="flex items-center gap-0.5">
            {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                title={d}
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
                  device === d ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                )}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Live preview ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-11 bg-white border-b border-slate-200 flex items-center gap-3 px-4 shrink-0">
          {hideControls && (
            <button
              onClick={() => setHideControls(false)}
              className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800 shrink-0"
            >
              <Eye size={13} /> Show Controls
            </button>
          )}
          <span className="text-xs text-slate-400 font-mono truncate">Site preview</span>
          {pendingStructural.size > 0 ? (
            <span className="text-[11px] text-amber-600 font-medium shrink-0">
              Layout changes need Publish to appear in the preview
            </span>
          ) : dirty ? (
            <span className="text-[11px] text-emerald-600 font-medium shrink-0">
              Live preview — Publish to make it permanent
            </span>
          ) : null}
          <button
            onClick={() => setPreviewKey((k) => k + 1)}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800 shrink-0"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex justify-center min-h-0">
          <iframe
            ref={iframeRef}
            key={previewKey}
            src={section === "search" ? "/preview/customizer?view=search" : "/preview/customizer"}
            title="Site preview"
            className="bg-white shadow-lg rounded-lg border border-slate-200 h-full transition-all duration-300"
            style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}
          />
        </div>

        {(section === "header" || section === "footer") && (
          dockOpen ? (
            section === "header" ? (
              <HeaderDock
              s={settings}
              set={set}
              device={dockDevice}
              setDevice={setDockDevice}
              onHide={() => setDockOpen(false)}
              onConfigureItem={setFocusItem}
                drag={drag}
                setDrag={setDrag}
              />
            ) : (
              <FooterDock
                s={settings}
                set={set}
                onHide={() => setDockOpen(false)}
                onConfigureItem={setFocusItem}
                drag={drag}
                setDrag={setDrag}
              />
            )
          ) : (
            <button
              onClick={() => setDockOpen(true)}
              className="shrink-0 border-t border-slate-300 bg-slate-100 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
            >
              Show {section} builder
            </button>
          )
        )}
      </main>

      {imagePick && (
        <MediaPicker
          onSelect={(url) => { imagePick(url); setImagePick(null); }}
          onClose={() => setImagePick(null)}
        />
      )}

      {mediaTarget && (
        <MediaPicker
          onSelect={(url) => {
            // Safari and several bookmark/tab surfaces silently drop a WebP or
            // AVIF favicon — the browser just keeps the previous icon, which
            // reads as "the upload didn't work" with nothing to debug from.
            // PNG/ICO/JPG are universally supported, so only the icon target
            // gets warned; the logo has no such constraint.
            if (mediaTarget === "site_favicon" && /\.(webp|avif)(\?|$)/i.test(url)) {
              const proceed = window.confirm(
                "This image is a WebP/AVIF file. Some browsers (notably Safari) " +
                "won't display a WebP site icon in the tab or bookmarks — use a " +
                "PNG or ICO instead for the safest result.\n\nUse it anyway?"
              );
              if (!proceed) { setMediaTarget(null); return; }
            }
            set(mediaTarget, url);
          }}
          onClose={() => setMediaTarget(null)}
        />
      )}
    </div>
  );
}

/* ── Section bodies ───────────────────────────────────────────────────────── */

function SectionBody({
  id, s, set, pages, dockDevice, drag, setDrag, setFocusItem,
}: {
  id: SectionId;
  s: CustomizerSettings;
  set: (k: keyof CustomizerSettings, v: string) => void;
  pages: { id: number; title: string; language?: string }[];
  dockDevice: DockDevice;
  drag: { item: string; from: keyof CS | null } | null;
  setDrag: (d: { item: string; from: keyof CS | null } | null) => void;
  setFocusItem: (id: string | null) => void;
}) {
  const fontOpts = [
    ...customFontFamilies(parseCustomFonts(s.custom_fonts)).map((f) => ({ value: f, label: `${f} (uploaded)` })),
    ...GOOGLE_FONTS.map((f) => {
      // "Cairo — Arabic": findable by the script it is for.
      const draws = Object.keys(CHECKED_SCRIPTS).filter((sc) => !fontLacksScript(f, sc)).map((sc) => CHECKED_SCRIPTS[sc]);
      return { value: f, label: draws.length ? `${f} — ${draws.join(", ")}` : f };
    }),
  ];

  switch (id) {
    case "identity":
      return (
        <>
          {IDENTITY_PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setFocusItem(panel.id)}
              className="w-full flex items-center justify-between gap-3 px-3 py-3 mb-2 border border-slate-200 rounded-lg text-left hover:bg-slate-50 hover:border-brand-300 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm text-slate-800">{panel.label}</span>
                <span className="block text-[11px] text-slate-400 truncate">{panel.hint}</span>
              </span>
              <ChevronRight size={14} className="text-slate-400 shrink-0" />
            </button>
          ))}
        </>
      );

    case "colors":
      return (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Palette</p>
          <Field label="Primary"><ColorIn value={s.color_primary} onChange={(v) => set("color_primary", v)} /></Field>
          <Field label="Secondary"><ColorIn value={s.color_secondary} onChange={(v) => set("color_secondary", v)} /></Field>
          <Field label="Accent"><ColorIn value={s.color_accent} onChange={(v) => set("color_accent", v)} /></Field>
          <Field label="Body Text"><ColorIn value={s.color_text} onChange={(v) => set("color_text", v)} /></Field>
          <Field label="Headings"><ColorIn value={s.color_heading} onChange={(v) => set("color_heading", v)} /></Field>
          <Field label="Background"><ColorIn value={s.color_bg} onChange={(v) => set("color_bg", v)} /></Field>
          {/* Writes `dark_bg`, the key `darkModeCss` actually reads.
              This control wrote `color_bg_dark`, which nothing on the site has
              ever read — so picking a dark background here changed the colour
              in the picker and nothing else. The Dark Mode panel's own
              Background field always edited the working key; this is the same
              setting, reachable from the screen where you would look for it. */}
          <Field label="Dark Background"><ColorIn value={s.dark_bg} onChange={(v) => set("dark_bg", v)} /></Field>
          <Field label="Dark Mode">
            <SelectIn value={s.dark_mode} onChange={(v) => set("dark_mode", v)} options={[
              { value: "off", label: "Off" },
              { value: "toggle", label: "Visitor toggle" },
              { value: "system", label: "Follow system" },
            ]} />
          </Field>

          <div className="h-px bg-slate-200 my-5" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Typography</p>
          <Field label="Heading Font"><SelectIn value={s.font_heading} onChange={(v) => set("font_heading", v)} options={fontOpts} /></Field>
          <Field label="Body Font"><SelectIn value={s.font_body} onChange={(v) => set("font_body", v)} options={fontOpts} /></Field>
          <FontScriptWarning s={s} />
          <CustomFontsManager value={s.custom_fonts} onChange={(v) => set("custom_fonts", v)} />
          <Field label="Base Font Size"><RangeIn value={s.font_size_base} onChange={(v) => set("font_size_base", v)} min={12} max={24} unit="px" /></Field>
          <Field label="Heading Weight">
            <SelectIn value={s.font_weight_heading} onChange={(v) => set("font_weight_heading", v)} options={[
              { value: "500", label: "Medium (500)" },
              { value: "600", label: "Semibold (600)" },
              { value: "700", label: "Bold (700)" },
              { value: "800", label: "Extrabold (800)" },
            ]} />
          </Field>
          <Field label="Body Line Height"><TextIn value={s.line_height_body} onChange={(v) => set("line_height_body", v)} /></Field>

          <div className="h-px bg-slate-200 my-5" />
          <PanelRows panels={STATE_PANELS.colors} onOpen={setFocusItem} />

          <div className="h-px bg-slate-200 my-5" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Buttons</p>
          <PanelRows panels={BUTTON_PANELS} onOpen={setFocusItem} />
        </>
      );

    case "header":
      return (
        <HeaderPanel
          s={s}
          set={set}
          device={dockDevice}
          drag={drag}
          setDrag={setDrag}
          onFocusItem={setFocusItem}
        />
      );

    case "footer":
      return (
        <FooterPanel
          s={s}
          set={set}
          drag={drag}
          setDrag={setDrag}
          onFocusItem={setFocusItem}
        />
      );

    case "general":
      return (
        <>
          <Toggle label="Maintenance mode" value={s.maintenance_mode} onChange={(v) => set("maintenance_mode", v)} />
          <p className="text-[11px] text-slate-400 mb-4">
            Visitors see a holding page; logged-in admins still see the site.
          </p>
          <Field label="Title"><TextIn value={s.maintenance_title} onChange={(v) => set("maintenance_title", v)} /></Field>
          <Field label="Message"><TextArea rows={3} value={s.maintenance_message} onChange={(v) => set("maintenance_message", v)} /></Field>
          <Field label="Background"><ColorIn value={s.maintenance_bg_color} onChange={(v) => set("maintenance_bg_color", v)} /></Field>

          <div className="h-px bg-slate-200 my-5" />
          <PanelRows panels={STATE_PANELS.general} onOpen={setFocusItem} />
        </>
      );

    case "homepage": {
      // One picker per content language. Each offers only that language's own
      // pages: content is not shared, so a French homepage has to be a French
      // page — you write it from scratch rather than inheriting the English one.
      const languages = contentLanguages(s as unknown as Record<string, string>);
      const defaultLang = languages[0];
      const pagesIn = (code: string) =>
        pages.filter((p) => (p.language ?? defaultLang) === code);

      return (
        <>
          {languages.map((code) => {
            const key = code === defaultLang ? "homepage_id" : `homepage_id_${code}`;
            const options = pagesIn(code);
            return (
              <Field
                key={code}
                label={
                  languages.length > 1
                    ? `Homepage displays — ${languageName(code)}`
                    : "Homepage displays"
                }
              >
                <SelectIn
                  value={(s as unknown as Record<string, string>)[key] ?? ""}
                  onChange={(v) => set(key as keyof CustomizerSettings, v)}
                  options={[
                    { value: "", label: "Latest posts" },
                    ...options.map((p) => ({ value: String(p.id), label: `Page: ${p.title}` })),
                  ]}
                />
                {options.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    No pages in this language yet — create one under Pages, then choose it here.
                  </p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">
                  Serves at <code>{code === defaultLang ? "/" : `/${code}`}</code>. That page&apos;s own slug stops
                  deciding its URL.
                </p>
              </Field>
            );
          })}
          {/* The WordPress "Posts page": a page the owner made, whose own URL
              then lists the posts. Nothing is chosen on a fresh site, so no
              listing URL exists until someone wants one — and it is theirs to
              name, not a fixed `/blog`. */}
          {languages.map((code) => {
            const key = code === defaultLang ? "posts_page_id" : `posts_page_id_${code}`;
            const options = pagesIn(code);
            return (
              <Field
                key={`posts-${code}`}
                label={languages.length > 1 ? `Posts page — ${languageName(code)}` : "Posts page"}
              >
                <SelectIn
                  value={(s as unknown as Record<string, string>)[key] ?? ""}
                  onChange={(v) => set(key as keyof CustomizerSettings, v)}
                  options={[
                    { value: "", label: "— None —" },
                    ...options.map((p) => ({ value: String(p.id), label: `Page: ${p.title}` })),
                  ]}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  That page&apos;s URL shows your posts instead of its content, with <code>/page/2</code> and so on.
                  Leave it empty for no listing page.
                </p>
              </Field>
            );
          })}
          <Field label="Posts per page">
            <TextIn value={s.posts_per_page} onChange={(v) => set("posts_per_page", v)} />
          </Field>
        </>
      );
    }

    case "menus":
      return (
        <>
          <p className="text-[11px] text-slate-400 mb-3">
            Menu items are managed in the navigation builder, where you can drag to reorder them.
          </p>
          <LinkOut href="/admin/navigation">Open navigation builder</LinkOut>
        </>
      );

    case "css":
      return (
        <Field label="Additional CSS" help="Injected into every frontend page, after the theme styles.">
          <TextArea mono rows={18} value={s.custom_css} onChange={(v) => set("custom_css", v)} placeholder=".site-header { border-bottom: 2px solid red; }" />
        </Field>
      );

    case "scripts":
      return (
        <>
          <Field label="Head Scripts" help="Injected into <head> — analytics, verification tags.">
            <TextArea mono rows={7} value={s.script_head} onChange={(v) => set("script_head", v)} />
          </Field>
          <Field label="Body End Scripts" help="Injected before the closing body tag — chat widgets, pixels.">
            <TextArea mono rows={7} value={s.script_body_end} onChange={(v) => set("script_body_end", v)} />
          </Field>
          <Toggle label="Delay these scripts until the visitor interacts" value={s.scripts_delay} onChange={(v) => set("scripts_delay", v)} />
          <p className="-mt-2 text-[11px] leading-relaxed text-slate-400">
            Analytics, pixels and chat widgets load on the first scroll, tap or key press (or after 6 seconds), so they
            never slow the first paint. Nothing about what they do changes — only when they start. Add{" "}
            <code>data-no-delay</code> to a script tag that must run immediately, such as a consent manager. The timeout,
            an exclusion list and &ldquo;defer head scripts&rdquo; are under <Link href="/admin/speed" className="underline">Speed</Link>.
          </p>
        </>
      );

    case "speed":
      // Every option here moved to its own screen, Admin → Speed, with the
      // rest of the cache, font, media and Cloudflare settings. The same keys,
      // so nothing changed for a site that had them set from here.
      return (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
            <p className="font-medium text-slate-800 mb-1">Speed settings have their own screen</p>
            <p>
              Page cache and lifetimes, click-to-play videos, link prefetch, preconnect, local fonts, lazy loading, image
              quality, the cache warmer, Cloudflare and database clean-up now live together under <strong>Speed</strong>,
              with a live cache test.
            </p>
            <Link href="/admin/speed" className="btn-secondary text-xs inline-flex items-center gap-1.5 mt-3">
              <Gauge size={13} /> Open Speed
            </Link>
          </div>
          <Toggle label="Click-to-play videos" value={s.perf_video_facade} onChange={(v) => set("perf_video_facade", v)} />
          <Toggle label="LiteSpeed page cache" value={s.cache_litespeed} onChange={(v) => set("cache_litespeed", v)} />
          <p className="-mt-2 text-[11px] leading-relaxed text-slate-400">The two most-used switches stay here as shortcuts; both are the same setting as on the Speed screen.</p>
        </>
      );

    case "layout":
      return (
        <>
          {LAYOUT_PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setFocusItem(panel.id)}
              className="w-full flex items-center justify-between gap-3 px-3 py-3 mb-2 border border-slate-200 rounded-lg text-left hover:bg-slate-50 hover:border-brand-300 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm text-slate-800">{panel.label}</span>
                <span className="block text-[11px] text-slate-400 truncate">{panel.hint}</span>
              </span>
              <ChevronRight size={14} className="text-slate-400 shrink-0" />
            </button>
          ))}
          <p className="text-[11px] text-slate-400 mt-1">
            These are site-wide defaults. Any post or page can override them in its own Design panel.
          </p>
        </>
      );

    case "search":
      return <SearchPanel s={s} set={set} />;
  }
}

/**
 * Says so when a chosen font cannot draw the site's own script — Poppins on
 * an Arabic site. The page looks fine to the owner (their system font fills
 * in) while every visitor downloads Latin font files that draw nothing but
 * the odd brand name, and sees whatever font their own device has.
 */
function FontScriptWarning({ s }: { s: CustomizerSettings }) {
  const scripts = [...new Set(contentLanguages(s as unknown as Record<string, string>).map(subsetForLanguage))].filter((sc) => CHECKED_SCRIPTS[sc]);
  const problems = scripts.flatMap((sc) =>
    [...new Set([s.font_heading, s.font_body])]
      .filter((f) => fontLacksScript(f, sc))
      .map((f) => ({ font: f || "Inter", script: sc }))
  );
  if (!problems.length) return null;
  const script = problems[0].script;
  return (
    <p className="text-[11px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 -mt-1 mb-4">
      {[...new Set(problems.map((p) => p.font))].join(" and ")} {problems.length > 1 ? "have" : "has"} no {CHECKED_SCRIPTS[script]} letters, so {CHECKED_SCRIPTS[script]} text is shown in each visitor&apos;s system font instead. Fonts that draw {CHECKED_SCRIPTS[script]}: {fontsForScript(script).slice(0, 6).join(", ")}.
    </p>
  );
}
