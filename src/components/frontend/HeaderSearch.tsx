"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";

/**
 * Header search. Both affordances are always rendered — an inline field and an
 * icon that opens a modal — and `headerSearchCss` decides which one shows. That
 * keeps the Customizer's live preview able to switch modes with no re-render.
 */
export default function HeaderSearch({
  placeholder,
  action,
  labels,
}: {
  placeholder: string;
  /** The icon trigger, the modal's close button and the submit control, in
   *  the page's language. */
  labels: { open: string; close: string; submit?: string };
  /** Search stays inside the current language: `/search`, or `/fr/search`. */
  action: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // The input carries `autoFocus`, so focus moved in already; this traps Tab
  // inside the overlay and hands focus back to the icon when it closes.
  useDialogFocus(open, panel);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="hsearch flex items-center">
      <form action={action} className="hsearch-inline items-center gap-2">
        <input
          type="search"
          name="q"
          placeholder={placeholder}
          data-bms-placeholder="hsearch_placeholder"
          aria-label={placeholder}
          className="hsearch-field text-sm px-3 py-1.5 bg-black/5 focus:outline-none w-40"
        />
        {/* Enter submits, but a form needs a submit control to be complete
            (WCAG H32) — visually hidden, since the field is the whole design. */}
        <button type="submit" className="sr-only">{labels.submit ?? labels.open}</button>
      </form>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.open}
        className="hsearch-trigger hsearch-icon items-center justify-center leading-none px-2 py-1 rounded-lg"
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={labels.open}
          className="hsearch-modal fixed inset-0 z-[100] flex items-start justify-center pt-32 px-4"
          style={{ backgroundColor: "var(--hsearch-modal-bg, rgba(15,23,42,.96))" }}
          onClick={() => setOpen(false)}
        >
          <form action={action} className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b-2 border-current/40 focus-within:border-current">
              <input
                autoFocus
                type="search"
                name="q"
                placeholder={placeholder}
                aria-label={placeholder}
                className="min-w-0 flex-1 text-xl bg-transparent pb-3 focus:outline-none placeholder:opacity-50"
              />
              {/* On a phone there is no Enter key in sight until the keyboard
                  opens, and nothing else in the overlay submits. */}
              <button type="submit" aria-label={labels.submit ?? labels.open} className="pb-3 text-xl opacity-80 hover:opacity-100">
                <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="mt-4 text-xs uppercase tracking-wide opacity-70 hover:opacity-100">
              {labels.close}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
