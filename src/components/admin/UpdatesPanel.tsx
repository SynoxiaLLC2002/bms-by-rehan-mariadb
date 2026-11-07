"use client";

// The Updates screen.
//
// Three ways an update can happen, and the screen says which one applies:
// "self" — server.js installs the signed release from GitHub in place, with
// rollback (cPanel and other servers); "deploy-hook" — the host rebuilds
// (Vercel/Netlify); "manual" — the exact steps, never a button that quietly
// does nothing.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, Rocket, RotateCcw, TriangleAlert } from "lucide-react";

interface Release {
  version: string;
  released?: string;
  notes?: string[];
  url?: string;
  critical?: boolean;
}

interface Status {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  release: Release | null;
  method: "self" | "deploy-hook" | "manual";
  blocked?: string;
  canRollback?: boolean;
  error?: string;
  checkedAt: string;
}

export default function UpdatesPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch("/api/updates", { cache: "no-store" });
      setStatus(res.ok ? await res.json() : null);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  async function apply(action?: "rollback") {
    if (action === "rollback" && !confirm("Go back to the version that ran before the last update?")) return;
    setApplying(true);
    setResult(null);
    try {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setResult(res.ok
        ? { ok: true, text: data.message ?? "Build started." }
        : { ok: false, text: data.error ?? "Could not start the update." });
      // The site restarts itself; show the version it comes back with.
      if (res.ok && status?.method === "self") setTimeout(() => window.location.reload(), 12000);
    } catch {
      setResult({ ok: false, text: "Could not start the update." });
    } finally {
      setApplying(false);
    }
  }

  if (checking && !status) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 size={15} className="animate-spin" /> Checking for updates…
      </div>
    );
  }

  const upToDate = status && !status.updateAvailable && status.latest;

  return (
    <div className="space-y-6">
      {/* What is running */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              This site is running
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              BMS <span className="font-mono text-xl">v{status?.current ?? "?"}</span>
            </p>
            {status?.latest && (
              <p className="mt-1 text-xs text-slate-500">
                Latest published: <span className="font-mono">v{status.latest}</span>
              </p>
            )}
          </div>
          <button
            onClick={check}
            disabled={checking}
            className="btn-ghost flex shrink-0 items-center gap-1.5 text-xs"
            title="Check again"
          >
            <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
            Check again
          </button>
        </div>

        {upToDate && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
            <Check size={13} /> You are on the latest version.
          </p>
        )}

        {status?.error && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            <span>
              {status.error}
              {status.method !== "self" && (
                <>
                  {" "}Set <code>UPDATE_MANIFEST_URL</code> in <code>.env.local</code> to the JSON file
                  where releases are published, and this screen will track them.
                </>
              )}
            </span>
          </p>
        )}
      </div>

      {/* What is new */}
      {status?.updateAvailable && status.release && (
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Rocket size={15} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              Version {status.release.version} is available
            </h2>
            {status.release.critical && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                Important
              </span>
            )}
          </div>

          {status.release.released && (
            <p className="mb-3 text-[11px] text-slate-400">
              Released {new Date(status.release.released).toLocaleDateString()}
            </p>
          )}

          {status.release.notes && status.release.notes.length > 0 && (
            <ul className="mb-4 space-y-1.5">
              {status.release.notes.map((n, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {n}
                </li>
              ))}
            </ul>
          )}

          {status.release.url && (
            <a
              href={status.release.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Read the full notes
            </a>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            {status.method === "self" && !status.blocked ? (
              <>
                <button onClick={() => apply()} disabled={applying} className="btn-primary flex items-center gap-2">
                  {applying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  {applying ? "Installing… (up to a minute)" : "Update now"}
                </button>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Downloads the release, checks its signature, installs it and restarts the site (a few
                  seconds). Your posts, images, settings and database are not touched, and the current
                  version is kept so you can roll back.
                </p>
              </>
            ) : status.method === "self" ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                <TriangleAlert size={13} className="mt-px shrink-0" />
                {status.blocked}
              </p>
            ) : status.method === "deploy-hook" ? (
              <>
                <button onClick={() => apply()} disabled={applying} className="btn-primary flex items-center gap-2">
                  {applying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                  {applying ? "Starting…" : "Update now"}
                </button>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  This rebuilds the site from the latest code. It takes a couple of minutes, and the
                  live site keeps serving the current version until the build finishes — nothing goes
                  down.
                </p>
              </>
            ) : (
              <ManualInstructions version={status.release.version} />
            )}

            {result && (
              <p className={`mt-3 text-[11px] ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
                {result.text}
              </p>
            )}
          </div>
        </div>
      )}

      {status?.method === "self" && status.canRollback && (
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Something wrong after the last update?</h2>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            The version that ran before it is kept. Going back takes a few seconds and does not touch your content.
          </p>
          <button onClick={() => apply("rollback")} disabled={applying} className="btn-ghost flex items-center gap-2 text-xs">
            <RotateCcw size={13} /> Roll back
          </button>
          {result && !status.updateAvailable && (
            <p className={`mt-3 text-[11px] ${result.ok ? "text-emerald-600" : "text-red-600"}`}>{result.text}</p>
          )}
        </div>
      )}

      {/* How updating works here */}
      <div className="card p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">How updates work</h2>
        <p className="text-xs leading-relaxed text-slate-500">
          This CMS is a compiled application, not a set of PHP files — so an update is{" "}
          <em>install, build, restart</em> rather than swapping files in place. It cannot rebuild
          itself.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {status?.method === "self" ? (
            <>
              This site installs <strong>signed</strong> BMS releases itself: it only accepts a release
              signed with the BMS release key, swaps the program files, restarts, and builds any new
              database tables on start. If the new version cannot start, it goes back to the previous
              one by itself. Releases that add packages, or move between major versions, are installed by
              hand and say so above.
            </>
          ) : status?.method === "deploy-hook" ? (
            <>
              A deploy hook is configured, so the button above asks your host to pull the latest
              code and rebuild. The build still has to succeed on the host&rsquo;s side — this
              screen reports that it started, not that it finished.
            </>
          ) : (
            <>
              This site updates <strong>manually</strong>: someone with server access installs the
              new release and rebuilds, using the steps shown when an update is available. That is
              deliberate — it means a release is never applied to your live site without a person
              deciding to.
            </>
          )}
        </p>
        {status?.method === "manual" && (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            If you later want this to be one click, put a host deploy hook URL in{" "}
            <code>DEPLOY_HOOK_URL</code> and the button appears. It rebuilds code only — the
            database step below still has to be done by hand.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The manual update procedure — the normal path for this CMS.
 *
 * Written as the real sequence rather than the tidy one. Two details matter and
 * are easy to get wrong: `.env.local` and `public/uploads` live inside the
 * project folder, so replacing the folder wholesale destroys the site's
 * configuration and every uploaded image; and this project has no automatic
 * migration runner, so a release that changes the database changes nothing
 * until someone applies its SQL. Both are stated here rather than assumed.
 */
function ManualInstructions({ version }: { version: string }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold text-slate-600">
        To update to {version}, on the machine where the site runs:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 px-3 py-2.5 text-[11px] leading-relaxed text-slate-100">
{`# 1. Back up  (Settings -> Export, and copy public/uploads)

# 2. Put the new release in place, keeping these two:
#      .env.local        your database URL, secrets, SMTP
#      public/uploads    every image the site has ever used
#    (if the project is in Git, this step is just: git pull)

# 3. Rebuild and restart
npm install
npm run build
npm run start        # or: pm2 restart <name>`}
      </pre>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        The database catches up by itself: new tables and columns are added when the site starts.
      </p>
    </div>
  );
}
