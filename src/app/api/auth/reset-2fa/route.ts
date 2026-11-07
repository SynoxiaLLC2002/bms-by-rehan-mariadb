import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { affectedRows } from "@/lib/db/write";
import { users } from "@/lib/db/schema";
import { passwordProblem } from "@/lib/password";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { consumeTotp } from "@/lib/totp";
import { sendMail } from "@/lib/mail";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Sets a new password from the account's email and a code from its
 * authenticator app — the way back in when the site cannot send email.
 *
 * Only accounts with two-factor sign-in turned on can use it, and the code is
 * the only secret in the request, so guesses are what this route is built
 * around. A 6-digit code is one of a million, and about three are accepted at
 * any moment (the current one and one either side), so each guess has roughly
 * a 1-in-330,000 chance. Five per account per 24 hours keeps that to a
 * fraction of a percent over a whole year of trying, and the count lives in
 * the database (drizzle/0020) because the host stops idle apps many times a
 * day and an in-memory counter would start again from zero each time.
 *
 * The attempt is reserved *before* the code is checked, in one UPDATE that
 * refuses when the window is already full, so fifty requests sent at once
 * cannot all slip in under a limit that was read before any of them counted.
 *
 * Every failure gives the same answer, whether the email has no account, the
 * account has no 2FA or the code is wrong, so this cannot be used to find out
 * which addresses are registered. Only a full window says so, and by then the
 * caller has already proved they are trying one particular address.
 */

const MAX_ATTEMPTS = 5;
const WINDOW = sql`INTERVAL 24 HOUR`;
const NO_MATCH = "That email and code do not match an account with two-factor sign-in. Check the email, and enter the code your authenticator app shows right now.";

export async function POST(req: NextRequest) {
  if (rateLimited("reset-2fa-ip", clientIp(req), { max: 10, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  let email = "";
  let code = "";
  let password = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    code = String(body?.code ?? "").replace(/\s+/g, "");
    password = String(body?.password ?? "");
  } catch {
    // Treated as empty below.
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter the email address you sign in with." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });
  }
  // Before an attempt is spent: a password the site would refuse anyway must
  // not cost the owner one of their five tries.
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const account = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
    columns: { id: true, name: true, email: true, totpEnabled: true, totpSecret: true },
  });
  if (!account || !account.totpEnabled || !account.totpSecret) {
    return NextResponse.json({ error: NO_MATCH }, { status: 400 });
  }

  // Reserve one attempt, or find the window full. A window older than 24
  // hours starts again at this attempt.
  const expired = sql`(${users.totpResetSince} IS NULL OR ${users.totpResetSince} < now() - ${WINDOW})`;
  const reservation = await db
    .update(users)
    .set({
      totpResetFailures: sql`CASE WHEN ${expired} THEN 1 ELSE ${users.totpResetFailures} + 1 END`,
      totpResetSince: sql`CASE WHEN ${expired} THEN now() ELSE ${users.totpResetSince} END`,
    })
    .where(and(eq(users.id, account.id), sql`(${expired} OR ${users.totpResetFailures} < ${MAX_ATTEMPTS})`));
  // MariaDB: changing the row IS the reservation; then the count, by id.
  const after = affectedRows(reservation)
    ? await db.query.users.findFirst({ where: eq(users.id, account.id), columns: { totpResetFailures: true } })
    : undefined;
  const reserved = after ? [{ failures: after.totpResetFailures }] : [];
  if (reserved.length === 0) {
    return NextResponse.json(
      {
        error:
          "Too many wrong codes for this account. Try again in 24 hours, or ask another administrator to set a new password for you (Users → the account).",
      },
      { status: 429 }
    );
  }

  if (!(await consumeTotp(account.id, code, account.totpSecret))) {
    const left = MAX_ATTEMPTS - reserved[0].failures;
    return NextResponse.json(
      { error: left > 0 ? `${NO_MATCH} ${left} ${left === 1 ? "try" : "tries"} left today.` : NO_MATCH },
      { status: 400 }
    );
  }

  const hash = await bcrypt.hash(password, 12);
  // A new hash also signs out every session this account had (lib/auth
  // passwordVersion) and voids any reset link already emailed.
  await db
    .update(users)
    .set({ password: hash, totpResetFailures: 0, totpResetSince: null })
    .where(eq(users.id, account.id));

  // Usually goes nowhere: this route exists for sites that cannot send email.
  // When one can, the owner hears about it.
  const settings = await getSiteSettings();
  const base = siteUrl(settings).replace(/\/$/, "");
  const site = settings.site_name || new URL(base).host;
  void sendMail({
    to: account.email,
    subject: `Your password was changed — ${site}`,
    text:
      `Hello${account.name ? ` ${account.name}` : ""},\n\n` +
      `The password for your account on ${site} was just changed using a code from your authenticator app, and every device that was signed in has been signed out.\n\n` +
      `If this was you, nothing else is needed.\n\n` +
      `If it was NOT you, someone has your authenticator. Reset your password again at ${base}/admin/forgot, then turn two-factor sign-in off and on again (Users → your account) so the old authenticator stops working.\n`,
  });
  return NextResponse.json({ ok: true });
}
