"use client";

// Deletes an account, asking first who takes over its posts and pages.
//
// Deleting a user used to leave everything they wrote with no author: the
// byline and author schema disappeared, and an author's own drafts could only
// be opened by editors and admins. The server now refuses until a choice is
// made (see DELETE /api/users/[id]); this is where the choice is made.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

export default function UserDeleteButton({
  id,
  name,
  others,
}: {
  id: string;
  name: string;
  /** Every other account, as candidates to take the content over. */
  others: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [owned, setOwned] = useState(0);
  const [heir, setHeir] = useState(others[0]?.id ?? "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove(reassignTo?: string) {
    setBusy(true);
    setError("");
    const q = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
    const res = await fetch(`/api/users/${encodeURIComponent(id)}${q}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.status === 409) {
      const data = await res.json().catch(() => ({}));
      setOwned(Number(data.owned) || 0);
      setOpen(true);
      return;
    }
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError((data as { error?: string }).error || "The account could not be deleted.");
      if (!open) window.alert((data as { error?: string }).error || "The account could not be deleted.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        title="Delete account"
        className="btn-ghost p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        disabled={busy}
        onClick={() => {
          if (!confirm(`Delete ${name || "this account"}? This cannot be undone.`)) return;
          void remove();
        }}
      >
        {busy && !open ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-5 text-left shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Who takes over {name || "this account"}&apos;s content?</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {owned} post{owned === 1 ? "" : "s"} or page{owned === 1 ? "" : "s"} will move to the account you choose, bylines
              and author pages included.
            </p>
            <select className="input mt-3 w-full text-sm" value={heir} onChange={(e) => setHeir(e.target.value)}>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              <option value="none">Nobody — leave them without an author</option>
            </select>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary bg-red-600 text-sm hover:bg-red-700" onClick={() => remove(heir)} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
