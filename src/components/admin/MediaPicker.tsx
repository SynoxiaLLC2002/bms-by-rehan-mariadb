"use client";

import { useEffect, useState, useRef } from "react";
import { X, Upload, Loader2 } from "lucide-react";

interface MediaItem {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
}

interface MediaPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function MediaPicker({ onSelect, onClose }: MediaPickerProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  // An upload that fails silently looks exactly like one that never started.
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /**
   * One page at a time. The picker used to pull the entire library every time
   * it opened, which on a site with a real archive is a long wait before the
   * first thumbnail appears.
   */
  async function load(nextPage = 1, append = false) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/media?page=${nextPage}`);
      const data = await res.json();
      setItems((prev) => (append ? [...prev, ...(data.media ?? [])] : data.media ?? []));
      setHasMore(!!data.hasMore);
      setPage(nextPage);
    } catch {
      if (!append) setItems([]);
      setHasMore(false);
    }
    setLoading(false);
    setLoadingMore(false);
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        if (data?.media?.url) {
          onSelect(data.media.url);
          onClose();
          return;
        }
        setError("The server accepted the file but returned no URL.");
      } else {
        setError(data?.error || `Upload failed (${res.status}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    // Let the same file be picked again after a failure — without this the
    // input keeps its value and re-selecting it fires no change event.
    e.target.value = "";
    setUploading(false);
    load();
  }

  const images = items.filter((m) => m.mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(m.url));

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">Media Library</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-secondary gap-1.5 text-xs"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </div>

        {error && (
          <p className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
            {error}
          </p>
        )}

        <div className="overflow-y-auto p-5 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : images.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              No images yet. Click <span className="font-semibold">Upload</span> to add one.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onSelect(m.url); onClose(); }}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-sky-400 hover:ring-2 hover:ring-sky-200 transition-all"
                  title={m.originalName}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.originalName} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {hasMore && !loading && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => load(page + 1, true)}
                disabled={loadingMore}
                className="btn-secondary text-xs"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
