// Time-based one-time passwords, in one place.
//
// Two bugs lived in the previous inline usage, and either alone was enough:
//
//   • otplib 13 needs its crypto and base32 plugins passed in. `new TOTP()`
//     with nothing constructs fine and then throws "Crypto plugin is required"
//     on the first verify — which the routes caught and reported as "Failed
//     to update 2FA", so enabling 2FA never worked, and a user who somehow had
//     it enabled could never log in.
//   • `verify()` returns `{ valid: boolean }`, not a boolean. Testing the
//     object with `if (!result)` would have accepted every six-digit code.
//
// Both call sites — enrolment and login — now use the two functions below and
// nothing else, so the library's API is a detail of this file.

import { TOTP, NobleCryptoPlugin, ScureBase32Plugin, generateSecret, generateURI } from "otplib";

const crypto = new NobleCryptoPlugin();
const base32 = new ScureBase32Plugin();
const totp = new TOTP({ crypto, base32 });

/** A fresh base32 secret for a new enrolment. */
export function newTotpSecret(): string {
  return generateSecret({ crypto, base32 });
}

/**
 * Whether `token` is the right code for `secret` right now.
 *
 * One period (30s) of tolerance either side: phone clocks drift, and a user
 * who types the code at the moment it rolls over should not be told it is
 * wrong. Malformed input (not six digits) is simply false, never an error.
 */
export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  const code = String(token ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code) || !secret) return false;
  try {
    const result = await totp.verify(code, { secret, epochTolerance: 30 });
    return result.valid === true;
  } catch {
    return false;
  }
}

/**
 * The `otpauth://` URI an authenticator app enrols from.
 *
 * The issuer is the product; the label is the site and the account. The app
 * shows the issuer as the title and the label under it, so someone with
 * several BMS sites in one authenticator sees
 *
 *     BMS by Rehan
 *     example.com (name@example.com)
 *
 * rather than five identical entries.
 */
export function totpUri(secret: string, site: string, account: string): string {
  return generateURI({
    strategy: "totp",
    issuer: "BMS by Rehan",
    label: site ? `${site} (${account})` : account,
    secret,
  });
}

/**
 * Codes already used to sign in, until they could no longer verify anyway.
 *
 * A code is valid for about 90 seconds (its own period and one either side),
 * so one read over a shoulder, from a screen share or from a phishing page
 * relaying it could be replayed within that window for a second session.
 * RFC 6238 §5.2 says a verifier must not accept the same code twice.
 *
 * In memory: the app runs as one process on its host, and a restart clears
 * this only for codes that expire within the next minute and a half.
 */
const usedCodes = new Map<string, number>();
const USED_TTL_MS = 120_000;

/**
 * `verifyTotp`, once per code per account: a second attempt with a code that
 * has already signed this account in is refused.
 */
export async function consumeTotp(accountId: string, token: string, secret: string): Promise<boolean> {
  const code = String(token ?? "").replace(/\s+/g, "");
  const now = Date.now();
  for (const [k, until] of usedCodes) if (until <= now) usedCodes.delete(k);
  const key = `${accountId}:${code}`;
  if (usedCodes.has(key)) return false;
  if (!(await verifyTotp(code, secret))) return false;
  usedCodes.set(key, now + USED_TTL_MS);
  return true;
}
