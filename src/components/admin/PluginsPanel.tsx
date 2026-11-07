"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Copy, Loader2, Package, Trash2, Upload } from "lucide-react";
import type { InstalledPlugin } from "@/lib/plugins";

export default function PluginsPanel({ initial }: { initial: InstalledPlugin[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/plugins", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setMessage({ ok: false, text: data.error ?? "Could not install the plugin." });
      else {
        setMessage({ ok: true, text: `Installed ${data.manifest.name} ${data.manifest.version}. Shortcode: [${data.manifest.slug}]` });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Could not install the plugin." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function patch(slug: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/plugins/${slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setMessage({ ok: false, text: (data as { error?: string }).error || "That plugin could not be changed." });
    }
    router.refresh();
  }

  async function remove(p: InstalledPlugin) {
    if (!confirm(`Remove ${p.name}? Posts that use [${p.slug}] will show the shortcode as text until it is installed again.`)) return;
    const res = await fetch(`/api/plugins/${p.slug}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setMessage({ ok: false, text: (data as { error?: string }).error || `${p.name} could not be removed.` });
    } else setMessage({ ok: true, text: `${p.name} removed.` });
    router.refresh();
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Install a plugin</p>
            <p className="mt-0.5 text-xs text-slate-500">
              A plugin is a zip with a <code>plugin.json</code>, an <code>index.html</code>, and optionally{" "}
              <code>style.css</code> and <code>script.js</code>. Uploading the same slug again upgrades it and keeps its settings.
            </p>
          </div>
          <label className={`btn-primary flex cursor-pointer items-center gap-2 text-xs ${busy ? "opacity-60" : ""}`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {busy ? "Installing…" : "Upload .zip"}
            <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        {message && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
        )}
      </div>

      <div className="card">
        {initial.length === 0 ? (
          <div className="p-8 text-center">
            <Package size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">No plugins installed.</p>
            <p className="mt-1 text-xs text-slate-400">See PLUGINS.md in the CMS folder for how to make one — a calculator is about forty lines.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {initial.map((p) => {
              const isOpen = open === p.slug;
              const shortcode = `[${p.slug}]`;
              return (
                <li key={p.slug}>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <button type="button" onClick={() => setOpen(isOpen ? null : p.slug)} className="text-slate-400 hover:text-slate-700">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-slate-900">
                        {p.name}
                        <span className="font-mono text-[11px] font-normal text-slate-400">v{p.version}</span>
                        {!p.enabled && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">OFF</span>}
                      </p>
                      {p.description && <p className="truncate text-xs text-slate-500">{p.description}</p>}
                    </div>
                    <button type="button" onClick={() => copy(shortcode)} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700 hover:border-sky-400" title="Copy shortcode">
                      {shortcode} {copied === shortcode ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} className="text-slate-400" />}
                    </button>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <input type="checkbox" checked={p.enabled} onChange={(e) => patch(p.slug, { enabled: e.target.checked })} /> on
                    </label>
                    <button type="button" onClick={() => remove(p)} className="btn-ghost p-1.5 text-red-500" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {isOpen && <PluginDetails plugin={p} onSave={(settings) => patch(p.slug, { settings })} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PluginDetails({ plugin, onSave }: { plugin: InstalledPlugin; onSave: (settings: Record<string, unknown>) => Promise<void> }) {
  const defs = plugin.manifest.settings ?? [];
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const s of defs) v[s.key] = s.key in plugin.settings ? plugin.settings[s.key] : (s.default ?? (s.type === "toggle" ? false : ""));
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const attrs = plugin.manifest.attributes ?? [];

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-semibold text-slate-700">How to use</p>
          <p className="text-slate-500">
            Put <code className="rounded bg-white px-1">[{plugin.slug}]</code> on its own line in a post, or anywhere in an HTML block, or add the <em>Plugin</em> block.
          </p>
          {attrs.length > 0 && (
            <>
              <p className="mb-1 mt-3 font-semibold text-slate-700">Attributes</p>
              <ul className="space-y-0.5 text-slate-500">
                {attrs.map((a) => (
                  <li key={a.name}>
                    <code className="rounded bg-white px-1">{a.name}</code> {a.label ?? ""}{a.default !== undefined ? ` (default: ${a.default})` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1 font-mono text-[11px] text-slate-400">[{plugin.slug} {attrs.map((a) => `${a.name}="…"`).join(" ")}]</p>
            </>
          )}
          {(plugin.manifest.author || plugin.manifest.homepage) && (
            <p className="mt-3 text-slate-400">
              {plugin.manifest.author && <>By {plugin.manifest.author}</>}
              {plugin.manifest.homepage && (
                <>
                  {" · "}
                  <a href={plugin.manifest.homepage} target="_blank" rel="noreferrer" className="underline">homepage</a>
                </>
              )}
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 font-semibold text-slate-700">Settings</p>
          {defs.length === 0 ? (
            <p className="text-slate-400">This plugin has no settings.</p>
          ) : (
            <div className="space-y-3">
              {defs.map((s) => (
                <div key={s.key}>
                  <label className="mb-1 block font-medium text-slate-600">{s.label}</label>
                  {s.type === "toggle" ? (
                    <input type="checkbox" checked={!!values[s.key]} onChange={(e) => setValues({ ...values, [s.key]: e.target.checked })} />
                  ) : s.type === "select" ? (
                    <select className="input text-xs" value={String(values[s.key] ?? "")} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}>
                      {(s.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : s.type === "textarea" ? (
                    <textarea className="input text-xs" rows={3} value={String(values[s.key] ?? "")} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
                  ) : (
                    <input type={s.type === "number" ? "number" : s.type === "color" ? "color" : "text"} className="input text-xs" value={String(values[s.key] ?? "")}
                      onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
                  )}
                  {s.help && <p className="mt-0.5 text-[11px] text-slate-400">{s.help}</p>}
                </div>
              ))}
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await onSave(values);
                  setSaving(false);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1500);
                }}
                className="btn-primary flex items-center gap-1.5 text-xs"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : null}
                {saved ? "Saved" : "Save settings"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
