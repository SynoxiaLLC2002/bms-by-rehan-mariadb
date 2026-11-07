"use client";

import { useState } from "react";
import { AlertTriangle, Check, PlugZap, X } from "lucide-react";

// The Allow screen for "Connect Claude" (page.tsx, lib/oauth.ts). Written for
// someone who has never heard of OAuth: what is asking, what it will be able
// to do, what it never can, and how to undo it.

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator — pages, posts, media, settings, menus",
  editor: "Editor — pages, posts and media",
  author: "Author — posts and media only",
};

export default function ConnectForm(props: {
  query: string;
  problem: string;
  appName: string;
  returnHost: string;
  isClaude: boolean;
  siteName: string;
  userName: string;
  userRole: string;
}) {
  const roles = ["admin", "editor", "author"].filter((r) =>
    props.userRole === "admin" ? true : props.userRole === "editor" ? r !== "admin" : r === "author"
  );
  const [role, setRole] = useState(roles[0] ?? "author");
  const [backups, setBackups] = useState(false);
  const [plugins, setPlugins] = useState(false);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision: "allow" | "deny") {
    setBusy(true);
    setError("");
    const scopes = role === "admin" ? [...(backups ? ["backups"] : []), ...(plugins ? ["plugins"] : []), ...(publish ? ["publish"] : [])] : [];
    const res = await fetch("/api/oauth/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: props.query, decision, role, scopes }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.redirect !== "string") {
      setBusy(false);
      setError(data.error || "Something went wrong. Start again from the app.");
      return;
    }
    window.location.assign(data.redirect);
  }

  if (props.problem) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Could not connect</h1>
        <p className="text-sm text-slate-600">{props.problem}</p>
      </Shell>
    );
  }

  const app = props.isClaude ? "Claude" : props.appName;

  return (
    <Shell>
      <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
        <PlugZap className="text-white" size={22} />
      </div>
      <h1 className="text-xl font-bold text-slate-900 text-center">
        Connect {app} to {props.siteName}?
      </h1>
      <p className="text-sm text-slate-500 text-center mt-1">
        Signed in as <span className="font-medium text-slate-700">{props.userName}</span>
      </p>

      {!props.isClaude && (
        <div className="mt-5 bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-lg flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            This is <b>not Claude</b> — it is &ldquo;{props.appName}&rdquo;, and the access goes to <b>{props.returnHost}</b>. Only
            continue if you started this connection yourself, just now.
          </span>
        </div>
      )}

      <div className="mt-5 text-sm space-y-3">
        <div>
          <p className="font-medium text-slate-800 mb-1">{app} will be able to:</p>
          <ul className="space-y-1 text-slate-600">
            {role === "author" ? (
              <>
                <Li ok>Write new posts — always as <b>drafts</b>, never published</Li>
                <Li ok>
                  Edit your own posts — <b>changes to a published post show on your site at once</b>
                </Li>
              </>
            ) : (
              <>
                <Li ok>Read your pages, posts, media and settings</Li>
                <Li ok>Make new pages and posts — always as <b>drafts</b>, never published</Li>
                <Li ok>
                  Edit existing pages — <b>changes to a published page show on your site at once</b>
                </Li>
              </>
            )}
            <Li ok>Upload images</Li>
            {role === "admin" && <Li ok>Change settings, menus and the look of the site</Li>}
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-800 mb-1">It can never:</p>
          <ul className="space-y-1 text-slate-600">
            <Li>Publish, unpublish or permanently delete anything</Li>
            <Li>See or change users, passwords or this sign-in</Li>
            <Li>Read comments or form entries (your visitors&apos; details)</Li>
            <Li>Run updates or add scripts to your pages</Li>
          </ul>
        </div>
      </div>

      {roles.length > 1 && (
        <div className="mt-5">
          <label className="label">Access level</label>
          <select className="input text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] ?? r}
              </option>
            ))}
          </select>
        </div>
      )}

      {role === "admin" && (
        <fieldset className="mt-4 space-y-2">
          <legend className="label">Extra access (optional — leave off unless you need it)</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <span>
              <span className="font-medium">Publishing</span>
              <span className="block text-xs text-slate-500">
                Publish pages and posts, take them offline, and schedule them. Without it, everything new waits as a draft for you.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={backups} onChange={(e) => setBackups(e.target.checked)} />
            <span>
              <span className="font-medium">Backups</span>
              <span className="block text-xs text-slate-500">Make backups, and restore an older one (it can put pages and posts back to how they were).</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={plugins} onChange={(e) => setPlugins(e.target.checked)} />
            <span>
              <span className="font-medium">Plugins</span>
              <span className="block text-xs text-slate-500">
                Install and remove plugins. <b className="text-amber-700">A plugin is code that runs for every visitor</b> — only tick
                this if you really need it.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      <div className="mt-6 flex gap-2">
        <button type="button" className="btn-secondary flex-1 justify-center" disabled={busy} onClick={() => decide("deny")}>
          Cancel
        </button>
        <button type="button" className="btn-primary flex-1 justify-center" disabled={busy} onClick={() => decide("allow")}>
          {busy ? "Connecting…" : "Allow"}
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-4 text-center">
        You can disconnect any time: Users → your account → API tokens → Revoke.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="card p-8">{children}</div>
      </div>
    </div>
  );
}

function Li({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      {ok ? <Check size={15} className="text-green-600 shrink-0 mt-0.5" /> : <X size={15} className="text-red-500 shrink-0 mt-0.5" />}
      <span>{children}</span>
    </li>
  );
}
