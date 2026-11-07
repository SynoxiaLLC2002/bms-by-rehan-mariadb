"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, KeyRound, Copy, Check, PlugZap, Star, Trash2 } from "lucide-react";

// API tokens for one account — what Claude (api/mcp), the MCP hub and other
// programs sign in with (lib/apiTokens.ts). Making one is only offered on your
// own account: a token acts as its owner. An administrator viewing someone
// else can see and revoke theirs.

// Extra access a token can be given (TOKEN_SCOPES in lib/apiTokens.ts), with
// what each one hands over — said plainly, because ticking one lets a program
// do what only an administrator at the keyboard could before.
const SCOPES = [
  {
    id: "backups",
    label: "Backups",
    hint: "List the server's backups, make a new one, and restore one (pages and posts can be put back to an older version).",
  },
  {
    id: "plugins",
    label: "Plugins",
    hint: "Install, switch on/off, configure and remove plugins. A plugin is code that runs on every visitor's page — only for a program you trust completely.",
  },
  {
    id: "publish",
    label: "Publishing",
    hint: "Publish pages and posts, take them offline, and schedule them. Without it, everything new it makes waits as a draft for you.",
  },
] as const;

interface TokenRow {
  id: number;
  name: string;
  prefix: string;
  role: string;
  scopes: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

function scopeList(v: string | null | undefined): string[] {
  return (v ?? "").split(",").filter(Boolean);
}

/**
 * The message for a failed request that brought no error of ours. A 403 or
 * 5xx page that is not JSON never came from the CMS: on shared hosting it is
 * the host's firewall (it blocks an IP after bot-like traffic) or the app
 * restarting — say so, rather than a bare "could not".
 */
function failure(res: Response, fallback: string): string {
  const ours = (res.headers.get("content-type") ?? "").includes("application/json");
  if (ours) return fallback;
  if (res.status === 403) {
    return `${fallback}: your hosting server refused the request before it reached the site (HTTP 403). This is usually the host's firewall blocking your internet address for a while — wait 15–60 minutes, or ask your host to unblock your IP.`;
  }
  if (res.status >= 500) return `${fallback}: the site is restarting or unreachable (HTTP ${res.status}). Try again in a minute.`;
  return `${fallback} (HTTP ${res.status}).`;
}

function when(v: string | null): string {
  return v ? new Date(v).toLocaleString() : "—";
}

/** The `claude mcp add` line for this site, with a server name taken from the domain. */
function connectCommand(origin: string, token: string): string {
  const host = origin.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const name = host.split(/[.:]/)[0].replace(/[^A-Za-z0-9_-]/g, "") || "mysite";
  // `--scope user`: without it Claude Code adds the site only for the folder the
  // command ran in, and the desktop app or VS Code opened on any other folder
  // does not see it.
  return `claude mcp add --scope user --transport http ${name} ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
}

export default function ApiTokensPanel({ userId, isSelf, userRole }: { userId: string; isSelf: boolean; userRole: string }) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(userRole);
  const [expires, setExpires] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // The sidebar's "Connect Claude" links here with #connect-claude. The box
  // renders only once `origin` is known, after the browser has already tried
  // (and failed) to jump to it — so jump again once it exists, and on every
  // later click while already on this page.
  useEffect(() => {
    if (!origin) return;
    const jump = () => {
      if (window.location.hash === "#connect-claude") document.getElementById("connect-claude")?.scrollIntoView({ behavior: "smooth" });
    };
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, [origin]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/tokens?userId=${encodeURIComponent(userId)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setTokens(data.tokens ?? []);
    else setError(data.error || failure(res, "Could not load tokens"));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function create() {
    if (scopes.includes("plugins") && !confirm("This token will be able to install plugins — code that runs on every visitor's page. Continue?")) return;
    setBusy(true);
    setError("");
    setCreated(null);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, expiresInDays: expires || null, scopes: role === "admin" ? scopes : [] }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || failure(res, "Could not create the token"));
      return;
    }
    setCreated(data.token);
    setName("");
    setScopes([]);
    load();
  }

  async function setTokenScopes(t: TokenRow, next: string[]) {
    if (next.includes("plugins") && !scopeList(t.scopes).includes("plugins")) {
      if (!confirm(`Let "${t.name}" install and remove plugins? A plugin is code that runs on every visitor's page.`)) return;
    }
    setError("");
    const res = await fetch(`/api/tokens/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || failure(res, "Could not change the token"));
      return;
    }
    load();
  }

  async function revoke(t: TokenRow) {
    if (!confirm(`Revoke "${t.name}"? Anything using it stops working immediately.`)) return;
    const res = await fetch(`/api/tokens/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || failure(res, "Could not revoke the token"));
      return;
    }
    load();
  }

  const roles = ["admin", "editor", "author"].filter((r) =>
    userRole === "admin" ? true : userRole === "editor" ? r !== "admin" : r === "author"
  );

  // Only the token's owner changes its extra access, and only on an admin token.
  const canScope = isSelf && userRole === "admin";

  return (
    <div className="card p-6">
      {isSelf && origin && (
        <div id="connect-claude" className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-4 mb-6 text-sm space-y-2 scroll-mt-6">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <PlugZap size={16} className="text-brand-600" />
            Connect Claude to this site
          </h2>
          <p className="text-slate-600">
            <b>Easiest and safest.</b> In Claude go to <b>Settings → Connectors → Add custom connector</b>, paste this address,
            then press <b>Connect</b>. Claude opens this site — sign in and press <b>Allow</b>. Nothing to copy, nothing secret.
          </p>
          <CopyField value={`${origin}/api/mcp`} />
          <p className="text-xs text-slate-500">
            It appears below as a token named after the app. Revoke it to disconnect.
          </p>
          {userRole === "admin" && <ClaudeBridge />}
        </div>
      )}

      <div className="mb-5">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <KeyRound size={16} className="text-slate-400" />
          API tokens
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Let a program — Claude, the MCP hub, a script — work on this site as this account. New pages it makes are
          drafts and it cannot publish, unless you tick Publishing on an admin token. It cannot manage users or tokens,
          run updates or add scripts. Backups and plugins stay off unless you tick them too. Only make one here if the Connect button above does not work for you.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      {created && (
        <div className="bg-green-50 border border-green-200 text-sm px-4 py-3 rounded-lg mb-4 space-y-3">
          <p className="text-green-800 font-medium">Copy what you need now — it will not be shown again.</p>

          {origin && (
            <div className="space-y-1.5">
              <p className="text-slate-800">
                <b>Your private Claude link.</b> In Claude: Settings → Connectors → Add custom connector → paste it → Add.
              </p>
              <CopyField value={`${origin}/api/mcp/k/${created}`} />
              <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2 rounded-lg flex gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <b>This link is the key to your site.</b> Anyone who has it can edit your pages until you press Revoke
                  below — no password needed. Never post it, email it, or show it in a screenshot or video. If it might
                  have leaked, Revoke it and make a new one. The Connect address above is safer: it needs your login.
                </span>
              </div>
            </div>
          )}

          {origin && (
            <div className="bg-white border-2 border-brand-300 rounded-lg px-3 py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-slate-900 font-semibold">Claude Code</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Star size={11} className="fill-current" />
                  Recommended by Rehan
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Works in all three: the <b>Claude desktop app</b> (Code tab), the <b>terminal</b>, and the{" "}
                <b>Claude extension in VS Code</b>. Add it once and this site is there in every one of them, in any folder.
              </p>
              <CopyField value={connectCommand(origin, created)} />
              <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">
                <li><b>Terminal:</b> paste the line and press Enter.</li>
                <li><b>VS Code:</b> Terminal → New Terminal, paste it, press Enter.</li>
                <li><b>Desktop app:</b> ask Claude to run it for you, or paste it into any terminal.</li>
              </ul>
              <p className="text-xs text-slate-600">
                Then start a new Claude Code chat and ask, for example: <i>&ldquo;List the pages on my site.&rdquo;</i>
              </p>
              <p className="text-[11px] text-slate-500">
                The line contains the same secret as the link above. Keep it out of screenshots and shared chats.
              </p>
            </div>
          )}

          <details className="text-slate-700">
            <summary className="cursor-pointer text-xs font-medium">For programmers: the raw token</summary>
            <div className="mt-2 space-y-2">
              <CopyField value={created} />
            </div>
          </details>
        </div>
      )}

      {isSelf && (
        // Folded away: Connect above is the way in for almost everyone, and
        // an open form here read as a step that had to be done too.
        <details className="mb-5">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Advanced: make a token by hand</summary>
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div className="flex-1 min-w-[10rem]">
            <label className="label">Name</label>
            <input className="input text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude" maxLength={80} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Expires (days)</label>
            <input className="input text-sm w-28" type="number" min={1} max={3650} value={expires} onChange={(e) => setExpires(e.target.value)} placeholder="never" />
          </div>
          <button type="button" className="btn-primary" disabled={busy || !name.trim()} onClick={create}>
            {busy ? "Creating…" : "Create token"}
          </button>
          {canScope && role === "admin" && (
            <fieldset className="basis-full mt-1 space-y-1.5">
              <legend className="label">Extra access (optional)</legend>
              {SCOPES.map((sc) => (
                <label key={sc.id} className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={scopes.includes(sc.id)}
                    onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, sc.id] : cur.filter((x) => x !== sc.id)))}
                  />
                  <span>
                    <span className="font-medium">{sc.label}</span>
                    <span className="block text-xs text-slate-500">{sc.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
        </details>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-slate-400">No tokens.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Token</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Extra access</th>
                <th className="py-2 pr-3 font-medium">Last used</th>
                <th className="py-2 pr-3 font-medium">Expires</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => {
                const has = scopeList(t.scopes);
                return (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3 text-slate-800">{t.name}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">{t.prefix}…</td>
                    <td className="py-2 pr-3 text-slate-600">{t.role}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {canScope && t.role === "admin" ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {SCOPES.map((sc) => {
                            const on = has.includes(sc.id);
                            return (
                              <label key={sc.id} className="flex items-center gap-1 text-xs whitespace-nowrap" title={sc.hint}>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => setTokenScopes(t, on ? has.filter((x) => x !== sc.id) : [...has, sc.id])}
                                />
                                {sc.label}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs">{has.map((x) => SCOPES.find((sc) => sc.id === x)?.label ?? x).join(", ") || "—"}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{when(t.lastUsedAt)}</td>
                    <td className="py-2 pr-3 text-slate-500">{t.expiresAt ? when(t.expiresAt) : "Never"}</td>
                    <td className="py-2 text-right">
                      <button type="button" className="btn-danger" onClick={() => revoke(t)} aria-label={`Revoke ${t.name}`}>
                        <Trash2 size={14} />
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface BridgeStatus {
  configured: boolean;
  state: "on" | "partial" | "off" | "unreadable";
  host?: string;
  error?: string;
  permissions?: string[];
}

/**
 * The Cloudflare bridge (lib/claudeBridge.ts): for a host whose firewall
 * turns Claude away before the request reaches the site. Administrators only —
 * it uses the Cloudflare token saved on the Speed screen.
 */
function ClaudeBridge() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/claude-bridge").then((r) => (r.ok ? r.json() : null)).then((d) => setStatus(d)).catch(() => {});
  }, []);

  async function run(action: "install" | "remove") {
    if (action === "remove" && !confirm("Remove the Cloudflare bridge? If your host blocks Claude, Claude stops reaching this site.")) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/claude-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.status) setStatus(data.status);
    if (!res.ok || !data.ok) setError(data.error || failure(res, action === "install" ? "Could not set up the bridge" : "Could not remove the bridge"));
  }

  if (!status) return null;
  const on = status.state === "on";

  return (
    <div className="border-t border-brand-100 pt-3 mt-3 space-y-2">
      <p className="text-slate-800 font-medium flex flex-wrap items-center gap-2">
        Claude says it cannot connect?
        {on && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"><Check size={11} /> Bridge is on</span>}
      </p>
      <p className="text-xs text-slate-600">
        Some hosting companies block Claude before it reaches your site. The bridge is a small program placed in{" "}
        <b>your own Cloudflare account</b> that lets Claude through — to the Claude addresses of this site only. The
        address above stays the same, and you still sign in and press Allow.
      </p>
      {!status.configured ? (
        <p className="text-xs text-slate-600">
          First connect Cloudflare on <Link className="text-brand-600 underline" href="/admin/speed?tab=cloudflare">Speed → Cloudflare</Link>,
          then come back here.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run("install")}>
            {busy ? "Working…" : on ? "Set up again" : status.state === "partial" ? "Finish setting up" : "Set up the bridge"}
          </button>
          {status.state !== "off" && status.state !== "unreadable" && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => run("remove")}>Remove</button>
          )}
          {on && <span className="text-xs text-slate-500">Now add the address above in Claude.</span>}
        </div>
      )}
      {status.state === "unreadable" && status.error && <p className="text-xs text-red-600">Cloudflare: {status.error}</p>}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}
      {status.configured && !on && status.permissions && (
        <p className="text-[11px] text-slate-500">
          The Cloudflare API token needs two more permissions than the Speed screen asks for:{" "}
          {status.permissions.map((p, i) => <span key={p}>{i > 0 && " and "}<code>{p}</code></span>)}.
        </p>
      )}
    </div>
  );
}

/** A value with a Copy button. */
function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <code className="flex-1 min-w-0 text-xs bg-white border border-slate-200 px-3 py-2 rounded-lg font-mono break-all select-all">{value}</code>
      <button
        type="button"
        className="btn-secondary shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => setCopied(true), () => {});
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
