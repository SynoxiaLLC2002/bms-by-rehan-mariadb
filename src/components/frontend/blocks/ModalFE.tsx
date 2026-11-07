"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ContentImage from "@/components/frontend/ContentImage";

// A popup built on the native <dialog> element: focus is trapped, Escape
// closes it and the page behind is inert, all by the browser. The trigger is
// whatever the author chose — a button, an image, a text link — or nothing at
// all for a popup that opens by itself after a delay or when the visitor moves
// to leave. "Once per visitor" is remembered in the visitor's own browser.

export interface ModalProps {
  id: string;
  trigger: "button" | "image" | "text" | "none";
  triggerLabel: string;
  triggerImage: string;
  triggerAlign: string;
  title: string;
  text: string;
  image: string;
  videoEmbed: string | null;
  buttonLabel: string;
  buttonUrl: string;
  width: "sm" | "md" | "lg" | "xl";
  autoOpen: boolean;
  delay: number;
  exitIntent: boolean;
  oncePerVisitor: boolean;
  /** The close button's accessible name, in the page's language. */
  closeLabel: string;
  closeOnBackdrop: boolean;
}

const WIDTH = { sm: 400, md: 560, lg: 760, xl: 980 };

export default function ModalFE(p: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const key = `bms:modal:${p.id}`;

  const show = useCallback(
    (auto: boolean) => {
      const d = ref.current;
      if (!d || d.open) return;
      if (auto && p.oncePerVisitor) {
        try {
          if (localStorage.getItem(key)) return;
          localStorage.setItem(key, String(Date.now()));
        } catch {
          // Storage blocked — show it; worst case the visitor sees it again.
        }
      }
      d.showModal();
      setOpen(true);
    },
    [key, p.oncePerVisitor]
  );

  const close = () => {
    ref.current?.close();
  };

  useEffect(() => {
    if (!p.autoOpen && !p.exitIntent) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (p.autoOpen) timers.push(setTimeout(() => show(true), Math.max(0, p.delay) * 1000));
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) show(true);
    };
    if (p.exitIntent) document.addEventListener("mouseout", onLeave);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [p.autoOpen, p.delay, p.exitIntent, show]);

  const align = p.triggerAlign === "center" ? "text-center" : p.triggerAlign === "right" ? "text-right" : "";

  return (
    <div className={`bms-modal my-4 ${align}`}>
      {p.trigger === "button" && (
        <button type="button" className="btn" onClick={() => show(false)}>
          {p.triggerLabel || "Open"}
        </button>
      )}
      {p.trigger === "text" && (
        <button type="button" className="underline underline-offset-2" style={{ color: "var(--color-primary)" }} onClick={() => show(false)}>
          {p.triggerLabel || "Open"}
        </button>
      )}
      {p.trigger === "image" && p.triggerImage && (
        <button type="button" className="inline-block cursor-zoom-in" onClick={() => show(false)} aria-label={p.triggerLabel || p.title || "Open"}>
          <ContentImage src={p.triggerImage} alt={p.triggerLabel || p.title || ""} className="max-w-full h-auto rounded-xl" />
        </button>
      )}

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (p.closeOnBackdrop && e.target === ref.current) close();
        }}
        className="bms-modal-dialog m-auto w-[calc(100%-2rem)] rounded-2xl p-0 text-start shadow-2xl backdrop:bg-black/60"
        style={{ maxWidth: WIDTH[p.width] ?? WIDTH.md, background: "var(--color-bg,#fff)", color: "inherit" }}
        aria-labelledby={p.title ? `${p.id}-title` : undefined}
      >
        <div className="relative">
          <button
            type="button"
            onClick={close}
            aria-label={p.closeLabel}
            className="absolute end-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-lg leading-none text-white hover:bg-black/70"
          >
            ×
          </button>
          {/* The player is only built while the dialog is open, so closing it stops the video. */}
          {p.videoEmbed && open && (
            <div className="aspect-video w-full bg-black">
              <iframe
                src={p.videoEmbed}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={p.title || "Video"}
              />
            </div>
          )}
          {!p.videoEmbed && p.image && (
            // Optimised; the dialog is at most about the content column wide.
            <ContentImage src={p.image} alt="" className="block w-full h-auto" />
          )}
          {(p.title || p.text || (p.buttonLabel && p.buttonUrl)) && (
            <div className="p-6">
              {p.title && (
                <h3 id={`${p.id}-title`} className="text-xl font-bold">
                  {p.title}
                </h3>
              )}
              {p.text && <p className="mt-2 whitespace-pre-line leading-relaxed opacity-80">{p.text}</p>}
              {p.buttonLabel && p.buttonUrl && (
                <a href={p.buttonUrl} className="btn mt-5 inline-block">
                  {p.buttonLabel}
                </a>
              )}
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
