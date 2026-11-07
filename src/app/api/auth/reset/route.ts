import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordProblem } from "@/lib/password";
import { readResetToken } from "@/lib/passwordReset";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { consumeTotp } from "@/lib/totp";
import { sendMail } from "@/lib/mail";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

/** Sets a new password for the account a valid reset token names. */
export async function POST(req: NextRequest) {
  if (rateLimited("reset", clientIp(req), { max: 10, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  let token = "";
  let password = "";
  let code = "";
  try {
    const body = await req.json();
    token = String(body?.token ?? "");
    password = String(body?.password ?? "");
    code = String(body?.code ?? "").replace(/\s+/g, "");
  } catch {
    // Treated as empty below.
  }

  const userId = await readResetToken(token, async (id) => {
    const u = await db.query.users.findFirst({ where: eq(users.id, id), columns: { password: true } });
    return u ? u.password : undefined;
  });
  if (!userId) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }

  const account = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true, name: true, totpEnabled: true, totpSecret: true },
  });
  if (!account) return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });

  // An account protected by two-factor sign-in needs its code here too: the
  // email link alone would otherwise let whoever reads that inbox replace the
  // password and walk around the second factor's purpose. Someone who has lost
  // both their password and their authenticator is helped by an administrator
  // (Users → the account → set a password, turn 2FA off).
  if (account.totpEnabled && account.totpSecret) {
    if (!code) return NextResponse.json({ needsCode: true, error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });
    if (!(await consumeTotp(userId, code, account.totpSecret))) {
      return NextResponse.json({ needsCode: true, error: "That code is not right. Enter the current 6-digit code from your authenticator app." }, { status: 400 });
    }
  }

  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const hash = await bcrypt.hash(password, 12);
  // Changing the hash also ends every signed-in session for this account
  // (they are bound to it — lib/auth passwordVersion) and voids the link.
  await db.update(users).set({ password: hash }).where(eq(users.id, userId));

  // Tell the owner. If this was not them, this email is how they find out.
  const settings = await getSiteSettings();
  const base = siteUrl(settings).replace(/\/$/, "");
  const site = settings.site_name || new URL(base).host;
  void sendMail({
    to: account.email,
    subject: `Your password was changed — ${site}`,
    text:
      `Hello${account.name ? ` ${account.name}` : ""},\n\n` +
      `The password for your account on ${site} was just changed using a reset link, and every device that was signed in has been signed out.\n\n` +
      `If this was you, nothing else is needed.\n\n` +
      `If it was NOT you, reset your password again straight away at ${base}/admin/forgot and tell the site's administrator.\n`,
  });
  return NextResponse.json({ ok: true });
}
