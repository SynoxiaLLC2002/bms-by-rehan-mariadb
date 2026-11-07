"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";

function ResetForm() {
  const router = useRouter();
  // Read once, then taken out of the address bar: a reset link left in the
  // history, a bookmark or a screenshot is a way into the account for the
  // next half hour.
  const fromUrl = useSearchParams().get("token") ?? "";
  const [token] = useState(fromUrl);
  useEffect(() => {
    if (fromUrl) window.history.replaceState(null, "", "/admin/reset");
  }, [fromUrl]);
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsCode) setNeedsCode(true);
        setError(data.error || "Could not reset the password.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/admin/login"), 1800);
    } catch {
      setError("Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        This page needs the link from the reset email.{" "}
        <Link href="/admin/forgot" className="font-medium underline">
          Request one
        </Link>
        .
      </div>
    );
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
        <label className="label">New password</label>
        <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Confirm password</label>
        <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </div>
      <p className="text-xs text-slate-500">At least 8 characters. Avoid common passwords and simple runs like 12345678.</p>
      {needsCode && (
        <div>
          <label className="label">Code from your authenticator app</label>
          <input className="input tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} required placeholder="123456" />
          <p className="mt-1 text-xs text-slate-500">This account uses two-factor sign-in, so a reset needs the code too.</p>
        </div>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      {/* The link carries the reset token: never send it to another site. */}
      <meta name="referrer" content="no-referrer" />
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <KeyRound className="text-white" size={22} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
          </div>
          <Suspense fallback={null}>
            <ResetForm />
          </Suspense>
          <p className="mt-5 text-center text-xs text-slate-400">
            <Link href="/admin/login" className="hover:text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
