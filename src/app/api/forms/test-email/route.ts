import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (visitors' names and emails)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { mailStatus, recipientList, sendMail } from "@/lib/mail";
import { getSiteSettings } from "@/lib/settings";
import { clientIp, rateLimited } from "@/lib/rateLimit";

/**
 * Is mail configured, and to whom would a notification go?
 *
 * The admin screen asks this so it can say "notifications are on but SMTP is
 * not configured" out loud, rather than leaving a switch that looks active and
 * quietly sends nothing.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const settings = await getSiteSettings();
  const status = await mailStatus();
  return NextResponse.json({
    ...status,
    recipients: recipientList(settings.forms_notify_to),
  });
}

/**
 * Sends one test message, to prove the credentials work before a real
 * submission depends on them.
 *
 * Administrators only, and rate limited: it is an authenticated endpoint that
 * causes outbound mail, which is worth a leash even behind a login.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  if (rateLimited("test-email", clientIp(req), { max: 5, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: "Too many test emails. Try again shortly." }, { status: 429 });
  }

  const status = await mailStatus();
  if (!status.configured) {
    return NextResponse.json({ error: status.detail }, { status: 400 });
  }

  const settings = await getSiteSettings();
  const body = await req.json().catch(() => ({}));

  // The address in the box if there is one, else wherever notifications go,
  // else the signed-in administrator.
  const to =
    recipientList(body?.to).length > 0
      ? recipientList(body?.to)
      : recipientList(settings.forms_notify_to).length > 0
        ? recipientList(settings.forms_notify_to)
        : recipientList(session.user.email);

  if (to.length === 0) {
    return NextResponse.json({ error: "No address to send to." }, { status: 400 });
  }

  const result = await sendMail({
    to,
    subject: `Test email from ${settings.site_name || "your site"}`,
    text: [
      "This is a test message from your CMS.",
      "",
      "If you are reading it, form notifications will reach this address.",
      "",
      `Sent via ${status.detail}`,
    ].join("\n"),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, sent: to });
}
