import { and, asc, eq } from "drizzle-orm";
import { safeHttpUrl } from "@/lib/utils";
import { db } from "@/lib/db";
import { comments } from "@/lib/db/schema";
import CommentForm from "./blocks/CommentForm";
import ReplyBox from "./ReplyBox";
import { getSiteSettings } from "@/lib/settings";
import { uiText } from "@/lib/uiText";
import { defaultContentLanguage } from "@/lib/locale";
import { formatSiteDate, isoDate } from "@/lib/locale";

type Row = {
  id: number;
  parentId: number | null;
  authorName: string;
  authorUrl: string | null;
  content: string;
  createdAt: Date;
};

/** Approved comments as a two-level thread, oldest first. */
function thread(rows: Row[]): { comment: Row; replies: Row[] }[] {
  const roots = rows.filter((r) => r.parentId === null);
  const byParent = new Map<number, Row[]>();
  for (const r of rows) {
    if (r.parentId === null) continue;
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  // A reply whose parent was deleted or unapproved would otherwise vanish; it
  // is promoted to the top level rather than dropped.
  const known = new Set(rows.map((r) => r.id));
  const orphans = rows.filter((r) => r.parentId !== null && !known.has(r.parentId));

  /**
   * Every descendant of a root, flattened into one list.
   *
   * `byParent.get(root.id)` returned only DIRECT children, so a reply to a
   * reply — which the API accepts and stores — was rendered nowhere at all:
   * it was not a root, and it was not a child of a root. It simply vanished.
   *
   * Flattened rather than nested arbitrarily deep, which is what WordPress
   * does by default too: past one indent the thread is unreadable on a phone,
   * and the conversation order matters more than the exact shape.
   */
  const descendants = (rootId: number): Row[] => {
    const out: Row[] = [];
    const seen = new Set<number>([rootId]);
    const walk = (id: number) => {
      for (const child of byParent.get(id) ?? []) {
        if (seen.has(child.id)) continue; // a cycle cannot hang the render
        seen.add(child.id);
        out.push(child);
        walk(child.id);
      }
    };
    walk(rootId);
    return out.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  };

  return [...roots, ...orphans].map((c) => ({ comment: c, replies: descendants(c.id) }));
}

/** `settings` is threaded in so a comment date reads like every other date on the site. */
function Comment({ c, settings, language }: { c: Row; settings: Record<string, string>; language?: string }) {
  return (
    <li id={`comment-${c.id}`} className="border-t border-black/10 pt-5">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">
          {safeHttpUrl(c.authorUrl) ? (
            <a href={safeHttpUrl(c.authorUrl)} rel="ugc nofollow noopener noreferrer" target="_blank" className="hover:underline">
              {c.authorName}
            </a>
          ) : (
            c.authorName
          )}
        </span>
        <time dateTime={isoDate(c.createdAt)} className="text-xs opacity-50">{formatSiteDate(c.createdAt, settings, language)}</time>
      </div>
      {/* Printed as text, never as HTML — this content came from the public. */}
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed opacity-90">{c.content}</p>
    </li>
  );
}

/**
 * How many comments one page renders.
 *
 * High enough that no ordinary post reaches it, low enough that one that does
 * cannot take the page down with it.
 */
const COMMENT_LIMIT = 500;

/**
 * The comment thread for one document.
 *
 * Takes a post or a page, never both — the same shape the `comments` table
 * enforces with its `comments_one_target` check.
 */
export default async function PostComments(
  props: ({ postId: number; pageId?: undefined } | { pageId: number; postId?: undefined }) & {
    /** The document's language, so the heading and the form speak it. Falls back
     *  to the site language, which is right for a single-language site. */
    language?: string;
  },
) {
  try {
    return await renderComments(props);
  } catch (err) {
    console.error("[PostComments]", err);
    return null;
  }
}

async function renderComments({
  postId,
  pageId,
  language,
}: ({ postId: number; pageId?: undefined } | { pageId: number; postId?: undefined }) & {
  language?: string;
}) {
  // Free: `getSiteSettings` is memoised per request, so this is the same read
  // the layout already did rather than another query.
  const settings = await getSiteSettings();
  const t = uiText(language || defaultContentLanguage(settings));
  const target = postId != null ? eq(comments.postId, postId) : eq(comments.pageId, pageId!);
  let rows: Row[] = [];
  try {
    rows = await db.query.comments.findMany({
      where: and(target, eq(comments.status, "approved")),
      orderBy: [asc(comments.createdAt)],
      columns: { id: true, parentId: true, authorName: true, authorUrl: true, content: true, createdAt: true },
      // Bounded. This was unlimited, so a post that attracts a few thousand
      // comments would load and render every one of them on every request —
      // and a busy post is exactly the one that can least afford it.
      //
      // Oldest first, so the cap drops the *newest* rather than breaking the
      // start of a conversation, and threading stays intact for what is shown.
      limit: COMMENT_LIMIT,
    });
  } catch {
    // No comments table yet — the section simply stays empty.
  }

  const items = thread(rows);
  // Plain strings only: `t` carries functions, which cannot cross into a
  // client component. See reasons.txt 6A.
  const replyLabels = {
    reply: t.reply,
    cancelReply: t.cancelReply,
    yourName: t.yourName,
    yourEmail: t.yourEmail,
    yourWebsite: t.yourWebsite,
    yourComment: t.yourComment,
    postComment: t.postComment,
    posting: t.posting,
    commentPending: t.commentPending,
    commentPosted: t.commentPosted,
  };

  return (
    <section className={`${postId != null ? "post" : "page"}-comments mt-14 border-t border-black/10 pt-10`}>
      <h2 className="mb-6 text-xl font-bold">
        {rows.length === 0 ? t.leaveAComment : t.comments(rows.length)}
      </h2>

      {items.length > 0 && (
        <ul className="mb-10 space-y-5">
          {items.map(({ comment, replies }) => (
            // `<li>`, not `<div>`: a `<ul>` may only contain `<li>`, and the
            // markup was invalid on every page with a comment.
            <li key={comment.id}>
              <Comment c={comment} settings={settings} language={language} />
              <ReplyBox postId={postId} pageId={pageId} replyTo={comment.id} labels={replyLabels} />
              {replies.length > 0 && (
                <ul className="mt-5 space-y-5 ps-6">
                  {replies.map((r) => (
                    <li key={r.id}>
                      <Comment c={r} settings={settings} language={language} />
                      <ReplyBox postId={postId} pageId={pageId} replyTo={r.id} labels={replyLabels} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <CommentForm
        postId={postId}
        pageId={pageId}
        t={{
          yourName: t.yourName,
          yourEmail: t.yourEmail,
          yourWebsite: t.yourWebsite,
          yourComment: t.yourComment,
          postComment: t.postComment,
          posting: t.posting,
          commentPending: t.commentPending,
          commentPosted: t.commentPosted,
        }}
      />
    </section>
  );
}
