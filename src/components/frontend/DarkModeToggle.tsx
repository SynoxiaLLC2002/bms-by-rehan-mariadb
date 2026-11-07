"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * The light/dark switch.
 *
 * It used to add and remove `class="dark"` on `<html>`, and nothing in the
 * site's CSS has ever looked at that class — every rule keys off
 * `:root[data-theme="dark"]` (see `siteCss.ts`). So the button changed its own
 * icon, wrote to localStorage, and had no visible effect at all.
 *
 * The second half was worse. The automatic rule is
 * `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` —
 * so a visitor whose system is dark got a dark site, and pressing "light"
 * could not turn it off, because nothing ever set `data-theme="light"`. The
 * only control offered was one the theme ignored.
 *
 * Both states are therefore written explicitly. "light" is not the absence of
 * "dark": it is the value that opts out of the system preference.
 */
type Theme = "dark" | "light";

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function DarkModeToggle({ label }: { label: string }) {
  // `null` until the effect has read localStorage, so the first paint does not
  // claim a state it has not checked.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      // Private mode or blocked storage: fall back to the system preference.
    }
    const initial: Theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    // Only write the attribute when a choice was stored. Without a stored
    // choice the CSS media query is already doing the right thing, and
    // stamping the attribute would freeze the site against a later change of
    // system preference.
    if (stored === "dark" || stored === "light") apply(stored);
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // The attribute is already set; the choice just will not survive a reload.
    }
  }

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg hover:bg-black/10 transition-colors"
      aria-label={label}
      aria-pressed={theme === "dark"}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
