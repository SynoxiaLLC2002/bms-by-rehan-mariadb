"use client";

import { useState } from "react";
import CommentForm from "@/components/frontend/blocks/CommentForm";

/**
 * The "Reply" control under a comment.
 *
 * `CommentForm` has accepted a `replyTo` since it was written and the API has
 * always stored `parentId`, but nothing ever passed one — so the whole reply
 * feature existed and was unreachable, and the only way to answer someone was
 * to start a new top-level comment.
 *
 * A small client island rather than making the whole list a client component:
 * the comments themselves stay server-rendered (they are the content, and
 * they are what the cache serves), and only the toggle needs state.
 *
 * Every label arrives as a plain string. Handing this component the whole
 * `t` object would pass functions across the server/client boundary, which
 * is what crashed Preview and the Slider — see reasons.txt 6A.
 */
export default function ReplyBox({
  postId,
  pageId,
  replyTo,
  labels,
}: {
  postId?: number;
  pageId?: number;
  replyTo: number;
  labels: {
    reply: string;
    cancelReply: string;
    yourName: string;
    yourEmail: string;
    yourWebsite: string;
    yourComment: string;
    postComment: string;
    posting: string;
    commentPending: string;
    commentPosted: string;
  };
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs font-medium opacity-70 hover:opacity-100 hover:underline"
      >
        {labels.reply}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <CommentForm
        postId={postId}
        pageId={pageId}
        replyTo={replyTo}
        t={{
          yourName: labels.yourName,
          yourEmail: labels.yourEmail,
          yourWebsite: labels.yourWebsite,
          yourComment: labels.yourComment,
          postComment: labels.postComment,
          posting: labels.posting,
          commentPending: labels.commentPending,
          commentPosted: labels.commentPosted,
        }}
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-xs font-medium opacity-70 hover:opacity-100 hover:underline"
      >
        {labels.cancelReply}
      </button>
    </div>
  );
}
