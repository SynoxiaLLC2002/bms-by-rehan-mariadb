"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/admin/Header";
import { cn } from "@/lib/utils";
import { speedDefaults, SPEED_KEYS, type SpeedKey, type SpeedSettings } from "@/lib/speed";
import { HTACCESS } from "@/lib/htaccess";
import { Check, Loader2, Save, Trash2, Zap, RefreshCw, Download, Upload, RotateCcw, ExternalLink, Flame, Cloud, Database, Wrench, Gauge, Image as ImageIcon, FileCode2, HardDrive } from "lucide-react";

type Tab = "dashboard" | "cache" | "browser" | "optimize" | "media" | "preload" | "cloudflare" | "database" | "tools";

const TABS: { id: Tab; label: string; hint: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", hint: "What is cached, when it was last cleared, and a live test", icon: Gauge },
  { id: "cache", label: "Cache", hint: "LiteSpeed's page cache — lifetimes, exclusions, when it clears", icon: Zap },
  { id: "browser", label: "Browser cache", hint: "How long a visitor's browser keeps files", icon: HardDrive },
  { id: "optimize", label: "Page optimization", hint: "CSS, scripts, fonts, connections and link prefetch", icon: FileCode2 },
  { id: "media", label: "Media", hint: "Lazy loading, the hero image, image quality", icon: ImageIcon },
  { id: "preload", label: "Preload", hint: "Warm the cache after a publish, and crawl the site on a schedule", icon: Flame },
  { id: "cloudflare", label: "Cloudflare", hint: "The edge cache in front of the site", icon: Cloud },
  { id: "database", label: "Database", hint: "Revisions, trash and logs", icon: Database },
  { id: "tools", label: "Tools", hint: ".htaccess, export / import, debug headers", icon: Wrench },
];

interface Status {
  siteUrl: string;
  urlCount: number;
  lastPurge: string | null;
  lastWarm: { at: string; fetched: number; failed: number } | null;
  crawler: { last: { at: string; fetched: number; failed: number; cursor: number; total: number } | null; lastPass: string | null; cursor: number };
  cron: { lastPublishCheck: string | null; tokenSet: boolean };
  cleanup: { items: { id: string; label: string; count: number; detail: string }[]; total: number; lastRun: string | null; trashDays: number } | null;
  revisions: { n: number; docs: number };
  env: { imageOptimization: boolean; imageFormats: string; nodeEnv: string };
}

interface CronStatus {
  jobs: { id: string; label: string; line: string }[];
  missing: string[];
  installed: string[];
  supported: boolean;
  reason?: string;
}

interface CfStatus {
  configured: boolean;
  ok: boolean;
  error?: string;
  zoneName?: string;
  browserTtl?: number;
  developmentMode?: boolean;
  developmentModeRemaining?: number;
  edgeHtml?: "on" | "off" | "stale" | "unreadable";
  edgeHtmlError?: string;
  /** Mirrors CloudflareStatus in lib/cloudflare.ts — keep the two in step. */
  earlyHints?: boolean;
  tieredCache?: boolean;
  polish?: string;
  polishUnavailable?: string;
}

interface HtStatus {
  path: string | null;
  publicPath?: string;
  publicManaged?: "current" | "absent";
  managed: "current" | "outdated" | "absent" | "unknown";
  uploadsCacheControl?: string;
  uploadsMaxAge?: number;
  error?: string;
}

interface TestRun {
  status: number;
  ms: number;
  headers: Record<string, string>;
}

const defaults = (): SpeedSettings => ({ ...speedDefaults });

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function seconds(v: string): string {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return "";
  if (n % 86400 === 0) return `${n / 86400} day${n === 86400 ? "" : "s"}`;
  if (n % 3600 === 0) return `${n / 3600} hour${n === 3600 ? "" : "s"}`;
  if (n % 60 === 0) return `${n / 60} min`;
  return `${n} s`;
}

/* ── Field components ──────────────────────────────────────────
 *
 * These sit at module scope rather than inside SpeedPage. Declared inside, each
 * one was a different function object on every render, so React saw a new
 * component type, discarded the old DOM and mounted a fresh <input> — which
 * meant a field lost focus after every character typed into it.
 */

type SetFn = (k: SpeedKey, v: string) => void;

function Toggle({ s, set, k, label, help, invert }: { s: SpeedSettings; set: SetFn; k: SpeedKey; label: string; help?: string; invert?: boolean }) {
  // Most keys are on unless "false"; `invert` is for keys that are off unless "true".
  const on = invert ? s[k] === "true" : s[k] !== "false";
  return (
    <div className="mb-3">
      <button type="button" onClick={() => set(k, on ? "false" : "true")} className="flex items-center gap-2.5 text-left">
        <span className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0", on ? "bg-brand-600" : "bg-slate-300")}>
          <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all", on ? "left-[18px]" : "left-0.5")} />
        </span>
        <span className="text-sm text-slate-700">{label}</span>
      </button>
      {help && <p className="text-xs text-slate-400 mt-1 ml-[46px]">{help}</p>}
    </div>
  );
}

function Num({ s, set, k, label, help, min, max, step, unit, placeholder }: { s: SpeedSettings; set: SetFn; k: SpeedKey; label: string; help?: string; min?: number; max?: number; step?: number; unit?: string; placeholder?: string }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" className="input w-40" min={min} max={max} step={step} value={s[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
        {unit === "seconds" && s[k] && <span className="text-xs text-slate-400">= {seconds(s[k])}</span>}
      </div>
      {help && <p className="text-xs text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

function Lines({ s, set, k, label, help, placeholder, rows = 4 }: { s: SpeedSettings; set: SetFn; k: SpeedKey; label: string; help?: string; placeholder?: string; rows?: number }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      <textarea className="input font-mono text-xs" rows={rows} value={s[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
      {help && <p className="text-xs text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

/**
 * Which weights to request. Multi-select rather than a text box because the
 * css2 API is picky about the order and the format, and because the useful
 * answer is "the ones this theme draws" — a list you tick, not a string you
 * compose. 400 is fixed: it is the body text.
 */
function Weights({ s, set, k, label, help }: { s: SpeedSettings; set: SetFn; k: SpeedKey; label: string; help?: string }) {
  const chosen = new Set(
    (s[k] || "").split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 100 && n <= 900)
  );
  chosen.add(400);
  const toggle = (w: number) => {
    const next = new Set(chosen);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    next.add(400);
    set(k, [...next].sort((a, b) => a - b).join(","));
  };
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-1">
        {[300, 400, 500, 600, 700, 800, 900].map((w) => {
          const on = chosen.has(w);
          return (
            <button
              key={w}
              type="button"
              disabled={w === 400}
              onClick={() => toggle(w)}
              title={w === 400 ? "Body text — always loaded" : undefined}
              className={cn(
                "px-2.5 py-1 rounded-lg border text-xs transition-colors",
                on ? "border-brand-600 bg-brand-50 text-brand-700 font-medium" : "border-slate-200 text-slate-500 hover:border-slate-300",
                w === 400 && "cursor-default opacity-90"
              )}
            >
              {w}
            </button>
          );
        })}
      </div>
      {help && <p className="text-xs text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

function Choice({ s, set, k, label, help, options }: { s: SpeedSettings; set: SetFn; k: SpeedKey; label: string; help?: string; options: { value: string; label: string; hint?: string }[] }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.hint}
            onClick={() => set(k, o.value)}
            className={cn("px-3 py-1.5 rounded-lg border text-xs transition-colors", s[k] === o.value ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-300 hover:border-brand-400 text-slate-700")}
          >
            {o.label}
          </button>
        ))}
      </div>
      {help && <p className="text-xs text-slate-400 mt-1">{help}</p>}
    </div>
  );
}

function Action({ busy, id, label, onClick, danger, icon: Icon }: { busy: string | null; id: string; label: string; onClick: () => void; danger?: boolean; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  const running = busy === id;
  return (
    <button type="button" disabled={!!busy} onClick={onClick} className={cn(danger ? "btn-danger" : "btn-secondary", "inline-flex items-center gap-2 text-xs")}>
      {running ? <Loader2 size={14} className="animate-spin" /> : Icon ? <Icon size={14} /> : null}
      {label}
    </button>
  );
}

/**
 * One edge feature: what it is, what it does, and a switch.
 *
 * The explanation is not decoration. Everything on this row happens inside
 * Cloudflare rather than in this CMS, so someone who is not technical has no
 * way to find out what they just turned on — and a switch whose effect you
 * cannot see is one people either leave alone forever or flip nervously.
 * `what` is one sentence in plain words; `why` is what it buys and when it
 * matters, including when it does not.
 */
function EdgeFeature({
  title, what, why, on, busy, id, onToggle, unavailable, detail,
}: {
  title: string;
  what: string;
  why: string;
  /** undefined = the zone would not say, or the plan does not allow it. */
  on?: boolean;
  busy?: string | null;
  id?: string;
  onToggle?: () => void;
  unavailable?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800">
            {title}
            {!unavailable && on !== undefined && (
              <span className={cn("ml-2 text-[11px] font-normal", on ? "text-emerald-600" : "text-slate-400")}>
                {on ? "On" : "Off"}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1">{what}</p>
          <p className="text-xs text-slate-400 mt-1">{why}</p>
          {detail && <p className="text-xs text-slate-400 mt-1">{detail}</p>}
          {unavailable && <p className="text-xs text-amber-600 mt-1">{unavailable}</p>}
        </div>
        {!unavailable && onToggle && id && (
          <Action busy={busy ?? null} id={id} label={on ? "Turn off" : "Turn on"} onClick={onToggle} icon={on ? Wrench : Check} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-medium text-slate-800 mt-0.5">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SpeedPage() {
  const [s, setS] = useState<SpeedSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<Status | null>(null);
  const [cf, setCf] = useState<CfStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [test, setTest] = useState<{ url: string; runs: TestRun[] } | null>(null);
  const [testPath, setTestPath] = useState("/");
  const importRef = useRef<HTMLInputElement>(null);

  // `?tab=cloudflare` opens on that tab — the Connect Claude box links here
  // for the Zone ID and API token its bridge needs.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((t) => t.id === wanted)) setTab(wanted as Tab);
  }, []);

  const loadStatus = useCallback(() => {
    fetch("/api/speed/status").then((r) => r.json()).then((d) => !d.error && setStatus(d)).catch(() => {});
  }, []);
  const [cron, setCron] = useState<CronStatus | null>(null);
  const loadCron = useCallback(() => {
    fetch("/api/speed/cron").then((r) => r.json()).then((d) => !d.error && setCron(d)).catch(() => {});
  }, []);
  useEffect(() => { loadCron(); }, [loadCron]);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (id: string, text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); });

  const [ht, setHt] = useState<HtStatus | null>(null);

  const loadHt = useCallback(() => {
    fetch("/api/speed/htaccess").then((r) => r.json()).then((d) => setHt(d)).catch(() => {});
  }, []);

  // Speed → Media → "Re-optimise existing images": how many are left, and a
  // running tally while the batches go through.
  const [imgPending, setImgPending] = useState<{ pending: number; maxPx: number } | null>(null);
  const [imgRun, setImgRun] = useState<{ processed: number; resized: number; filled: number; saved: number; failed: number } | null>(null);
  const loadImgPending = useCallback(() => {
    fetch("/api/speed/media").then((r) => r.json()).then((d) => !d.error && setImgPending(d)).catch(() => {});
  }, []);

  const loadCf = useCallback(() => {
    fetch("/api/speed/cloudflare").then((r) => r.json()).then((d) => setCf(d)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const loaded = defaults();
        for (const key of SPEED_KEYS) {
          const v = d.settings?.[key];
          if (typeof v === "string") loaded[key] = v;
        }
        // The old single prefetch switch, before this screen existed.
        if (d.settings?.prefetch_mode == null && d.settings?.perf_hover_prefetch === "false") loaded.prefetch_mode = "off";
        setS(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    loadStatus();
    loadCf();
    loadHt();
    loadImgPending();
  }, [loadStatus, loadCf, loadHt, loadImgPending]);

  const set = (k: SpeedKey, v: string) => {
    setS((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  function say(kind: "ok" | "err", text: string) {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 6000);
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      say("err", d.error || "Could not save.");
      return;
    }
    setDirty(false);
    // Saved, but the Cloudflare rule did not take the new exclusions.
    const d = await res.json().catch(() => ({}));
    if (d.warning) say("err", d.warning);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // The Cloudflare card's rule state may have changed with the exclusions.
    loadStatus();
  }

  async function act(id: string, url: string, body?: unknown, done?: (d: Record<string, unknown>) => void) {
    setBusy(id);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) say("err", d.error || "Failed.");
      else done?.(d);
    } catch {
      say("err", "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  const purgeAll = () =>
    act("purge", "/api/cache/purge", {}, (d) => {
      const cfr = d.cloudflare as { attempted: boolean; ok: boolean; error?: string } | undefined;
      say("ok", `Cache cleared — Next, LiteSpeed${cfr?.attempted ? (cfr.ok ? " and Cloudflare" : ` (Cloudflare failed: ${cfr.error})`) : ""}.`);
      loadStatus();
    });

  const runTest = () =>
    act("test", "/api/speed/test", { path: testPath }, (d) => setTest(d as unknown as { url: string; runs: TestRun[] }));

  const warm = (mode: "home" | "batch") =>
    act(`warm-${mode}`, "/api/speed/warm", { mode }, (d) => {
      const failed = (d.failed as string[]) ?? [];
      say("ok", `Fetched ${d.fetched} page${d.fetched === 1 ? "" : "s"} in ${Math.round((d.ms as number) / 100) / 10}s${failed.length ? `, ${failed.length} failed` : ""}${d.total ? ` — ${d.cursor}/${d.total} of the site done` : ""}.`);
      loadStatus();
    });

  const cfAction = (action: string, on?: boolean, mode?: string) =>
    act(`cf-${action}`, "/api/speed/cloudflare", { action, on, mode }, (d) => {
      // Done, but a companion step was not (the tracking-parameter rule):
      // say what did not happen rather than a clean success.
      if (d.ok && d.warning) say("err", d.warning as string);
      else if (d.ok)
        say(
          "ok",
          action === "purge" ? "Cloudflare cache cleared."
            : action === "dev_mode" ? `Development mode ${on ? "on for 3 hours" : "off"}.`
            : action === "edge_html" ? (on ? "Cloudflare is now caching this site's pages." : "Cloudflare is no longer caching pages.")
            : action === "early_hints" ? `Early Hints ${on ? "on" : "off"}.`
            : action === "tiered_cache" ? `Smart Tiered Cache ${on ? "on" : "off"}.`
            : action === "polish" ? `Polish ${mode && mode !== "off" ? `on (${mode})` : "off"}.`
            : "Cloudflare now respects the site's cache headers."
        );
      else say("err", (d.error as string) || "Cloudflare refused.");
      if (d.status) setCf(d.status as CfStatus);
    });

  const htAction = (action: "apply" | "remove") =>
    act(`ht-${action}`, "/api/speed/htaccess", { action }, (d) => {
      if (d.ok) {
        say(
          "ok",
          d.reason === "removed"
            ? "Server rules removed."
            : d.reason === "unchanged"
              ? "Already up to date."
              : "Server rules applied — the site answered, so the file is good."
        );
        if (d.status) setHt(d.status as HtStatus);
      } else {
        say("err", (d.error as string) || "Could not write the file.");
        loadHt();
      }
    });

  const dbAction = (action: "revisions" | "cleanup") =>
    act(`db-${action}`, "/api/speed/database", { action }, (d) => {
      say("ok", action === "revisions" ? `Removed ${d.removed} old revision${d.removed === 1 ? "" : "s"}.` : `Removed ${d.removed} row${d.removed === 1 ? "" : "s"}.`);
      loadStatus();
    });

  /**
   * Walks the media library a few files per request until the server says
   * done. One long request would hit the host's timeout on a big library and
   * show nothing until it did.
   */
  async function reoptimizeImages() {
    if (dirty) return say("err", "Save your changes first — the size limit used is the saved one.");
    if (!confirm("Shrink every uploaded image that is larger than the limit, and add the missing sizes and placeholders?\n\nFile names and formats stay the same, so no link changes. Each original is kept in uploads-originals/ next to the app.")) return;
    setBusy("reopt");
    const tally = { processed: 0, resized: 0, filled: 0, saved: 0, failed: 0 };
    setImgRun({ ...tally });
    let after = 0;
    try {
      for (;;) {
        const res = await fetch("/api/speed/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ after }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.error) {
          say("err", d.error || "Stopped — the server refused a batch.");
          break;
        }
        tally.processed += d.processed;
        tally.resized += d.resized;
        tally.filled += d.filled;
        tally.saved += d.saved;
        tally.failed += d.failed.length;
        setImgRun({ ...tally });
        after = d.after;
        if (d.done) break;
      }
    } catch {
      say("err", "Stopped — the connection dropped. Run it again to carry on where it stopped.");
    } finally {
      setBusy(null);
      loadImgPending();
    }
    // Pages carry the old sizes and no placeholders until they are rendered again.
    if (tally.resized + tally.filled > 0) purgeAll();
  }

  function exportSettings() {
    const blob = new Blob([JSON.stringify({ bms_speed: 1, exported: new Date().toISOString(), settings: s }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `speed-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadHtaccess() {
    const blob = new Blob([HTACCESS], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // Browsers will not save a file whose name is only an extension, so it
    // downloads as htaccess.txt and gets renamed on the host.
    a.download = "htaccess.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importSettings(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { settings?: Record<string, unknown> };
      const incoming = parsed.settings ?? (parsed as Record<string, unknown>);
      const next = { ...s };
      let n = 0;
      for (const key of SPEED_KEYS) {
        if (typeof incoming[key] === "string") {
          next[key] = incoming[key] as string;
          n++;
        }
      }
      if (n === 0) return say("err", "No speed settings in that file.");
      setS(next);
      setDirty(true);
      say("ok", `${n} settings loaded — Save to apply.`);
    } catch {
      say("err", "That is not a settings file.");
    }
  }

  function reset() {
    if (!confirm("Reset every Speed setting to its default? Cloudflare credentials are kept. Save afterwards to apply.")) return;
    const next = defaults();
    next.cf_zone_id = s.cf_zone_id;
    next.cf_api_token = s.cf_api_token;
    setS(next);
    setDirty(true);
  }

  if (loading) {
    return (
      <>
        <Header title="Speed" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading speed settings…
        </div>
      </>
    );
  }

  const current = TABS.find((t) => t.id === tab)!;
  const cacheOn = s.cache_litespeed !== "false";

  return (
    <>
      <Header title="Speed" />
      <div className="p-8 max-w-5xl">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-2 text-sm rounded-t-lg border border-b-0 -mb-px transition-colors inline-flex items-center gap-1.5",
                tab === t.id ? "bg-white border-slate-200 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              <t.icon size={14} className={tab === t.id ? "text-brand-600" : "text-slate-400"} />
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-6">{current.hint}</p>

        {notice && (
          <div className={cn("mb-4 rounded-lg border px-3 py-2 text-xs", notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>{notice.text}</div>
        )}

        <form onSubmit={save} className="space-y-6">
          {/* ── Dashboard ─────────────────────────────────────────────── */}
          {tab === "dashboard" && (
            <>
              <div className="card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-sm">Cache</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Three layers keep pages ready: Next renders once and keeps the HTML, LiteSpeed serves it without waking Node, Cloudflare serves it from the edge.
                      Purging clears all three; every save from the admin clears them too.
                    </p>
                  </div>
                  <Action busy={busy} id="purge" label="Purge all caches" onClick={purgeAll} icon={Trash2} danger />
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                  <Stat label="LiteSpeed page cache" value={cacheOn ? "On" : "Off"} sub={cacheOn ? `Pages kept ${seconds(s.cache_ttl)}` : "Every visit renders"} />
                  <Stat label="Last purge" value={ago(status?.lastPurge)} sub={status?.lastPurge ? new Date(status.lastPurge).toLocaleString() : "Purges by saving are not recorded"} />
                  <Stat label="Public URLs" value={status?.urlCount ?? "…"} sub="Pages, posts, category pages" />
                  <Stat label="Publish cron" value={status?.cron.lastPublishCheck ? ago(status.cron.lastPublishCheck) : "Not running"} sub={status?.cron.tokenSet ? "CRON_TOKEN is set" : "CRON_TOKEN missing — see Site Health"} />
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm">Is it cached? Test a URL</h2>
                <p className="text-xs text-slate-400 mt-1 mb-3">Fetches the page twice from the server and shows each layer&apos;s answer. The second run should be a hit.</p>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-slate-500 font-mono">{status?.siteUrl}</span>
                  <input className="input font-mono text-xs w-64" value={testPath} onChange={(e) => setTestPath(e.target.value)} placeholder="/" />
                  <Action busy={busy} id="test" label="Test" onClick={runTest} icon={RefreshCw} />
                </div>
                {test && (
                  <div className="grid md:grid-cols-2 gap-3 mt-4">
                    {test.runs.map((r, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 p-3 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-slate-700">Request {i + 1}</span>
                          <span className={cn("font-mono", r.status === 200 ? "text-emerald-700" : "text-red-600")}>{r.status} · {r.ms} ms</span>
                        </div>
                        <dl className="space-y-1">
                          {Object.entries(r.headers).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <dt className="font-mono text-slate-400 w-44 shrink-0">{k}</dt>
                              <dd className={cn("font-mono break-all", /hit/i.test(v) ? "text-emerald-700" : /miss|dynamic|bypass/i.test(v) ? "text-amber-700" : "text-slate-700")}>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-3">
                  <code>x-litespeed-cache: hit</code> — served by LiteSpeed without Node. <code>cf-cache-status: HIT</code> — served by Cloudflare&apos;s edge. <code>x-nextjs-cache: HIT</code> — Node answered from its rendered copy. Turn on debug headers under Tools to see <em>why</em> a page is not cached.
                </p>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-3">Warm-up</h2>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Stat label="After last publish" value={status?.lastWarm ? `${status.lastWarm.fetched} fetched` : "—"} sub={status?.lastWarm ? ago(status.lastWarm.at) : s.warm_after_publish !== "false" ? "Waiting for the next publish" : "Off"} />
                  <Stat label="Crawler" value={s.crawler_enabled === "true" ? `${status?.crawler.cursor ?? 0} / ${status?.urlCount ?? "…"}` : "Off"} sub={status?.crawler.last ? `Last batch ${ago(status.crawler.last.at)}` : "No batch yet"} />
                  <Stat label="Last full pass" value={ago(status?.crawler.lastPass)} />
                </div>
                <div className="flex gap-2 mt-3">
                  <Action busy={busy} id="warm-home" label="Warm front page" onClick={() => warm("home")} icon={Flame} />
                  <Action busy={busy} id="warm-batch" label={`Warm next ${s.crawler_batch || 10} pages`} onClick={() => warm("batch")} icon={Flame} />
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-3">Server</h2>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Stat label="Image optimiser" value={status?.env.imageOptimization ? "On" : "Off (IMAGE_OPTIMIZATION=off)"} sub={status?.env.imageOptimization ? `Formats: ${status?.env.imageFormats}` : "Originals are served"} />
                  <Stat label="NODE_ENV" value={status?.env.nodeEnv ?? "…"} sub={status?.env.nodeEnv === "production" ? "Production build" : "Set NODE_ENV=production on the host"} />
                  <Stat label="Cloudflare" value={cf?.configured ? (cf.ok ? cf.zoneName : "Error") : "Not connected"} sub={cf?.configured && cf.ok ? (cf.browserTtl === 0 ? "Respects cache headers" : `Overrides browser TTL (${seconds(String(cf.browserTtl ?? 0))})`) : cf?.error} />
                </div>
              </div>
            </>
          )}

          {/* ── Cache ─────────────────────────────────────────────────── */}
          {tab === "cache" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">LiteSpeed page cache</h2>
                <Toggle s={s} set={set} k="cache_litespeed" label="Enable page cache" help="LiteSpeed keeps the finished HTML and serves it without waking Node. On any other server the header is ignored, so it is safe to leave on." />
                <Toggle s={s} set={set} k="cache_purge_on_save" label="Clear the cache on every save from the admin" help="Publishing, editing settings, changing a menu — anything an editor saves drops every cached page. Off, pages refresh only when their lifetime ends or you purge by hand." />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Lifetimes</h2>
                <p className="text-xs text-slate-400 mb-4">How long a cached copy is served before LiteSpeed asks Node for a fresh one. Long is safe: a save clears everything anyway.</p>
                <div className="grid md:grid-cols-2 gap-x-6">
                  <Num s={s} set={set} k="cache_ttl" label="Posts and pages" unit="seconds" min={60} step={60} />
                  <Num s={s} set={set} k="cache_ttl_home" label="Front page" unit="seconds" min={60} step={60} placeholder={s.cache_ttl} help="Blank = same as posts and pages. Shorter if the front page lists the latest posts and the publish cron is not running." />
                  <Num s={s} set={set} k="cache_ttl_archive" label="Category, tag, author and paginated pages" unit="seconds" min={60} step={60} placeholder={s.cache_ttl} help="Blank = same as posts and pages." />
                  <Num s={s} set={set} k="cache_ttl_feed" label="Feeds and sitemaps" unit="seconds" min={60} step={60} />
                </div>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Never cache</h2>
                <Lines s={s} set={set} k="cache_exclude_paths" label="These paths" placeholder={"/account\n/checkout/*\n*.pdf"} help="One per line. A plain path matches itself and everything under it; * matches any characters. Admin, API and preview URLs are never cached regardless." />
                <Lines s={s} set={set} k="cache_exclude_cookies" label="Requests carrying one of these cookies" placeholder={"wordpress_logged_in\ncart_id"} help="One cookie name per line. The sign-in cookie is always excluded." rows={3} />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Query strings that do not change the page</h2>
                <p className="text-xs text-slate-400 mb-4">A URL with a query string is normally not cached — it is a search, a preview, a form. Tracking tags are the exception: <code>?utm_source=newsletter</code> is the same page and should be served from cache. Add the names here. LiteSpeed still keys its cache on the full URL; the Tools tab has an <code>.htaccess</code> snippet that makes it drop these too.</p>
                <Lines s={s} set={set} k="cache_ignore_params" label="Ignored parameters" rows={6} />
              </div>
            </>
          )}

          {/* ── Browser cache ─────────────────────────────────────────── */}
          {tab === "browser" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">How long the browser keeps files</h2>
                <p className="text-xs text-slate-400 mb-4">Uploads and font files never change under their names — a replaced image gets a new name — so a year is safe and is what PageSpeed&apos;s &quot;efficient cache lifetimes&quot; check expects. The site&apos;s own CSS and JS carry a hash in their names and are always cached for a year.</p>
                <div className="grid md:grid-cols-2 gap-x-6">
                  <Num s={s} set={set} k="browser_ttl_uploads" label="Uploaded images and files" unit="seconds" min={0} step={3600} help="0 = always revalidate." />
                  <Num s={s} set={set} k="browser_ttl_fonts" label="Font files" unit="seconds" min={0} step={3600} />
                </div>
                <div className="flex gap-2 mt-1">
                  {[["1 hour", "3600"], ["1 day", "86400"], ["1 month", "2592000"], ["1 year", "31536000"]].map(([l, v]) => (
                    <button key={v} type="button" className="btn-ghost text-xs" onClick={() => { set("browser_ttl_uploads", v); set("browser_ttl_fonts", v); }}>{l}</button>
                  ))}
                </div>
              </div>
              <div className={cn("card p-5", cf?.configured && cf.ok && cf.browserTtl !== 0 ? "border-amber-300 bg-amber-50" : "")}>
                <h2 className="font-semibold text-sm mb-1">Cloudflare can overwrite these</h2>
                <p className="text-xs text-slate-500">
                  Cloudflare&apos;s <strong>Browser Cache TTL</strong> replaces the <code>Cache-Control</code> the site sends unless it is set to <em>Respect Existing Headers</em>.
                  {cf?.configured && cf.ok
                    ? cf.browserTtl === 0
                      ? " Your zone respects them."
                      : ` Your zone currently forces ${seconds(String(cf.browserTtl ?? 0))} on everything, which is what PageSpeed is complaining about.`
                    : " Connect Cloudflare on its tab to check and fix this from here."}
                </p>
                {cf?.configured && cf.ok && cf.browserTtl !== 0 && (
                  <div className="mt-3"><Action busy={busy} id="cf-respect_headers" label="Set Cloudflare to respect existing headers" onClick={() => cfAction("respect_headers")} icon={Cloud} /></div>
                )}
              </div>
            </>
          )}

          {/* ── Page optimization ────────────────────────────────────── */}
          {tab === "optimize" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">CSS</h2>
                <Toggle s={s} set={set} k="css_inline_site" invert label="Inline the site stylesheet" help="Puts the theme's CSS (colours, fonts, layout — about 9 KB) in the page instead of a separate file. One render-blocking request fewer, at the cost of that CSS not being cached between pages. Worth it on a site where most visits are one page; turn off if visitors browse many." />
                <p className="text-xs text-slate-400 ml-[46px] -mt-1">Minify and combine are not options: Next already minifies and splits CSS and JavaScript at build time.</p>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Rendering</h2>
                <Toggle s={s} set={set}
                  k="render_offscreen"
                  invert
                  label="Skip rendering what is off screen"
                  help="A long page is well over a thousand elements, and the browser measures and paints every one of them before it can show the first screen — which is most of what PageSpeed calls &ldquo;element render delay&rdquo;. This lets it leave the blocks below the fold until they are scrolled near. Off by default: measured on this CMS it made Speed Index worse (2.4 s → 3.8 s) with no gain in LCP, because images below the fold wait for their block. Turn it on only if a PageSpeed run on a long page shows it helps."
                />
                {s.render_offscreen === "true" && (
                  <>
                    <Num s={s} set={set} k="render_offscreen_after" label="Always render the first" unit="blocks" min={1} max={20} step={1} help="Counted from the top of the content. The largest element on the first screen is normally among these, and it must not be skipped — three is right for most layouts." />
                    <p className="text-xs text-amber-700 mt-2">Scroll a long page once to check this. The browser also contains layout and paint for the blocks it skips, so anything drawn deliberately outside its own box — a sticky element, an overhanging shadow — is clipped until it is scrolled to. If you see that, either turn this off or exempt the block in Custom CSS with <code>content-visibility: visible</code>, which runs after this. Links to a heading lower on the page (the Table of Contents) can also land slightly off, because blocks not yet drawn are sized by a guess.</p>
                  </>
                )}
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Empty lines</h2>
                <Choice s={s} set={set}
                  k="render_empty_paragraphs"
                  label="A paragraph with nothing in it"
                  options={[
                    { value: "drop", label: "Leave it out of the page", hint: "Nothing is published for an empty line" },
                    { value: "keep", label: "Publish it as a blank line", hint: "How it always worked: each empty line is a gap about one line high" },
                  ]}
                  help="Pressing Enter on an empty line stores an empty paragraph. One measured article had sixty. For deliberate spacing use the Spacer block, which has an exact height on every screen. Turn this to “keep” only if a site was laid out with blank lines and looks too tight without them."
                />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Scripts you added under Customize → Scripts</h2>
                <Toggle s={s} set={set} k="scripts_delay" invert label="Delay them until the visitor interacts" help="Analytics, pixels and chat widgets run on the first scroll, tap or key — or after the timeout below — instead of competing with the page for bandwidth. This is the single biggest win for Total Blocking Time. A tag with data-no-delay is never delayed." />
                {s.scripts_delay === "true" && (
                  <div className="ml-[46px]">
                    <Num s={s} set={set} k="scripts_delay_timeout" label="Run them anyway after" unit="seconds" min={0} max={60} help="A visitor who only reads is still counted. 0 = only on interaction." />
                    <Lines s={s} set={set} k="scripts_delay_exclude" label="Never delay scripts containing" placeholder={"cookieconsent\ngtm.js"} help="One per line; matched against the script's src and its inline code. A consent manager belongs here." rows={3} />
                    <Lines s={s} set={set} k="scripts_delay_exclude_paths" label="Never delay on these pages" placeholder={"/contact\n/checkout/*"} help="One path per line; /contact also covers everything under it, * matches anything. Every script runs on load there, as if delay were off — for a page whose form or widget must work before the first scroll." rows={2} />
                  </div>
                )}
                {s.scripts_delay !== "true" && (
                  <Toggle s={s} set={set} k="scripts_defer_head" invert label="Defer external head scripts" help="Adds defer to <script src> tags in Head Scripts that have neither async nor defer, so they no longer stop the HTML parser. Only applies while delay is off." />
                )}
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Fonts</h2>
                <Toggle s={s} set={set} k="fonts_local" label="Serve Google Fonts from this site" help="The font files are copied here on first use and served from /fonts — no connection to Google, works where Google is blocked." />
                <Toggle s={s} set={set} k="fonts_preload" label="Preload the fonts the page will certainly use" help="Three files at most — the heading weight, the body weight and the button weight, in the page's script (Arabic, Latin…) — start downloading with the HTML instead of after the CSS has been read. One family is one file per weight, so the heading counts even when it is the same family as the body." />
                <Lines s={s} set={set} k="fonts_preload_urls" label="Also preload these font files" placeholder="/fonts/custom/brand-700.woff2" help="One URL per line, for an uploaded font used above the fold. Four at most are preloaded; more makes the page slower, not faster." rows={2} />
                <Weights s={s} set={set}
                  k="font_weights"
                  label="Weights to load"
                  help="Google sends one @font-face per weight per character set, and that CSS is inlined into every page. Untick the weights the design never draws. Careful: a weight that is used but not loaded is faked by the browser, which looks heavier and blurrier than the real one."
                />
                <Choice s={s} set={set}
                  k="font_display"
                  label="While a web font loads"
                  options={[
                    { value: "swap", label: "Show fallback, swap in (swap)", hint: "Text is visible immediately; may reflow when the font arrives" },
                    { value: "optional", label: "Use it only if it is quick (optional)", hint: "No reflow ever; a slow connection keeps the fallback font" },
                    { value: "fallback", label: "Brief wait, then fallback (fallback)" },
                    { value: "block", label: "Wait for it (block)", hint: "Invisible text until the font loads — hurts First Contentful Paint" },
                  ]}
                  help="swap is what PageSpeed asks for. optional is the choice when layout shift matters more than always seeing the brand font."
                />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Connections</h2>
                <Toggle s={s} set={set} k="perf_preconnect" label="Preconnect to third-party hosts found in the content" help="YouTube, Google Maps, an embedded script host — the TLS handshake starts while the HTML is still arriving." />
                <Lines s={s} set={set} k="perf_preconnect_hosts" label="Also preconnect to" placeholder={"https://cdn.example.com"} help="One origin per line. Only hosts the page will definitely request — each preconnect costs a connection." rows={2} />
                <Lines s={s} set={set} k="perf_dns_prefetch" label="DNS-prefetch" placeholder={"https://www.googletagmanager.com"} help="Cheaper than preconnect: just the DNS lookup. For hosts a delayed script will reach later." rows={2} />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Link prefetch</h2>
                <Choice s={s} set={set}
                  k="prefetch_mode"
                  label="Fetch the next page before the click"
                  options={[
                    { value: "hover", label: "On hover / touch", hint: "The 200–400 ms between hovering and clicking are enough to have the page ready" },
                    { value: "viewport", label: "As links scroll into view", hint: "Every visible link, once — instant on phones too, more data used" },
                    { value: "prerender", label: "Render it on hover", hint: "Not just the bytes: the browser builds the whole next page out of sight, so the click is instant. Two at a time, Chromium only, and the page’s own scripts run — check how your analytics counts a prerendered view before leaving this on." },
                    { value: "off", label: "Off" },
                  ]}
                  help="Same origin only; never on a 2G or data-saver connection; never admin, files or feeds."
                />
                <Lines s={s} set={set} k="prefetch_exclude" label="Never prefetch" placeholder={"/logout\n/download/*"} help="Paths whose visit has a side effect, or heavy pages." rows={2} />
              </div>
            </>
          )}

          {/* ── Media ─────────────────────────────────────────────────── */}
          {tab === "media" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Images</h2>
                <Toggle s={s} set={set} k="media_lazy" label="Lazy-load images" help="Images below the fold download only as the visitor scrolls near them. Off, every image on the page loads at once." />
                <Num s={s} set={set} k="media_eager_count" label="Look for the hero image in the first" unit="blocks" min={0} max={10} help="The first image or image-background row among these leading blocks is the Largest Contentful Paint candidate: it is preloaded from the <head> and loaded eagerly at high priority, whatever the lazy setting. 0 turns this off. 3 covers a heading, an intro and a hero." />
                <Toggle s={s} set={set} k="media_blur_placeholder" label="Blurred placeholder while an image loads" help="A tiny blurred version, recorded at upload, fills the box until the file arrives. A few hundred bytes per image inside the HTML." />
                <Choice s={s} set={set}
                  k="media_max_px"
                  label="Largest image size"
                  options={[
                    { value: "", label: "Default", hint: "MEDIA_MAX_PX in the environment, else 2000" },
                    ...[1200, 1600, 2000, 2560, 3200].map((n) => ({ value: String(n), label: `${n} px` })),
                  ]}
                  help="An uploaded photo is shrunk so its longer side is at most this, and stored as WebP. No layout here shows an image wider than about 1,300 px, so 2000 already leaves room for high-density screens; 1600 is plenty for a blog. Applies to new uploads, and to old ones through the button below."
                />
                <Choice s={s} set={set}
                  k="image_quality"
                  label="Quality of optimised images"
                  options={[50, 60, 65, 70, 75, 80, 85, 90].map((q) => ({ value: String(q), label: String(q), hint: q === 75 ? "Next's default" : undefined }))}
                  help="Applies to content images served through the optimiser as WebP/AVIF. 75 is invisible from the original on photos; 60–65 is fine for screenshots and saves about a third more."
                />
                <p className="text-xs text-slate-400">
                  Format: <strong>{status?.env.imageFormats === "webp" ? "WebP only" : "AVIF, with WebP fallback"}</strong>. WebP only is the default: one format per image URL is what lets the Cloudflare cache rule keep optimised images at the edge instead of every one reaching this server. <code>IMAGE_FORMATS=avif</code> in the app&apos;s environment turns AVIF on, and takes images out of the edge cache rule. Width, height and responsive sizes are always emitted; there is no switch for them.
                </p>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Re-optimise existing images</h2>
                <p className="text-xs text-slate-500 mb-3">
                  Images uploaded before shrinking existed are still the size they arrived at, and have no placeholder. This goes through the media library and shrinks each JPEG, PNG or WebP larger than the limit above in place: the same name and format, so every post and menu that links to it keeps working. It also records the size and placeholder older uploads are missing. The original is copied to <code>uploads-originals/</code> beside the app first, so nothing is lost. The caches are cleared when it finishes.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Action busy={busy} id="reopt" label={imgPending?.pending === 0 ? "Check again" : "Re-optimise now"} icon={ImageIcon} onClick={imgPending?.pending === 0 ? loadImgPending : reoptimizeImages} />
                  <span className="text-xs text-slate-500">
                    {imgPending == null ? "Counting…" : imgPending.pending === 0 ? "Every image is within the limit and has its placeholder." : `${imgPending.pending} image${imgPending.pending === 1 ? "" : "s"} to look at (limit ${imgPending.maxPx} px).`}
                  </span>
                </div>
                {imgRun && (
                  <p className="text-xs text-slate-600 mt-3">
                    {busy === "reopt" && <Loader2 size={12} className="inline animate-spin mr-1" />}
                    {imgRun.processed} looked at · {imgRun.resized} shrunk ({(imgRun.saved / 1024 / 1024).toFixed(1)} MB saved) · {imgRun.filled} given size and placeholder
                    {imgRun.failed > 0 && <span className="text-amber-700"> · {imgRun.failed} could not be read (file missing on disk?)</span>}
                  </p>
                )}
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Embeds</h2>
                <Toggle s={s} set={set} k="media_lazy_iframes" label="Lazy-load iframes" help="Maps and embeds outside the viewport wait until scrolled to." />
                <Toggle s={s} set={set} k="perf_video_facade" label="Click-to-play videos" help="A YouTube or Vimeo embed shows its poster image and a play button; the player (about 1 MB of JavaScript) loads only when clicked. The single biggest saving on a page with a video." />
              </div>
            </>
          )}

          {/* ── Preload ───────────────────────────────────────────────── */}
          {tab === "preload" && (
            <>
              <div className={cn("card p-5", !status?.cron.tokenSet || !status?.cron.lastPublishCheck ? "border-amber-300 bg-amber-50" : "")}>
                <h2 className="font-semibold text-sm mb-1">Runs inside the publish cron</h2>
                <p className="text-xs text-slate-500">
                  Everything on this tab happens when <code>/api/cron/publish</code> is called — the same cron that publishes scheduled posts and keeps the app warm. No extra cron job is needed.
                  {status?.cron.lastPublishCheck ? ` Last run ${ago(status.cron.lastPublishCheck)}.` : " It has not run yet — set up the cron jobs below."}
                </p>
              </div>
              <div className="card p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="font-semibold text-sm mb-1">Cron jobs</h2>
                    <p className="text-xs text-slate-500">
                      Adds this site&apos;s two jobs to the hosting account&apos;s crontab: publish every 15 minutes, backup once a day. Running it again replaces them instead of adding duplicates; other sites&apos; jobs are not touched.
                    </p>
                  </div>
                  <Action
                    busy={busy} id="cron" icon={Check}
                    label={cron?.installed.length && cron.installed.length === cron.jobs.length ? "Set up again" : "Set up cron jobs"}
                    onClick={() => act("cron", "/api/speed/cron", {}, () => { say("ok", "Cron jobs added to the hosting account."); loadCron(); })}
                  />
                </div>
                {cron && !cron.supported && cron.reason && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                    This host does not let the site edit its crontab ({cron.reason}). Add them by hand in cPanel → Cron Jobs → Add New Cron Job: the first five values of a line go in the timing fields (minute, hour, day, month, weekday), everything after them in Command.
                  </p>
                )}
                {cron && cron.missing.length > 0 && (
                  <p className="text-xs text-amber-700 mb-3">Missing in the app&apos;s environment: {cron.missing.join(", ")} (16+ characters each). That job is left out until it is set.</p>
                )}
                <div className="space-y-2">
                  {cron?.jobs.map((j) => (
                    <div key={j.id} className="rounded border border-slate-200 p-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-medium flex items-center gap-1.5">
                          {cron.installed.includes(j.id) ? <Check size={13} className="text-green-600" /> : <span className="inline-block w-[13px] h-[13px] rounded-full border border-slate-300" />}
                          {j.label}
                        </span>
                        <button type="button" className="btn-secondary text-xs" onClick={() => copy(j.id, j.line)}>{copied === j.id ? "Copied" : "Copy line"}</button>
                      </div>
                      <code className="block text-[11px] break-all text-slate-600">{j.line}</code>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">After a publish</h2>
                <Toggle s={s} set={set} k="warm_after_publish" label="Fetch the pages a publish changed, so the first visitor gets a cached copy" help="The post itself, its category, the front page and the feed are requested once, right after the caches were cleared. Without this, the first person to open each of them waits for a full render." />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Crawler</h2>
                <Toggle s={s} set={set} k="crawler_enabled" invert label="Walk the whole site and keep every page cached" help="A few pages per cron run, in sitemap order, until the whole site has been visited; then it rests for the interval and starts again. Like LiteSpeed Cache's crawler and WP Rocket's preload — but throttled for a shared host." />
                {s.crawler_enabled === "true" && (
                  <div className="ml-[46px] grid md:grid-cols-2 gap-x-6">
                    <Num s={s} set={set} k="crawler_batch" label="Pages per run" min={1} max={100} help={`With a cron every 15 minutes, ${Math.ceil((status?.urlCount ?? 0) / (parseInt(s.crawler_batch, 10) || 10))} runs (~${Math.ceil(((status?.urlCount ?? 0) / (parseInt(s.crawler_batch, 10) || 10)) * 15 / 60 * 10) / 10} h) cover the site's ${status?.urlCount ?? "…"} URLs.`} />
                    <Num s={s} set={set} k="crawler_interval_hours" label="Rest between full passes" unit="hours" min={1} max={720} help="Pages are cached for a day by default; a pass a day keeps them from ever going cold." />
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Action busy={busy} id="warm-batch" label="Run one batch now" onClick={() => warm("batch")} icon={Flame} />
                  <Action busy={busy} id="warm-home" label="Warm front page" onClick={() => warm("home")} icon={Flame} />
                </div>
                {status?.crawler.last && (
                  <p className="text-xs text-slate-400 mt-3">Last batch {ago(status.crawler.last.at)}: {status.crawler.last.fetched} fetched, {status.crawler.last.failed} failed, position {status.crawler.cursor}/{status.urlCount}. Last full pass {ago(status.crawler.lastPass)}.</p>
                )}
              </div>
            </>
          )}

          {/* ── Cloudflare ────────────────────────────────────────────── */}
          {tab === "cloudflare" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Connect</h2>
                <div className="grid md:grid-cols-2 gap-4 mb-4 text-xs text-slate-500">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-700 mb-1">1 · Zone ID</p>
                    <ol className="list-decimal ml-4 space-y-0.5">
                      <li><a className="text-brand-600 underline" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">dash.cloudflare.com <ExternalLink size={10} className="inline" /></a> → click the site&apos;s domain.</li>
                      <li>On <strong>Overview</strong>, scroll the right-hand column to <strong>API</strong>.</li>
                      <li>Copy <strong>Zone ID</strong> (32 characters) into the field below.</li>
                    </ol>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-700 mb-1">2 · API token</p>
                    <ol className="list-decimal ml-4 space-y-0.5">
                      <li><a className="text-brand-600 underline" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Profile → API Tokens <ExternalLink size={10} className="inline" /></a> → <strong>Create Token</strong>.</li>
                      <li>Top row <strong>Create Custom Token → Get started</strong> (not a template).</li>
                      <li>Name it, e.g. <code>BMS Speed</code>.</li>
                      <li><strong>Permissions</strong>, three rows (use <em>+ Add more</em> twice):<br /><code>Zone · Cache Purge · Purge</code><br /><code>Zone · Zone Settings · Edit</code><br /><code>Zone · Cache Rules · Edit</code><br /><span className="text-slate-400">The third is what &ldquo;Cache pages at the edge&rdquo; below needs; without it the rest still works.</span><div className="mt-1.5 rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-slate-600"><strong className="text-slate-800">Want to use Claude with this site, now or later?</strong> Add these two rows as well, in this same token (use <em>+ Add more</em> for each):<br /><code>Zone · Workers Routes · Edit</code><br /><code>Account · Workers Scripts · Edit</code><br />The second one adds an <strong>Account Resources</strong> box under the permissions: choose <code>Include · </code>your account. They are what the bridge under <strong>Connect Claude</strong> (in the sidebar) needs when your host blocks Claude.</div></li>
                      <li><strong>Zone Resources</strong>: <code>Include · Specific zone · </code>this domain.</li>
                      <li>Leave IP filtering and TTL empty → <strong>Continue to summary → Create Token</strong>.</li>
                      <li>Copy the token — it is shown <strong>once</strong> — paste below, then <strong>Save</strong>. Need another permission later (the third row, or the two Claude rows)? No new token: on the same Cloudflare page press the token&apos;s <strong>⋯ → Edit</strong>, add the row, <strong>Continue to summary → Update token</strong>. The token itself does not change, so there is nothing to paste again.</li>
                    </ol>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-x-6">
                  <div className="mb-4">
                    <label className="label">Zone ID</label>
                    <input className="input font-mono text-xs" value={s.cf_zone_id} onChange={(e) => set("cf_zone_id", e.target.value.trim())} placeholder="023e105f4ecef8ad9ca31a8372d0c353" />
                  </div>
                  <div className="mb-4">
                    <label className="label">API token</label>
                    <input className="input font-mono text-xs" type="password" value={s.cf_api_token} onChange={(e) => set("cf_api_token", e.target.value.trim())} placeholder="Bearer token" autoComplete="off" />
                  </div>
                </div>
                <div className="text-xs">
                  {dirty && (s.cf_zone_id || s.cf_api_token) && <span className="text-amber-700">Save, then the status below refreshes.</span>}
                  {!dirty && cf?.configured && (cf.ok ? <span className="text-emerald-700">Connected to <strong>{cf.zoneName}</strong>.</span> : <span className="text-red-600">Cloudflare refused: {cf.error}</span>)}
                  {!dirty && !cf?.configured && <span className="text-slate-400">Not connected. Without this, a published change can stay hidden behind Cloudflare&apos;s copy for hours.</span>}
                </div>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Behaviour</h2>
                <Toggle s={s} set={set} k="cf_purge_on_save" label="Clear Cloudflare's cache on every save" help="Clears the whole zone when settings are saved, and after the publish cron releases a scheduled post. Saving a post or page does NOT clear Cloudflare — this purge drops every cached image too, and Cloudflare caps it at about a thousand a day, so it is not run on every edit. Cloudflare does not cache HTML unless you add a rule telling it to; if you do, use the Purge button after publishing." />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Cache pages at the edge</h2>
                <p className="text-xs text-slate-400 mb-3">
                  The page cache on the server means a page is rendered once — but it is still sent from the server, so a
                  visitor far from it waits for the round trip anyway. Cloudflare does not keep HTML unless a rule tells it
                  to. With this on, the page comes out of the visitor&apos;s nearest Cloudflare city instead, which is the
                  difference between roughly 400 ms and 40 ms before the browser sees a single byte.
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Never cached at the edge: the admin, the API, previews, any request carrying a sign-in cookie, and
                  anything with a query string — which covers search, forms and the data Next fetches when a visitor
                  clicks through the site. The paths and cookies under <strong>Cache → Never cache</strong> are added to
                  that list, so the edge and the server agree on what is personal. How long a page is kept comes from
                  <strong> Cache → Cache lifetime</strong>, and saving anything still clears it.
                </p>
                {!cf?.configured ? (
                  <p className="text-xs text-slate-400">Connect the zone above first.</p>
                ) : cf.edgeHtml === "unreadable" ? (
                  <p className="text-xs text-amber-700">
                    Could not read the zone&apos;s cache rules: {cf.edgeHtmlError}
                    {/* Only an authentication failure is the token's fault. Saying so
                        about every error sent someone to re-make a working token. */}
                    {/auth|permission|forbidden|unauthor|invalid|denied/i.test(cf.edgeHtmlError ?? "") && (
                      <>
                        {" "}The token needs one more permission — <code>Zone → Cache Rules → Edit</code>. A token cannot be
                        shown again after it is made, so add the permission to a <strong>new</strong> token and paste that above.
                      </>
                    )}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Action busy={busy}
                      id="cf-edge_html"
                      label={cf.edgeHtml === "on" ? "Stop caching pages at the edge" : cf.edgeHtml === "stale" ? "Update the edge rule" : "Cache pages at the edge"}
                      onClick={() => cfAction("edge_html", cf.edgeHtml !== "on")}
                      icon={Cloud}
                      danger={cf.edgeHtml === "on"}
                    />
                    <span className={cn("text-xs", cf.edgeHtml === "on" ? "text-emerald-700" : cf.edgeHtml === "stale" ? "text-amber-700" : "text-slate-400")}>
                      {cf.edgeHtml === "on"
                        ? "On — Cloudflare is keeping this site's pages and optimised images."
                        : cf.edgeHtml === "stale"
                          ? "On, but written by an older version — update it so Cloudflare also keeps optimised images."
                          : "Off — every visitor is still reaching the server for the HTML."}
                    </span>
                  </div>
                )}
              </div>
              {cf?.configured && cf.ok && (
                <div className="card p-5">
                  <h2 className="font-semibold text-sm mb-3">Zone</h2>
                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    <Stat label="Browser Cache TTL" value={cf.browserTtl === 0 ? "Respect existing headers ✓" : `Forced to ${seconds(String(cf.browserTtl ?? 0))}`} sub={cf.browserTtl === 0 ? "The site's Cache-Control reaches the browser" : "Overrides the one-year lifetime the site sends"} />
                    <Stat label="Development mode" value={cf.developmentMode ? `On — ${Math.round((cf.developmentModeRemaining ?? 0) / 60)} min left` : "Off"} sub="Bypasses the edge cache for 3 hours" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cf.browserTtl !== 0 && <Action busy={busy} id="cf-respect_headers" label="Respect existing headers" onClick={() => cfAction("respect_headers")} icon={Check} />}
                    <Action busy={busy} id="cf-dev_mode" label={cf.developmentMode ? "Turn development mode off" : "Development mode for 3 hours"} onClick={() => cfAction("dev_mode", !cf.developmentMode)} icon={Wrench} />
                    <Action busy={busy} id="cf-purge" label="Purge Cloudflare cache" onClick={() => cfAction("purge")} icon={Trash2} danger />
                    <button type="button" className="btn-ghost text-xs" onClick={loadCf}>Refresh</button>
                  </div>

                  {/* Three zone features that are free on every Cloudflare plan
                      and that nothing in this CMS can do for you — they happen
                      at the edge, before a request ever reaches the server. */}
                  <h3 className="font-semibold text-sm mt-6 mb-1">Speed features at the edge</h3>
                  <p className="text-xs text-slate-500 mb-3">
                    These are switches inside Cloudflare, not this site. Turning them on here saves you finding them in
                    the Cloudflare dashboard. The first two are free on every plan.
                  </p>

                  <div className="space-y-3">
                    <EdgeFeature
                      title="Early Hints (103)"
                      on={cf.earlyHints}
                      busy={busy}
                      id="cf-early_hints"
                      onToggle={() => cfAction("early_hints", !cf.earlyHints)}
                      what="Sends the browser a list of the stylesheet and fonts it will need before the page itself is ready."
                      why="The browser normally learns what to download only after the HTML arrives. With this, it starts fetching during the wait, so the page paints sooner. It helps most on a slow connection, and it cannot slow anything down — a browser that does not understand a 103 ignores it."
                    />
                    <EdgeFeature
                      title="Smart Tiered Cache"
                      on={cf.tieredCache}
                      busy={busy}
                      id="cf-tiered_cache"
                      onToggle={() => cfAction("tiered_cache", !cf.tieredCache)}
                      what="Makes Cloudflare's datacentres ask each other for a page before asking your server."
                      why="Cloudflare has datacentres worldwide, and without this each one fetches every page from your server itself — so one popular page can be requested a hundred times over. With it they check a nearby datacentre first and your server usually answers once. On shared hosting this is the difference between a busy day and a slow site."
                    />
                    {cf.polishUnavailable ? (
                      <EdgeFeature
                        title="Polish (image compression)"
                        on={undefined}
                        unavailable="Needs a Cloudflare Pro plan. Your images are already resized and converted to WebP by this site, so this is an extra, not a gap."
                        what="Recompresses images at the edge, on Cloudflare's machines instead of yours."
                        why="Useful when a site serves original-size images. This CMS already optimises them before they are cached, so the gain here is small."
                      />
                    ) : (
                      <EdgeFeature
                        title="Polish (image compression)"
                        on={cf.polish !== undefined && cf.polish !== "off"}
                        busy={busy}
                        id="cf-polish"
                        onToggle={() => cfAction("polish", undefined, cf.polish && cf.polish !== "off" ? "off" : "lossless")}
                        what="Recompresses images at the edge, on Cloudflare's machines instead of yours."
                        why="Strips metadata and repacks images as they pass through. This CMS already resizes and converts to WebP, so treat it as a small extra rather than a fix."
                        detail={cf.polish ? `Currently: ${cf.polish}` : undefined}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Database ──────────────────────────────────────────────── */}
          {tab === "database" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Revisions</h2>
                <Num s={s} set={set} k="revisions_keep" label="Revisions to keep per post or page" min={1} max={500} help={`Enough to undo a bad session, few enough that a long-lived post is not the largest thing in the database. Currently ${status?.revisions.n ?? "…"} revisions across ${status?.revisions.docs ?? "…"} documents.`} />
                <Action busy={busy} id="db-revisions" label="Trim every document to this limit now" onClick={() => dbAction("revisions")} icon={Trash2} />
                <p className="text-xs text-slate-400 mt-2">New saves trim automatically; this applies a lowered limit to what is already there. Save the new limit first.</p>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Trash and logs</h2>
                <Num s={s} set={set} k="cleanup_trash_days" label="Empty trash after" unit="days" min={1} max={365} help="Trashed posts and pages older than this are deleted for good, with their revisions." />
                <Toggle s={s} set={set} k="cleanup_auto" label="Clean up automatically once a day" help="Once a day, from the publish cron or when an administrator opens the dashboard: old trash, error-log entries older than 30 days, 404 entries not hit in 90 days, revisions past the limit." />
                {status?.cleanup && (
                  <div className="mt-3 rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs">
                    {status.cleanup.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between px-3 py-2">
                        <div><span className="text-slate-700">{it.label}</span><span className="text-slate-400 ml-2">{it.detail}</span></div>
                        <span className={cn("font-mono", it.count > 0 ? "text-amber-700" : "text-slate-400")}>{it.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-3">
                  <Action busy={busy} id="db-cleanup" label={`Clean up now${status?.cleanup ? ` (${status.cleanup.total} rows)` : ""}`} onClick={() => dbAction("cleanup")} icon={Trash2} />
                  <span className="text-xs text-slate-400">Last run {ago(status?.cleanup?.lastRun)}</span>
                </div>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Not offered</h2>
                <p className="text-xs text-slate-400">Object cache (Redis/Memcached) and table optimisation are WordPress remedies for WordPress problems. Settings here are read once per request from a 400-row table, and the database is Postgres, which maintains itself.</p>
              </div>
            </>
          )}

          {/* ── Tools ─────────────────────────────────────────────────── */}
          {tab === "tools" && (
            <>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-4">Debugging</h2>
                <Toggle s={s} set={set} k="speed_debug_headers" invert label="Send an X-BMS-Cache header on every page" help="Says why the response was or was not cacheable: page:86400, home:3600, logged-in, query:s, excluded-path, cookie:cart_id, rsc, disabled. Visible in the Dashboard test and in the browser's Network panel. Harmless to leave on; off by default to keep responses tidy." />
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Server rules</h2>
                <p className="text-xs text-slate-400 mb-3">
                  Two things this app cannot do from inside Node. Files that exist on disk — every uploaded image, and
                  <code> /bms-plugins.js</code> — are answered by the web server before the request ever reaches the
                  site, so the lifetimes set under <strong>Browser cache</strong> never apply to them and the host&apos;s own
                  four-hour default wins; and the server keys its page cache on the whole URL, so
                  <code> ?utm_source=newsletter</code> is a second copy of a page it already had. Both are fixed by a few
                  lines in the site&apos;s <code>.htaccess</code>, which this writes for you.
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  Two files, because Apache reads the ones along the path of what it is serving: the page-cache rules go in the domain&apos;s own folder, and the file lifetimes go beside the uploads, under the app. Only the block between two <code>BMS by Rehan</code> markers is ever touched — the rest of each file,
                  including the block that makes the site run at all, is copied through untouched, and the previous
                  version is kept beside it. After writing, the site is fetched to check it still answers; if it does
                  not, the old file goes straight back.
                </p>

                {ht && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-3 text-xs">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-slate-500 shrink-0">Uploaded images are served with</span>
                      <code className={cn("font-medium", (ht.uploadsMaxAge ?? 0) >= 2592000 ? "text-emerald-700" : "text-amber-700")}>
                        {ht.uploadsCacheControl || "no Cache-Control"}
                      </code>
                    </div>
                    <p className="text-slate-400">
                      {(ht.uploadsMaxAge ?? 0) >= 2592000
                        ? "That is the long lifetime these rules ask for — they are working. This is measured over HTTP, not assumed."
                        : "Short. A returning visitor re-downloads every image on the page, and PageSpeed reports it as “use efficient cache lifetimes”."}
                    </p>
                  </div>
                )}

                {ht?.path ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Action busy={busy}
                      id="ht-apply"
                      label={ht.managed === "current" ? "Re-apply the rules" : ht.managed === "outdated" ? "Update the rules" : "Apply the rules"}
                      onClick={() => htAction("apply")}
                      icon={Check}
                    />
                    {ht.managed !== "absent" && (
                      <Action busy={busy} id="ht-remove" label="Remove them" onClick={() => htAction("remove")} icon={Trash2} danger />
                    )}
                    <span className={cn("text-xs", ht.managed === "current" ? "text-emerald-700" : "text-slate-400")}>
                      {ht.managed === "current"
                        ? "In place and up to date."
                        : ht.managed === "outdated"
                          ? "An older version of the block is in the file."
                          : "Not applied yet."}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 mb-2">
                    {ht
                      ? "This site is not on a host where the file can be written automatically — the folder the domain is served from could not be identified. Paste the rules in by hand instead, or set BMS_DOCROOT to that folder and reload."
                      : "Checking…"}
                  </p>
                )}

                {ht?.path && (
                  <div className="text-[11px] text-slate-400 mt-2 font-mono break-all">
                    <div>{ht.path}</div>
                    {ht.publicPath && <div>{ht.publicPath}</div>}
                  </div>
                )}

                <details className="mt-4">
                  <summary className="text-xs text-slate-500 cursor-pointer">Show the rules, to paste by hand</summary>
                  <pre className="rounded-lg bg-slate-900 text-slate-100 text-[11px] p-3 overflow-x-auto leading-relaxed mt-2">{HTACCESS}</pre>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button type="button" className="btn-ghost text-xs" onClick={() => navigator.clipboard.writeText(HTACCESS).then(() => say("ok", "Copied."))}>Copy</button>
                    <button type="button" className="btn-ghost text-xs inline-flex items-center gap-2" onClick={downloadHtaccess}><Download size={14} /> Download .htaccess</button>
                  </div>
                </details>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-3">Export / import</h2>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary text-xs inline-flex items-center gap-2" onClick={exportSettings}><Download size={14} /> Export speed settings</button>
                  <button type="button" className="btn-secondary text-xs inline-flex items-center gap-2" onClick={() => importRef.current?.click()}><Upload size={14} /> Import…</button>
                  <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f); e.target.value = ""; }} />
                  <button type="button" className="btn-ghost text-xs inline-flex items-center gap-2" onClick={reset}><RotateCcw size={14} /> Reset to defaults</button>
                </div>
                <p className="text-xs text-slate-400 mt-2">The export includes the Cloudflare token — keep the file private. Import and reset change the form only; Save applies them.</p>
              </div>
              <div className="card p-5">
                <h2 className="font-semibold text-sm mb-1">Done by the build, not by a switch</h2>
                <ul className="text-xs text-slate-400 list-disc ml-4 space-y-0.5">
                  <li>Minified, code-split CSS and JavaScript with hashed file names cached for a year</li>
                  <li>Compression by LiteSpeed / Cloudflare (Brotli), HTML not compressed twice</li>
                  <li>Responsive images with width, height and srcset; AVIF/WebP conversion; a year&apos;s cache on optimised sizes</li>
                  <li>Pages pre-rendered and kept by Next until something changes; incremental revalidation by tag</li>
                  <li>Google Fonts CSS inlined; no emoji script, no jQuery, no render-blocking third-party CSS</li>
                </ul>
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
              {saved ? "Saved" : "Save Speed Settings"}
            </button>
            {dirty && !saving && <span className="text-xs text-amber-700">Unsaved changes</span>}
            <span className="text-xs text-slate-400">Saving clears every cache, as any save does.</span>
          </div>
        </form>
      </div>
    </>
  );
}
