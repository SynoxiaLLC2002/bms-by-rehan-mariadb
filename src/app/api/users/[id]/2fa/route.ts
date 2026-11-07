import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { canManageUser, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { rateLimited } from "@/lib/rateLimit";
import { newTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

// Second-factor enrolment for one account.
//
// Both handlers took the user id straight from the URL and checked only that
// *somebody* was signed in. That made the second factor worthless against any
// account on the site: an editor could
//
//   • GET this route with the administrator's id, which overwrote that admin's
//     `totp_secret` with a freshly generated one and handed it back — binding
//     their own authenticator app to the admin's account;
//   • POST `{ action: "disable" }` with the administrator's id and switch the
//     admin's 2FA off outright.
//
// Neither needed the target's password. `canManageUser` is the fix: yourself,
// or an administrator acting on someone else.

/**
 * Starts enrolment: a new secret, stored as pending, and its QR code.
 *
 * A POST (`{ action: "setup" }`), not a GET. It writes — it replaces any
 * pending secret — and a GET can be fired by a link or an <img> on another
 * site while an admin is signed in, which silently invalidated a setup code
 * someone had just scanned.
 */
async function startSetup(id: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, email: true, totpSecret: true, totpEnabled: true },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enrolment replaces the stored secret, so running it against an account
  // that already has 2FA working locks that account out: the authenticator
  // keeps generating codes for the old secret while the database holds a new
  // one. Turning it off first is the deliberate step that makes that safe.
  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "Two-factor authentication is already on for this account. Turn it off before setting it up again." },
      { status: 409 }
    );
  }

  // Labelled with the site's own domain, so a person running several BMS
  // sites can tell the entries apart in their authenticator.
  const secret = newTotpSecret();
  let site = "";
  try {
    site = new URL(siteUrl(await getSiteSettings())).hostname.replace(/^www\./, "");
  } catch {
    // No configured URL yet — the label falls back to the email alone.
  }
  const otpAuthUrl = totpUri(secret, site, user.email);
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

  // Store the pending secret (not enabled yet until verified)
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, id));

  return NextResponse.json({
    secret,
    qrCode: qrCodeDataUrl,
    enabled: user.totpEnabled,
  });
}

/** Reading is harmless and no longer starts anything; setup is a POST. */
export async function GET() {
  return NextResponse.json({ error: "Start two-factor setup with a POST." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const { id } = await params;
    if (!canManageUser(session, id)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    const { action, token } = body;
    if (action === "setup") return await startSetup(id);

    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { totpSecret: true, totpEnabled: true },
    });

    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "verify") {
      if (!user.totpSecret) return NextResponse.json({ error: "No 2FA secret set" }, { status: 400 });
      if (!(await verifyTotp(String(token ?? ""), user.totpSecret))) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
      }

      await db.update(users).set({ totpEnabled: true }).where(eq(users.id, id));
      return NextResponse.json({ success: true, enabled: true });
    }

    if (action === "disable") {
      // The password of whoever is signed in — the account's owner, or the
      // administrator helping someone who lost their phone. Without it a
      // stolen session cookie was enough to take the second factor off and
      // leave the account protected by the password alone.
      if (rateLimited("2fa-disable", session.user.id, { max: 5, windowMs: 15 * 60 * 1000 })) {
        return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
      }
      const actor = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { password: true } });
      const password = String(body.password ?? "");
      if (!password) return NextResponse.json({ error: "Enter your password to turn off two-factor authentication." }, { status: 400 });
      if (!actor?.password || !(await bcrypt.compare(password, actor.password))) {
        return NextResponse.json({ error: "That password is incorrect." }, { status: 403 });
      }
      await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, id));
      return NextResponse.json({ success: true, enabled: false });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Failed to update 2FA" }, { status: 500 });
  }
}
