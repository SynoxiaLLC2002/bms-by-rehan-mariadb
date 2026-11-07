"use client";

import { useId, useRef, useState } from "react";

interface Tab { label: string; content: string }

/**
 * Tabs, the WAI-ARIA way.
 *
 * The first version was buttons with `role="tab"` and nothing else: arrow
 * keys did nothing, every tab was its own Tab stop, and no tab was tied to its
 * panel, so a screen reader announced a panel with no name. Now: one Tab stop
 * for the whole list (roving tabindex), ←/→ (mirrored in RTL), Home and End
 * move between tabs, and each tab and panel name each other.
 *
 * Colours come from the theme: text inherits, and lines are drawn from
 * `currentColor`, so the block reads correctly on a dark background and in
 * dark mode instead of fixed slate greys.
 */
export default function TabsFE({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!tabs.length) return null;

  const tabId = (i: number) => `${base}-tab-${i}`;
  const panelId = (i: number) => `${base}-panel-${i}`;

  const move = (to: number) => {
    const n = (to + tabs.length) % tabs.length;
    setActive(n);
    refs.current[n]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === next) move(active + 1);
    else if (e.key === prev) move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="my-6">
      <div
        className="flex overflow-x-auto border-b border-[color-mix(in_srgb,currentColor_15%,transparent)]"
        role="tablist"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(i)}
            type="button"
            role="tab"
            aria-selected={active === i}
            aria-controls={panelId(i)}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-opacity ${
              active === i
                ? "border-[var(--color-primary,#0ea5e9)] text-[var(--color-primary,#0ea5e9)]"
                : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Every panel stays in the DOM so crawlers see all tabs, not just the active one */}
      {tabs.map((tab, i) => (
        <div
          key={i}
          id={panelId(i)}
          role="tabpanel"
          aria-labelledby={tabId(i)}
          tabIndex={0}
          hidden={active !== i}
          className="py-5 text-sm leading-relaxed"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
