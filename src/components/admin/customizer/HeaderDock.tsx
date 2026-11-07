"use client";

import type { CustomizerSettings } from "@/lib/appearanceSettings";
import { type Col, MOBILE_COLS, COLS, HEADER_ITEMS, itemLabel } from "@/lib/builderItems";
import { BuilderDock, parseZone, type Drag } from "./BuilderDock";

export type DockDevice = "desktop" | "mobile";
export { parseZone };
export type { Drag };

export { HEADER_ITEMS, itemLabel };

/** Zone keys for a given device — the mobile set mirrors the desktop one. */
export function zoneKey(
  device: DockDevice,
  row: "topbar" | "main" | "bottombar",
  col: Col
): keyof CustomizerSettings {
  const p = device === "mobile" ? "header_m_" : "header_";
  return `${p}${row}_${col}` as keyof CustomizerSettings;
}

export function rowEnabledKey(device: DockDevice, row: "topbar" | "bottombar"): keyof CustomizerSettings {
  const p = device === "mobile" ? "header_m_" : "header_";
  return `${p}${row}_enabled` as keyof CustomizerSettings;
}

export function HeaderDock({
  s, set, device, setDevice, onHide, onConfigureItem, drag, setDrag,
}: {
  s: CustomizerSettings;
  set: (k: keyof CustomizerSettings, v: string) => void;
  device: DockDevice;
  setDevice: (d: DockDevice) => void;
  onHide: () => void;
  onConfigureItem: (id: string) => void;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
}) {
  return (
    <BuilderDock
      s={s}
      set={set}
      cols={device === "mobile" ? MOBILE_COLS : COLS}
      rows={
        device === "mobile"
          ? [
              { id: "topbar",    label: "Top Row",    enabledKey: rowEnabledKey(device, "topbar") },
              { id: "main",      label: "Main Row" },
              { id: "bottombar", label: "Bottom Row", enabledKey: rowEnabledKey(device, "bottombar") },
              { id: "popup",     label: "Off-Canvas" },
            ]
          : [
              { id: "topbar",    label: "Top Row",    enabledKey: rowEnabledKey(device, "topbar") },
              { id: "main",      label: "Main Row" },
              { id: "bottombar", label: "Bottom Row", enabledKey: rowEnabledKey(device, "bottombar") },
            ]
      }
      zoneKeyFor={(row, col) =>
        row === "popup" ? ("header_m_popup" as keyof CustomizerSettings) : zoneKey(device, row as "topbar" | "main" | "bottombar", col)
      }
      labelFor={itemLabel}
      onHide={onHide}
      onConfigureItem={onConfigureItem}
      drag={drag}
      setDrag={setDrag}
      devices={[
        { id: "desktop", label: "Desktop",         icon: "desktop" },
        { id: "mobile",  label: "Tablet / Mobile", icon: "mobile" },
      ]}
      device={device}
      setDevice={(d) => setDevice(d as DockDevice)}
    />
  );
}
