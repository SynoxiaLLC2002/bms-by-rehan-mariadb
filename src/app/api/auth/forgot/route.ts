import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { mailConfigured, sendMail } from "@/lib/mail";
import { issueResetToken, RESET_LIFETIME_MINUTES } from "@/lib/passwordReset";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Sends a reset link, if the email belongs to an account.
 *
 * The response is the same whether or not it does — "if that address has an
 * account, a link is on its way" — so this cannot be used to discover which
 * emails are registered. Rate limited per address and per IP, because the
 * only thing an attacker can do with it is make someone's inbox annoying.
 *
 * With no SMTP configured the request says so plainly: that is a fact about
 * the site, not about any account, and the alternative is a person waiting
 * for an email that will never come.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (rateLimited("forgot-ip", ip, { max: 5, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  if (!(await mailConfigured())) {
    return NextResponse.json({ ok: false, notConfigured: true, error: "This site cannot send email, so passwords cannot be reset this way. Ask an administrator to set yours." });
  }

  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    // Treated as empty below.
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter the email address you sign in with." }, { status: 400 });
  }
  if (rateLimited("forgot-email", email, { max: 3, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ ok: true });
  }

  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}`, columns: { id: true, name: true, password: true } });
  if (user?.password) {
    const settings = await getSiteSettings();
    // Through siteUrl, which keeps only the origin of NEXTAUTH_URL: that
    // variable may carry `/api/auth`, which made the emailed link a 404.
    const base = siteUrl(settings);
    const link = `${base.replace(/\/$/, "")}/admin/reset?token=${issueResetToken(user.id, user.password)}`;
    const site = settings.site_name || new URL(base).host;
    // Not awaited past a short grace: the reply must not depend on the mail
    // server's mood, and sendMail never throws.
    void sendMail({
      to: email,
      subject: `Reset your password — ${site}`,
      text:
        `Hello${user.name ? ` ${user.name}` : ""},\n\n` +
        `Someone asked to reset the password for your account on ${site}. If that was you, open this link within ${RESET_LIFETIME_MINUTES} minutes:\n\n` +
        `${link}\n\n` +
        `The link works once. If it was not you, ignore this email — nothing changes unless the link is used, and your password stays as it is.\n`,
    });
  }

  return NextResponse.json({ ok: true });
}
