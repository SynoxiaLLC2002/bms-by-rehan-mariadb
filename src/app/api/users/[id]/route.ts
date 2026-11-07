import { NextRequest, NextResponse } from "next/server";
import { revalidatePublicSite } from "@/lib/revalidateSite";
import { recordSlugChange } from "@/lib/autoRedirect";
import { db } from "@/lib/db";
import { pages, posts, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sessionAuth as auth, passwordVersion, unstable_update } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import bcrypt from "bcryptjs";
import { normalizeEmail, passwordProblem } from "@/lib/password";
import { toSlug } from "@/lib/utils";
import { canManageUser, isAdmin, sessionUser, FORBIDDEN, UNAUTHORIZED, isValidRole } from "@/lib/authz";
import { contentForRole } from "@/lib/contentPolicy";
import { and, count, ne, sql } from "drizzle-orm";
import { getSiteSettings } from "@/lib/settings";
import { authorPath } from "@/lib/permalinks";
import { contentLanguages } from "@/lib/locale";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const { id } = await params;
    // Yourself, or an administrator — the same rule PATCH, DELETE and the 2FA
    // routes already use. Without it any signed-in account, down to an author,
    // could read another person's email, role, last sign-in and whether their
    // 2FA is on, one id at a time; the list endpoint above is admin-only for
    // exactly that reason.
    if (!canManageUser(session, id)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        id: true, name: true, email: true, role: true,
        totpEnabled: true, lastLogin: true, createdAt: true,
      },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const me = sessionUser(session);
    if (!me) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const { id } = await params;
    // Yourself, or an administrator. Without this an editor could PATCH any
    // account, including the administrator's.
    if (!canManageUser(session, id)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    const target = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { id: true, role: true, password: true, email: true, slug: true },
    });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Changing your own password — or your own email, which "Forgot password"
    // then sends a reset link to, and so is a password change one step
    // removed — requires the current password. A stolen session was
    // otherwise enough to take the account permanently. An administrator
    // acting on someone else's account does not need it; that is a reset.
    const selfCheck = async (): Promise<NextResponse | null> => {
      if (me.id !== id) return null;
      const current = String(body.currentPassword ?? "");
      if (!current) {
        return NextResponse.json({ error: "Enter your current password to change your password or email" }, { status: 400 });
      }
      const ok = target.password ? await bcrypt.compare(current, target.password) : false;
      return ok ? null : NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    };

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name === null ? null : String(body.name);
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      if (email !== (target.email ?? "").toLowerCase()) {
        const refused = await selfCheck();
        if (refused) return refused;
        // Emails are unique. Without this the index threw and the screen said
        // only "Failed to update user", which reads like a broken site.
        const taken = await db.query.users.findFirst({
          where: and(sql`lower(${users.email}) = ${email}`, ne(users.id, id)),
          columns: { id: true },
        });
        if (taken) return NextResponse.json({ error: "Another account already uses that email address." }, { status: 409 });
      }
      updateData.email = email;
    }

    // ── The public author profile ────────────────────────────────────────────
    //
    // Same partial-update rule as everything above: a key that is absent is not
    // touched, so a request that only changes a password cannot blank a bio.
    const text = (v: unknown) => {
      const s = String(v ?? "").trim();
      return s === "" ? null : s;
    };
    for (const k of [
      "image", "bio", "website", "twitter", "linkedin", "facebook",
      "instagram", "github", "youtube",
      "seoTitle", "seoDescription", "canonicalUrl", "ogImage",
      "cssClasses",
    ]) {
      if (body[k] !== undefined) updateData[k] = text(body[k]);
    }

    // Raw markup and stylesheets are an administrator's to write, not any
    // account holder's.
    //
    // This endpoint lets a user edit *themselves* — that is the whole point of
    // `canManageUser`. Without this gate an editor could put arbitrary script
    // on their own author page, which is a public URL on the site: a privilege
    // escalation dressed up as a profile field. Posts and pages already draw
    // the line here; so does this.
    if (isAdmin(session)) {
      for (const k of ["customCss", "scriptHead", "scriptBodyEnd"]) {
        if (body[k] !== undefined) updateData[k] = text(body[k]);
      }
      if (body.transparentHeader !== undefined) {
        updateData.transparentHeader = ["enable", "disable"].includes(String(body.transparentHeader))
          ? String(body.transparentHeader)
          : "default";
      }
      if (body.disableHeader !== undefined) updateData.disableHeader = body.disableHeader === true;
      if (body.disableFooter !== undefined) updateData.disableFooter = body.disableFooter === true;
    }
    // Layout choices are constrained rather than free text: these land in a
    // `data-` attribute the stylesheet selects on, so an unknown value would
    // silently match no rule and look like the setting had done nothing.
    const oneOf = (v: unknown, allowed: string[]) =>
      allowed.includes(String(v)) ? String(v) : "default";
    if (body.pageLayout !== undefined) {
      updateData.pageLayout = oneOf(body.pageLayout, [
        "normal", "narrow", "wide", "fullwidth", "left-sidebar", "right-sidebar",
      ]);
    }
    if (body.contentStyle !== undefined) {
      updateData.contentStyle = oneOf(body.contentStyle, ["boxed", "unboxed"]);
    }
    if (body.verticalSpacing !== undefined) {
      updateData.verticalSpacing = oneOf(body.verticalSpacing, [
        "enable", "disable", "top-only", "bottom-only",
      ]);
    }
    if (body.direction !== undefined) {
      updateData.direction = ["ltr", "rtl"].includes(String(body.direction)) ? String(body.direction) : null;
    }
    if (body.language !== undefined) {
      const lang = String(body.language).trim().slice(0, 16);
      updateData.language = lang || null;
    }
    // The author page's own block content. Same rule as `pages.content`: an
    // array of blocks, or null to fall back to the plain profile-field layout.
    if (body.content !== undefined) {
      // The author page is a public page like any other: the HTML Embed
      // block keeps its scripts only when an administrator saved it.
      updateData.content = Array.isArray(body.content) ? contentForRole(body.content, isAdmin(session)).content : null;
    }
    if (body.noIndex !== undefined) updateData.noIndex = body.noIndex === true || body.noIndex === "true";
    if (body.publicProfile !== undefined) {
      updateData.publicProfile = body.publicProfile === true || body.publicProfile === "true";
    }

    // The slug addresses a page, so it is normalised rather than trusted, and
    // checked for collision here to return a readable error instead of letting
    // the unique index surface as a 500.
    if (body.slug !== undefined) {
      const slug = toSlug(String(body.slug ?? ""));
      if (slug) {
        const clash = await db.query.users.findFirst({
          where: eq(users.slug, slug),
          columns: { id: true },
        });
        if (clash && clash.id !== id) {
          return NextResponse.json(
            { error: "Another author already uses that profile slug." },
            { status: 409 }
          );
        }
      }
      updateData.slug = slug || null;
    }

    // Only an administrator grants a role, and never by editing their own —
    // `role` came straight from the request body, so anyone could send
    // `{ role: "admin" }` about themselves.
    if (body.role !== undefined && !isValidRole(body.role)) {
      return NextResponse.json({ error: "Unknown role." }, { status: 400 });
    }
    if (body.role !== undefined && body.role !== target.role) {
      if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });
      if (target.role === "admin" && body.role !== "admin") {
        const others = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, "admin"), ne(users.id, id)));
        // Removing the last administrator locks everyone out of the settings,
        // the users screen and the customizer, with no way back in.
        if (others.length === 0) {
          return NextResponse.json(
            { error: "This is the only administrator — promote someone else first" },
            { status: 400 }
          );
        }
      }
      updateData.role = body.role;
    }

    if (body.password) {
      const problem = passwordProblem(body.password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });

      // See `selfCheck` above. (When the email changed too it has already
      // run; comparing twice costs one bcrypt, on a rare request.)
      const refused = await selfCheck();
      if (refused) return refused;

      updateData.password = await bcrypt.hash(body.password, 12);
    }

    await db.update(users).set(updateData).where(eq(users.id, id));
    const user = await db.query.users.findFirst({ where: eq(users.id, id), columns: {
      password: true,
      id: true, name: true, email: true, role: true, totpEnabled: true,
      slug: true,
    } });

    // The author page is cached like every other public route (`revalidate =
    // 3600` on its route) — without this, a saved bio/direction/language/
    // content change sat behind up to an hour of stale HTML. It answers at
    // every configured language's prefix at once (unlike a post or page,
    // which moves with its own `language`), so every prefix needs clearing,
    // not just one path.
    // A new password ends every other session for this account within a
    // minute (see lib/auth.ts). This browser keeps its own by taking the new
    // version into its token now.
    if (updateData.password && me.id === id && user) {
      await unstable_update({ pv: passwordVersion(user.password) } as never).catch(() => undefined);
    }

    // The whole public site, not the author paths: a per-path revalidate
    // matches nothing here (reasons.txt 3.1), so the default language's author
    // page never refreshed — and the name and avatar also appear in the byline
    // of every post this person wrote.
    // Cloudflare: their author archive in each language (old and new slug),
    // not the whole zone — a profile edit is not worth re-serving every
    // image on the site. Bylines on posts follow at the edge's normal expiry.
    if (user) {
      const settings = await getSiteSettings();
      const slugs = [...new Set([user.slug, target.slug].filter((s): s is string => !!s))];
      revalidatePublicSite({
        cloudflarePaths: contentLanguages(settings).flatMap((lang) => slugs.map((s) => authorPath(s, lang, settings))),
      });
    }

    // A changed profile slug moves the author page in every language; the old
    // address keeps answering, the way a renamed post's does.
    if (user && target.slug && user.slug && target.slug !== user.slug) {
      const settings = await getSiteSettings();
      for (const lang of contentLanguages(settings)) {
        const from = authorPath(target.slug, lang, settings);
        const to = authorPath(user.slug, lang, settings);
        if (from !== to) await recordSlugChange(from, to).catch(() => undefined);
      }
    }

    if (user) delete (user as { password?: string | null }).password;
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const me = sessionUser(session);
    if (!me) return NextResponse.json(UNAUTHORIZED, { status: 401 });
    // Deleting an account is an administrator's action, not any signed-in
    // user's.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const { id } = await params;
    // Prevent deleting yourself
    if (id === me.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    const target = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { role: true, slug: true },
    });
    if (target?.role === "admin") {
      const others = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), ne(users.id, id)));
      if (others.length === 0) {
        return NextResponse.json(
          { error: "This is the only administrator — promote someone else first" },
          { status: 400 }
        );
      }
    }

    // Their posts and pages need a new author, or they lose their byline and
    // author schema, and only editors and admins can open them afterwards.
    // `?reassignTo=<id>` hands them over; `?reassignTo=none` leaves them
    // without one, which has to be asked for rather than happen by default.
    const reassign = req.nextUrl.searchParams.get("reassignTo");
    const [postCount] = await db.select({ n: count() }).from(posts).where(eq(posts.authorId, id));
    const [pageCount] = await db.select({ n: count() }).from(pages).where(eq(pages.authorId, id));
    const owned = Number(postCount?.n ?? 0) + Number(pageCount?.n ?? 0);
    if (owned > 0 && !reassign) {
      return NextResponse.json(
        { error: `This account wrote ${owned} post${owned === 1 ? "" : "s"} or page${owned === 1 ? "" : "s"}. Choose who takes them over.`, code: "has_content", owned },
        { status: 409 }
      );
    }
    if (owned > 0 && reassign && reassign !== "none") {
      if (reassign === id) return NextResponse.json({ error: "Choose a different account." }, { status: 400 });
      const heir = await db.query.users.findFirst({ where: eq(users.id, reassign), columns: { id: true, slug: true } });
      if (!heir) return NextResponse.json({ error: "That account does not exist." }, { status: 400 });
      await db.update(posts).set({ authorId: reassign }).where(eq(posts.authorId, id));
      await db.update(pages).set({ authorId: reassign }).where(eq(pages.authorId, id));
      // Their author archive is indexed and linked from every byline they
      // had; send it to the archive that now lists the same posts rather
      // than letting it 404. One per language, since each has its own.
      if (target?.slug && heir.slug && target.slug !== heir.slug) {
        const settings = await getSiteSettings();
        for (const lang of contentLanguages(settings)) {
          await recordSlugChange(authorPath(target.slug, lang, settings), authorPath(heir.slug, lang, settings));
        }
      }
    }

    await db.delete(users).where(eq(users.id, id));
    // Bylines, author archives and author schema on every page they touch.
    if (owned > 0) revalidatePublicSite();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
