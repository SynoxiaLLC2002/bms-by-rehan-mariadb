// Renders any icon value — see lib/icons.ts for the three kinds.
//
// Usable from server and client components alike: it has no state and no
// browser APIs. Every kind is sized in `em`, so the font-size the blocks
// already set for their icons keeps working, and Lucide icons draw in
// currentColor, so the blocks' icon-colour settings apply to them too.

import type { CSSProperties } from "react";
import { icons } from "lucide-react";
import { lucideComponentName, parseIcon } from "@/lib/icons";

interface IconProps {
  value: unknown;
  /** Rendered when `value` is empty. */
  fallback?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible name. Without one the icon is decorative and hidden from readers. */
  title?: string;
}

export default function Icon({ value, fallback = "", className, style, title }: IconProps) {
  const icon = parseIcon(value) ?? parseIcon(fallback);
  if (!icon) return null;

  const a11y = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };

  if (icon.kind === "lucide") {
    const Cmp = icons[lucideComponentName(icon.value) as keyof typeof icons];
    if (!Cmp) return null;
    return (
      <Cmp
        size="1em"
        strokeWidth={2}
        // `.bms-ico` carries the two constants (defined in both stylesheets,
        // because this renders in the admin too). A caller's own style is the
        // only thing that goes inline: on one measured page this component
        // wrote the same 44 bytes 29 times.
        className={className ? `bms-ico ${className}` : "bms-ico"}
        style={style}
        {...a11y}
      />
    );
  }

  if (icon.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon.value}
        alt={title ?? ""}
        className={className ? `bms-ico bms-ico-img ${className}` : "bms-ico bms-ico-img"}
        style={style}
        {...(title ? {} : { "aria-hidden": true })}
      />
    );
  }

  return (
    <span className={className} style={style} {...a11y}>
      {icon.value}
    </span>
  );
}
