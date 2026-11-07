"use client";

// The buttons on the Homepages screen.
//
// Client-side because both actions write and then navigate: choosing a page
// saves one setting, and "create a blank page" makes a draft and opens it. The
// listing around them stays a server component.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function HomepagePicker({
  languageCode,
  settingKey,
  current,
  pages,
}: {
  languageCode: string;
  /** `homepage_id` for the default language, `homepage_id_<code>` otherwise. */
  settingKey: string;
  current: number | null;
  /** Only this language's pages — a homepage must be a page in its own language. */
  pages: { id: number; title: string; status: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function choose(value: string) {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [settingKey]: value }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) window.alert("The homepage could not be changed. Please try again.");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="input py-1.5 text-sm"
        value={current ? String(current) : ""}
        disabled={saving}
        onChange={(e) => choose(e.target.value)}
      >
        <option value="">Latest posts</option>
        {pages.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.title || "(untitled)"}
            {p.status !== "published" ? " — draft" : ""}
          </option>
        ))}
      </select>
      {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
      <input type="hidden" data-language={languageCode} />
    </div>
  );
}

export function CreateHomepageButton({
  languageCode,
  languageLabel,
  settingKey,
}: {
  languageCode: string;
  languageLabel: string;
  settingKey: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /**
   * Makes an empty draft in this language and points the setting at it.
   *
   * Deliberately empty: no blocks, no layout, nothing copied from another
   * language's homepage. It is a blank page you then build, and it stays a
   * draft until you publish it yourself.
   */
  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Home (${languageLabel})`,
          content: [],
          status: "draft",
          language: languageCode,
        }),
      });
      if (!res.ok) {
        setBusy(false);
        window.alert("The page could not be created. Please try again.");
        return;
      }
      const { page } = await res.json();
      const set = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [settingKey]: String(page.id) }),
      }).catch(() => null);
      // The page exists either way; say so, then open it.
      if (!set?.ok) window.alert("The page was created as a draft, but could not be set as the homepage. Choose it from the list afterwards.");
      router.push(`/admin/pages/${page.id}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={create} disabled={busy} className="btn-secondary text-xs">
      {busy ? "Creating…" : "Create a blank page"}
    </button>
  );
}

/**
 * Adds a content language without leaving this screen.
 *
 * The list of languages is one ordered, comma-separated setting whose first
 * entry is the default, so adding appends rather than rewrites — the default
 * cannot change by accident here. Adding a language creates nothing: no page,
 * no content, no design. The new row appears with its own "Create a blank
 * page" button, and that page starts as a draft.
 */
export function AddLanguageButton({
  configured,
  options,
}: {
  /** Codes already configured, in order; the first is the default. */
  configured: string[];
  /** Every language not yet configured, as {code, label}. */
  options: { code: string; label: string }[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!code) return;
    setBusy(true);
    try {
      const next = Array.from(new Set([...configured, code])).join(",");
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_languages: next }),
      });
      if (res.ok) {
        setCode("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) {
    return <p className="text-xs text-slate-400">Every available language is already configured.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="input py-1.5 text-sm"
        value={code}
        disabled={busy}
        onChange={(e) => setCode(e.target.value)}
      >
        <option value="">Add a language…</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={add} disabled={!code || busy} className="btn-secondary text-xs">
        {busy ? "Adding…" : "Add"}
      </button>
    </div>
  );
}
