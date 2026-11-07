"use client";

// Admin → Email: everything "Forgot password" and form notifications need,
// set up by someone who has never heard of SMTP. Pick the provider, follow the
// numbered steps shown for it, type an address and a password, press one
// button. The technical fields fill themselves in and hide under Advanced.

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/admin/Header";
import { MAIL_PRESETS, mailPreset, type MailSecurity } from "@/lib/mailPresets";
import { Check, ChevronDown, KeyRound, Loader2, Mail, TriangleAlert } from "lucide-react";

interface Loaded {
  managedByHost: boolean;
  status: { configured: boolean; detail: string; source?: "env" | "admin" };
  domain: string;
  adminEmail: string;
  preset: string;
  host: string;
  port: string;
  security: string;
  user: string;
  fromEmail: string;
  fromName: string;
  allowBadCert: boolean;
  hasPassword: boolean;
  passwordUnreadable: boolean;
  lastTest: string;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function EmailSettingsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [presetId, setPresetId] = useState("hosting");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("465");
  const [security, setSecurity] = useState<MailSecurity>("ssl");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [allowBadCert, setAllowBadCert] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const preset = useMemo(() => mailPreset(presetId), [presetId]);

  async function load() {
    const res = await fetch("/api/mail-settings", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as Loaded;
    setData(d);
    const p = mailPreset(d.preset);
    setPresetId(p.id);
    setHost(d.host || p.host(d.domain));
    setPort(d.port || String(p.port));
    setSecurity((d.security as MailSecurity) || p.security);
    setFromEmail(d.fromEmail || (p.id === "hosting" && d.domain ? `noreply@${d.domain}` : ""));
    setFromName(d.fromName);
    setUser(d.user && d.user !== d.fromEmail ? d.user : "");
    setAllowBadCert(d.allowBadCert);
    setTestTo(d.adminEmail);
  }
  useEffect(() => {
    void load();
  }, []);

  /** Choosing a provider fills in its server, port and security. */
  function choose(id: string) {
    const p = mailPreset(id);
    setPresetId(p.id);
    setHost(p.host(data?.domain ?? ""));
    setPort(String(p.port));
    setSecurity(p.security);
    if (p.id === "hosting" && data?.domain && !fromEmail) setFromEmail(`noreply@${data.domain}`);
    setResult(null);
  }

  async function save() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/mail-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: presetId, host, port, security, fromEmail, fromName, user, password, allowBadCert, testTo }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && d.ok) {
      setPassword("");
      setResult({ ok: true, text: `It works. A test email was sent to ${d.sentTo} — check that inbox (and its spam folder). Password reset emails will now be sent.` });
      void load();
    } else {
      setResult({ ok: false, text: d.error || "It did not work, and nothing was changed. Check the details and try again." });
    }
  }

  async function turnOff() {
    if (!window.confirm("Turn email off? \"Forgot password\" will stop sending reset links.")) return;
    const res = await fetch("/api/mail-settings", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      setResult({ ok: true, text: "Email is off." });
      void load();
    } else setResult({ ok: false, text: "Could not turn email off. Try again." });
  }

  if (!data) {
    return (
      <>
        <Header title="Email & password reset" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      </>
    );
  }

  const working = data.status.configured;
  const lastTest = data.lastTest ? new Date(data.lastTest).toLocaleString() : "";

  return (
    <>
      <Header title="Email & password reset" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Where things stand, in one line. */}
          <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${working ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            {working ? <Check size={18} className="mt-0.5 shrink-0" /> : <TriangleAlert size={18} className="mt-0.5 shrink-0" />}
            <div>
              {working ? (
                <>
                  <strong>Email is working.</strong> &ldquo;Forgot password&rdquo; sends reset links, and form notifications go out.
                  <span className="block text-xs opacity-80 mt-0.5">Sending through {data.status.detail}{lastTest ? ` · last tested ${lastTest}` : ""}.</span>
                </>
              ) : (
                <>
                  <strong>Email is not set up.</strong> Until it is, &ldquo;Forgot password&rdquo; cannot send a reset link — people who forget their password have to ask you to set a new one (Users → their name).
                  <span className="block text-xs opacity-80 mt-0.5">It takes about five minutes. Follow the four steps below.</span>
                </>
              )}
              {data.passwordUnreadable && (
                <span className="block mt-1 font-medium">The saved email password can no longer be read (the site&rsquo;s secret key changed). Type it again below and press the button.</span>
              )}
            </div>
          </div>

          {data.managedByHost ? (
            <section className="card p-5 text-sm text-slate-600">
              <p><strong>Email is set by your hosting account&rsquo;s settings</strong> (the SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM variables in cPanel → Setup Node.js App). Those win over this screen.</p>
              <p className="mt-2">To manage email here instead, remove those variables in cPanel, restart the app, and come back.</p>
            </section>
          ) : (
            <>
              <Step n={1} title="Choose where your emails are sent from">
                <div className="grid gap-2 sm:grid-cols-2">
                  {MAIL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => choose(p.id)}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${presetId === p.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{p.blurb}</span>
                    </button>
                  ))}
                </div>
              </Step>

              <Step n={2} title={`Get your details from ${preset.label.replace(/ \(.*\)$/, "")}`}>
                {preset.note && <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">{preset.note}</p>}
                <ol className="space-y-2.5">
                  {preset.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </Step>

              <Step n={3} title="Type the email details">
                <div className="space-y-4">
                  <div>
                    <label className="label">Send from (email address)</label>
                    <input type="email" className="input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder={data.domain ? `noreply@${data.domain}` : "you@example.com"} autoComplete="off" />
                  </div>
                  <div>
                    <label className="label">Sender name (what people see)</label>
                    <input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your website name" />
                  </div>
                  {(preset.usernameHint || user) && (
                    <div>
                      <label className="label">Username</label>
                      <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Leave empty to use the email address" autoComplete="off" />
                      {preset.usernameHint && <p className="mt-1 text-xs text-slate-500">{preset.usernameHint}</p>}
                    </div>
                  )}
                  <div>
                    <label className="label flex items-center gap-1.5"><KeyRound size={13} /> Password</label>
                    <input
                      type="password"
                      className="input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={data.hasPassword && !data.passwordUnreadable ? "Saved — leave empty to keep it" : "Password"}
                      autoComplete="new-password"
                    />
                    <p className="mt-1 text-xs text-slate-500">{preset.passwordHint} It is stored encrypted and never shown again.</p>
                  </div>

                  <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
                    <ChevronDown size={14} className={advanced ? "rotate-180 transition-transform" : "transition-transform"} /> Advanced (filled in for you)
                  </button>
                  {advanced && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className="label">Server</label>
                          <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.example.com" />
                        </div>
                        <div>
                          <label className="label">Port</label>
                          <input className="input" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} placeholder="465" />
                        </div>
                      </div>
                      <div>
                        <label className="label">Security</label>
                        <select className="input" value={security} onChange={(e) => setSecurity(e.target.value as MailSecurity)}>
                          <option value="ssl">SSL (usually port 465)</option>
                          <option value="starttls">STARTTLS (usually port 587)</option>
                          <option value="none">None (not recommended)</option>
                        </select>
                      </div>
                      {!(preset.usernameHint || user) && (
                        <div>
                          <label className="label">Username (only if different from the email address)</label>
                          <input className="input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
                        </div>
                      )}
                      <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input type="checkbox" className="mt-1" checked={allowBadCert} onChange={(e) => setAllowBadCert(e.target.checked)} />
                        <span>Accept the host&rsquo;s certificate even if its name does not match. <span className="text-slate-500">Only if the test says the certificate does not match and your host&rsquo;s server name does not help.</span></span>
                      </label>
                    </div>
                  )}
                </div>
              </Step>

              <Step n={4} title="Test and save">
                <div className="space-y-3">
                  <div>
                    <label className="label">Send the test email to</label>
                    <input type="email" className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  </div>
                  <button type="button" onClick={save} disabled={busy} className="btn-primary w-full justify-center py-2.5 text-sm">
                    {busy ? <><Loader2 size={16} className="animate-spin" /> Testing… (up to 30 seconds)</> : <><Mail size={16} /> Save and send a test email</>}
                  </button>
                  <p className="text-xs text-slate-500">Nothing is saved unless the test email goes out, so a mistake here never breaks what already works.</p>
                  {result && (
                    <div className={`rounded-lg border px-4 py-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
                      {result.text}
                    </div>
                  )}
                </div>
              </Step>
            </>
          )}

          <section className="card p-5 text-sm text-slate-600">
            <h2 className="mb-2 text-base font-semibold text-slate-900">How password reset works for your users</h2>
            <ol className="list-decimal space-y-1.5 ps-5">
              <li>On the sign-in page they press <strong>Forgot password?</strong> and type their email address.</li>
              <li>They receive an email with a link. It works <strong>once</strong> and only for <strong>30 minutes</strong>.</li>
              <li>They open the link and choose a new password. Weak passwords (like 12345678) are refused.</li>
              <li>If they use two-factor sign-in, they also type the code from their authenticator app.</li>
              <li>They get a second email saying the password was changed, and every device they were signed in on is signed out.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">Someone who has lost both their password and their authenticator: open Users → their name, set a new password and turn two-factor sign-in off for them.</p>
            {working && !data.managedByHost && (
              <button type="button" onClick={turnOff} className="mt-4 text-xs font-semibold text-red-600 hover:underline">Turn email off</button>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
