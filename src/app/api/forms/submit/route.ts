import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formSubmissions } from "@/lib/db/schema";
import {
  HONEYPOT_FIELD,
  MAX_FIELDS,
  MIN_FILL_MS,
  parseFields,
  validateSubmission,
  type FormField,
} from "@/lib/forms";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import { notifySubmission } from "@/lib/formNotify";
import { savedForms } from "@/lib/formLookup";
import { after } from "next/server";

/**
 * The one public write endpoint on the site, so it is the one that has to be
 * careful. Three layers, cheapest first: a rate limit, then the spam traps,
 * then real validation against the form's own field list.
 */

/** Submissions per IP per window. Module scope, so it resets on redeploy. */
const SUBMIT_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

/**
 * The "submitted from" page, only if it is a path on this site.
 *
 * The browser sends it, and the owner's email prints it as
 * `${siteUrl}${pagePath}`. A bot sending `@evil.com/login` turned that into
 * `https://yoursite.net@evil.com/login` — a link that reads as your own site
 * and opens the attacker's. Anything that does not resolve to this origin as
 * a plain path is dropped.
 */
function sitePath(raw: unknown): string | null {
  const p = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
  if (!p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\") || /[\s\u0000-\u001f\\]/.test(p)) return null;
  try {
    const base = "https://site.invalid";
    const u = new URL(p, base);
    // As sent (an Arabic path stays readable in the inbox), once proven local.
    return u.origin === base ? p : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    if (rateLimited("forms", ip, SUBMIT_LIMIT)) {
      return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
    }

    const body = await req.json();
    const values = (body?.values ?? {}) as Record<string, unknown>;

    // Bots fill hidden inputs and submit instantly. Both get the success
    // response rather than an error — telling a bot it failed just teaches it.
    const elapsed = Number(body?.elapsed);
    const trapped =
      !!String(values[HONEYPOT_FIELD] ?? "").trim() ||
      (Number.isFinite(elapsed) && elapsed < MIN_FILL_MS);
    if (trapped) return NextResponse.json({ ok: true });

    // The form as it was saved, not as the request describes it: fields,
    // required rules and name all come from the content (lib/formLookup).
    // Usually one definition. More than one only when a copy shares the
    // form's block id (a page duplicated by an older version): the one this
    // submission satisfies is the form the visitor filled in.
    //
    // "The first one it passes" was not enough: a newer copy missing a field
    // the live form has would pass, and that answer was silently dropped —
    // and a bot could aim at whichever copy was most lenient. So, in order:
    // the copy that would drop the fewest answers actually given; then one
    // the submission passes; then the closest field-name match; then the
    // strictest (most required fields).
    const candidates = await savedForms(body?.formId);
    const answered = Object.keys(values).filter((k) => k !== HONEYPOT_FIELD && String(values[k] ?? "").trim() !== "");
    const ranked = candidates
      .map((c) => {
        const f = parseFields(c.fields);
        const names = new Set(f.map((x) => x.name));
        return {
          c,
          dropped: answered.filter((k) => !names.has(k)).length,
          fails: f.length > MAX_FIELDS || Object.keys(validateSubmission(f, values)).length > 0 ? 1 : 0,
          unmatched: [...names].filter((n) => !(n in values)).length,
          required: f.filter((x) => x.required).length,
        };
      })
      .sort((a, b) => a.dropped - b.dropped || a.fails - b.fails || a.unmatched - b.unmatched || b.required - a.required);
    const saved = ranked[0]?.c;
    if (!saved) {
      return NextResponse.json(
        { error: "This form has changed since the page was loaded. Please reload the page and try again." },
        { status: 400 }
      );
    }
    const fields: FormField[] = parseFields(saved.fields);

    // Belt and braces — a saved form this large was not built in the editor.
    if (fields.length > MAX_FIELDS) {
      return NextResponse.json({ error: "That form could not be read." }, { status: 400 });
    }

    const errors = validateSubmission(fields, values);
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Please check the highlighted fields.", errors }, { status: 400 });
    }

    // After the field checks, not before: a Turnstile token can be verified
    // once, so checking it first spent it on a submission that was about to
    // be refused for a typo, and the corrected resubmission then failed as
    // "complete the verification".
    if (!(await verifyTurnstile(body?.turnstileToken, ip))) {
      return NextResponse.json({ error: "Please complete the verification and try again." }, { status: 400 });
    }

    // Store only the fields the form actually declares, so a crafted POST
    // can't append arbitrary keys to the record.
    const clean: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "checkbox") clean[f.name] = v ? "Yes" : "No";
      else if (v != null && String(v).trim() !== "") clean[f.name] = String(v).trim();
    }

    const formName = saved.formName;
    const pagePath = sitePath(body?.pagePath);

    await db.insert(formSubmissions).values({
      formName,
      pagePath,
      data: clean,
      ip,
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500),
    });

    // Notify after the response has gone. It was awaited before replying, so a
    // slow mail server made "Send" hang for as long as SMTP took. `after()`
    // runs it once the visitor has their answer, and — unlike a floating
    // promise — keeps the work alive on hosts that freeze a finished request.
    // The submission is already stored, so a mail failure loses nothing.
    after(async () => {
      try {
        const settings = await getSiteSettings();
        await notifySubmission(settings, {
          formName,
          pagePath,
          data: clean,
          siteName: settings.site_name || "This site",
          siteUrl: siteUrl(settings),
        });
      } catch {
        // Deliberately silent; the submission stands.
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }
}
