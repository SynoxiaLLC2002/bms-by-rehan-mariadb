"use client";

import { useState, useRef } from "react";
import Header from "@/components/admin/Header";
import { Upload, Trash2, Copy, Check, Image as ImageIcon } from "lucide-react";
import { formatBytes } from "@/lib/siteHealthTypes";

export interface MediaItem {
  id: number;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string | null;
  caption: string | null;
  createdAt: string;
}

export default function MediaLibraryClient({
  initialItems,
  initialTotal,
  initialHasMore,
}: {
  initialItems: MediaItem[];
  initialTotal: number;
  initialHasMore: boolean;
}) {
  const [items, setItems] = useState<MediaItem[]>(initialItems);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Loads one page. `append` is what separates "show me more" from a refresh
   * after an upload or a delete, which has to start over so the new ordering
   * is respected. The first page is already on hand from the server render —
   * this is only called for page 2+ or to refresh after a write.
   */
  async function fetchMedia(nextPage = 1, append = false) {
    if (append) setLoadingMore(true);
    const res = await fetch(`/api/media?page=${nextPage}`);
    const data = await res.json();
    setItems((prev) => (append ? [...prev, ...(data.media ?? [])] : data.media ?? []));
    setTotal(data.total ?? (data.media ?? []).length);
    setHasMore(!!data.hasMore);
    setPage(nextPage);
    setLoadingMore(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    // The upload route explains every refusal ("the limit is 10 MB", "that
    // type is not allowed"); those reasons were thrown away, so a refused
    // file simply never appeared.
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: fd }).catch(() => null);
      if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        problems.push(`${file.name}: ${(data as { error?: string }).error || "could not be uploaded."}`);
      }
    }

    setUploading(false);
    if (problems.length) window.alert(problems.join("\n"));
    fetchMedia();
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this file?")) return;
    let res = await fetch(`/api/media/${id}`, { method: "DELETE" }).catch(() => null);
    // Still in use: say where, and delete only if the person says so again.
    if (res?.status === 409) {
      const data = await res.json().catch(() => ({}));
      if (!confirm(`${data.error || "This file is still in use."}

Delete it anyway?`)) return;
      res = await fetch(`/api/media/${id}?force=1`, { method: "DELETE" }).catch(() => null);
    }
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      window.alert((data as { error?: string }).error || "The file could not be deleted.");
    }
    if (selected?.id === id) setSelected(null);
    fetchMedia();
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Header title="Media Library" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Media Library</h2>
            <p className="text-sm text-slate-500">
              {total} {total === 1 ? "file" : "files"}
              {items.length < total && <span className="text-slate-400"> · showing {items.length}</span>}
            </p>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.svg"
              onChange={handleUpload}
              className="hidden"
              id="media-upload"
            />
            <label htmlFor="media-upload" className="btn-primary cursor-pointer">
              <Upload size={16} />
              {uploading ? "Uploading…" : "Upload Files"}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Grid */}
          <div>
            {items.length === 0 ? (
              <div className="card py-16 text-center">
                <ImageIcon size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No files uploaded yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selected?.id === item.id
                        ? "border-brand-500 ring-2 ring-brand-200"
                        : "border-transparent hover:border-slate-300"
                    }`}
                  >
                    {item.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.alt || item.originalName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                        <span className="text-xs text-slate-500 font-mono">
                          {item.mimeType.split("/")[1]?.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => fetchMedia(page + 1, true)}
                  disabled={loadingMore}
                  className="btn-secondary"
                >
                  {loadingMore ? "Loading…" : `Load more (${total - items.length} left)`}
                </button>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="card p-5 space-y-4 h-fit">
              <div className="aspect-video rounded-lg overflow-hidden bg-slate-100">
                {selected.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.url}
                    alt={selected.alt || selected.originalName}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-slate-400 text-sm">{selected.mimeType}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="font-medium text-slate-900 text-sm truncate">{selected.originalName}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatBytes(selected.size)} · {selected.mimeType}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => copyUrl(selected.url)}
                  className="btn-secondary flex-1 text-xs"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy URL"}
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="btn-danger text-xs px-3"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 break-all font-mono">
                {selected.url}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
