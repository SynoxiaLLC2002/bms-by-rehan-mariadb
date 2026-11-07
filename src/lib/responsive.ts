// Responsive, unit-aware values — the model behind every length control.
//
// A Kadence-grade control has four things ours didn't: a per-device value, a
// unit, a link toggle for four-sided values, and a reset. All four live here so
// the controls stay dumb and the CSS emitter stays the single source of truth
// for how a breakpoint inherits.
//
// Values serialise to one compact JSON string, because BlockNote block props
// are flat strings — a dozen schema props per spacing control is not workable.

export type Device = "d" | "t" | "m";

export const DEVICES: { id: Device; title: string }[] = [
  { id: "d", title: "Desktop" },
  { id: "t", title: "Tablet" },
  { id: "m", title: "Mobile" },
];

/** Widest-first, matching the fallback chain: mobile inherits tablet inherits desktop. */
export const DEVICE_ORDER: Device[] = ["d", "t", "m"];

export type Unit = "px" | "em" | "rem" | "%" | "vw" | "vh";

export const LENGTH_UNITS: Unit[] = ["px", "em", "rem", "%", "vw", "vh"];
export const SPACING_UNITS: Unit[] = ["px", "em", "rem", "%"];

/** Top, right, bottom, left — CSS order, so the control reads like the shorthand. */
export type Sides = [string, string, string, string];

export const EMPTY_SIDES: Sides = ["", "", "", ""];

export interface RespScalar {
  d?: string;
  t?: string;
  m?: string;
  u?: Unit;
}

export interface RespSides {
  d?: Sides;
  t?: Sides;
  m?: Sides;
  u?: Unit;
  /** 1 while the four sides are edited together. */
  lk?: 0 | 1;
}

/* ── Parsing ─────────────────────────────────────────────────────────────── */

export function parseScalar(raw: unknown): RespScalar {
  if (typeof raw !== "string" || !raw.trim()) return {};
  // A bare number is a pre-responsive value: treat it as the desktop value.
  if (/^-?[\d.]+$/.test(raw.trim())) return { d: raw.trim() };
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as RespScalar) : {};
  } catch {
    return {};
  }
}

export function parseSides(raw: unknown): RespSides {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return v as RespSides;
  } catch {
    return {};
  }
}

/* ── Serialising ─────────────────────────────────────────────────────────── */

const blankSides = (s?: Sides) => !s || s.every((x) => x === "");

/** Drops empty devices so "unset" is unambiguous and the stored string stays small. */
export function serializeScalar(v: RespScalar): string {
  const out: RespScalar = {};
  for (const d of DEVICE_ORDER) if (v[d] && v[d] !== "") out[d] = v[d];
  if (Object.keys(out).length === 0) return "";
  if (v.u && v.u !== "px") out.u = v.u;
  return JSON.stringify(out);
}

export function serializeSides(v: RespSides): string {
  const out: RespSides = {};
  for (const d of DEVICE_ORDER) if (!blankSides(v[d])) out[d] = v[d];
  if (Object.keys(out).length === 0) return "";
  if (v.u && v.u !== "px") out.u = v.u;
  if (v.lk) out.lk = 1;
  return JSON.stringify(out);
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

export const unitOf = (v: RespScalar | RespSides): Unit => v.u ?? "px";

/** The value stored *for this device only* — empty means "inherits". */
export function rawScalar(v: RespScalar, device: Device): string {
  return v[device] ?? "";
}

export function rawSides(v: RespSides, device: Device): Sides {
  return v[device] ?? EMPTY_SIDES;
}

/**
 * What this device actually renders, after inheritance. The controls show this
 * as placeholder text so an empty tablet field still tells you what you'll get.
 */
export function effectiveScalar(v: RespScalar, device: Device): string {
  const chain = DEVICE_ORDER.slice(0, DEVICE_ORDER.indexOf(device) + 1).reverse();
  for (const d of chain) if (v[d]) return v[d] as string;
  return "";
}

/**
 * Four side values as the shortest CSS shorthand that means the same:
 * `1px 1px 1px 1px` → `1px`, `10px 0 10px 0` → `10px 0`. Pure byte saving —
 * every four-sided value on a page went out in full, and a page with
 * thirty styled blocks carried a few hundred bytes of repeated zeros.
 */
export function shorthand(parts: readonly string[]): string {
  const [t, r, b, l] = parts;
  if (parts.length !== 4) return parts.join(" ");
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

export function effectiveSides(v: RespSides, device: Device): Sides {
  const chain = DEVICE_ORDER.slice(0, DEVICE_ORDER.indexOf(device) + 1).reverse();
  const out: Sides = ["", "", "", ""];
  for (let i = 0; i < 4; i++) {
    for (const d of chain) {
      const s = v[d];
      if (s && s[i] !== "") {
        out[i] = s[i];
        break;
      }
    }
  }
  return out;
}

/* ── CSS ─────────────────────────────────────────────────────────────────── */

const SIDE_SUFFIX = ["t", "r", "b", "l"] as const;
const DEVICE_SUFFIX: Record<Device, string> = { d: "", t: "-t", m: "-m" };

const withUnit = (n: string, u: Unit) => {
  const t = n.trim();
  if (t === "") return undefined;
  // Already carries a unit or is a keyword — pass it through untouched.
  if (!/^-?[\d.]+$/.test(t)) return t;
  return `${parseFloat(t)}${u}`;
};

/**
 * Custom properties for a scalar, e.g. respScalarVars("mh", v) ->
 * { "--mh": "420px", "--mh-m": "260px" }.
 */
export function respScalarVars(name: string, v: RespScalar): Record<string, string> {
  const u = unitOf(v);
  const out: Record<string, string> = {};
  for (const d of DEVICE_ORDER) {
    const val = withUnit(v[d] ?? "", u);
    if (val !== undefined) out[`--${name}${DEVICE_SUFFIX[d]}`] = val;
  }
  return out;
}

/** Custom properties for a four-sided value: --pad-t, --pad-r-m, and so on. */
export function respSidesVars(name: string, v: RespSides): Record<string, string> {
  const u = unitOf(v);
  const out: Record<string, string> = {};
  for (const d of DEVICE_ORDER) {
    const sides = v[d];
    if (!sides) continue;
    sides.forEach((raw, i) => {
      const val = withUnit(raw, u);
      if (val !== undefined) out[`--${name}-${SIDE_SUFFIX[i]}${DEVICE_SUFFIX[d]}`] = val;
    });
  }
  return out;
}

/**
 * The `var()` fallback chain for one device, so mobile falls back to tablet and
 * tablet to desktop without the caller repeating the nesting.
 */
export function respVar(name: string, device: Device, fallback = "0"): string {
  if (device === "d") return `var(--${name},${fallback})`;
  if (device === "t") return `var(--${name}-t,var(--${name},${fallback}))`;
  return `var(--${name}-m,var(--${name}-t,var(--${name},${fallback})))`;
}

export function respSideVar(name: string, side: 0 | 1 | 2 | 3, device: Device, fallback = "0"): string {
  return respVar(`${name}-${SIDE_SUFFIX[side]}`, device, fallback);
}

/** Media queries wrapping tablet and mobile rules — matches the existing block CSS. */
export const MQ_TABLET = "@media(max-width:1024px)";
export const MQ_MOBILE = "@media(max-width:767px)";

/**
 * Builds the three-breakpoint rule set for a shorthand property driven by a
 * four-sided responsive value, e.g. blockSidesRule(".bx", "padding", "bx-pad").
 */
export function blockSidesRule(selector: string, property: string, name: string): string {
  const decl = (d: Device) =>
    `${property}:${respSideVar(name, 0, d)} ${respSideVar(name, 1, d)} ${respSideVar(name, 2, d)} ${respSideVar(name, 3, d)}`;
  return [
    `${selector}{${decl("d")}}`,
    `${MQ_TABLET}{${selector}{${decl("t")}}}`,
    `${MQ_MOBILE}{${selector}{${decl("m")}}}`,
  ].join("");
}
