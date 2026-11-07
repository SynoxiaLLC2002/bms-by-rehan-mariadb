"use client";

import { useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [error, setError] = useState("");
  const proofRef = useRef("");
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/check-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      // A throttled attempt is not a wrong password, and telling someone their
      // password is wrong while they are locked out sends them off resetting a
      // password that was fine. Anything else stays deliberately vague — the
      // message must not say whether the account exists.
      setError(
        res.status === 429
          ? data.error || "Too many attempts. Try again in a few minutes."
          : "Invalid email or password"
      );
      return;
    }

    // Kept in a ref rather than state: it is used within the same tick for
    // the no-2FA path, before a state update would be visible.
    proofRef.current = typeof data.proof === "string" ? data.proof : "";

    if (data.requires2FA) {
      setStep("totp");
    } else {
      await doSignIn();
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    await doSignIn(totpToken);
  }

  async function doSignIn(token = "") {
    const res = await signIn("credentials", {
      email,
      password,
      totpToken: token,
      proof: proofRef.current,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      if (step === "totp") {
        setError("Invalid authenticator code. Please try again.");
      } else {
        setError("Invalid email or password");
      }
    } else {
      // Back to "Connect Claude" when that is what sent you here (middleware
      // adds ?next=). Only that one screen: any other `next` would make the
      // login page an open redirect.
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      if (next === "/admin/connect" || next.startsWith("/admin/connect?")) window.location.assign(next);
      else router.push("/admin");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              {step === "totp" ? (
                <ShieldCheck className="text-white" size={22} />
              ) : (
                <span className="text-white text-xl font-bold">B</span>
              )}
            </div>
            {step !== "totp" && (
              <>
                <h1 className="text-2xl font-bold text-slate-900">BMS by Rehan</h1>
                <p className="text-slate-400 text-xs mt-0.5 italic">A CMS made for bloggers by a blogger</p>
              </>
            )}
            {step === "totp" && (
              <h1 className="text-2xl font-bold text-slate-900">Two-factor authentication</h1>
            )}
            <p className="text-slate-500 text-sm mt-1">
              {step === "totp"
                ? "Open your authenticator app and enter the 6-digit code"
                : "Sign in to your admin panel"}
            </p>
          </div>

          {step === "credentials" ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? "Checking…" : "Continue"}
              </button>
              <p className="text-center text-xs text-slate-400">
                <Link href="/admin/forgot" className="hover:text-brand-600 hover:underline">Forgot your password?</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleTotp} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              <div>
                <label className="label">Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input font-mono tracking-[0.4em] text-center text-xl"
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading || totpToken.length !== 6}
              >
                {loading ? "Verifying…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("credentials"); setError(""); setTotpToken(""); }}
                className="btn-ghost w-full text-sm"
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-5">
          Made with ♥ by{" "}
          <a
            href="https://www.facebook.com/rehanmubarak32/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 hover:underline"
          >
            Rehan
          </a>
        </p>
      </div>
    </div>
  );
}
