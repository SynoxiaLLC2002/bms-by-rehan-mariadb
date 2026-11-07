import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { rawQuery } from "@/lib/db/raw";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import {
  decryptSecret,
  encryptSecret,
  forgetMailConfig,
  mailStatus,
  readAdminMailRows,
  sendWith,
  MAIL_KEYS,
  type MailConfig,
} from "@/lib/mail";
import { mailPreset } from "@/lib/mailPresets";

// Admin → Email: the settings behind "Forgot password" and form notifications.
//
// Saved only after a real test email has gone out with them, so the site never
// claims it can send when it cannot — a reset page promising an email that
// never arrives is worse than one that says "ask an administrator". The
// password is encrypted before it is stored and is never sent back, not even
// to an administrator; GET says only whether one is saved.

const EMAIL = /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]+$/;
const HOST = /^[a-z0-9.-]{1,253}$/i;

async function admin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json(UNAUTHORIZED, { status: 401 }) };
  if (!isAdmin(session)) return { error: NextResponse.json(FORBIDDEN, { status: 403 }) };
  return { session };
}

export async function GET() {
  const a = await admin();
  if (a.error) return a.error;
  const settings = await getSiteSettings();
  let domain = "";
  try {
    domain = new URL(siteUrl(settings)).hostname.replace(/^www\./, "");
  } catch {
    /* no site URL yet */
  }
  const status = await mailStatus();
  const r = await readAdminMailRows();
  return NextResponse.json(
    {
      // Set by the host's variables: shown, not editable here.
      managedByHost: status.source === "env",
      status,
      domain,
      adminEmail: a.session.user?.email ?? "",
      preset: r.mail_preset || "hosting",
      host: r.mail_host || "",
      port: r.mail_port || "",
      security: r.mail_security || "",
      user: r.mail_user || "",
      fromEmail: r.mail_from_email || "",
      fromName: r.mail_from_name || settings.site_name || "",
      allowBadCert: r.mail_allow_bad_cert === "true",
      hasPassword: !!r.mail_password,
      // Saved, but no longer readable (AUTH_SECRET changed): ask for it again.
      passwordUnreadable: !!r.mail_password && decryptSecret(r.mail_password) === null,
      lastTest: r.mail_last_test || "",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const a = await admin();
  if (a.error) return a.error;
  if (rateLimited("mail-settings", clientIp(req), { max: 8, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: "Too many tries. Wait a few minutes, then try again." }, { status: 429 });
  }
  if ((await mailStatus()).source === "env") {
    return NextResponse.json({ error: "Email is set by your host's settings (cPanel variables). Remove those to manage it here." }, { status: 400 });
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string, max = 200) => String(b[k] ?? "").trim().slice(0, max);
  const preset = mailPreset(str("preset"));
  const host = str("host").toLowerCase();
  const port = parseInt(str("port"), 10);
  const security = (["ssl", "starttls", "none"].includes(str("security")) ? str("security") : preset.security) as MailConfig["security"];
  const fromEmail = str("fromEmail").toLowerCase();
  const user = str("user") || fromEmail;
  const fromName = str("fromName", 80).replace(/["\r\n<>]/g, "");
  const allowBadCert = b.allowBadCert === true;
  const newPassword = String(b.password ?? "");

  if (!HOST.test(host)) return NextResponse.json({ error: "Enter the mail server name (for example mail.yourdomain.com)." }, { status: 400 });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return NextResponse.json({ error: "Enter the port — usually 465 or 587." }, { status: 400 });
  if (!EMAIL.test(fromEmail)) return NextResponse.json({ error: "Enter the email address the site should send from." }, { status: 400 });
  if (newPassword.length > 500) return NextResponse.json({ error: "That password is too long." }, { status: 400 });

  // A blank password box means "keep the saved one".
  const saved = await readAdminMailRows();
  const pass = newPassword || decryptSecret(saved.mail_password) || "";
  if (!pass) return NextResponse.json({ error: "Enter the password for this email account." }, { status: 400 });

  const to = String(b.testTo ?? "").trim() || a.session.user?.email || fromEmail;
  if (!EMAIL.test(to)) return NextResponse.json({ error: "Enter an address to send the test email to." }, { status: 400 });

  const config: MailConfig = { source: "admin", host, port, security, user, pass, fromEmail, fromName, allowBadCert };
  const settings = await getSiteSettings();
  const site = settings.site_name || "your website";
  const result = await sendWith(config, {
    to,
    subject: `Email is working — ${site}`,
    text: [
      `This test email was sent by ${site}.`,
      "",
      "If you are reading it, the site can now send password-reset links and form notifications.",
      "",
      `Sent through ${host}:${port} as ${user}.`,
    ].join("\n"),
  });
  if (!result.ok) {
    // Nothing is saved: the settings that are live (if any) keep working.
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const values: Record<string, string> = {
    mail_preset: preset.id,
    mail_host: host,
    mail_port: String(port),
    mail_security: security,
    mail_user: user,
    mail_from_email: fromEmail,
    mail_from_name: fromName,
    mail_allow_bad_cert: allowBadCert ? "true" : "false",
    mail_password: encryptSecret(pass),
    mail_last_test: new Date().toISOString(),
  };
  const keys = Object.keys(values);
  await rawQuery(
    `INSERT INTO site_settings (\`key\`, value, updated_at)
     VALUES ${keys.map(() => "(?, ?, NOW(3))").join(", ")}
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW(3)`,
    keys.flatMap((k) => [k, values[k]])
  );
  forgetMailConfig();
  return NextResponse.json({ ok: true, sentTo: to });
}

/** Turns the Email screen's settings off (the host's variables, if any, are untouched). */
export async function DELETE() {
  const a = await admin();
  if (a.error) return a.error;
  await rawQuery("DELETE FROM site_settings WHERE `key` IN (?)", [[...MAIL_KEYS]]);
  forgetMailConfig();
  return NextResponse.json({ ok: true });
}
