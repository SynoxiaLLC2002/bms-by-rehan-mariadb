"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Brush as Broom,
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  Globe,
  Info,
  Loader2,
  Plug,
  RefreshCw,
  Search,
  Server,
  Shield,
  Sparkles,
  XCircle,
  Zap,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, type CleanupPreview, type HealthCategory, type HealthCheck, type HealthReport, type HealthStat, type HealthStatus } from "@/lib/siteHealthTypes";

// One screen, three layers: the verdict and the numbers at the top, then what
// needs doing, then everything else grouped by what it is about. Someone who
// only reads the first card still leaves knowing whether the site is alright.

const STYLE: Record<HealthStatus, { icon: typeof CheckCircle2; badge: string; dot: string; label: string }> = {
  fail: { icon: XCircle, badge: "text-red-700 bg-red-50 ring-red-200", dot: "bg-red-500", label: "Broken" },
  warn: { icon: AlertTriangle, badge: "text-amber-700 bg-amber-50 ring-amber-200", dot: "bg-amber-400", label: "Worth fixing" },
  info: { icon: Info, badge: "text-slate-600 bg-slate-100 ring-slate-200", dot: "bg-slate-300", label: "Note" },
  ok: { icon: CheckCircle2, badge: "text-emerald-700 bg-emerald-50 ring-emerald-200", dot: "bg-emerald-500", label: "Fine" },
};

const SEVERITY: Record<HealthStatus, number> = { fail: 0, warn: 1, info: 2, ok: 3 };

const CATEGORY_ICON: Record<HealthCategory, typeof Globe> = {
  identity: Sparkles,
  seo: Search,
  security: Shield,
  server: Server,
  database: Database,
  content: FileText,
  integrations: Plug,
};

const CATEGORY_ORDER: HealthCategory[] = ["security", "seo", "identity", "content", "server", "database", "integrations"];

function StatusIcon({ status, size = 14 }: { status: HealthStatus; size?: number }) {
  const { icon: Icon, badge } = STYLE[status];
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${badge.split(" ").slice(0, 2).join(" ")}`}>
      <Icon size={size} />
    </span>
  );
}

/**
 * "Fix ↗" — opens the screen that fixes it in a new tab, so this report
 * stays where it is while the person works through the list.
 */
function FixLink({ href, className = "" }: { href: string; className?: string }) {
  // A "#…" anchor is a section of this page: scroll there, same tab.
  if (href.startsWith("#")) {
    return (
      <a href={href} className={`flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline ${className}`}>
        Fix below ↓
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener" className={`flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline ${className}`}>
      Fix <ExternalLink size={11} />
    </a>
  );
}

/** The steps, in a muted box under the finding. */
function HowTo({ text }: { text: string }) {
  return (
    <p className="mt-1.5 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-600">
      <span className="font-semibold text-slate-500">How: </span>
      {text}
    </p>
  );
}

function Row({ check, compact = false }: { check: HealthCheck; compact?: boolean }) {
  return (
    <li className={`flex items-start gap-3 ${compact ? "py-2" : "py-2.5"}`}>
      <StatusIcon status={check.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <p className={`text-sm font-medium ${check.status === "ok" ? "text-slate-700" : "text-slate-900"}`}>{check.label}</p>
          {check.href && check.status !== "ok" && <FixLink href={check.href} />}
          {check.href && check.status === "ok" && (
            <a href={check.href} target={check.href.startsWith("http") ? "_blank" : undefined} rel="noopener" className="text-[11px] text-slate-400 hover:text-brand-600 hover:underline">
              Open
            </a>
          )}
        </div>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-500">{check.detail}</p>
        {check.how && check.status !== "ok" && <HowTo text={check.how} />}
      </div>
    </li>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const tone = score >= 90 ? "text-emerald-500" : score >= 70 ? "text-amber-500" : "text-red-500";
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} className="stroke-slate-100" strokeWidth="7" fill="none" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className={`${tone} stroke-current transition-[stroke-dashoffset] duration-700`}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * score) / 100}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none text-slate-900">{score}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">score</span>
      </div>
    </div>
  );
}

function StatTile({ stat }: { stat: HealthStat }) {
  const tone =
    stat.tone === "good" ? "text-emerald-600" : stat.tone === "warn" ? "text-amber-600" : stat.tone === "bad" ? "text-red-600" : "text-slate-900";
  const body = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{stat.label}</p>
      <p className={`mt-1 text-2xl font-bold leading-none ${tone}`}>{stat.value}</p>
      {stat.note && <p className="mt-1.5 truncate text-[11px] text-slate-500">{stat.note}</p>}
    </>
  );
  const cls = "card block p-4 transition-colors";
  return stat.href ? (
    <Link href={stat.href} className={`${cls} hover:border-brand-300 hover:bg-brand-50/30`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function CategoryCard({ category, items, showFine }: { category: HealthCategory; items: HealthCheck[]; showFine: boolean }) {
  const Icon = CATEGORY_ICON[category];
  const meta = CATEGORY_LABELS[category];
  const sorted = [...items].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);
  const visible = showFine ? sorted : sorted.filter((c) => c.status !== "ok");
  const worst = sorted[0]?.status ?? "ok";
  const fine = items.filter((c) => c.status === "ok").length;
  const issues = items.length - fine - items.filter((c) => c.status === "info").length;

  return (
    <section className="card flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${worst === "fail" ? "bg-red-50 text-red-600" : worst === "warn" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
          <p className="truncate text-[11px] text-slate-400">{meta.blurb}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${issues > 0 ? STYLE[worst].badge : fine > 0 ? STYLE.ok.badge : STYLE.info.badge}`}>
          {issues > 0 ? `${issues} to fix` : fine > 0 ? `${fine}/${items.length} fine` : `${items.length} note${items.length === 1 ? "" : "s"}`}
        </span>
      </header>
      <ul className="flex-1 divide-y divide-slate-100 px-5">
        {visible.length === 0 ? (
          <li className="py-4 text-center text-xs text-slate-400">Everything here is fine.</li>
        ) : (
          visible.map((c) => <Row key={c.id} check={c} compact />)
        )}
      </ul>
    </section>
  );
}

export default function HealthPanel({ report }: { report: HealthReport }) {
  const router = useRouter();
  const [live, setLive] = useState<HealthCheck[] | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [showFine, setShowFine] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cleanup, setCleanup] = useState<CleanupPreview | undefined>(report.cleanup);
  const [cleaning, setCleaning] = useState(false);
  const [cleanNote, setCleanNote] = useState("");

  // Cloudflare purge config — loaded once so the fields don't flash empty
  // and overwrite a saved token the moment someone clicks Save.
  const [cfZoneId, setCfZoneId] = useState("");
  const [cfApiToken, setCfApiToken] = useState("");
  const [cfLoaded, setCfLoaded] = useState(false);
  const [cfSaving, setCfSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeNote, setPurgeNote] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setCfZoneId(d.settings?.cf_zone_id ?? "");
        setCfApiToken(d.settings?.cf_api_token ?? "");
      })
      .catch(() => {})
      .finally(() => setCfLoaded(true));
  }, []);

  async function saveCloudflareConfig() {
    setCfSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cf_zone_id: cfZoneId, cf_api_token: cfApiToken }),
      }).catch(() => null);
      if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        window.alert((data as { error?: string }).error || "The Cloudflare settings could not be saved.");
      }
    } finally {
      setCfSaving(false);
    }
  }

  async function purgeCache() {
    setPurging(true);
    setPurgeNote("");
    try {
      const res = await fetch("/api/cache/purge", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPurgeNote(data.error ?? "Purge failed.");
        return;
      }
      const cf = data.cloudflare as { attempted: boolean; ok: boolean; error?: string } | undefined;
      setPurgeNote(
        !cf?.attempted
          ? "LiteSpeed cache purged."
          : cf.ok
            ? "LiteSpeed and Cloudflare caches purged."
            : `LiteSpeed cache purged — Cloudflare purge failed: ${cf.error}`
      );
    } catch {
      setPurgeNote("Purge failed.");
    } finally {
      setPurging(false);
    }
  }

  async function runCleanup() {
    setCleaning(true);
    setCleanNote("");
    try {
      const res = await fetch("/api/maintenance", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCleanNote(data.error ?? "Clean-up failed.");
        return;
      }
      setCleanup(data.preview);
      setCleanNote(data.total > 0 ? `Removed ${data.total} row${data.total === 1 ? "" : "s"}.` : "Nothing to remove.");
    } catch {
      setCleanNote("Clean-up failed.");
    } finally {
      setCleaning(false);
    }
  }

  async function runLive() {
    setLiveBusy(true);
    setLiveError("");
    try {
      const res = await fetch("/api/health", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setLiveError(data.error ?? "Could not run the live check.");
        return;
      }
      setLive(data.checks);
    } catch {
      setLiveError("Could not run the live check.");
    } finally {
      setLiveBusy(false);
    }
  }

  function recheck() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
  }

  const attention = useMemo(
    () => report.checks.filter((c) => c.status === "fail" || c.status === "warn").sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]),
    [report.checks]
  );
  const byCategory = useMemo(() => {
    const map = new Map<HealthCategory, HealthCheck[]>();
    for (const c of report.checks) {
      const key = c.category ?? "server";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return CATEGORY_ORDER.filter((k) => map.has(k)).map((k) => ({ category: k, items: map.get(k)! }));
  }, [report.checks]);

  const headline =
    report.counts.fail > 0
      ? `${report.counts.fail} thing${report.counts.fail === 1 ? "" : "s"} need${report.counts.fail === 1 ? "s" : ""} fixing`
      : report.counts.warn > 0
        ? "Nothing broken, a few things worth doing"
        : "Everything looks right";
  const ran = new Date(report.ranAt);

  return (
    <div className="space-y-5">
      {/* Verdict */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-5">
          <ScoreRing score={report.score} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Site health</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{headline}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(["fail", "warn", "info", "ok"] as HealthStatus[]).map((st) => (
                <span key={st} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STYLE[st].badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STYLE[st].dot}`} />
                  {report.counts[st]} {STYLE[st].label.toLowerCase()}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {report.checks.length} checks · ran {ran.toLocaleTimeString()} · the live-site check below reaches the public address
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={showFine} onChange={(e) => setShowFine(e.target.checked)} className="rounded border-slate-300" />
              Show fine
            </label>
            <button onClick={recheck} disabled={refreshing} className="btn-ghost flex items-center gap-1.5 text-xs" title="Run the checks again">
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Re-check
            </button>
            <button onClick={runLive} disabled={liveBusy} className="btn-primary flex items-center gap-2 text-xs">
              {liveBusy ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />}
              {liveBusy ? "Checking…" : "Check live site"}
            </button>
          </div>
        </div>
      </div>

      {/* Numbers */}
      {report.stats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {report.stats.map((st) => (
            <StatTile key={st.id} stat={st} />
          ))}
        </div>
      )}

      {/* Live site result */}
      {(live || liveError) && (
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-brand-600" />
            <p className="text-sm font-semibold text-slate-900">Live site</p>
            <p className="text-[11px] text-slate-400">— what a visitor gets from the public address right now</p>
          </div>
          {liveError && <p className="mt-3 text-xs text-red-600">{liveError}</p>}
          {live && (
            <ul className="mt-2 grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
              {live.map((c) => (
                <Row key={c.id} check={c} compact />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* What to do */}
      {attention.length > 0 && (
        <div className="card p-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-semibold text-slate-900">Needs attention</p>
            <p className="text-[11px] text-slate-400">{attention.length} item{attention.length === 1 ? "" : "s"}, worst first</p>
          </div>
          <ul className="mt-1 grid gap-x-8 md:grid-cols-2">
            {attention.map((c) => (
              <li key={c.id} className="flex items-start gap-3 border-b border-slate-100 py-2.5 last:border-0 md:[&:nth-last-child(2)]:border-0">
                <StatusIcon status={c.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium text-slate-900">{c.label}</p>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{CATEGORY_LABELS[c.category ?? "server"].label}</span>
                    {c.href && <FixLink href={c.href} className="ml-auto" />}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{c.detail}</p>
                  {c.how && <HowTo text={c.how} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Housekeeping */}
      {cleanup && (
        <div className="card p-5">
          <div id="cleanup" className="flex flex-wrap items-start justify-between gap-4 scroll-mt-6">
            <div>
              <div className="flex items-center gap-2">
                <Broom size={15} className="text-brand-600" />
                <p className="text-sm font-semibold text-slate-900">Database clean-up</p>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Trash older than {cleanup.trashDays} days, stale logs and expired sessions. Runs by itself once a day with the publish cron
                {cleanup.lastRun ? ` · last run ${new Date(cleanup.lastRun).toLocaleString()}` : " · has not run yet"}.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {cleanNote && <span className="text-xs text-slate-500">{cleanNote}</span>}
              <button onClick={runCleanup} disabled={cleaning || cleanup.total === 0} className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50">
                {cleaning ? <Loader2 size={13} className="animate-spin" /> : <Broom size={13} />}
                {cleaning ? "Cleaning…" : cleanup.total === 0 ? "Nothing to clean" : `Clean up ${cleanup.total} row${cleanup.total === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
          <ul className="mt-3 grid gap-x-8 sm:grid-cols-2 xl:grid-cols-5">
            {cleanup.items.map((it) => (
              <li key={it.id} className="border-t border-slate-100 py-2.5">
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">{it.label}</span>
                  <span className={`text-sm font-bold ${it.count > 0 ? "text-amber-600" : "text-slate-300"}`}>{it.count}</span>
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500">{it.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cache */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-brand-600" />
              <p className="text-sm font-semibold text-slate-900">Cache</p>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              A settings save already purges LiteSpeed&apos;s cache on its own — this is the same purge, on demand.
              Add a Cloudflare API token below to purge its edge cache too, the layer LiteSpeed can&apos;t reach on
              its own: a published change can otherwise sit cached at Cloudflare&apos;s edge for a while even
              though the origin already has it right.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {purgeNote && <span className="text-xs text-slate-500">{purgeNote}</span>}
            <button onClick={purgeCache} disabled={purging} className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50">
              {purging ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {purging ? "Purging…" : "Purge cache"}
            </button>
          </div>
        </div>

        <div id="cloudflare" className="mt-4 border-t border-slate-100 pt-4 scroll-mt-6">
          <div className="flex items-center gap-2">
            <Cloud size={14} className="text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">Cloudflare (optional)</p>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] text-slate-400">Zone ID</span>
              <input
                value={cfZoneId}
                onChange={(e) => setCfZoneId(e.target.value)}
                disabled={!cfLoaded}
                placeholder="From the Cloudflare dashboard → this domain → Overview"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-400">API Token</span>
              <input
                type="password"
                value={cfApiToken}
                onChange={(e) => setCfApiToken(e.target.value)}
                disabled={!cfLoaded}
                placeholder="A token scoped to Zone → Cache Purge → Purge"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
          </div>
          <button
            onClick={saveCloudflareConfig}
            disabled={cfSaving || !cfLoaded}
            className="btn-ghost mt-2 text-xs disabled:opacity-50"
          >
            {cfSaving ? "Saving…" : "Save Cloudflare settings"}
          </button>
        </div>
      </div>

      {/* Everything, by area */}
      <div className="columns-1 gap-4 md:columns-2 2xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {byCategory.map(({ category, items }) => (
          <CategoryCard key={category} category={category} items={items} showFine={showFine} />
        ))}
      </div>
    </div>
  );
}
