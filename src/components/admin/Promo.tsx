"use client";

// Rehan's own offers, shown in every BMS admin: a banner on the Dashboard and a
// button above "Join WhatsApp channel". The words, links and colours come from
// the BMS Promo plugin on synoxia.org, so an offer changes there, never here.
//
// The admin's browser fetches the feed, like the unlock screen does (this
// server never calls out). Copy kept 3 h in localStorage. If synoxia.org is
// down or the feed is off, nothing shows. Only plain text, https links and hex
// colours are used: a feed that sends anything else shows nothing, so a
// hacked WordPress cannot put code into every BMS admin.

import { useEffect, useState } from "react";
import { Sparkles, Rocket, Gift, Star, Zap, Megaphone } from "lucide-react";

const FEED = "https://synoxia.org/wp-json/bms-promo/v1/feed";
const CACHE_KEY = "bms-promo";
const CACHE_MS = 3 * 60 * 60 * 1000;
const ICONS = { sparkles: Sparkles, rocket: Rocket, gift: Gift, star: Star, zap: Zap, megaphone: Megaphone };

type Banner = { picture: string; title: string; text: string; button: string; url: string; image: string; bg: string; fg: string; buttonBg: string; buttonFg: string };
type SideLink = { label: string; url: string; badge: string; icon: keyof typeof ICONS };
type Feed = { banner: Banner | null; sidebar: SideLink | null };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function https(v: unknown): string {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? v : fallback);

/** Untrusted JSON in, only safe values out. Exported for the self-check below. */
export function cleanFeed(raw: unknown): Feed {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | null>;
  const b = r.banner;
  const s = r.sidebar;
  const banner: Banner | null =
    // A ready-made picture replaces the text design; the headline is then its alt text.
    b && (str(b.title, 120) || https(b.picture)) && https(b.url)
      ? {
          picture: https(b.picture),
          title: str(b.title, 120),
          text: str(b.text, 400),
          button: str(b.button, 40) || "Learn more",
          url: https(b.url),
          image: https(b.image),
          bg: hex(b.bg, "#0f172a"),
          fg: hex(b.fg, "#ffffff"),
          buttonBg: hex(b.button_bg, "#0284c7"),
          buttonFg: hex(b.button_fg, "#ffffff"),
        }
      : null;
  const sidebar: SideLink | null =
    s && str(s.label, 40) && https(s.url)
      ? {
          label: str(s.label, 40),
          url: https(s.url),
          badge: str(s.badge, 12),
          icon: (Object.keys(ICONS) as (keyof typeof ICONS)[]).find((k) => k === s.icon) ?? "sparkles",
        }
      : null;
  return { banner, sidebar };
}

// One fetch per page load, shared by the banner and the sidebar button.
let pending: Promise<Feed> | null = null;
function loadFeed(): Promise<Feed> {
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(cleanFeed(hit.feed));
  } catch {}
  pending ??= fetch(FEED, { credentials: "omit", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), feed: raw }));
      } catch {}
      return cleanFeed(raw);
    })
    .catch(() => cleanFeed(null));
  return pending;
}

function useFeed(): Feed | null {
  const [feed, setFeed] = useState<Feed | null>(null);
  useEffect(() => {
    let live = true;
    loadFeed().then((f) => live && setFeed(f));
    return () => {
      live = false;
    };
  }, []);
  return feed;
}

export function PromoBanner() {
  const b = useFeed()?.banner;
  if (!b) return null;
  if (b.picture)
    return (
      <a href={b.url} target="_blank" rel="noopener" className="mb-8 block rounded-xl overflow-hidden hover:opacity-95 transition-opacity">
        <img src={b.picture} alt={b.title || "Offer"} className="block w-full h-auto" />
      </a>
    );
  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener"
      className="mb-8 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl p-5 hover:opacity-95 transition-opacity"
      style={{ background: b.bg, color: b.fg }}
    >
      {b.image && <img src={b.image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-lg leading-snug">{b.title}</div>
        {b.text && <p className="text-sm mt-1 opacity-90">{b.text}</p>}
      </div>
      <span
        className="shrink-0 self-start sm:self-center rounded-lg px-4 py-2 text-sm font-semibold"
        style={{ background: b.buttonBg, color: b.buttonFg }}
      >
        {b.button}
      </span>
    </a>
  );
}

export function PromoSidebarLink() {
  const s = useFeed()?.sidebar;
  if (!s) return null;
  const Icon = ICONS[s.icon];
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-amber-300 hover:text-white hover:bg-slate-800 transition-colors"
    >
      <Icon size={16} />
      <span className="truncate">{s.label}</span>
      {s.badge && (
        <span className="ml-auto rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">{s.badge}</span>
      )}
    </a>
  );
}
