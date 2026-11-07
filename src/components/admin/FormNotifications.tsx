"use client";

// Where form submissions get sent.
//
// Only the non-secret half lives here. The SMTP host and password come from the
// environment, so this panel *reports* whether they are set rather than editing
// them — and says so plainly, because a notification switch that looks on while
// nothing can send is the exact failure this project keeps finding.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Mail, Send, TriangleAlert } from "lucide-react";

interface Status {
  configured: boolean;
  detail: string;
  recipients: string[];
}

const KEYS = [
  "forms_notify_enabled",
  "forms_notify_to",
  "forms_notify_subject",
  "forms_autoreply_enabled",
  "forms_autoreply_subject",
  "forms_autoreply_body",
] as const;

type Key = (typeof KEYS)[number];

export default function FormNotifications() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([
      fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/forms/test-email").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const all = s?.settings ?? {};
    const picked: Record<string, string> = {};
    for (const k of KEYS) picked[k] = all[k] ?? "";
    setValues(picked);
    if (st) setStatus(st);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = (k: Key, v: string) => setValues((p) => ({ ...(p ?? {}), [k]: v }));

  async function save() {
    if (!values) return;
    setSaving(true);
    setTestMsg(null);
    // The keys themselves, flat — the settings API stores each top-level key
    // as a setting. Wrapped as `{ settings: … }` this saved one junk row named
    // "settings" and none of these, then reported "Saved" regardless.
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setTestMsg({ ok: false, text: "Could not save these settings. Try again." });
      return;
    }
    setSavedAt(Date.now());
    void load();
  }

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/forms/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: values?.forms_notify_to ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      setTestMsg(
        res.ok
          ? { ok: true, text: `Sent to ${(data.sent ?? []).join(", ")}.` }
          : { ok: false, text: data.error ?? "Could not send." }
      );
    } catch {
      setTestMsg({ ok: false, text: "Could not send." });
    } finally {
      setTesting(false);
    }
  }

  if (!values) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 size={15} className="animate-spin" /> Loading notification settings…
      </div>
    );
  }

  const notifyOn = values.forms_notify_enabled === "true";
  const replyOn = values.forms_autoreply_enabled === "true";
  const wantsMail = notifyOn || replyOn;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Mail size={15} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
      </div>

      {/* The honest status line. */}
      {status && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
            status.configured
              ? "bg-emerald-50 text-emerald-800"
              : wantsMail
                ? "bg-amber-50 text-amber-900"
                : "bg-slate-50 text-slate-500"
          }`}
        >
          {status.configured ? <Check size={13} className="mt-px shrink-0" /> : <TriangleAlert size={13} className="mt-px shrink-0" />}
          <span>
            {status.configured ? (
              <>Mail is configured — {status.detail}</>
            ) : (
              <>
                Email is not set up yet.{" "}
                <Link href="/admin/email" className="font-semibold underline">Set it up in Admin → Email</Link>{" "}
                — pick your provider and press one button.{" "}
                {wantsMail && <strong>Until then nothing below will send.</strong>}
              </>
            )}
          </span>
        </div>
      )}

      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={notifyOn}
          onChange={(e) => set("forms_notify_enabled", e.target.checked ? "true" : "false")}
          className="rounded border-slate-300"
        />
        Email me when someone submits a form
      </label>

      {notifyOn && (
        <div className="mb-4 space-y-3 pl-6">
          <div>
            <label className="label">Send to</label>
            <input
              className="input text-xs"
              value={values.forms_notify_to}
              onChange={(e) => set("forms_notify_to", e.target.value)}
              placeholder="you@example.com, someone@example.com"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Comma separated. Replies go to whoever submitted the form, not to the site.
            </p>
          </div>
          <div>
            <label className="label">Subject</label>
            <input
              className="input text-xs"
              value={values.forms_notify_subject}
              onChange={(e) => set("forms_notify_subject", e.target.value)}
            />
          </div>
        </div>
      )}

      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={replyOn}
          onChange={(e) => set("forms_autoreply_enabled", e.target.checked ? "true" : "false")}
          className="rounded border-slate-300"
        />
        Send an automatic reply to the person who submitted
      </label>

      {replyOn && (
        <div className="mb-4 space-y-3 pl-6">
          <div>
            <label className="label">Subject</label>
            <input
              className="input text-xs"
              value={values.forms_autoreply_subject}
              onChange={(e) => set("forms_autoreply_subject", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea
              className="input min-h-[90px] text-xs"
              value={values.forms_autoreply_body}
              onChange={(e) => set("forms_autoreply_body", e.target.value)}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Sent only when the form collected an email address. Nothing is sent if it did not —
            there is nowhere to send it.
          </p>
        </div>
      )}

      <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
        Both subject and message accept <code>{"{{form}}"}</code>, <code>{"{{site}}"}</code>,{" "}
        <code>{"{{page}}"}</code>, <code>{"{{fields}}"}</code>, and any field name from the form.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={sendTest}
          disabled={testing || !status?.configured}
          className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
          title={status?.configured ? "Send a test email" : "Configure SMTP first"}
        >
          {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Send test email
        </button>
        {savedAt > 0 && !saving && <span className="text-[11px] text-emerald-600">Saved.</span>}
        {testMsg && (
          <span className={`text-[11px] ${testMsg.ok ? "text-emerald-600" : "text-red-600"}`}>
            {testMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}
