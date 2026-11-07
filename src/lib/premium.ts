// Premium features: parts of BMS that stay locked until the owner of a site
// has paid for them and been approved.
//
// How a site gets unlocked, end to end:
//
//   1. The locked screen shows a form. The administrator's *browser* sends it
//      (name, email, how they paid, a screenshot of the payment) straight to
//      synoxia.org, where a WordPress plugin stores it. This server never calls
//      synoxia.org: shared hosts block outgoing requests in surprising ways,
//      and the other side's firewall treats a Node user agent as a bot.
//   2. Rehan looks at the screenshot in that plugin and presses Approve. The
//      plugin signs a key for this site's domain with a private key that exists
//      only there.
//   3. The locked screen asks synoxia.org whether there is an answer yet, gets
//      the key, and posts it to /api/premium, which checks the signature below
//      and saves it. From then on the feature is open, with no further calls
//      to anybody: the key is verified here, offline, every time.
//
// What the lock is and is not. The key is tied to one domain and cannot be
// forged, so a key bought for one site does not open another and nobody can
// mint their own. The source of this CMS is on every buyer's disk, though, and
// someone who edits it can remove the check. That is true of every licence
// check ever shipped as source; this one is for honest people and a $1 price.
//
// The key travels through the browser and is stored in a setting any
// administrator can write. Neither matters, because nothing is trusted but the
// signature.

import { createHmac, createPublicKey, scryptSync, timingSafeEqual, verify } from "node:crypto";
import { rawQuery } from "@/lib/db/raw";
import { getSiteSettings, invalidateSiteSettings, type SiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

/** Where requests go and answers come from: the BMS Unlock plugin on synoxia.org. */
export const PREMIUM_SERVER = "https://synoxia.org/wp-json/bms-unlock/v1";

/**
 * The public half of the key the plugin signs with (Ed25519, raw, base64).
 * Changing it makes every key ever issued stop working.
 */
const PUBLIC_KEY_B64 = "+cOFY1p4kDAp1m9EYUzdLcYk+PQFe6wuGhA+XULdUJA=";

// Empty since RankLocal was removed (2026-10-31); add a feature id here to sell one.
export const PREMIUM_FEATURES = [] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export function isPremiumFeature(v: unknown): v is PremiumFeature {
  return typeof v === "string" && (PREMIUM_FEATURES as readonly string[]).includes(v);
}

/** Settings keys one feature owns. The request token is a credential, hence its name (ADMIN_ONLY_SETTING). */
export function premiumKeys(feature: PremiumFeature) {
  return {
    license: `premium_${feature}_license`,
    requestId: `premium_${feature}_request_id`,
    requestToken: `premium_${feature}_request_token`,
    requestAt: `premium_${feature}_request_at`,
  };
}

/** The name a key is issued for: this site's hostname, lowercase, without `www.`. */
export function premiumDomain(settings: SiteSettings): string {
  try {
    return new URL(siteUrl(settings)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

let keyObject: ReturnType<typeof createPublicKey> | null = null;
function publicKey() {
  // Node wants the key wrapped (SPKI); these twelve bytes are that wrapper for Ed25519.
  keyObject ??= createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(PUBLIC_KEY_B64, "base64")]),
    format: "der",
    type: "spki",
  });
  return keyObject;
}

export type LicenseCheck = { ok: true; domain: string; issuedAt: number } | { ok: false; error: string };

/**
 * Is this key genuine, for this feature, and for this domain?
 *
 * A key is `<payload>.<signature>`, both base64url. The payload is JSON:
 * `{ v: 1, f: feature, d: domain, i: request id, t: issued (unix seconds) }`,
 * and the signature is over the payload exactly as it appears in the key.
 */
export function checkLicense(license: string, feature: PremiumFeature, domain: string): LicenseCheck {
  const bad = { ok: false as const, error: "That key is not valid. Copy it again, all of it, with no spaces." };
  const parts = license.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || license.length > 2000) return bad;
  try {
    if (!verify(null, Buffer.from(parts[0], "utf8"), publicKey(), b64url(parts[1]))) return bad;
    const p = JSON.parse(b64url(parts[0]).toString("utf8")) as { v?: unknown; f?: unknown; d?: unknown; t?: unknown };
    if (p.v !== 1 || typeof p.d !== "string") return bad;
    if (p.f !== feature) return { ok: false, error: "That key is for a different feature." };
    if (!domain || p.d !== domain) {
      return { ok: false, error: `That key is for ${p.d}, and this site is ${domain || "not set up yet (Settings → Site URL)"}. A key works on one domain only.` };
    }
    return { ok: true, domain: p.d, issuedAt: typeof p.t === "number" ? p.t : 0 };
  } catch {
    return bad;
  }
}

/** True when this site holds a valid key for the feature. */
// ── The preview lock ──────────────────────────────────────────────────────────
//
// A paid feature that is in the code but not yet on sale: the screen does
// not even show its payment form: it asks for a password only Rehan has, and
// nothing behind it works — not the screen, not its API, not the tools an AI
// gets — until that password has been typed once on the site.
//
// The password is not here. This is its scrypt hash; typing the right one
// stores a proof (an HMAC under the site's AUTH_SECRET) that this site was
// opened, and that proof is what every check below looks for. A setting any
// administrator could write by hand would not be a lock.
//
// To put the features on sale: set PREVIEW_LOCK to false. Nothing else changes.

export const PREVIEW_LOCK = true;
const PREVIEW_SALT = "bms-ranklocal-preview-v1";
const PREVIEW_HASH = "5c916c46f78fb231bb46740d89dc3ef1ace86846afe364730317f4f4bfb62dbe";
/** Ends in `_secret`, so only administrators are ever sent it (ADMIN_ONLY_SETTING). */
export const PREVIEW_KEY = "premium_preview_secret";

/** Is this the preview password? Constant-time, and slow on purpose. */
export function previewPasswordOk(password: string): boolean {
  if (!password || password.length > 200) return false;
  const given = scryptSync(password, PREVIEW_SALT, 32);
  return timingSafeEqual(given, Buffer.from(PREVIEW_HASH, "hex"));
}

/** What the setting holds on a site where the password has been typed. */
export function previewProof(): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`bms-preview:${PREVIEW_HASH}`).digest("hex");
}

/** True when the preview lock is off, or this site has been opened with the password. */
export function previewOpen(settings: SiteSettings): boolean {
  if (!PREVIEW_LOCK) return true;
  const saved = settings[PREVIEW_KEY] ?? "";
  const want = previewProof();
  return !!process.env.AUTH_SECRET && saved.length === want.length && timingSafeEqual(Buffer.from(saved), Buffer.from(want));
}

export async function premiumUnlocked(feature: PremiumFeature, settings?: SiteSettings): Promise<boolean> {
  const s = settings ?? (await getSiteSettings());
  // Behind the preview lock nothing is unlocked, whatever key the site holds.
  if (!previewOpen(s)) return false;
  const license = s[premiumKeys(feature).license];
  return !!license && checkLicense(license, feature, premiumDomain(s)).ok;
}

/** Writes (or, with an empty value, removes) settings rows and drops the shared copy. */
export async function writePremiumSettings(values: Record<string, string>): Promise<void> {
  const set = Object.entries(values).filter(([, v]) => v !== "");
  const unset = Object.entries(values).filter(([, v]) => v === "").map(([k]) => k);
  if (set.length) {
    await rawQuery(
      `INSERT INTO site_settings (\`key\`, value, updated_at)
       VALUES ${set.map(() => "(?, ?, NOW(3))").join(", ")}
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW(3)`,
      set.flat()
    );
  }
  if (unset.length) await rawQuery("DELETE FROM site_settings WHERE `key` IN (?)", [unset]);
  invalidateSiteSettings();
}
