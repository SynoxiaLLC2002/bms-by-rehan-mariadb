// Brute-force protection for the two places a password is checked.
//
// There are two of them, which is the whole problem: NextAuth's `authorize()`,
// and `/api/auth/check-2fa`, which the login form calls first to decide whether
// to show the 2FA field. The second is an unauthenticated endpoint that takes an
// email and a password and answers 200 or 401 — a password oracle, with no
// throttle in front of it. Guessing was limited only by how fast bcrypt runs,
// and bcrypt running is itself the denial-of-service: each attempt cost the
// server ~0.5s of CPU that the attacker paid nothing for.
//
// Both entry points now share these counters, so an attacker cannot get a fresh
// allowance by switching between them.

import { rateLimited } from "@/lib/rateLimit";
import bcrypt from "bcryptjs";

/** Per address. Generous enough for a person who forgot which password it was. */
const BY_IP = { max: 10, windowMs: 10 * 60 * 1000 };

/**
 * Per account, so a botnet spreading attempts across many addresses still runs
 * into a wall on the account it is actually targeting.
 *
 * Higher than the per-address limit on purpose. At 10 it was a lockout switch
 * anyone could press: ten wrong passwords for the admin's email, from one
 * address, and the real admin could not sign in for ten minutes — repeatable
 * forever. One address now runs into its own limit (10) long before this, so
 * locking the account takes attempts from at least five addresses, while a
 * distributed guess is still capped at 50 per ten minutes.
 */
const BY_ACCOUNT = { max: 50, windowMs: 10 * 60 * 1000 };

/**
 * A real bcrypt hash, compared against when no such user exists.
 *
 * Returning early for an unknown email answers in a millisecond while a known
 * one costs half a second — which is a reliable oracle for *which addresses
 * have accounts*, even when every response body says "invalid credentials".
 * Burning the same work either way removes the signal.
 */
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/** Whether this attempt should be refused before any password work happens. */
export function loginBlocked(ip: string, email: string): boolean {
  // Both are recorded, deliberately: `||` would short-circuit and let the
  // account counter go unincremented once the address one trips.
  const ipHit = rateLimited("login-ip", ip, BY_IP);
  const accountHit = rateLimited("login-account", email.trim().toLowerCase(), BY_ACCOUNT);
  return ipHit || accountHit;
}

/**
 * Compares a password, spending the same time whether or not the account is
 * real. Pass `null` for `hash` when the user was not found.
 */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}
