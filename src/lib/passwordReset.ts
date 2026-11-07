// Password-reset links.
//
// Stateless on purpose: the token is an HMAC over the user id, an expiry and
// a fragment of the *current* password hash. Nothing is stored, so there is
// no table to clean up — and because the hash is part of what is signed, the
// token stops working the moment the password changes. That makes it single
// use without a database flag, and it also means a token issued before the
// user changed their password some other way is worthless.
//
// Thirty minutes: long enough to find the email, short enough that a link
// sitting in an inbox (or a forwarded message) is not a standing door.

import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "./authSecret";

export const RESET_LIFETIME_MINUTES = 30;
const LIFETIME_MS = RESET_LIFETIME_MINUTES * 60 * 1000;

function sign(userId: string, expires: number, hashFragment: string): string {
  return createHmac("sha256", authSecret()).update(`reset\n${userId}\n${expires}\n${hashFragment}`).digest("base64url");
}

/** The part of the stored hash the token is bound to. */
function fragment(passwordHash: string | null | undefined): string {
  return (passwordHash ?? "").slice(-22);
}

export function issueResetToken(userId: string, passwordHash: string | null | undefined): string {
  const expires = Date.now() + LIFETIME_MS;
  const mac = sign(userId, expires, fragment(passwordHash));
  return Buffer.from(`${userId}.${expires}.${mac}`).toString("base64url");
}

/** The user id the token was issued for, or null if it is invalid or expired. */
export function readResetToken(token: string, lookupHash: (userId: string) => Promise<string | null | undefined>): Promise<string | null> {
  return (async () => {
    let raw = "";
    try {
      raw = Buffer.from(token, "base64url").toString("utf8");
    } catch {
      return null;
    }
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const [userId, expiresRaw, mac] = parts;
    const expires = Number(expiresRaw);
    if (!userId || !Number.isFinite(expires) || Date.now() > expires) return null;

    const hash = await lookupHash(userId);
    if (hash === undefined) return null;
    let expected: string;
    try {
      expected = sign(userId, expires, fragment(hash));
    } catch {
      return null;
    }
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
  })();
}
