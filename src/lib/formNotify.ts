// What happens after a form submission is stored.
//
// Two messages, both optional and both independent: one telling the site that
// somebody wrote in, one telling the person who wrote in that it arrived.
//
// Neither is allowed to affect the submission. The row is already saved by the
// time any of this runs, the visitor has already been told it worked, and a
// mail server being down is not their problem.

import { rateLimited } from "@/lib/rateLimit";
import { fillTemplate, recipientList, sendMail } from "@/lib/mail";
import type { SiteSettings } from "@/lib/settings";
import { recordError } from "@/lib/errorLog";

/** The first value that looks like an email address the visitor gave us. */
export function replyAddress(data: Record<string, string>): string {
  // Prefer a field actually named like an email, then fall back to any value
  // shaped like one — forms in the wild label it "Email", "your-email", "mail".
  // Both branches check the shape. The named one used to accept anything
  // containing "@", so a field called "email" holding an address followed by
  // a CRLF and a "Bcc:" line went straight into the Reply-To header. Nodemailer neutralises that —
  // verified — but it renders the address as a broken group (`"a@b.com
  // Bcc":;`) that a strict SMTP server may reject, which would cost the owner
  // the whole notification. An address that is not one is worth less than no
  // address at all.
  const looksLikeEmail = (v: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v).trim());
  const named = Object.entries(data).find(([k, v]) => /e-?mail/i.test(k) && looksLikeEmail(v));
  if (named) return String(named[1]).trim();
  const any = Object.values(data).find(looksLikeEmail);
  return any ? String(any).trim() : "";
}

/** The submitted fields as a readable plain-text block. */
function fieldsAsText(data: Record<string, string>): string {
  const rows = Object.entries(data);
  if (rows.length === 0) return "(no fields)";
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`).join("\n");
}

export interface SubmissionContext {
  formName: string;
  pagePath: string | null;
  data: Record<string, string>;
  siteName: string;
  siteUrl: string;
}

/**
 * Sends whatever the settings ask for.
 *
 * Returns nothing and rejects for nothing: the caller awaits it only so that a
 * serverless function does not exit mid-send. Each message is attempted
 * independently, so a bad auto-reply address cannot cost the site its own
 * notification.
 */
export async function notifySubmission(
  settings: SiteSettings,
  ctx: SubmissionContext
): Promise<void> {
  const vars: Record<string, string> = {
    form: ctx.formName,
    site: ctx.siteName,
    page: ctx.pagePath ?? "",
    fields: fieldsAsText(ctx.data),
    ...Object.fromEntries(Object.entries(ctx.data).map(([k, v]) => [k.toLowerCase(), v])),
  };

  const jobs: Promise<unknown>[] = [];

  // ── To the site ─────────────────────────────────────────────────────────
  if (settings.forms_notify_enabled === "true") {
    const to = recipientList(settings.forms_notify_to);
    if (to.length) {
      const subject =
        fillTemplate(settings.forms_notify_subject || "", vars).trim() ||
        `New ${ctx.formName} submission`;

      const body = [
        `A new submission came in through ${ctx.formName}.`,
        "",
        fieldsAsText(ctx.data),
        "",
        ctx.pagePath ? `Submitted from: ${ctx.siteUrl}${ctx.pagePath}` : "",
        `Inbox: ${ctx.siteUrl}/admin/forms`,
      ]
        .filter(Boolean)
        .join("\n");

      // Reply-To, not From: the message is *from* the site, but replying to it
      // should reach the person who wrote in rather than the site's own inbox.
      const reply = replyAddress(ctx.data);
      jobs.push(sendMail({ to, subject, text: body, ...(reply ? { replyTo: reply } : {}) }));
    }
  }

  // ── To the person who submitted ─────────────────────────────────────────
  //
  // This is the one message this site sends to an address a *stranger* chose,
  // which makes it the one that can be turned into a mail relay: submit the
  // form repeatedly with someone else's address and your domain delivers the
  // mail. The damage is not to the CMS — it is your sending reputation, and a
  // domain that lands on a blocklist stops delivering password resets too.
  //
  // So it is capped twice, with the same limiter the routes use:
  //   - once per address per hour, so no one person can be mail-bombed;
  //   - a global ceiling, so a burst across many addresses stops early even
  //     when each address is only hit once.
  // A real visitor filling in the form once is never affected. The
  // notification to the site owner above is deliberately NOT capped: that
  // goes to a fixed address the owner configured, so it cannot be abused this
  // way, and losing it would hide submissions.
  if (settings.forms_autoreply_enabled === "true") {
    const to = replyAddress(ctx.data);
    if (!to) {
      // No usable address; nothing to do.
    } else if (rateLimited("form-autoreply-to", to.toLowerCase(), { max: 1, windowMs: 3_600_000 })) {
      // Same address already auto-replied to this hour.
    } else if (rateLimited("form-autoreply-all", "site", { max: 30, windowMs: 3_600_000 })) {
      // Site-wide ceiling reached; the submission is still saved and the owner
      // is still notified, only the courtesy reply is skipped.
    } else {
      const subject =
        fillTemplate(settings.forms_autoreply_subject || "", vars).trim() ||
        `We received your message`;
      const body =
        fillTemplate(settings.forms_autoreply_body || "", vars).trim() ||
        `Thanks for getting in touch. We have your message and will reply soon.\n\n— ${ctx.siteName}`;
      jobs.push(sendMail({ to, subject, text: body }));
    }
  }

  // `allSettled`: one failing send must not skip the other.
  const results = await Promise.allSettled(jobs);

  // And a failure has to end up somewhere the owner will see it. `sendMail`
  // *returns* `{ ok: false }` rather than throwing, and the caller's catch is
  // deliberately silent to the visitor — so before this, an expired SMTP
  // password meant every notification stopped arriving with nothing logged
  // anywhere. Site Health only checks that SMTP_HOST is *set*, so it still
  // reported "ok". Submissions piled up in the inbox and the first sign of
  // trouble was a customer asking why they were ignored.
  //
  // `recordError` is deduplicated per minute and never throws, so a mail
  // server that is down cannot flood the log or break this path.
  for (const r of results) {
    const failure =
      r.status === "rejected"
        ? String((r.reason as Error)?.message ?? r.reason)
        : r.value && typeof r.value === "object" && "ok" in r.value && !(r.value as { ok: boolean }).ok
          ? String((r.value as { error?: string }).error ?? "Send failed.")
          : null;
    if (failure) {
      await recordError({
        source: "server",
        path: ctx.pagePath ?? null,
        message: `Form notification for "${ctx.formName}" was not sent: ${failure}`,
      });
    }
  }
}
