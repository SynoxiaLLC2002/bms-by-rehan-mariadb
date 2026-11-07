"use client";

// One icon picker for every block that has an icon.
//
// Six blocks each carried their own copy of the same grid of emoji. Now they
// share this, and it offers three sources instead of one:
//
//   Emoji   the original glyph set — nothing to download, works everywhere
//   Icons   Lucide's line icons, searchable by name; drawn in the block's icon
//           colour, which emoji never could be
//   Custom  anything typed or pasted (any character, any emoji), or an image
//           from the media library — a logo, a badge, a coloured icon
//
// The value is a plain string in every case; see lib/icons.ts for the shapes.

import { useEffect, useMemo, useRef, useState } from "react";
import { icons } from "lucide-react";
import { ImagePlus, Search, X } from "lucide-react";
import MediaPicker from "@/components/admin/MediaPicker";
import Icon from "@/components/shared/Icon";
import { GLYPH_ICONS } from "@/lib/blockStyle";
import { lucideIcon, lucideKebab, parseIcon } from "@/lib/icons";

type Tab = "emoji" | "icons" | "custom";

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** What the trigger shows when nothing is chosen. */
  fallback?: string;
  /** Short text beside the trigger — "Overridden", "Used by every item", … */
  hint?: string;
  /** Label of the clear action; omit to hide it. */
  clearLabel?: string;
  /** Anything else that belongs on the trigger row (a side toggle, say). */
  children?: React.ReactNode;
}

// Built once: 1,600 names in kebab-case, for searching.
const LUCIDE_NAMES: string[] = Object.keys(icons).map(lucideKebab).sort();

// A small curated first page, so the tab is useful before anyone types.
const LUCIDE_FEATURED = [
  "check", "check-circle", "x", "star", "heart", "thumbs-up", "info", "alert-triangle",
  "arrow-right", "arrow-down", "download", "upload", "external-link", "link",
  "zap", "flame", "sparkles", "rocket", "target", "lightbulb", "trophy", "award",
  "shield-check", "lock", "key", "eye", "search", "settings", "wrench", "puzzle",
  "smartphone", "monitor", "laptop", "gamepad-2", "wifi", "cloud", "database", "code",
  "camera", "image", "video", "music", "headphones", "play", "film", "mic",
  "shopping-cart", "credit-card", "tag", "gift", "percent", "trending-up", "bar-chart-3", "wallet",
  "calendar", "clock", "map-pin", "globe", "home", "building-2", "users", "user",
  "mail", "phone", "message-circle", "send", "bell", "bookmark", "file-text", "folder",
];

export default function IconPicker({ value, onChange, fallback = "—", hint, clearLabel, children }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    const k = parseIcon(value)?.kind;
    return k === "lucide" ? "icons" : k === "image" ? "custom" : "emoji";
  });
  const [query, setQuery] = useState("");
  const [showMedia, setShowMedia] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else, as a popover should.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const lucideResults = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "-");
    if (!q) return LUCIDE_FEATURED.filter((n) => LUCIDE_NAMES.includes(n));
    // Names that start with the query first — "arrow" should lead with the
    // arrows, not with "circle-arrow-…".
    const starts = LUCIDE_NAMES.filter((n) => n.startsWith(q));
    const contains = LUCIDE_NAMES.filter((n) => !n.startsWith(q) && n.includes(q));
    return [...starts, ...contains].slice(0, 160);
  }, [query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const current = parseIcon(value);
  const currentLabel =
    current?.kind === "lucide" ? current.value : current?.kind === "image" ? "Image" : current ? "Chosen" : undefined;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-11 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-lg hover:border-sky-400"
          title="Choose an icon"
        >
          <Icon value={value} fallback={fallback} />
        </button>
        {children}
        {(hint || currentLabel) && (
          <span className="min-w-0 truncate text-[11px] text-slate-400">{hint ?? currentLabel}</span>
        )}
        {clearLabel && value && (
          <button type="button" onClick={() => onChange("")} className="ml-auto shrink-0 text-[11px] text-red-400 hover:text-red-600">
            {clearLabel}
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-[19rem] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex gap-1 rounded bg-slate-100 p-0.5 text-[11px] font-medium">
            {(
              [
                ["emoji", "Emoji"],
                ["icons", "Icons"],
                ["custom", "Custom"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 rounded px-2 py-1 transition-colors ${tab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "emoji" && (
            <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto rounded bg-slate-50 p-1.5">
              {GLYPH_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => pick(ic)}
                  className={`aspect-square rounded text-sm transition-colors ${value === ic ? "bg-sky-500 text-white" : "bg-white hover:bg-sky-50"}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          )}

          {tab === "icons" && (
            <>
              <div className="relative mb-1.5">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search 1,600 icons — arrow, camera, shield…"
                  className="w-full rounded border border-slate-200 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-sky-400"
                />
              </div>
              <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto rounded bg-slate-50 p-1.5">
                {lucideResults.map((name) => {
                  const v = lucideIcon(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => pick(v)}
                      className={`flex aspect-square items-center justify-center rounded text-base transition-colors ${value === v ? "bg-sky-500 text-white" : "bg-white text-slate-700 hover:bg-sky-50"}`}
                    >
                      <Icon value={v} />
                    </button>
                  );
                })}
                {lucideResults.length === 0 && (
                  <p className="col-span-8 py-4 text-center text-[11px] text-slate-400">Nothing called &ldquo;{query}&rdquo;.</p>
                )}
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                Line icons follow the block&rsquo;s icon colour and size.
              </p>
            </>
          )}

          {tab === "custom" && (
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-600">
                Type or paste anything
                <input
                  autoFocus
                  defaultValue={current?.kind === "glyph" ? current.value : ""}
                  placeholder="an emoji, a letter, a symbol…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) pick(v);
                    }
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== value) onChange(v);
                  }}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-400"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMedia(true)}
                  className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-sky-400"
                >
                  <ImagePlus size={13} /> Image from Media
                </button>
                {current?.kind === "image" && (
                  <button type="button" onClick={() => onChange("")} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500">
                    <X size={11} /> remove image
                  </button>
                )}
              </div>
              <p className="text-[10px] leading-snug text-slate-400">
                An image keeps its own colours and is shown at the icon size. A small square PNG or WebP works best.
              </p>
            </div>
          )}
        </div>
      )}

      {showMedia && (
        <MediaPicker
          onSelect={(url) => {
            pick(url);
            setShowMedia(false);
          }}
          onClose={() => setShowMedia(false)}
        />
      )}
    </div>
  );
}
