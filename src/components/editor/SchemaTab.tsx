"use client";

// SEO → Schema: every piece of structured data this document will emit, and
// the ones the author adds by hand — see lib/schemaTypes.ts.
//
// Two lists. The first is read-only and says what the page already sends
// (its own node, the site's, and whatever blocks on the page contribute), so
// nobody adds a second FAQPage by hand because they did not know the
// Accordion was already emitting one. The second is the author's entries,
// each a form built from the type's field list. Saved with the document —
// the Update button — like every other SEO field.

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Braces } from "lucide-react";
import {
  SCHEMA_TYPE_DEFS, SCHEMA_TYPE_BY_ID, blankValues, buildCustomSchemas, missingRequired, parseCustomJson, parseSchemaEntries,
  type Field, type SchemaEntry, type Values,
} from "@/lib/schemaTypes";

interface Props {
  /** The document's `schemas` JSON. */
  value: string;
  onChange: (json: string) => void;
  /** The page's own node type, from the Advanced tab's select. */
  pageType: string;
  onPageTypeChange: (t: string) => void;
  pageTypes: string[];
  /** The editor's blocks, to spot the ones that emit schema themselves. */
  blocks?: unknown[];
  kind: string;
  permalink: string;
}

/** Count of blocks of `type` whose `flag` prop is on, at any nesting depth. */
function countBlocks(blocks: unknown[] | undefined, type: string, flag: string, on: string): number {
  if (!blocks) return 0;
  const blob = JSON.stringify(blocks);
  // Nested blocks live in JSON strings, escaped once per level — a pattern
  // tolerant of any number of backslashes sees every level.
  const re = new RegExp(`type\\\\*"\\s*:\\s*\\\\*"${type}\\\\*"[^}]*?${flag}\\\\*"\\s*:\\s*\\\\*"${on}\\\\*"`, "g");
  return (blob.match(re) || []).length;
}

/** Blocks of one type, at any nesting level (same escaping rule as countBlocks). */
function countType(blocks: unknown[] | undefined, type: string): number {
  if (!blocks) return 0;
  const re = new RegExp(`type\\\\*"\\s*:\\s*\\\\*"${type}\\\\*"`, "g");
  return (JSON.stringify(blocks).match(re) || []).length;
}

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function SchemaTab({ value, onChange, pageType, onPageTypeChange, pageTypes, blocks, kind, permalink }: Props) {
  const entries = useMemo(() => parseSchemaEntries(value), [value]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const write = (next: SchemaEntry[]) => onChange(next.length ? JSON.stringify(next) : "");
  const patch = (id: string, values: Values) => write(entries.map((e) => (e.id === id ? { ...e, values } : e)));
  const remove = (id: string) => {
    if (!confirm("Remove this schema from the page?")) return;
    write(entries.filter((e) => e.id !== id));
  };
  const add = (type: string) => {
    const def = SCHEMA_TYPE_BY_ID[type];
    const entry: SchemaEntry = { id: newId(), type, values: blankValues(def) };
    write([...entries, entry]);
    setOpenId(entry.id);
    setPicking(false);
  };

  const faqBlocks = countBlocks(blocks, "accordion", "faqSchema", "1");
  // Both emit SoftwareApplication, and each is named for what it is — this
  // counted Download Boxes and called them App Info blocks, which sent an
  // owner looking for a block that was not on the page.
  const downloadBoxes = countBlocks(blocks, "downloadBox", "schema", "true");
  // On unless switched off ("0"), as the renderer reads it (lib/appInfo) —
  // an older block may not store the prop at all.
  const appInfoBlocks = Math.max(0, countType(blocks, "appInfo") - countBlocks(blocks, "appInfo", "showSchema", "0"));
  const plural = (n: number, one: string) => `${n} ${one}${n > 1 ? "s" : ""}`;
  const appSources = [
    downloadBoxes ? plural(downloadBoxes, "Download Box") : "",
    appInfoBlocks ? plural(appInfoBlocks, "App Info block") : "",
  ].filter(Boolean);

  const automatic: { type: string; from: string }[] = [
    { type: pageType, from: `this ${kind} — title, description, dates, image, language` },
    { type: "WebSite", from: "the site — every page" },
    { type: "Organization / Person", from: "Settings → SEO → Knowledge Graph, when filled in" },
    { type: "BreadcrumbList", from: "the title area, when breadcrumbs are shown" },
    ...(faqBlocks ? [{ type: "FAQPage", from: `${faqBlocks} Accordion block${faqBlocks > 1 ? "s" : ""} with FAQ schema on` }] : []),
    ...(appSources.length ? [{ type: "SoftwareApplication", from: `${appSources.join(" and ")} with schema on` }] : []),
  ];

  return (
    <div className="space-y-5">
      <section>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Already on this {kind}</p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {automatic.map((a, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-2">
              <Braces size={13} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700">
                  {i === 0 ? (
                    <select className="input py-0.5 text-xs" value={pageType} onChange={(e) => onPageTypeChange(e.target.value)}>
                      {pageTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : a.type}
                </div>
                <p className="text-[11px] text-slate-400">From {a.from}.</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Added by hand</p>
        {entries.length === 0 && !picking && (
          <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
            Nothing yet. Add one when this {kind} is about something the blocks above do not describe — an app, a product, a video, an event.
          </p>
        )}
        <ul className="space-y-2">
          {entries.map((e) => {
            const def = SCHEMA_TYPE_BY_ID[e.type];
            const open = openId === e.id;
            const missing = missingRequired(def, e.values);
            const title = def.titleKey ? String(e.values[def.titleKey] ?? "").trim() : "";
            const customErr = def.id === "Custom" ? (() => { const r = parseCustomJson(String(e.values.json ?? "")); return r.ok ? "" : r.error; })() : "";
            const problem = customErr || (missing.length ? `Missing: ${missing.join(", ")}` : "");
            return (
              <li key={e.id} className="rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button type="button" onClick={() => setOpenId(open ? null : e.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {open ? <ChevronUp size={14} className="shrink-0 text-slate-400" /> : <ChevronDown size={14} className="shrink-0 text-slate-400" />}
                    <span className="truncate text-xs font-semibold text-slate-700">{def.label}{title ? ` — ${title}` : ""}</span>
                    {problem
                      ? <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title={problem}>not emitted</span>
                      : <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">ready</span>}
                  </button>
                  <button type="button" onClick={() => remove(e.id)} className="text-slate-300 hover:text-red-500" aria-label="Remove schema"><Trash2 size={14} /></button>
                </div>
                {open && (
                  <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                    <p className="text-[11px] leading-relaxed text-slate-400">{def.hint}</p>
                    {def.fields.map((f) => (
                      <FieldInput key={f.key} field={f} values={e.values} onChange={(v) => patch(e.id, v)} />
                    ))}
                    {problem && <p className="text-[11px] text-amber-700">{problem} — the page will not include this until it is fixed.</p>}
                    <button type="button" onClick={() => setPreviewId(previewId === e.id ? null : e.id)} className="text-[11px] font-medium text-sky-600 hover:underline">
                      {previewId === e.id ? "Hide JSON-LD" : "Show JSON-LD"}
                    </button>
                    {previewId === e.id && (
                      <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[10px] leading-snug text-slate-100" dir="ltr">
                        {JSON.stringify(
                          buildCustomSchemas(JSON.stringify([e]), { pageUrl: permalink, absolute: (u) => u })[0] ?? { note: "nothing to emit yet" },
                          null, 2
                        )}
                      </pre>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {picking ? (
          <div className="mt-2 rounded-lg border border-slate-200 p-2">
            <p className="mb-1 px-1 text-[11px] font-semibold text-slate-600">What is this {kind} about?</p>
            <ul className="max-h-72 overflow-auto">
              {SCHEMA_TYPE_DEFS.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => add(d.id)} className="w-full rounded px-2 py-1.5 text-left hover:bg-slate-50">
                    <span className="block text-xs font-semibold text-slate-700">{d.label} <span className="font-normal text-slate-400">({d.id})</span></span>
                    <span className="block text-[11px] leading-snug text-slate-400">{d.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setPicking(false)} className="mt-1 px-2 text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="btn-secondary mt-2 inline-flex items-center gap-1.5 text-xs">
            <Plus size={14} /> Add a schema
          </button>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Saved with the {kind} when you click Update. Test the published page with Google&apos;s Rich Results Test.
        </p>
      </section>
    </div>
  );
}

function FieldInput({ field: f, values, onChange }: { field: Field; values: Values; onChange: (v: Values) => void }) {
  const set = (val: string | Record<string, string>[]) => onChange({ ...values, [f.key]: val });
  const label = (
    <label className="mb-1 block text-xs font-medium text-slate-600">
      {f.label}{f.required && <span className="text-red-400"> *</span>}
    </label>
  );
  const hint = f.hint && <p className="mt-1 text-[11px] leading-snug text-slate-400">{f.hint}</p>;

  if (f.kind === "group") {
    const rows = Array.isArray(values[f.key]) ? (values[f.key] as Record<string, string>[]) : [];
    const setRow = (i: number, row: Record<string, string>) => set(rows.map((r, n) => (n === i ? row : r)));
    return (
      <div>
        {label}
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="rounded border border-slate-200 bg-slate-50 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">{f.rowLabel ?? "Item"} {i + 1}</span>
                <button type="button" onClick={() => set(rows.filter((_, n) => n !== i))} className="text-slate-300 hover:text-red-500" aria-label="Remove"><Trash2 size={12} /></button>
              </div>
              <div className="space-y-2">
                {(f.fields ?? []).map((sub) => (
                  <FieldInput key={sub.key} field={sub} values={row} onChange={(v) => setRow(i, v as Record<string, string>)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set([...rows, Object.fromEntries((f.fields ?? []).map((s) => [s.key, s.default ?? ""]))])} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:underline">
          <Plus size={12} /> Add {f.rowLabel?.toLowerCase() ?? "item"}
        </button>
        {hint}
      </div>
    );
  }

  const v = typeof values[f.key] === "string" ? (values[f.key] as string) : "";
  return (
    <div>
      {label}
      {f.kind === "textarea" || f.kind === "lines" ? (
        <textarea className="input resize-y font-[inherit]" rows={f.kind === "lines" ? 3 : 3} value={v} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} dir={f.key === "json" ? "ltr" : undefined} />
      ) : f.kind === "select" ? (
        <select className="input" value={v} onChange={(e) => set(e.target.value)}>
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          className="input"
          type={f.kind === "number" ? "text" : f.kind === "date" ? "date" : f.kind === "datetime" ? "datetime-local" : f.kind === "url" ? "url" : "text"}
          inputMode={f.kind === "number" ? "decimal" : undefined}
          value={v}
          placeholder={f.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      )}
      {hint}
    </div>
  );
}
