"use client";

import { useEffect, useRef, useState } from "react";
import NavList, { type NavNode } from "./NavList";

export type { NavNode };

/**
 * Primary navigation in click-to-open mode.
 *
 * Hover opening is done in CSS (see `headerNavCss`) so it previews live and
 * needs no JavaScript at all — SiteLayout renders NavList directly for that.
 * This wrapper exists only for the state click mode needs.
 */
export default function HeaderNav({
  items,
  openOn,
  activeIds,
  label,
}: {
  items: NavNode[];
  openOn: string;
  activeIds: number[];
  label?: string;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const clickMode = openOn === "click";

  useEffect(() => {
    if (!clickMode || openId === null) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [clickMode, openId]);

  return (
    <NavList
      navRef={rootRef}
      label={label}
      items={items}
      activeIds={new Set(activeIds)}
      openId={clickMode ? openId : null}
      onToggle={clickMode ? (id) => setOpenId((cur) => (cur === id ? null : id)) : undefined}
    />
  );
}
