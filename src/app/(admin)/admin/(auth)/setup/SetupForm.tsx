"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

/**
 * First-run setup in two steps: the account's details, then two-factor
 * sign-in. The account is created only at the end of step two, with 2FA
 * already on (see api/setup for why it is not optional).
 */
export default function SetupForm({ needsToken = false }: { needsToken?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", setupToken: "" });
  const [step, setStep] = useState<"details" | "2fa">("details");
  const [twoFactor, setTwoFactor] = useState<{ secret: string; qrCode: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function toTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { res, data } = await post({ ...form, action: "2fa" });
      if (!res.ok || !data.secret) {
        setError(data.error || "Setup failed");
        return;
      }
      setTwoFactor({ secret: data.secret, qrCode: data.qrCode });
      setStep("2fa");
    } catch {
      setError("Setup failed");
    } finally {
      setLoading(false);
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!twoFactor) return;
    setLoading(true);
    setError("");
    try {
      const { res, data } = await post({ ...form, totpSecret: twoFactor.secret, code });
      if (!res.ok) {
        setError(data.error || "Setup failed");
        setCode("");
        return;
      }
      router.push("/admin/login");
    } catch {
      setError("Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-10">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              {step === "details" ? (
                <span className="text-white text-xl font-bold">B</span>
              ) : (
                <ShieldCheck className="text-white" size={22} />
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {step === "details" ? "Welcome to BMS" : "Turn on two-factor sign-in"}
            </h1>
            {step === "details" && <p className="text-slate-400 text-xs italic mt-0.5">A CMS made for bloggers by a blogger</p>}
            <p className="text-slate-500 text-sm mt-2">
              {step === "details" ? "Create your admin account to get started" : "Step 2 of 2 · required for the first account"}
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          {step === "details" ? (
            <form onSubmit={toTwoFactor} className="space-y-4">
              {needsToken && (
                <div>
                  <label className="label">Setup token</label>
                  <input
                    type="password"
                    className="input"
                    value={form.setupToken}
                    onChange={(e) => setForm({ ...form, setupToken: e.target.value })}
                    placeholder="The SETUP_TOKEN from the host's environment"
                    autoComplete="off"
                    required
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    This site was installed with a setup token, so only someone with access to the server can create the
                    first account.
                  </p>
                </div>
              )}
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Admin"
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Choose a strong password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <p className="text-xs text-slate-500">
                Next you will set up two-factor sign-in with an authenticator app on your phone (Google Authenticator,
                Microsoft Authenticator, Authy or any other).
              </p>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={finish} className="space-y-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                <p className="font-semibold">Why this is required</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  <li>
                    This first account <strong>owns the whole site</strong>: every page, every user, every setting.
                  </li>
                  <li>
                    A password alone can be guessed, leaked by another website, or caught by a fake login page. With
                    two-factor sign-in, a stolen password is <strong>not enough</strong> — the code on your phone is needed too.
                  </li>
                  <li>
                    It is also <strong>your way back in</strong>. A new site cannot send email until you set it up, so if you
                    forget your password, <em>Forgot password → Use your authenticator app</em> is how you reset it.
                  </li>
                </ul>
              </div>

              <ol className="space-y-4 text-sm text-slate-700">
                <li>
                  <p className="font-medium text-slate-900">1. Scan this with your authenticator app</p>
                  {twoFactor && (
                    // eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimise
                    <img src={twoFactor.qrCode} alt="QR code for your authenticator app" width={180} height={180} className="mx-auto mt-3 rounded-lg border border-slate-200" />
                  )}
                  <details className="mt-2 text-xs text-slate-500">
                    <summary className="cursor-pointer">Can&apos;t scan? Type this key into the app instead</summary>
                    <code className="mt-1 block select-all break-all rounded bg-slate-100 px-2 py-1.5 font-mono text-slate-800">{twoFactor?.secret}</code>
                  </details>
                </li>
                <li>
                  <p className="font-medium text-slate-900">2. Enter the 6-digit code it shows</p>
                  <input
                    className="input mt-2 tracking-widest"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    required
                    autoFocus
                  />
                </li>
              </ol>

              <p className="text-xs text-slate-500">
                Keep the app on your phone. Signing in will ask for a code from it each time, after your password.
              </p>

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? "Creating account…" : "Create account & continue"}
              </button>
              <button
                type="button"
                className="w-full text-center text-xs text-slate-400 hover:text-brand-600 hover:underline"
                onClick={() => {
                  setStep("details");
                  setError("");
                  setCode("");
                }}
              >
                Back to account details
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
