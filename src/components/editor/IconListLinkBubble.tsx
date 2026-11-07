"use client";

// Select words inside an Icon List item on the canvas and link just those.
//
// The item label is a plain string (see iconList.ts): a link inside it is the
// `[label](url)` marker and a highlight is `==word==`. Typing those by hand was
// the only way to get either, and nobody finds a tip in a side panel. This is
// the button BlockNote's own formatting toolbar gives every paragraph and
// bullet list, for the one list whose text BlockNote does not own.
//
// One instance serves the whole editor, columns included: it works on the DOM
// of whatever `.bmsil-txt[contenteditable]` holds the selection, and commits by
// focusing and blurring that span — the same path a typed edit takes — so it
// needs no wiring into each block.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Highlighter, Link2, Link2Off } from "lucide-react";
import { safeHref } from "@/lib/blockStyle";

const SPAN = ".bmsil-txt[contenteditable]";
const LINK_RE = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

/** Only one mounted editor draws the bubble — a page can hold several. */
let owner: symbol | null = null;

interface Target {
  el: HTMLElement;
  start: number;
  end: number;
  rect: DOMRect;
}

function offsetIn(el: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** The selection, when it is a non-empty run inside one item label. */
function readSelection(): Target | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const host = (n: Node | null) =>
    (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>(SPAN) ?? null;
  const el = host(range.startContainer);
  if (!el || el !== host(range.endContainer)) return null;
  const start = offsetIn(el, range.startContainer, range.startOffset);
  const end = offsetIn(el, range.endContainer, range.endOffset);
  if (end <= start) return null;
  const rect = range.getBoundingClientRect();
  return { el, start, end, rect };
}

/** The `[label](url)` run the selection sits in or covers, if any. */
function linkAround(text: string, start: number, end: number) {
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(text))) {
    const a = m.index;
    const b = a + m[0].length;
    if (start < b && end > a) return { a, b, label: m[1], url: m[2] };
  }
  return null;
}

/** Writes new label text through the span's own blur commit. */
function commit(el: HTMLElement, text: string) {
  el.textContent = text;
  el.focus();
  el.blur();
}

/** A URL the `[label](url)` marker can hold: no spaces, no stray brackets. */
function encodeForMarker(url: string): string {
  return url.trim().replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export default function IconListLinkBubble() {
  const [target, setTarget] = useState<Target | null>(null);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef(false);
  editingRef.current = editing;
  const [active, setActive] = useState(false);

  useEffect(() => {
    const me = Symbol("bubble");
    if (owner) return;
    owner = me;
    setActive(true);
    return () => {
      if (owner === me) owner = null;
    };
  }, []);

  const openLink = useCallback((t: Target) => {
    const text = t.el.textContent ?? "";
    const existing = linkAround(text, t.start, t.end);
    setTarget(t);
    setUrl(existing ? existing.url : "");
    setError("");
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!active) return;
    const onSel = () => {
      if (editingRef.current) return;
      setTarget(readSelection());
    };
    // Capture phase: the label's own keydown handler stops propagation.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        const t = readSelection();
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        openLink(t);
      }
    };
    const onScroll = () => {
      if (!editingRef.current) setTarget(readSelection());
    };
    document.addEventListener("selectionchange", onSel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [active, openLink]);

  if (!active || !target || !target.el.isConnected) return null;

  const text = target.el.textContent ?? "";
  const existing = linkAround(text, target.start, target.end);
  const close = () => {
    setEditing(false);
    setTarget(null);
  };

  const apply = () => {
    const href = encodeForMarker(url);
    if (!href || !safeHref(href)) {
      setError("Enter a web address (https://…) or a path on this site (/page).");
      return;
    }
    let next: string;
    if (existing) {
      // Re-pointing a link keeps its label and changes only the address.
      next = text.slice(0, existing.a) + `[${existing.label}](${href})` + text.slice(existing.b);
    } else {
      const label = text.slice(target.start, target.end);
      if (/[[\]]/.test(label)) {
        setError("The selection contains [ or ] — select just the words to link.");
        return;
      }
      next = text.slice(0, target.start) + `[${label}](${href})` + text.slice(target.end);
    }
    commit(target.el, next);
    close();
  };

  const unlink = () => {
    if (!existing) return;
    commit(target.el, text.slice(0, existing.a) + existing.label + text.slice(existing.b));
    close();
  };

  const highlight = () => {
    const label = text.slice(target.start, target.end);
    const m = /^==([^=]+)==$/.exec(label);
    const replacement = m ? m[1] : label.includes("==") ? null : `==${label}==`;
    if (replacement === null) return;
    commit(target.el, text.slice(0, target.start) + replacement + text.slice(target.end));
    close();
  };

  const top = Math.max(8, target.rect.top - 44);
  const left = Math.min(window.innerWidth - 320, Math.max(8, target.rect.left + target.rect.width / 2 - 150));
  const btn =
    "flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-100";

  return createPortal(
    <div
      className="fixed z-[1000] flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
      style={{ top, left }}
      // Keep the selection in the label while a button is pressed.
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="flex flex-col">
            <input
              ref={inputRef}
              dir="ltr"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") close();
              }}
              placeholder="https://… or /page"
              className="w-56 rounded border border-slate-300 px-2 py-1 text-[12px] outline-none focus:border-sky-500"
            />
            {error && <span className="mt-1 max-w-56 text-[11px] text-red-600">{error}</span>}
          </div>
          <button type="submit" className="rounded bg-sky-600 px-2 py-1 text-[12px] font-semibold text-white hover:bg-sky-700">
            {existing ? "Update" : "Link"}
          </button>
          <button type="button" onClick={close} className={btn}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button type="button" className={btn} onClick={() => openLink(target)} title="Link the selected words (Ctrl+K)">
            <Link2 size={14} /> {existing ? "Edit link" : "Link"}
          </button>
          {existing && (
            <button type="button" className={btn} onClick={unlink} title="Remove this link, keep the words">
              <Link2Off size={14} /> Remove link
            </button>
          )}
          <button type="button" className={btn} onClick={highlight} title="Highlight the selected words">
            <Highlighter size={14} /> Highlight
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
