import Link from "next/link";

export interface NavNode {
  id: number;
  label: string;
  url: string;
  target: string | null;
  icon?: string | null;
  description?: string | null;
  badge?: string | null;
  highlight?: string | null;
  megaMenu?: boolean | null;
  megaColumns?: number | null;
  children: NavNode[];
}

/**
 * The navigation markup, shared by the server and client renderers.
 *
 * No hooks and no imported state, so this compiles as a Server Component for
 * the plain hover-mode header and as client code inside HeaderNav. Keeping one
 * copy is the point: the two used to be written out separately, and the server
 * one had quietly fallen behind on icons, badges, descriptions and mega menus.
 */
export default function NavList({
  items,
  activeIds,
  openId,
  onToggle,
  navRef,
  label = "Primary",
}: {
  items: NavNode[];
  /** The landmark's accessible name — "Primary", "Secondary", "Mobile". */
  label?: string;
  activeIds: Set<number>;
  /** Click-mode only; hover mode is pure CSS. */
  openId?: number | null;
  onToggle?: (id: number) => void;
  navRef?: React.Ref<HTMLElement>;
}) {
  // No items, no landmark: an empty <nav> is announced to a screen reader
  // and shipped to every visitor for nothing.
  if (items.length === 0) return null;
  return (
    <nav ref={navRef} className="hnav text-sm" aria-label={label}>
      {items.map((item) => {
        const hasKids = item.children.length > 0;
        const isOpen = openId === item.id;
        const isActive = activeIds.has(item.id);
        return (
          <div
            key={item.id}
            className={`hnav-item relative flex items-stretch${isActive ? " is-active" : ""}`}
          >
            <Link
              href={item.url}
              target={item.target || "_self"}
              data-highlight={item.highlight || undefined}
              aria-current={isActive ? "page" : undefined}
              className="hnav-link font-medium transition-colors px-1 gap-1.5"
              onClick={
                onToggle && hasKids
                  ? (e) => { e.preventDefault(); onToggle(item.id); }
                  : undefined
              }
              aria-expanded={onToggle && hasKids ? isOpen : undefined}
            >
              {item.icon && <span className="hnav-icon" aria-hidden="true">{item.icon}</span>}
              {item.label}
              {item.badge && <span className="hnav-badge">{item.badge}</span>}
              {hasKids && <span className="ms-1 text-[0.7em] opacity-60">▾</span>}
              <span className="hnav-underline" aria-hidden="true" />
            </Link>

            {/* Dropdown visibility is driven by CSS classes, never inline styles —
                inline would outrank the :hover rule and break hover mode. */}
            {hasKids && (
              <div
                className={`hnav-dd absolute top-full z-50 py-2 shadow-lg${isOpen ? " is-open" : ""}${item.megaMenu ? " is-mega" : " left-0"}`}
                style={item.megaMenu ? { ["--mega-cols" as string]: String(item.megaColumns || 2) } : undefined}
              >
                {item.children.map((child) => {
                  const childActive = activeIds.has(child.id);
                  return (
                    <Link
                      key={child.id}
                      href={child.url}
                      target={child.target || "_self"}
                      aria-current={childActive ? "page" : undefined}
                      className={`hnav-dd-item block px-4 py-2 text-sm transition-colors hover:opacity-70${
                        childActive ? " is-active" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {child.icon && <span className="hnav-icon" aria-hidden="true">{child.icon}</span>}
                        <span className="font-medium">{child.label}</span>
                        {child.badge && <span className="hnav-badge">{child.badge}</span>}
                      </span>
                      {child.description && (
                        <span className="hnav-dd-desc block text-xs opacity-60 mt-0.5">{child.description}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
