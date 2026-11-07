"use client";

// Focus handling for the two overlays that are not a native <dialog>.
//
// `ModalFE` calls `showModal()`, so the browser moves focus in, traps Tab and
// makes the rest of the page inert for free. The off-canvas menu and the
// header's search overlay are plain elements, and both were missing all three:
//
//   • The off-canvas panel carries `aria-modal="true"`, which tells a screen
//     reader that everything outside it is hidden — while focus stayed on the
//     hamburger button *outside* it. The reader is then parked on an element
//     it has just been told does not exist, with no way back.
//   • Tab walked straight out of both overlays into the page behind, which is
//     visually covered and, for the off-canvas, declared hidden.
//   • Closing either one dropped focus back to <body>, so the next Tab started
//     from the top of the page instead of the control the user came from.
//
// This is the smallest thing that fixes all three, and it is shared rather
// than written twice.

import { useEffect, type RefObject } from "react";

/** Things a keyboard can land on, in DOM order. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialogFocus(open: boolean, panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const root = panel.current;
    if (!root) return;

    // Where to put focus back when this closes.
    const returnTo = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Into the panel. An overlay with nothing focusable still needs to take
    // focus itself, or the reader stays outside a dialog it cannot leave.
    const first = focusable()[0];
    if (first) first.focus();
    else {
      root.tabIndex = -1;
      root.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it has escaped.
      if (e.shiftKey && (active === firstEl || !root.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !root.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Only take focus back if it is still inside the overlay being removed —
      // a click elsewhere on the page should keep whatever the click focused.
      if (returnTo && (!document.activeElement || root.contains(document.activeElement) || document.activeElement === document.body)) {
        returnTo.focus?.();
      }
    };
  }, [open, panel]);
}
