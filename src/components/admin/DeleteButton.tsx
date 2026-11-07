"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface DeleteButtonProps {
  id: number | string;
  type: "posts" | "pages" | "categories" | "media" | "users";
  /**
   * What this button does.
   *
   * `trash` is the default for posts and pages, and is not destructive — the
   * document is hidden from the site and kept. `permanent` and `restore` are
   * only reachable from inside the Trash view, which is what makes the
   * dangerous one hard to press by accident.
   *
   * Types without a trash (categories, media, users) pass `permanent`, because
   * for them a delete really is a delete and the confirm text should say so.
   */
  mode?: "trash" | "permanent" | "restore";
}

export default function DeleteButton({ id, type, mode = "trash" }: DeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const supportsTrash = type === "posts" || type === "pages";
  const effective = supportsTrash ? mode : "permanent";

  const copy = {
    trash: {
      confirm: "Move this to the trash? You can restore it afterwards.",
      title: "Move to trash",
      query: "",
      className: "btn-ghost p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600",
    },
    permanent: {
      // Named plainly. "Are you sure?" does not say that this one cannot be
      // undone, and this is the only button in the CMS that cannot.
      confirm: "Delete permanently? This cannot be undone.",
      title: "Delete permanently",
      query: "?permanent=1",
      className: "btn-ghost p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700",
    },
    restore: {
      confirm: "",
      title: "Restore",
      query: "?restore=1",
      className: "btn-ghost p-1.5 text-emerald-600 hover:bg-emerald-50",
    },
  }[effective];

  async function handleClick() {
    if (copy.confirm && !confirm(copy.confirm)) return;
    setLoading(true);
    const res = await fetch(`/api/${type}/${id}${copy.query}`, { method: "DELETE" }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "That could not be done. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={copy.className}
      title={copy.title}
    >
      {effective === "restore" ? <RotateCcw size={14} /> : <Trash2 size={14} />}
    </button>
  );
}
