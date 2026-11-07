// The rendered form of an icon list block.
//
// Hookless on purpose, so the same component serves the published page (a
// Server Component) and the editor canvas (a client one) — the arrangement
// `ButtonGroup` uses, for the same reason: shared markup cannot drift from
// shared CSS.
//
// The canvas passes `onEditText`, which turns each label into a contentEditable
// span. The page never passes it, so nothing about the published markup changes
// and no handler is ever serialised across the server boundary.

import React from "react";
import { resolveIconList, type ResolvedIconListItem, type TextSegment } from "@/lib/iconList";
import { editableCanvasCss, iconListBaseCss } from "@/lib/blockCss";
import type { PropRec } from "@/lib/blockStyle";
import Icon from "@/components/shared/Icon";
import { icons } from "lucide-react";
import { lucideComponentName, parseIcon } from "@/lib/icons";
import BlockStyle from "@/components/shared/BlockStyle";

/**
 * Lists of steps put the same icon on every row, and each copy was the whole
 * Lucide SVG — thirty identical download arrows, about 330 bytes and four
 * elements apiece. On the published page an icon used by at least this many
 * rows is drawn once as a `<symbol>` and each row points at it with `<use>`.
 * It draws in currentColor, so per-row colours still apply.
 */
const SHARE_FROM = 3;

/** The one hidden definition a shared icon's rows point at. */
function IconSymbol({ id, name }: { id: string; name: string }) {
  const Cmp = icons[lucideComponentName(name) as keyof typeof icons];
  if (!Cmp) return null;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <symbol id={id} viewBox="0 0 24 24">
        <Cmp size={24} strokeWidth={2} />
      </symbol>
    </svg>
  );
}

function Label({ segments }: { segments: TextSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        const body = seg.mark ? (
          <mark className="bmsil-hl">{seg.text}</mark>
        ) : (
          seg.text
        );
        // A run written as `[label](url)` becomes its own anchor, so a single
        // word can be the link while the rest of the item stays plain text.
        // `href` is already through `safeHref` when the segments are parsed.
        return seg.href ? (
          <a
            key={i}
            href={seg.href}
            className="bmsil-link"
          >
            {body}
          </a>
        ) : (
          <React.Fragment key={i}>{body}</React.Fragment>
        );
      })}
    </>
  );
}

/** How far into `el`'s text the caret sits. */
function caretOffset(el: HTMLElement): number {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function Row({
  item,
  index,
  inert,
  symbolId,
  onEditText,
  onFocusItem,
  onSplitItem,
  onRemoveItem,
}: {
  item: ResolvedIconListItem;
  index: number;
  inert: boolean;
  /** Set when this row's icon is drawn once for the list — see SHARE_FROM. */
  symbolId?: string;
  onEditText?: (index: number, text: string) => void;
  onFocusItem?: (index: number) => void;
  onSplitItem?: (index: number, before: string, after: string) => void;
  onRemoveItem?: (index: number) => void;
}) {
  // The glyph is decoration beside its own label — read aloud it is the emoji's
  // name, which is never what the author meant. A title, when set, is the text
  // that stands in for it.
  const icon = item.showIcon ? (
    <span
      className={["bmsil-ico", item.styleClass].filter(Boolean).join(" ")}
      aria-hidden={item.iconTitle ? undefined : true}
    >
      {symbolId ? (
        <svg className="bms-ico" width="1em" height="1em" aria-hidden>
          <use href={`#${symbolId}`} />
        </svg>
      ) : (
        <Icon value={item.icon} />
      )}
      {item.iconTitle && <span className="sr-only">{item.iconTitle}</span>}
    </span>
  ) : null;

  const label = onEditText ? (
    <span
      className="bmsil-txt"
      contentEditable
      suppressContentEditableWarning
      // Commit on blur rather than on every keystroke: writing to the block on
      // each character would re-render the node and drop the caret.
      onBlur={(e) => {
        // A structural edit already wrote the value; committing again here
        // would land on whatever item now sits at this index.
        if (e.currentTarget.dataset.skipCommit === "1") {
          delete e.currentTarget.dataset.skipCommit;
          return;
        }
        onEditText(index, e.currentTarget.textContent ?? "");
      }}
      onFocus={() => onFocusItem?.(index)}
      // BlockNote owns the keyboard for the block, so every key handled here has
      // to be stopped before it reaches the outer editor and splits the block.
      onKeyDown={(e) => {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        const text = el.textContent ?? "";

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const at = caretOffset(el);
          const before = text.slice(0, at);
          const after = text.slice(at);
          // Put the kept half in the DOM first, so the blur that follows
          // focusing the new row commits the same value rather than the old one.
          el.textContent = before;
          onSplitItem?.(index, before, after);
          return;
        }

        // Backspace in an empty item removes it, the way every list editor
        // behaves — without this, Enter could only ever add rows.
        if (e.key === "Backspace" && text === "" && caretOffset(el) === 0) {
          e.preventDefault();
          el.dataset.skipCommit = "1";
          onRemoveItem?.(index);
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      // The raw text, markers and all, so `==highlight==` stays editable.
      dangerouslySetInnerHTML={{ __html: escapeText(item.rawText) }}
    />
  ) : (
    <span className="bmsil-txt">
      <Label segments={item.segments} />
    </span>
  );

  const className = ["bmsil-item", item.scope].filter(Boolean).join(" ");

  if (item.href && !inert) {
    return (
      <li className={className}>
        <a
          href={item.href}
          target={item.target === "_blank" ? "_blank" : undefined}
          rel={item.rel}
          className="bmsil-link"
        >
          {icon}
          {label}
        </a>
      </li>
    );
  }

  return (
    <li className={className}>
      {icon}
      {label}
    </li>
  );
}

/** Text into HTML — the editable span sets its own content, so it must be safe. */
function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function IconListView({
  props,
  scopeBase,
  /** The canvas renders the same markup but must not navigate on click. */
  inert = false,
  onEditText,
  onFocusItem,
  onSplitItem,
  onRemoveItem,
  pageSymbols,
}: {
  props: PropRec;
  scopeBase: string;
  inert?: boolean;
  /**
   * Symbols already drawn on this page, from the page renderer. With it, an
   * icon is defined once for the whole document — five step lists with the
   * same arrow share one definition — instead of once per list.
   */
  pageSymbols?: Set<string>;
  onEditText?: (index: number, text: string) => void;
  onFocusItem?: (index: number) => void;
  onSplitItem?: (index: number, before: string, after: string) => void;
  onRemoveItem?: (index: number) => void;
}) {
  const { items, listClass, css, anchor } = resolveIconList(props, scopeBase);

  // On the page the base look is already in the site stylesheet. In the editor
  // canvas nothing is, so it ships with the block — first, so the block's own
  // rules still win at equal specificity.
  const sheet = inert ? iconListBaseCss() + editableCanvasCss() + css : css;

  if (items.length === 0) {
    return inert ? (
      <div className="p-3 text-sm italic text-slate-400">Icon List — click to add items</div>
    ) : null;
  }

  // Icons shared by enough rows to be worth one definition. Never on the
  // canvas: the editor re-renders rows one at a time and a row must not
  // depend on a symbol another render owns.
  const shared = new Map<string, string>();
  if (!inert && !onEditText) {
    const counts = new Map<string, number>();
    for (const it of items) {
      const icon = it.showIcon ? parseIcon(it.icon) : null;
      if (icon?.kind === "lucide") counts.set(icon.value, (counts.get(icon.value) ?? 0) + 1);
    }
    for (const [name, n] of counts) {
      if (n >= SHARE_FROM && icons[lucideComponentName(name) as keyof typeof icons]) shared.set(name, pageSymbols ? `bmsil-sym-${name}` : `${scopeBase}-${name}`);
    }
  }
  const symbolFor = (it: ResolvedIconListItem) => {
    const icon = it.showIcon ? parseIcon(it.icon) : null;
    return icon?.kind === "lucide" ? shared.get(icon.value) : undefined;
  };

  return (
    <ul className={listClass} id={anchor}>
      <BlockStyle css={sheet} hoist={!inert} />
      {[...shared].filter(([, id]) => {
        // Defined by an earlier list on this page: point at that one.
        if (!pageSymbols) return true;
        if (pageSymbols.has(id)) return false;
        pageSymbols.add(id);
        return true;
      }).map(([name, id]) => (
        // Inside the <ul> for the same reason the <style> is: the list is one
        // element, wherever a column puts it. A list item is the only child a
        // <ul> may have, so the definition sits in one that takes no space.
        // Inline display:none, not just `hidden`: a list layout rule for `li`
        // would out-rank the attribute. A sprite inside display:none still
        // serves <use> — that is the standard SVG sprite arrangement.
        <li key={id} hidden aria-hidden style={{ display: "none" }}>
          <IconSymbol id={id} name={name} />
        </li>
      ))}
      {items.map((item, i) => (
        <Row
          key={i}
          item={item}
          index={i}
          inert={inert}
          symbolId={symbolFor(item)}
          onEditText={onEditText}
          onFocusItem={onFocusItem}
          onSplitItem={onSplitItem}
          onRemoveItem={onRemoveItem}
        />
      ))}
    </ul>
  );
}
