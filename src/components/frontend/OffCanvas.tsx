"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useDialogFocus } from "./useDialogFocus";

/**
 * The mobile off-canvas panel, opened by the header's Trigger item.
 *
 * Appearance (side, width, animation, colours) is entirely CSS from
 * `offCanvasCss`, so all of it previews live; this only owns open/closed.
 */
export default function OffCanvas({
  children,
  labels,
}: {
  children: React.ReactNode;
  /** The trigger, the panel and the close button, in the page's language —
   *  a client component cannot read the settings, so the server passes them. */
  labels: { open: string; menu: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // `aria-modal` above promises the rest of the page is inert; this is what
  // makes that true for the keyboard as well.
  useDialogFocus(open, panel);

  // Links change the page without a reload, so nothing used to close the
  // panel: on a phone the next page loaded behind a menu that stayed open,
  // with page scrolling still locked. It closes when the address changes,
  // and on any link tap inside it (a `#section` link keeps the path).
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the panel.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.open}
        aria-expanded={open}
        className="offcanvas-trigger inline-flex flex-col justify-center gap-[5px] px-2 py-1"
      >
        <span className="block w-5 h-[2px] bg-current" />
        <span className="block w-5 h-[2px] bg-current" />
        <span className="block w-5 h-[2px] bg-current" />
      </button>

      <div
        className={`offcanvas-backdrop${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        ref={panel}
        className={`offcanvas${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={labels.menu}
        onClick={(e) => {
          if ((e.target as Element).closest("a[href]")) setOpen(false);
        }}
      >
        <div className="flex justify-end mb-4">
          <button type="button" onClick={() => setOpen(false)} aria-label={labels.close} className="offcanvas-close opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
