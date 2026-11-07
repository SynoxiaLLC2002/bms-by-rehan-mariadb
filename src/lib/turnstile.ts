// Cloudflare Turnstile, for the two forms anyone on the internet can submit.
//
// The honeypot field catches naive bots; it does nothing against the ones
// that read the page. Turnstile is Cloudflare's invisible challenge — no
// puzzles for people — and the site is already behind Cloudflare, so the keys
// are a two-minute job in the same dashboard.
//
// Off until both keys are set; then every comment and contact-form
// submission must carry a token the widget issued, and the token is checked
// with Cloudflare before anything is saved.

const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Read at run time. `process.env.NEXT_PUBLIC_…` written out literally is
 * replaced with its build-time value, in server code as well as in the
 * browser bundle; looking the name up indirectly gets the host's current one.
 */
const SITE_KEY_VAR = ["NEXT_PUBLIC", "TURNSTILE_SITE_KEY"].join("_");

export function turnstileSiteKey(): string {
  return (process.env[SITE_KEY_VAR] || "").trim();
}

export function turnstileEnabled(): boolean {
  return !!(turnstileSiteKey() && process.env.TURNSTILE_SECRET_KEY);
}

/**
 * True when the submission may proceed: Turnstile is off, or the token is
 * good. A network failure talking to Cloudflare counts as a failure — better
 * that a comment is refused with a clear message than that the check can be
 * bypassed by making it unreachable.
 */
export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  const t = typeof token === "string" ? token.trim() : "";
  if (!t || t.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY as string, response: t });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(VERIFY, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
