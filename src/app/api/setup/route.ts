import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { insertReturning } from "@/lib/db/write";
import { users } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { normalizeEmail, passwordProblem } from "@/lib/password";
import { secretMatches } from "@/lib/secretCompare";
import { rawExec, rawQuery } from "@/lib/db/raw";
import QRCode from "qrcode";
import { newTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

/** Claimed once, atomically, by whichever setup request gets there first. */
const CLAIM = "setup_claimed";

// One-time setup route to create the first admin user.
//
// Unauthenticated by necessity, and the account it creates owns the site, so
// between upload and the owner's first visit anyone who finds a fresh install
// could claim it. With SETUP_TOKEN in the environment, only someone who can
// read the server's environment can. Without it, it behaves as it always did.
//
// Two-factor sign-in is part of setup, not an option after it: the first
// account owns the site, and on a fresh install with no email configured the
// authenticator is also the only way back in after a forgotten password
// (api/auth/reset-2fa). So setup is two requests. `{ action: "2fa" }` hands
// out a new secret and its QR code and stores nothing; the second request
// brings that secret back with a code from the app, and the account is created
// only if the code is right — with 2FA already on. There is never a moment
// when the owner account exists without it.
//
// The secret travels to the browser and back rather than being kept here
// between the two requests. That is safe: it is the new owner's own secret,
// shown to them as the QR code anyway, and nobody else has an account yet
// whose secret they could choose.

/** Base32 as otplib's secrets are written; anything else is not ours. */
const SECRET_SHAPE = /^[A-Z2-7]{16,64}=*$/;

async function startTwoFactor(email: string) {
  let site = "";
  try {
    site = new URL(siteUrl(await getSiteSettings())).hostname.replace(/^www\./, "");
  } catch {
    // No configured URL yet — the label falls back to the email alone.
  }
  const secret = newTotpSecret();
  const qrCode = await QRCode.toDataURL(totpUri(secret, site, email));
  return NextResponse.json({ secret, qrCode });
}

export async function POST(req: NextRequest) {
  try {
    const existingUsers = await db.query.users.findMany({ limit: 1 });
    if (existingUsers.length > 0) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
    }

    const body = await req.json();
    const { name, email, password } = body;

    const setupToken = (process.env.SETUP_TOKEN ?? "").trim();
    if (setupToken && !secretMatches(setupToken, String(body.setupToken ?? "").trim(), 1)) {
      return NextResponse.json({ error: "That setup token is not the one this site was installed with." }, { status: 403 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    // This route is unauthenticated by necessity, and the account it creates
    // owns the whole site — so it is the last place to accept "a" as a password.
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // Step one: the details are fine, so hand out the QR code.
    if (body.action === "2fa") return startTwoFactor(normalizedEmail);

    // Step two: the account is made only with a working authenticator.
    const totpSecret = String(body.totpSecret ?? "").trim().toUpperCase();
    if (!SECRET_SHAPE.test(totpSecret)) {
      return NextResponse.json({ needs2fa: true, error: "Two-factor sign-in is required for the first account. Scan the QR code first." }, { status: 400 });
    }
    if (!(await verifyTotp(String(body.code ?? ""), totpSecret))) {
      return NextResponse.json({ error: "That code is not right. Enter the 6-digit code your authenticator app shows right now." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // The "no users yet" check above is a read, so two requests in the same
    // moment both passed it and both created an administrator. Claiming one
    // settings row (INSERT … ON DUPLICATE KEY, keyed on the unique `key`) is
    // atomic: exactly one request inserts it.
    // A claim left behind with still no account (a crash between the two
    // writes, or every user deleted later) must not lock setup for good.
    await rawQuery(`DELETE FROM site_settings WHERE \`key\` = ? AND value < ?`, [
      CLAIM,
      new Date(Date.now() - 10 * 60_000).toISOString(),
    ]);
    // MariaDB: a new row counts 1, a duplicate left as it was counts 0.
    const claimed = await rawExec(
      `INSERT INTO site_settings (\`key\`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`key\` = \`key\``,
      [CLAIM, new Date().toISOString()]
    );
    if (claimed !== 1) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
    }

    let user: { id: string };
    try {
      [user] = await insertReturning(users, {
        // An author page from the start: off, bylines were unlinked and the author
        // URL a 404, so Google saw no author at all. An account that only moderates
        // can be switched off on its Users screen.
        publicProfile: true,
        id: randomUUID(),
        name: name || "Admin",
        email: normalizedEmail,
        password: hashedPassword,
        role: "admin",
        totpSecret,
        totpEnabled: true,
      });
    } catch (err) {
      // Release the claim, or a failed insert would lock setup forever.
      await rawQuery(`DELETE FROM site_settings WHERE \`key\` = ?`, [CLAIM]).catch(() => {});
      throw err;
    }

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
