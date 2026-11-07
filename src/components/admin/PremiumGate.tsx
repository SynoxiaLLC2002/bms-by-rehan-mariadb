"use client";

// The lock in front of a premium feature, and the way through it.
//
// Locked: what the feature is, where to send the money, and a form — name,
// email, how they paid, a screenshot of the payment. The form goes from this
// browser straight to synoxia.org (lib/premium.ts explains why the server
// stays out of it). Waiting: says so, and asks synoxia.org for an answer each
// time the screen is opened (each ask carries the time, so a page cache on
// synoxia.org can never answer in the server's place). Approved: the key that comes back is handed to
// /api/premium, which checks it, and the feature's own screen is shown instead.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, Copy, KeyRound, Loader2, Lock, RefreshCw, TriangleAlert, Upload } from "lucide-react";

interface State {
  /** The feature is not on sale yet: the screen asks for the preview password and shows nothing else. */
  previewLocked?: boolean;
  server: string;
  domain: string;
  siteUrl: string;
  siteName: string;
  adminEmail: string;
  adminName: string;
  unlocked: boolean;
  licenseError: string;
  request: { id: string; token: string; at: string } | null;
}

interface PayMethod {
  id: string;
  label: string;
  account: string;
  holder?: string;
}

interface Info {
  price: string;
  methods: PayMethod[];
  note?: string;
}

const MAX_SHOT_BYTES = 5 * 1024 * 1024;

/** What synoxia.org said went wrong, or a plain fallback. */
async function serverMessage(res: Response | null, fallback: string): Promise<string> {
  if (!res) return "Could not reach synoxia.org. Check your internet connection and try again.";
  const d = (await res.json().catch(() => ({}))) as { message?: string };
  return d.message || fallback;
}

export default function PremiumGate({
  feature,
  name,
  pitch,
  children,
}: {
  feature: string;
  /** The feature's name as people see it. */
  name: string;
  /** What they get, shown above the payment steps while locked. */
  pitch: React.ReactNode;
  /** The feature itself, rendered once unlocked. */
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [infoError, setInfoError] = useState("");
  const [answer, setAnswer] = useState<{ status: "pending" | "rejected" | "unknown"; note?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pass, setPass] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState("");

  const load = useCallback(async (): Promise<State | null> => {
    const res = await fetch(`/api/premium?feature=${feature}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return null;
    const s = (await res.json()) as State;
    setState(s);
    setFullName((v) => v || s.adminName);
    setEmail((v) => v || s.adminEmail);
    return s;
  }, [feature]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, ...body }),
      }).catch(() => null);
      const d = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : {};
      return { ok: !!res?.ok && !!d.ok, error: d.error || "Something went wrong. Try again." };
    },
    [feature]
  );

  /** Asks synoxia.org whether the request has been answered; unlocks if it has. */
  const check = useCallback(
    async (s: State) => {
      if (!s.request) return;
      setChecking(true);
      const url = `${s.server}/status?id=${encodeURIComponent(s.request.id)}&token=${encodeURIComponent(s.request.token)}&_=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      const d = res?.ok ? ((await res.json().catch(() => ({}))) as { status?: string; license?: string; note?: string }) : null;
      if (d?.status === "approved" && d.license) {
        const r = await post({ action: "activate", license: d.license });
        if (r.ok) await load();
        else setAnswer({ status: "unknown", note: r.error });
      } else if (d?.status === "rejected") setAnswer({ status: "rejected", note: d.note });
      else if (d?.status === "pending") setAnswer({ status: "pending" });
      else setAnswer({ status: "unknown", note: res ? await serverMessage(res, "") : "" });
      setChecking(false);
    },
    [load, post]
  );

  const loadInfo = useCallback(
    async (s: State) => {
      setInfoError("");
      const res = await fetch(`${s.server}/info?feature=${feature}&_=${Date.now()}`, { cache: "no-store" }).catch(() => null);
      const d = res?.ok ? ((await res.json().catch(() => null)) as Info | null) : null;
      if (d && Array.isArray(d.methods) && d.methods.length) {
        setInfo(d);
        setMethod((v) => v || d.methods[0].id);
      } else setInfoError("The payment details could not be loaded from synoxia.org.");
    },
    [feature]
  );

  useEffect(() => {
    void (async () => {
      const s = await load();
      if (!s || s.previewLocked || s.unlocked) return;
      if (s.request) void check(s);
      else void loadInfo(s);
    })();
  }, [load, check, loadInfo]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard refused: the number is on screen to type */
    }
  }

  async function submit() {
    if (!state) return;
    setError("");
    if (!fullName.trim()) return setError("Type your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Type your email address, so you can be told when it is approved.");
    if (!shot) return setError("Add the screenshot of your payment.");
    if (shot.size > MAX_SHOT_BYTES) return setError("That screenshot is larger than 5 MB. Take a smaller one, or crop it.");

    const form = new FormData();
    form.set("feature", feature);
    form.set("domain", state.domain);
    form.set("site_url", state.siteUrl);
    form.set("site_name", state.siteName);
    form.set("name", fullName.trim());
    form.set("email", email.trim());
    form.set("method", method);
    form.set("reference", reference.trim());
    form.set("screenshot", shot);

    setBusy(true);
    const res = await fetch(`${state.server}/request`, { method: "POST", body: form }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      return setError(await serverMessage(res, "synoxia.org did not accept the request. Try again in a minute."));
    }
    const d = (await res.json().catch(() => ({}))) as { id?: string; token?: string };
    const saved = await post({ action: "requested", id: d.id, token: d.token });
    setBusy(false);
    if (!saved.ok) return setError(saved.error);
    setAnswer({ status: "pending" });
    await load();
  }

  async function sendAnother() {
    if (!state) return;
    await post({ action: "forget" });
    setAnswer(null);
    setShot(null);
    const s = await load();
    if (s) void loadInfo(s);
  }

  /**
   * Two things go in the key box. A full key (long, with a dot in it) is
   * checked here and now. Anything else is a custom key Rehan made up
   * ("REHAN-VIP"): synoxia.org swaps it for this site's real key, if it still
   * has uses left.
   */
  async function useKey() {
    if (!state) return;
    setKeyError("");
    setKeyBusy(true);
    let license = key.trim();
    if (!license.includes(".")) {
      const res = await fetch(`${state.server}/redeem`, {
        method: "POST",
        body: new URLSearchParams({ feature, domain: state.domain, code: license }),
      }).catch(() => null);
      if (!res?.ok) {
        setKeyBusy(false);
        return setKeyError(await serverMessage(res, "synoxia.org did not accept that key. Try again in a minute."));
      }
      license = String(((await res.json().catch(() => ({}))) as { license?: string }).license ?? "");
    }
    const r = await post({ action: "activate", license });
    setKeyBusy(false);
    if (r.ok) await load();
    else setKeyError(r.error);
  }

  /** The preview lock: the password opens this site; a full reload then starts the screen from the top. */
  async function openPreview() {
    setPassError("");
    setPassBusy(true);
    const r = await post({ action: "preview", password: pass });
    setPassBusy(false);
    if (r.ok) window.location.reload();
    else setPassError(r.error);
  }

  async function relock() {
    if (!window.confirm(`Lock ${name} on this site again? The password will be asked for next time.`)) return;
    await post({ action: "relock" });
    window.location.reload();
  }

  if (!state) {
    return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
  }
  if (state.previewLocked) {
    return (
      <div className="mx-auto max-w-md">
        <section className="card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Lock size={18} className="text-slate-500" /> {name} is not available yet</h2>
          <p className="mt-2 text-sm text-slate-600">This part of BMS is still being finished. It opens with a password.</p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void openPreview();
            }}
          >
            <input type="password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password" autoComplete="off" aria-label="Password" />
            <button type="submit" disabled={!pass || passBusy} className="btn-primary w-full justify-center text-sm">
              {passBusy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Open
            </button>
            {passError && <p className="text-sm text-red-700">{passError}</p>}
          </form>
        </section>
      </div>
    );
  }
  if (state.unlocked) {
    return (
      <>
        {children}
        <p className="mx-auto mt-6 max-w-3xl text-center">
          <button type="button" onClick={relock} className="text-xs font-semibold text-slate-400 hover:text-slate-700 hover:underline">Lock {name} on this site again</button>
        </p>
      </>
    );
  }

  const chosen = info?.methods.find((m) => m.id === method);
  const sentOn = state.request?.at ? new Date(state.request.at).toLocaleString() : "";

  const keyBox = (
    <section className="card p-5">
      <button type="button" onClick={() => setShowKey((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900">
        <KeyRound size={15} /> I already have a key
      </button>
      {showKey && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">If Rehan gave you a key, type or paste it here exactly as you received it.</p>
          <textarea className="input font-mono text-xs" rows={3} value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} />
          <button type="button" onClick={useKey} disabled={!key.trim() || keyBusy || !state.domain} className="btn-primary text-sm">
            {keyBusy ? <Loader2 size={15} className="animate-spin" /> : null} Unlock with this key
          </button>
          {keyError && <p className="text-sm text-red-700">{keyError}</p>}
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Lock size={18} className="mt-0.5 shrink-0" />
        <div>
          <strong>{name} is locked on this site.</strong> It is a paid extra{info?.price ? `: ${info.price}, once, for ${state.domain || "this site"}, forever` : ""}.
          {state.licenseError && <span className="mt-1 block font-medium">{state.licenseError}</span>}
        </div>
      </div>

      <section className="card p-5 text-sm text-slate-700">{pitch}</section>

      {!state.domain && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <span>This site has no address yet. Set it in Settings → Site URL first: the key is made for that exact domain.</span>
        </div>
      )}

      {state.request ? (
        <section className="card p-5">
          {answer?.status === "rejected" ? (
            <>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><TriangleAlert size={18} className="text-red-600" /> Your request was not approved</h2>
              <p className="mt-2 text-sm text-slate-700">{answer.note || "The payment could not be confirmed from the screenshot."}</p>
              <button type="button" onClick={sendAnother} className="btn-primary mt-4 text-sm">Send a new request</button>
            </>
          ) : (
            <>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Clock size={18} className="text-amber-600" /> Waiting for approval</h2>
              <p className="mt-2 text-sm text-slate-700">
                Your payment screenshot was sent{sentOn ? ` on ${sentOn}` : ""}. Rehan checks each one by hand, so this can take up to a day. You do not need to do anything: open this screen again later and it unlocks by itself.
              </p>
              {answer?.status === "unknown" && (
                <p className="mt-2 text-sm text-red-700">{answer.note || "Could not reach synoxia.org to check. Try again in a minute."}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => check(state)} disabled={checking} className="btn-primary text-sm">
                  {checking ? <><Loader2 size={15} className="animate-spin" /> Checking…</> : <><RefreshCw size={15} /> Check now</>}
                </button>
                <button type="button" onClick={sendAnother} className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">Sent the wrong screenshot? Start again</button>
              </div>
            </>
          )}
        </section>
      ) : infoError ? (
        <section className="card p-5 text-sm text-slate-700">
          <p>{infoError} Check your internet connection, or try again in a few minutes.</p>
          <button type="button" onClick={() => loadInfo(state)} className="btn-primary mt-3 text-sm"><RefreshCw size={15} /> Try again</button>
        </section>
      ) : !info ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading payment details…</div>
      ) : (
        <>
          <section className="card p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">1. Send {info.price}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {info.methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${method === m.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <span className="block text-sm font-semibold text-slate-900">{m.label}</span>
                  <span className="mt-0.5 block font-mono text-sm text-slate-700">{m.account}</span>
                  {m.holder && <span className="block text-xs text-slate-500">{m.holder}</span>}
                </button>
              ))}
            </div>
            {chosen && (
              <button type="button" onClick={() => copy(chosen.account)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
                {copied === chosen.account ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy the {chosen.label} number</>}
              </button>
            )}
            {info.note && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">{info.note}</p>}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">2. Send the screenshot of your payment</h2>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Your name</label>
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
                </div>
                <div>
                  <label className="label">Your email</label>
                  <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={150} />
                </div>
              </div>
              <div>
                <label className="label">Transaction ID, or the name the money was sent from (optional)</label>
                <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={150} />
              </div>
              <div>
                <label className="label">Payment screenshot</label>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setShot(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600 hover:border-slate-400">
                  <Upload size={16} /> {shot ? shot.name : "Choose the screenshot (PNG, JPG or WebP, up to 5 MB)"}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                This is sent to synoxia.org together with this site&rsquo;s address ({state.domain || "not set"}), so Rehan can check the payment and make a key for this site.
              </p>
              <button type="button" onClick={submit} disabled={busy || !state.domain} className="btn-primary w-full justify-center py-2.5 text-sm">
                {busy ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : "Send for approval"}
              </button>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
            </div>
          </section>
        </>
      )}

      {keyBox}
    </div>
  );
}
