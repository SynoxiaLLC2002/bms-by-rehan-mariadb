"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Makes a draft copy and opens it in the editor.
 *
 * Going straight to the editor rather than back to the list is deliberate:
 * the only reason to duplicate something is to change it, and a list with two
 * near-identical titles is where the wrong one gets edited.
 */
export default function DuplicateButton({ id, type }: { id: number; type: "posts" | "pages" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function duplicate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/${type}/${id}/duplicate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        alert(data.error || "Could not duplicate.");
        return;
      }
      router.push(`/admin/${type}/${data.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={duplicate}
      disabled={loading}
      className="btn-ghost p-1.5"
      title={`Duplicate ${type === "posts" ? "post" : "page"}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
    </button>
  );
}
