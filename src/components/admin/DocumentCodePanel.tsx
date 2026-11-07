"use client";

// CSS and scripts for one document.
//
// The site-wide pair already exists in Settings, but it runs on every page. A
// conversion pixel for one landing page, a widget on one article, a nudge to
// one heading — putting any of those site-wide makes every other page download
// and be checked against them.
//
// Administrator-only, and the API enforces it independently: this is raw markup
// on a page visitors load, which is a different power from writing a post.

import { useState } from "react";
import { Code2, ChevronRight, Lock } from "lucide-react";

export interface DocumentCode {
  customCss: string;
  scriptHead: string;
  scriptBodyEnd: string;
}

export default function DocumentCodePanel({
  value,
  onChange,
  canEdit,
  kind,
}: {
  value: DocumentCode;
  onChange: (next: DocumentCode) => void;
  /** False for an editor: the fields render read-only rather than vanishing. */
  canEdit: boolean;
  kind: "post" | "page";
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<DocumentCode>) => onChange({ ...value, ...patch });

  const used = [
    value.customCss && "CSS",
    value.scriptHead && "head",
    value.scriptBodyEnd && "footer",
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Code2 size={13} className="text-slate-400" />
        <span className="text-xs font-medium text-slate-700">Custom CSS &amp; JS</span>
        {used.length > 0 && (
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {used.join(" · ")}
          </span>
        )}
        {!canEdit && <Lock size={11} className="text-slate-400" />}
        <ChevronRight
          size={13}
          className={`ml-auto text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          {!canEdit && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
              Only an administrator can change these. Raw markup on a page visitors load is a
              different power from writing a {kind}, so it is gated the same way the site-wide
              scripts are.
            </p>
          )}

          <Field
            label={`${kind === "post" ? "Post" : "Page"} specific CSS`}
            hint="Applies to this page only. No <style> tag needed — just the rules."
            placeholder={".entry-title { letter-spacing: -0.02em; }"}
            value={value.customCss}
            onChange={(v) => set({ customCss: v })}
            disabled={!canEdit}
          />

          <Field
            label="Head scripts"
            hint="Rendered before the content. Include the full <script> tag."
            placeholder={'<script>/* … */</script>'}
            value={value.scriptHead}
            onChange={(v) => set({ scriptHead: v })}
            disabled={!canEdit}
          />

          <Field
            label="Footer scripts"
            hint="Rendered after the content — the right place for anything not needed to paint the page."
            placeholder={'<script src="https://example.com/widget.js" defer></script>'}
            value={value.scriptBodyEnd}
            onChange={(v) => set({ scriptBodyEnd: v })}
            disabled={!canEdit}
          />

          <p className="text-[11px] leading-relaxed text-slate-400">
            Site-wide equivalents live in Settings. Prefer the footer slot: a script in the head
            blocks the page from painting until it has loaded.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label, hint, placeholder, value, onChange, disabled,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input resize-y font-mono text-[11px] leading-relaxed disabled:bg-slate-50 disabled:text-slate-400"
        rows={4}
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}
