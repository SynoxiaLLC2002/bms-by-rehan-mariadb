// Sending mail.
//
// Form submissions have always been stored and never delivered: the inbox in
// the admin was the only way to learn that somebody had written in. This is
// the transport that closes that gap — and the one "Forgot password" needs.
//
// Two sources, in this order:
//
//   1. The environment (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM)
//      — how it was always configured, and still first, so a site set up
//      that way keeps working untouched.
//   2. Admin → Email: settings a non-technical owner fills in by picking a
//      provider. The password is stored ENCRYPTED (AES-256-GCM, key derived
//      from AUTH_SECRET) under `mail_password`, which `getSiteSettings` never
//      returns and no API ever sends back — not even to an administrator. The
//      old rule "credentials never in site_settings" existed because that table
//      is read on every render and handed to the browser; this key is kept out
//      of both, and is ciphertext besides.

import nodemailer, { type Transporter } from "nodemailer";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { authSecret } from "./authSecret";
import type { MailSecurity } from "./mailPresets";

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  /** Set when the recipient should be able to hit Reply and reach a human. */
  replyTo?: string;
}

export interface MailConfig {
  source: "env" | "admin";
  host: string;
  port: number;
  security: MailSecurity;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  /** Accept a certificate whose name does not match (common on shared hosting). */
  allowBadCert: boolean;
}

/** Settings keys the Email screen owns. `mail_password` holds ciphertext only. */
export const MAIL_KEYS = [
  "mail_preset", "mail_host", "mail_port", "mail_security", "mail_user",
  "mail_from_email", "mail_from_name", "mail_allow_bad_cert", "mail_password", "mail_last_test",
] as const;

// ── The stored password ─────────────────────────────────────────────────────

function key(): Buffer {
  return createHash("sha256").update(`mail-password\n${authSecret()}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
}

/** The password, or null when it cannot be read (AUTH_SECRET changed, or it was never set). */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored || !stored.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(stored.slice(3), "base64");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── Where the settings come from ────────────────────────────────────────────

function fromEnv(): MailConfig | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const from = (process.env.MAIL_FROM ?? "").trim();
  if (!host || !from) return null;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10) || 587;
  // MAIL_FROM may be `Name <addr>` or a bare address.
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return {
    source: "env",
    host,
    port,
    security: port === 465 ? "ssl" : "starttls",
    user: (process.env.SMTP_USER ?? "").trim(),
    pass: process.env.SMTP_PASS ?? "",
    fromEmail: m ? m[2].trim() : from,
    fromName: m ? m[1].trim() : "",
    allowBadCert: false,
  };
}

/** The Email screen's settings, straight from the table (the settings cache skips the password). */
export async function readAdminMailRows(): Promise<Record<string, string>> {
  const { rawQuery } = await import("./db/raw");
  const rows = await rawQuery<{ key: string; value: string | null }>(
    "SELECT `key`, value FROM site_settings WHERE `key` IN (?)",
    [[...MAIL_KEYS]]
  ).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

async function fromAdmin(): Promise<MailConfig | null> {
  const r = await readAdminMailRows();
  const host = (r.mail_host ?? "").trim();
  const fromEmail = (r.mail_from_email ?? "").trim();
  if (!host || !fromEmail) return null;
  const security = (["ssl", "starttls", "none"].includes(r.mail_security) ? r.mail_security : "ssl") as MailSecurity;
  return {
    source: "admin",
    host,
    port: parseInt(r.mail_port ?? "", 10) || (security === "ssl" ? 465 : 587),
    security,
    user: (r.mail_user ?? "").trim() || fromEmail,
    pass: decryptSecret(r.mail_password) ?? "",
    fromEmail,
    fromName: (r.mail_from_name ?? "").trim(),
    allowBadCert: r.mail_allow_bad_cert === "true",
  };
}

let memo: { at: number; value: Promise<MailConfig | null> } | null = null;

/** The configuration in force, cached for a few seconds. */
export function mailConfig(): Promise<MailConfig | null> {
  if (memo && Date.now() - memo.at < 10_000) return memo.value;
  const value = (async () => fromEnv() ?? (await fromAdmin()))();
  memo = { at: Date.now(), value };
  return value;
}

/** After the Email screen saves. */
export function forgetMailConfig(): void {
  memo = null;
  cached = null;
  cachedKey = "";
}

/**
 * Whether mail can be sent at all.
 *
 * Exported so the admin can *say* that notifications are switched on but not
 * configured, rather than silently never sending — a setting that looks active
 * and does nothing is the failure this codebase keeps finding.
 */
export async function mailConfigured(): Promise<boolean> {
  return !!(await mailConfig());
}

/** A short description of the current configuration, for the admin screens. */
export async function mailStatus(): Promise<{ configured: boolean; detail: string; source?: "env" | "admin" }> {
  const c = await mailConfig();
  if (!c) return { configured: false, detail: "Email is not set up yet. Open Admin → Email to set it up." };
  const auth = c.user ? `as ${c.user}` : "with no sign-in";
  return { configured: true, source: c.source, detail: `${c.host}:${c.port} ${auth}, from ${c.fromEmail}` };
}

// ── Sending ─────────────────────────────────────────────────────────────────

let cached: Transporter | null = null;
let cachedKey = "";

export function buildTransport(c: MailConfig): Transporter {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // 465 is implicit TLS; 587 starts plain and must upgrade. Getting this
    // wrong is the single most common reason SMTP "just hangs".
    secure: c.security === "ssl",
    requireTLS: c.security === "starttls",
    ...(c.user ? { auth: { user: c.user, pass: c.pass } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    ...(c.allowBadCert ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

function fromHeader(c: MailConfig): string {
  const name = c.fromName.replace(/["\r\n<>]/g, "").trim();
  return name ? `"${name}" <${c.fromEmail}>` : c.fromEmail;
}

/**
 * The transport, rebuilt only when the configuration changes. Nodemailer
 * pools connections, so holding one across requests is the point.
 */
async function transport(): Promise<{ t: Transporter; c: MailConfig } | null> {
  const c = await mailConfig();
  if (!c) return null;
  const k = JSON.stringify([c.host, c.port, c.security, c.user, c.pass, c.allowBadCert]);
  if (!cached || k !== cachedKey) {
    cached = buildTransport(c);
    cachedKey = k;
  }
  return { t: cached, c };
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Sends one message.
 *
 * Never throws. Every caller is on a path where the user's real work has
 * already succeeded — the submission is stored, the comment is saved — and
 * failing that because a mail server was unreachable would be the wrong answer
 * to the wrong question.
 */
export async function sendMail(msg: MailMessage): Promise<SendResult> {
  const tc = await transport().catch(() => null);
  if (!tc) return { ok: false, error: "Mail is not configured." };

  const to = Array.isArray(msg.to) ? msg.to.filter(Boolean).join(", ") : msg.to;
  if (!to.trim()) return { ok: false, error: "No recipient." };

  try {
    await tc.t.sendMail({
      from: fromHeader(tc.c),
      to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explainMailError(e) };
  }
}

/** Sends with a configuration that is not saved yet — the Email screen's test. */
export async function sendWith(c: MailConfig, msg: MailMessage): Promise<SendResult> {
  const t = buildTransport(c);
  try {
    await t.verify();
    await t.sendMail({ from: fromHeader(c), to: msg.to, subject: msg.subject, text: msg.text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explainMailError(e) };
  } finally {
    t.close();
  }
}

/**
 * A mail server's refusal, in words an owner can act on. The raw message
 * ("Invalid login: 535-5.7.8 Username and Password not accepted") follows in
 * brackets for whoever helps them.
 */
export function explainMailError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const raw = String(err?.message ?? e ?? "").slice(0, 200);
  const code = String(err?.code ?? "");
  let plain = "The email could not be sent.";
  if (code === "EAUTH" || err?.responseCode === 535 || /auth|login|credential|password/i.test(raw)) {
    plain = "The email address or password was refused. Check both. Gmail needs a 16-letter App Password, not your normal password; Brevo needs an SMTP key.";
  } else if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET|ESOCKET|ECONNECTION|timeout/i.test(code + raw)) {
    plain = "The mail server could not be reached. Check the server name and port (try 465 with SSL, or 587 with STARTTLS). On cPanel hosting, use the \"Outgoing Server\" name from Email Accounts → Connect Devices. If nothing works, your host may block sending — Brevo usually works then.";
  } else if (/ENOTFOUND|EDNS|getaddrinfo/i.test(code + raw)) {
    plain = "That server name does not exist. Check the spelling of the Server box.";
  } else if (/certificate|CERT_|self.signed|altname|hostname/i.test(code + raw)) {
    plain = "The server's security certificate does not match its name. Use the \"Outgoing Server\" name your host shows (cPanel: Connect Devices), or turn on \"Accept the host's certificate\" under Advanced.";
  } else if (/sender|from address|not owned|relay/i.test(raw)) {
    plain = "The server will not send from that address. The \"Send from\" address must belong to the account you signed in with (or be a confirmed sender in Brevo).";
  }
  return raw ? `${plain} (${raw})` : plain;
}

/** Splits a recipient setting — comma or newline separated — into addresses. */
export function recipientList(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

/**
 * Fills `{{name}}` placeholders in a subject or body.
 *
 * Deliberately not a template engine: these strings are written by an
 * administrator and rendered into a plain-text email, so substitution is all
 * that is needed and anything more would be a way to get code into a send path.
 */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return String(tpl ?? "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) =>
    vars[k.toLowerCase()] ?? ""
  );
}
