// A short-lived receipt that a password was just verified.
//
// Logging in is two requests: `/api/auth/check-2fa` verifies the password to
// decide whether to ask for an authenticator code, then NextAuth's credentials
// provider verifies it again to issue the session. Each verification is a
// bcrypt compare at cost 12 — deliberately slow, and on a shared host with one
// throttled core it is the single largest cost of signing in. Doing it twice
// doubled the wait for no security gain: the same password, the same hash,
// seconds apart.
//
// So the first step hands back a proof, and the second accepts the proof in
// place of the password. What makes that safe:
//
//   • it is only ever issued *after* a successful bcrypt compare;
//   • it is bound to the email, so it cannot be replayed against another
//     account, and to the time, so it dies two minutes later;
//   • it is an HMAC over those with AUTH_SECRET, so it cannot be forged;
//   • the sign-in step still checks the account exists and the second factor,
//     and a proof does not bypass the login throttle.
//
// Anyone who could steal a proof out of the browser in its two-minute life
// already had the password on the same page.

import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "./authSecret";

const LIFETIME_MS = 2 * 60 * 1000;

function sign(email: string, issuedAt: number): string {
  return createHmac("sha256", authSecret())
    .update(`login-proof\n${email.toLowerCase()}\n${issuedAt}`)
    .digest("base64url");
}

/** Call only after the password has been verified. */
export function issueLoginProof(email: string): string {
  const issuedAt = Date.now();
  return `${issuedAt}.${sign(email, issuedAt)}`;
}

/** True when `proof` was issued for this email within the last two minutes. */
export function verifyLoginProof(proof: string | undefined | null, email: string): boolean {
  if (!proof || !email) return false;
  const dot = proof.indexOf(".");
  if (dot <= 0) return false;

  const issuedAt = Number(proof.slice(0, dot));
  const mac = proof.slice(dot + 1);
  if (!Number.isFinite(issuedAt)) return false;

  const age = Date.now() - issuedAt;
  if (age < 0 || age > LIFETIME_MS) return false;

  let expected: string;
  try {
    expected = sign(email, issuedAt);
  } catch {
    return false;
  }
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
