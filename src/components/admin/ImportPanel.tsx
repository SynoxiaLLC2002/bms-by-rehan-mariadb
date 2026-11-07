"use client";

// Restoring an export.
//
// The whole design of this screen is the preview. Import writes to a live site,
// and the one thing that makes that safe to attempt is being able to see what
// it would do before it does it — so the file is checked first, the counts are
// shown, and only then does the button say Import.

import { useRef, useState } from "react";
import { Loader2, Upload, TriangleAlert, Check } from "lucide-react";

interface Report {
  ok: boolean;
  dryRun: boolean;
  created: Record<string, number>;
  skipped: Record<string, number>;
  restored?: Record<string, number>;
  notes: string[];
}

const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

function Counts({ label, map }: { label: string; map: Record<string, number> }) {
  const entries = Object.entries(map).filter(([, n]) => n > 0);
  if (entries.length === 0) return <p className="text-[11px] text-slate-400">{label}: nothing</p>;
  return (
    <p className="text-[11px] leading-relaxed text-slate-600">
      <span className="font-semibold">{label}:</span>{" "}
      {entries.map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ")}
    </p>
  );
}

export default function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [withSettings, setWithSettings] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Report | null>(null);
  const [done, setDone] = useState<Report | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setFile(null); setName(""); setPreview(null); setDone(null); setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(""); setPreview(null); setDone(null);
    setName(f.name);

    // A `.zip` is sent to the server whole — it holds the uploaded files as
    // well as the content, and unpacking it here only to repackage it would
    // mean base64-ing every image through JSON.
    if (f.name.toLowerCase().endsWith(".zip")) {
      setFile(f);
      await run(f, true);
      return;
    }

    try {
      const parsed = JSON.parse(await f.text());
      setFile(parsed);
      await run(parsed, true);
    } catch {
      setError("That file is not valid JSON.");
      setFile(null);
    }
  }

  /**
   * `opts` carries a checkbox's *new* value: a preview re-run from the same
   * click would otherwise read the state from before it, and show what the
   * previous setting would do.
   */
  async function run(payload: unknown, dryRun: boolean, opts: { settings?: boolean; overwrite?: boolean } = {}) {
    const useSettings = opts.settings ?? withSettings;
    const useOverwrite = opts.overwrite ?? overwrite;
    setBusy(true);
    setError("");
    try {
      const res = payload instanceof File
        ? await fetch("/api/import", {
            method: "POST",
            body: (() => {
              const fd = new FormData();
              fd.set("file", payload);
              fd.set("settings", String(useSettings));
              fd.set("overwrite", String(useOverwrite));
              fd.set("dryRun", String(dryRun));
              return fd;
            })(),
          })
        : await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: payload, settings: useSettings, overwrite: useOverwrite, dryRun }),
          });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "The import failed."); return; }
      if (dryRun) setPreview(data as Report);
      else { setDone(data as Report); setPreview(null); }
    } catch {
      setError("The import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Upload size={16} className="text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Import content</h2>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        Restores a backup made by Export or by the automatic backups — either the
        <code>.json</code> file or the <code>.zip</code> that carries the uploaded images too.
        By default it only <em>adds</em> what is missing: anything already here is kept and
        skipped, so it brings back deleted content but does not undo changes.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,.zip,application/zip"
        onChange={pick}
        className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:border-brand-400"
      />

      {/* The mode a backup is actually for: after a defaced site, a bad bulk
          edit or an emptied post, "add what is missing" restored nothing,
          because every one of those documents still existed. */}
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => {
            setOverwrite(e.target.checked);
            if (file) void run(file, true, { overwrite: e.target.checked });
          }}
          className="rounded border-slate-300"
        />
        Restore: put existing posts and pages back to the backup&rsquo;s version
      </label>
      {overwrite && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          Every post and page that differs from the backup is replaced by it — text, SEO, status,
          date, tags — and trashed ones come back out of the trash. Each one&rsquo;s current version is
          kept in its History, so a single post can still be put back. Menus, categories and
          elements are only added, never overwritten.
        </p>
      )}

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={withSettings}
          onChange={(e) => {
            setWithSettings(e.target.checked);
            // The preview is answering a different question once this changes.
            if (file) void run(file, true, { settings: e.target.checked });
          }}
          className="rounded border-slate-300"
        />
        Also import settings (overwrites this site&rsquo;s configuration)
      </label>
      {/* Restoring your own backup should bring your scripts back, so the
          import deliberately carries every settings key — `script_head`,
          `script_body_end`, `custom_css` and the header HTML included. That is
          right for a restore and worth spelling out for anything else: with
          this ticked, an archive from somebody else runs their JavaScript on
          every page of this site. The old label said "overwrites this site's
          configuration", which is true and does not tell anyone that. */}
      {withSettings && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          This includes the site&rsquo;s custom scripts, custom CSS and header HTML. Restoring your own
          backup is what that is for — but if this archive came from someone else, their code will run
          on every page of this site. Import settings only from an archive you trust.
        </p>
      )}

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
          <Loader2 size={13} className="animate-spin" /> Checking…
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
          <TriangleAlert size={13} className="mt-px shrink-0" /> {error}
        </p>
      )}

      {preview && !done && (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3">
          <p className="mb-2 text-[11px] font-semibold text-slate-700">
            {name} — this is what importing would do:
          </p>
          <Counts label="Add" map={preview.created} />
          {overwrite && <Counts label="Put back to the backup's version" map={preview.restored ?? {}} />}
          <Counts label={overwrite ? "Skip (already the same)" : "Skip (already here)"} map={preview.skipped} />
          {preview.notes.map((n, i) => (
            <p key={i} className="mt-2 text-[11px] leading-relaxed text-amber-800">{n}</p>
          ))}
          <button
            onClick={() => file && run(file, false)}
            disabled={busy || total(preview.created) + total(preview.restored ?? {}) === 0}
            className="btn-primary mt-3 text-xs disabled:opacity-40"
          >
            {total(preview.created) + total(preview.restored ?? {}) === 0 ? "Nothing to import" : overwrite ? "Restore" : "Import"}
          </button>
        </div>
      )}

      {done && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
            <Check size={13} /> Imported.
          </p>
          <Counts label="Added" map={done.created} />
          {done.restored && total(done.restored) > 0 && <Counts label="Put back" map={done.restored} />}
          <Counts label="Skipped" map={done.skipped} />
          {done.notes.map((n, i) => (
            <p key={i} className="mt-2 text-[11px] leading-relaxed text-emerald-900">{n}</p>
          ))}
          <button onClick={reset} className="btn-ghost mt-2 text-xs">Import another file</button>
        </div>
      )}
    </div>
  );
}
