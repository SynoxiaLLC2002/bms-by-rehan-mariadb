"use client";

import Turnstile, { resetTurnstile } from "@/components/frontend/Turnstile";

// The public comment form.
//
// The only client component in the comments feature: the thread itself is
// rendered on the server, so a post with comments still ships as static HTML.

import { useState } from "react";

/** Only the form's own words — never the full `UiText` (it has functions,
 *  and those cannot cross the server → client boundary). */
export type CommentFormText = {
  yourName: string;
  yourEmail: string;
  yourWebsite: string;
  yourComment: string;
  postComment: string;
  posting: string;
  commentPending: string;
  commentPosted: string;
};

export default function CommentForm({
  postId,
  pageId,
  replyTo,
  t,
}: {
  /** Exactly one target, matching the thread this form sits under. */
  postId?: number;
  pageId?: number;
  replyTo?: number;
  /** The wording, in the document's language. A client component cannot read
   *  the settings, so the server parent resolves it and passes it down. */
  t: CommentFormText;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "pending">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setState("sending");
    setError("");

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, postId, pageId, parentId: replyTo ?? null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not post your comment.");
        setState("idle");
        resetTurnstile(form);
        return;
      }
      form.reset();
      setState(json.pending ? "pending" : "done");
    } catch {
      setError("Could not reach the server.");
      setState("idle");
      resetTurnstile(form);
    }
  }

  if (state === "done" || state === "pending") {
    return (
      <p className="rounded-lg border border-black/10 bg-black/[0.03] p-4 text-sm">
        {state === "pending" ? t.commentPending : t.commentPosted}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="authorName" required placeholder={t.yourName}
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
        />
        <input
          name="authorEmail" type="email" required placeholder={t.yourEmail}
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>
      <input
        name="authorUrl" type="url" placeholder={t.yourWebsite}
        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
      />
      <textarea
        name="content" required rows={5} placeholder={t.yourComment}
        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
      />

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <Turnstile />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={state === "sending"} className="btn disabled:opacity-60">
        {state === "sending" ? t.posting : t.postComment}
      </button>
    </form>
  );
}
