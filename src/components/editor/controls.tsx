"use client";

// The shared control kit for the block settings panel.
//
// Every length control in a mature page builder carries the same four
// affordances, and ours carried none of them: a device toggle, a unit selector,
// a link toggle for four-sided values, and a reset that clears back to inherit.
// They live here once so all ~40 blocks gain them together.
//
// Device state is deliberately panel-wide rather than per control — switching to
// Mobile once should put every control on the panel into mobile, which is what
// makes responsive editing feel like one mode rather than forty toggles.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { Link2, Unlink2, RotateCcw, Monitor, Tablet, Smartphone } from "lucide-react";
import {
  DEVICES,
  EMPTY_SIDES,
  LENGTH_UNITS,
  effectiveScalar,
  effectiveSides,
  parseScalar,
  parseSides,
  rawScalar,
  rawSides,
  serializeScalar,
  serializeSides,
  unitOf,
  type Device,
  type RespScalar,
  type RespSides,
  type Sides,
  type Unit,
} from "@/lib/responsive";

/* ── Device context ──────────────────────────────────────────────────────── */

const DeviceCtx = createContext<{ device: Device; setDevice: (d: Device) => void }>({
  device: "d",
  setDevice: () => {},
});

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Device>("d");
  const value = useMemo(() => ({ device, setDevice }), [device]);
  return <DeviceCtx.Provider value={value}>{children}</DeviceCtx.Provider>;
}

export const useDevice = () => useContext(DeviceCtx);

const DEVICE_ICON: Record<Device, typeof Monitor> = {
  d: Monitor,
  t: Tablet,
  m: Smartphone,
};

/** The three-way switch. Sits in the panel header, drives every control below. */
export function DeviceToggle({ compact = false }: { compact?: boolean }) {
  const { device, setDevice } = useDevice();
  return (
    <div className="flex overflow-hidden rounded border border-slate-200">
      {DEVICES.map((d) => {
        const Icon = DEVICE_ICON[d.id];
        return (
          <button
            key={d.id}
            type="button"
            title={d.title}
            aria-label={d.title}
            aria-pressed={device === d.id}
            onClick={() => setDevice(d.id)}
            className={`flex items-center justify-center transition-colors ${
              compact ? "h-5 w-6" : "h-6 w-7"
            } ${
              device === d.id
                ? "bg-sky-500 text-white"
                : "bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            <Icon size={compact ? 10 : 12} />
          </button>
        );
      })}
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

const inputCls =
  "w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-sky-400 focus:outline-none";

function UnitSelect({
  value,
  units,
  onChange,
}: {
  value: Unit;
  units: readonly Unit[];
  onChange: (u: Unit) => void;
}) {
  if (units.length <= 1) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Unit)}
      title="Unit"
      className="h-[26px] shrink-0 rounded border border-slate-200 bg-slate-50 px-1 text-[10px] font-semibold uppercase text-slate-500 focus:border-sky-400 focus:outline-none"
    >
      {units.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
}

function ResetButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Reset to inherit"
      className={`flex h-4 w-4 items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 ${
        show ? "" : "pointer-events-none opacity-0"
      }`}
    >
      <RotateCcw size={10} />
    </button>
  );
}

/**
 * Control header: label on the left, device toggle and reset on the right.
 * The device toggle is repeated per control the way Kadence does it, so you can
 * see at a glance which controls have a value on the device you're editing.
 */
function ControlHead({
  label,
  hasValue,
  onReset,
  showDevice = true,
}: {
  label: string;
  hasValue: boolean;
  onReset: () => void;
  showDevice?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <span className="ml-auto flex items-center gap-1.5">
        <ResetButton show={hasValue} onClick={onReset} />
        {showDevice && <DeviceToggle compact />}
      </span>
    </div>
  );
}

/* ── Responsive slider ───────────────────────────────────────────────────── */

/**
 * Slider + number + unit, per device. An empty field shows the inherited value
 * as its placeholder, so "unset on mobile" still tells you what mobile renders.
 */
export function ResponsiveSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
  step = 1,
  units = LENGTH_UNITS,
  showDevice = true,
}: {
  label: string;
  /** Serialised RespScalar. */
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  step?: number;
  units?: readonly Unit[];
  showDevice?: boolean;
}) {
  const { device } = useDevice();
  const parsed = parseScalar(value);
  const raw = rawScalar(parsed, device);
  const inherited = effectiveScalar(parsed, device);
  const unit = unitOf(parsed);

  const write = useCallback(
    (patch: Partial<RespScalar>) => onChange(serializeScalar({ ...parsed, ...patch })),
    [onChange, parsed]
  );

  const sliderValue = Number.parseFloat(raw || inherited);

  return (
    <div className="space-y-1.5">
      <ControlHead
        label={label}
        hasValue={raw !== ""}
        onReset={() => write({ [device]: "" } as Partial<RespScalar>)}
        showDevice={showDevice}
      />
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(sliderValue) ? sliderValue : min}
          onChange={(e) => write({ [device]: e.target.value } as Partial<RespScalar>)}
          className="min-w-0 flex-1 accent-sky-600"
        />
        <input
          type="number"
          className={`${inputCls} w-14 shrink-0 text-center`}
          value={raw}
          placeholder={inherited || "—"}
          onChange={(e) => write({ [device]: e.target.value } as Partial<RespScalar>)}
        />
        <UnitSelect value={unit} units={units} onChange={(u) => write({ u })} />
      </div>
    </div>
  );
}

/* ── Responsive four-sided box ───────────────────────────────────────────── */

const SIDE_LABELS = ["Top", "Right", "Bottom", "Left"];

/**
 * The classic padding/margin control: four inputs, a link toggle that edits them
 * together, a unit selector and a per-device value. This is the single biggest
 * thing the old `SideBox` was missing — it had no left/right, no link, no unit
 * and no device.
 */
export function ResponsiveBox({
  label,
  value,
  onChange,
  min = -200,
  max = 400,
  units = LENGTH_UNITS,
  showDevice = true,
}: {
  label: string;
  /** Serialised RespSides. */
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  units?: readonly Unit[];
  showDevice?: boolean;
}) {
  const { device } = useDevice();
  const parsed = parseSides(value);
  const raw = rawSides(parsed, device);
  const inherited = effectiveSides(parsed, device);
  const unit = unitOf(parsed);
  const linked = parsed.lk === 1;

  const write = useCallback(
    (patch: Partial<RespSides>) => onChange(serializeSides({ ...parsed, ...patch })),
    [onChange, parsed]
  );

  const setSide = (index: number, next: string) => {
    const sides: Sides = linked
      ? [next, next, next, next]
      : (raw.map((v, i) => (i === index ? next : v)) as Sides);
    write({ [device]: sides } as Partial<RespSides>);
  };

  const hasValue = raw.some((v) => v !== "");

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </label>
        <span className="ml-auto flex items-center gap-1.5">
          <ResetButton show={hasValue} onClick={() => write({ [device]: EMPTY_SIDES } as Partial<RespSides>)} />
          <button
            type="button"
            title={linked ? "Sides linked — click to edit individually" : "Link all four sides"}
            aria-pressed={linked}
            onClick={() => {
              // Linking adopts whichever side already has a value, so the jump
              // to a single number is never a surprise reset to zero.
              if (!linked) {
                const seed = raw.find((v) => v !== "") ?? "";
                write({ lk: 1, [device]: [seed, seed, seed, seed] as Sides } as Partial<RespSides>);
              } else {
                write({ lk: 0 });
              }
            }}
            className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
              linked ? "text-sky-600" : "text-slate-300 hover:text-slate-600"
            }`}
          >
            {linked ? <Link2 size={11} /> : <Unlink2 size={11} />}
          </button>
          <UnitSelect value={unit} units={units} onChange={(u) => write({ u })} />
          {showDevice && <DeviceToggle compact />}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {SIDE_LABELS.map((side, i) => (
          <label key={side} className="space-y-1">
            <input
              type="number"
              min={min}
              max={max}
              className={`${inputCls} text-center`}
              value={raw[i]}
              placeholder={inherited[i] || "—"}
              onChange={(e) => setSide(i, e.target.value)}
            />
            <span className="block text-center text-[9px] uppercase tracking-wide text-slate-400">
              {side.slice(0, 1)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ── Colour ──────────────────────────────────────────────────────────────── */

/** Theme-ish defaults, so the common picks are one click rather than a colour wheel. */
/**
 * The shared palette, two rows of nine: neutrals on top, colour underneath.
 *
 * One list rather than a per-control one, so the same circle means the same
 * colour everywhere in the admin and a site's palette stays coherent by default.
 */
export const COLOR_SWATCHES = [
  "#000000", "#1e293b", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0", "#f8fafc", "#ffffff",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "transparent",
];

/** The checkerboard that says "no colour" — a flat swatch cannot. */
const CHECKER = {
  backgroundImage:
    "linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%),linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0,4px 4px",
};

/**
 * Round swatches, the way every page builder draws a palette.
 *
 * Circles rather than squares on purpose: a swatch is a value, not a region,
 * and the round form reads as "pick one of these" instead of "here is a block
 * of colour" — which is what the surrounding inputs already look like.
 */
export function ColorSwatches({
  value,
  onChange,
  columns = 9,
}: {
  value: string;
  onChange: (v: string) => void;
  columns?: number;
}) {
  const current = (value || "").toLowerCase();
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
    >
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          title={c === "transparent" ? "Transparent" : c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={`aspect-square w-full rounded-full border transition-transform hover:scale-110 ${
            current === c
              ? "border-sky-500 ring-2 ring-sky-300"
              : c === "#ffffff" || c === "#f8fafc"
                ? "border-slate-300"
                : "border-slate-200"
          }`}
          style={c === "transparent" ? CHECKER : { backgroundColor: c }}
        />
      ))}
    </div>
  );
}


/* ── Panel structure ─────────────────────────────────────────────────────── */

/** Collapsible group. Sections default closed so a long panel opens scannable. */
export function PanelSection({
  label,
  children,
  defaultOpen = false,
  badge,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
      >
        <span className="text-[11px] font-semibold text-slate-700">{label}</span>
        {badge && (
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-600">
            {badge}
          </span>
        )}
        <span className={`ml-auto text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>
          ›
        </span>
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}
