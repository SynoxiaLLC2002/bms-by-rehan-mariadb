"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/admin/Header";
import { Check, Trash2, Ban, Undo2, ExternalLink } from "lucide-react";

interface Comment {
  id: number;
  postId: number;
  parentId: number | null;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  content: string;
  status: string;
  createdAt: string;
  /** `path` is resolved by the API; the screen cannot build a permalink. */
  /** Exactly one of these is set — see the check on the `comments` table. */
  post?: { id: number; title: string; slug: string; path?: string } | null;
  page?: { id: number; title: string; slug: string; path?: string } | null;
}

const FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "spam", label: "Spam" },
  { id: "trash", label: "Trash" },
  { id: "all", label: "All" },
];

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  spam: "bg-red-50 text-red-700 border-red-200",
  trash: "bg-slate-100 text-slate-500 border-slate-200",
};

/** The server's reason when a request was refused, or null when it went through. */
async function refusal(res: Response | null, fallback: string): Promise<string | null> {
  if (res?.ok) return null;
  const data = res ? await res.json().catch(() => ({})) : {};
  return (data as { error?: string }).error || fallback;
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/comments?status=${filter}`);
    const data = await res.json();
    setComments(data.comments ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  // A failed action used to look like a click that did nothing: the list
  // reloaded unchanged with no word of why.
  async function setStatus(id: number, status: string) {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    const why = await refusal(res, "That comment could not be updated.");
    if (why) window.alert(why);
    fetchComments();
  }

  async function remove(id: number) {
    if (!confirm("Delete this comment permanently?")) return;
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => null);
    const why = await refusal(res, "That comment could not be deleted.");
    if (why) window.alert(why);
    fetchComments();
  }

  return (
    <>
      <Header title="Comments" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-1 mb-5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : comments.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-sm font-medium text-slate-600">Nothing here</p>
            <p className="mt-1 text-xs text-slate-400">
              {filter === "pending" ? "No comments are waiting for review." : `No ${filter} comments.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-800">{c.authorName}</span>
                  <span className="text-slate-400">{c.authorEmail}</span>
                  {c.authorUrl && (
                    <a href={c.authorUrl} target="_blank" rel="noreferrer nofollow" className="text-slate-400 hover:text-slate-700">
                      <ExternalLink size={11} />
                    </a>
                  )}
                  <span className={`rounded border px-1.5 py-px text-[10px] font-semibold uppercase ${STATUS_STYLE[c.status] ?? ""}`}>
                    {c.status}
                  </span>
                  {c.parentId && <span className="text-[10px] text-slate-400">reply</span>}
                  <span className="ml-auto text-slate-400">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{c.content}</p>

                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                  {/* A comment belongs to a post or a page; whichever it is,
                      the moderator sees what it is replying to. */}
                  {(c.post ?? c.page) && (
                    <a
                      href={`${(c.post ?? c.page)!.path ?? `/${(c.post ?? c.page)!.slug}`}#comment-${c.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-auto truncate text-[11px] text-slate-400 hover:text-slate-700"
                    >
                      on “{(c.post ?? c.page)!.title}”
                    </a>
                  )}
                  {c.status !== "approved" && (
                    <button onClick={() => setStatus(c.id, "approved")}
                      className="flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">
                      <Check size={12} /> Approve
                    </button>
                  )}
                  {c.status === "approved" && (
                    <button onClick={() => setStatus(c.id, "pending")}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                      <Undo2 size={12} /> Unapprove
                    </button>
                  )}
                  {c.status !== "spam" && (
                    <button onClick={() => setStatus(c.id, "spam")}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700">
                      <Ban size={12} /> Spam
                    </button>
                  )}
                  <button onClick={() => remove(c.id)}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
