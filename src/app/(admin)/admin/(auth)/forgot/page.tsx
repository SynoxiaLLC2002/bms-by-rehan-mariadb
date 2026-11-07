"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Smartphone } from "lucide-react";

/**
 * Two ways back in: a link by email, or — for an account with two-factor
 * sign-in — the code from its authenticator app (api/auth/reset-2fa). The
 * second is what a site with no email set up has, so when the email way
 * reports it cannot send, the page offers the app way instead of a dead end.
 */
export default function ForgotPage() {
  const [mode, setMode] = useState<"email" | "app">("email");
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              {mode === "email" ? <KeyRound className="text-white" size={22} /> : <Smartphone className="text-white" size={22} />}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
            <p className="text-slate-500 text-sm mt-1">
              {mode === "email"
                ? "Enter the email you sign in with and a reset link will be sent."
                : "Use the code from your authenticator app to choose a new password."}
            </p>
          </div>

          {mode === "email" ? (
            <EmailReset email={email} setEmail={setEmail} useApp={() => setMode("app")} />
          ) : (
            <AppReset email={email} setEmail={setEmail} />
          )}

          <p className="mt-5 text-center text-xs text-slate-400">
            <button
              type="button"
              className="hover:text-brand-600 hover:underline"
              onClick={() => setMode(mode === "email" ? "app" : "email")}
            >
              {mode === "email" ? "Use your authenticator app instead" : "Get a reset link by email instead"}
            </button>
            <span className="mx-2">·</span>
            <Link href="/admin/login" className="hover:text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailReset({ email, setEmail, useApp }: { email: string; setEmail: (v: string) => void; useApp: () => void }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "unavailable">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.notConfigured) {
        setState("unavailable");
        setError(data.error);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Could not send the email.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("Could not send the email.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
        If <strong>{email}</strong> has an account, a reset link is on its way. It works for 30 minutes. Check the spam
        folder if it does not arrive.
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div
          className={`border text-sm px-4 py-3 rounded-lg ${
            state === "unavailable" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {error}
          {state === "unavailable" && (
            <>
              {" "}
              If your account uses two-factor sign-in,{" "}
              <button type="button" className="font-medium underline" onClick={useApp}>
                reset it with your authenticator app
              </button>
              .
            </>
          )}
        </div>
      )}
      <div>
        <label className="label">Email</label>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={state === "sending" || state === "unavailable"}>
        {state === "sending" ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

function AppReset({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not reset the password.");
        // A code is good for one try; the next attempt needs the next one.
        setCode("");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/admin/login"), 2000);
    } catch {
      setError("Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
        Password changed. Taking you to sign in…
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div>
        <label className="label">Email</label>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus={!email}
          autoComplete="username"
        />
      </div>
      <div>
        <label className="label">Code from your authenticator app</label>
        <input
          className="input tracking-widest"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          placeholder="123456"
          autoFocus={!!email}
        />
      </div>
      <div>
        <label className="label">New password</label>
        <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Confirm password</label>
        <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </div>
      <p className="text-xs text-slate-500">
        At least 8 characters. Only works for an account with two-factor sign-in turned on, and allows 5 tries a day.
        Type the code last, just before you press the button: it changes every 30 seconds.
      </p>
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
