"use client";

import type { CustomizerSettings } from "@/lib/appearanceSettings";
import { type Col, FOOTER_ITEMS, footerItemLabel } from "@/lib/builderItems";
import { BuilderDock, type Drag } from "./BuilderDock";

export { FOOTER_ITEMS, footerItemLabel };

export function footerZoneKey(
  row: "toprow" | "main" | "bottomrow",
  col: Col
): keyof CustomizerSettings {
  return `footer_${row}_${col}` as keyof CustomizerSettings;
}

export function FooterDock({
  s, set, onHide, onConfigureItem, drag, setDrag,
}: {
  s: CustomizerSettings;
  set: (k: keyof CustomizerSettings, v: string) => void;
  onHide: () => void;
  onConfigureItem: (id: string) => void;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
}) {
  return (
    <BuilderDock
      s={s}
      set={set}
      rows={[
        { id: "toprow",    label: "Top Row",    enabledKey: "footer_toprow_enabled" },
        { id: "main",      label: "Main Row" },
        { id: "bottomrow", label: "Bottom Row", enabledKey: "footer_bottomrow_enabled" },
      ]}
      zoneKeyFor={(row, col) => footerZoneKey(row as "toprow" | "main" | "bottomrow", col)}
      labelFor={footerItemLabel}
      onHide={onHide}
      onConfigureItem={onConfigureItem}
      drag={drag}
      setDrag={setDrag}
    />
  );
}
