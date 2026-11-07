// Conditional Display — per-block rules deciding whether a block renders.
//
// Evaluated on the server, in the same pass that already filters rows by viewer
// login state. That matters for more than tidiness: a block hidden in the
// browser is still in the HTML, so a "members only" block done client-side is
// readable by anyone who opens View Source, and a search engine indexes it. The
// only honest place to drop a block is before it is serialised.
//
// Rules live in the block's `bx` blob under `cd`, so every block that already
// carries a box gets them without a schema change.

export type ConditionKind = "login" | "role" | "after" | "before";

export interface DisplayCondition {
  /** Which fact about the viewer or the clock this rule tests. */
  k: ConditionKind;
  /** The value compared against — a role name, or an ISO date. */
  v?: string;
}

export interface DisplayRules {
  /** "show" renders only when the rules pass; "hide" is the inverse. */
  mode: "show" | "hide";
  /** All rules must pass ("and") or any one of them ("or"). */
  match: "and" | "or";
  rules: DisplayCondition[];
}

export interface ViewerContext {
  loggedIn: boolean;
  role?: string;
  /** Injected rather than read from the clock, so a render is reproducible. */
  now: Date;
  /**
   * The site's timezone (Settings -> Timezone), so "show after 1 Oct 09:00"
   * means nine in the morning where the site is, not where the server is.
   */
  timeZone?: string;
}

export const CONDITION_KINDS: { id: ConditionKind; label: string; hint: string }[] = [
  { id: "login", label: "Logged in", hint: "The visitor is signed in" },
  { id: "role", label: "Has role", hint: "The visitor's role matches" },
  { id: "after", label: "On or after", hint: "The current date has reached this" },
  { id: "before", label: "Before", hint: "The current date is still under this" },
];

export function parseConditions(raw: unknown): DisplayRules | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || !Array.isArray(v.rules) || v.rules.length === 0) return null;
    return {
      mode: v.mode === "hide" ? "hide" : "show",
      match: v.match === "or" ? "or" : "and",
      rules: v.rules.filter((r: unknown): r is DisplayCondition => {
        const rule = r as DisplayCondition;
        return !!rule && typeof rule.k === "string";
      }),
    };
  } catch {
    return null;
  }
}

export function serializeConditions(r: DisplayRules | null): string {
  if (!r || r.rules.length === 0) return "";
  return JSON.stringify(r);
}

/**
 * An author's date, read in the site's timezone.
 *
 * `Date.parse("2026-10-01T09:00")` — no offset — is interpreted in whatever
 * timezone the SERVER runs in. A shared host is usually UTC, so an author in
 * Karachi scheduling a banner for 09:00 got it five hours early, and the
 * setting's own Timezone field had no effect on it.
 *
 * A value that carries its own offset or a trailing Z is already unambiguous
 * and is passed straight through. Everything else is treated as wall-clock
 * time in `timeZone`: format the naive instant in that zone, measure how far
 * the formatting moved it, and subtract that offset. This handles daylight
 * saving correctly because the offset is measured at the instant in question,
 * not taken as a constant.
 */
export function parseInZone(value: string | undefined, timeZone?: string): number {
  if (!value) return NaN;
  if (!timeZone || /[Zz]$|[+-]\d{2}:?\d{2}$/.test(value.trim())) return Date.parse(value);

  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return Date.parse(value);
  const [, y, mo, d, h = "0", mi = "0", sec = "0"] = m;
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(naive));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    // `hour` can come back as 24 for midnight under hour12:false.
    const asSeen = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return naive - (asSeen - naive);
  } catch {
    // Unknown timezone: better the server's reading than nothing at all.
    return Date.parse(value);
  }
}

function testOne(rule: DisplayCondition, ctx: ViewerContext): boolean {
  switch (rule.k) {
    case "login":
      return ctx.loggedIn;
    case "role":
      // An empty role means "any role at all", which still needs a session.
      return rule.v ? ctx.role === rule.v : !!ctx.role;
    case "after": {
      const at = parseInZone(rule.v, ctx.timeZone);
      return Number.isNaN(at) ? true : ctx.now.getTime() >= at;
    }
    case "before": {
      const at = parseInZone(rule.v, ctx.timeZone);
      return Number.isNaN(at) ? true : ctx.now.getTime() < at;
    }
    default:
      // An unknown rule must not silently hide content.
      return true;
  }
}

/** Whether a block with these rules should render for this viewer. */
export function shouldDisplay(rules: DisplayRules | null, ctx: ViewerContext): boolean {
  if (!rules || rules.rules.length === 0) return true;
  const passed =
    rules.match === "or"
      ? rules.rules.some((r) => testOne(r, ctx))
      : rules.rules.every((r) => testOne(r, ctx));
  return rules.mode === "hide" ? !passed : passed;
}

/**
 * Whether any block in the tree uses conditions.
 *
 * Reading the session opts a page out of static rendering, so pages that never
 * use a condition must not pay for one.
 */
export function usesConditions(blocks: any[]): boolean {
  for (const b of blocks ?? []) {
    const raw = b?.props?.bx;
    if (typeof raw === "string" && raw.includes('"cd"')) return true;
    if (typeof b?.props?.cols === "string" && b.props.cols.includes('"cd"')) return true;
    // Accordion panes carry their own rules inside the block's `items` JSON.
    if (typeof b?.props?.items === "string" && b.props.items.includes('"cd"')) return true;
    if (Array.isArray(b?.children) && usesConditions(b.children)) return true;
  }
  return false;
}

/**
 * Every "on or after" / "before" instant written anywhere in a document's
 * stored JSON, as epoch milliseconds.
 *
 * The rules live inside each block's `bx` string, so in the stored text they
 * are JSON inside JSON, quotes escaped once or several times depending on how
 * deep the block sits (a Row Layout column adds a level). Stripping the
 * backslashes first makes one pattern match all of them.
 *
 * Used by the publish cron: a page is cached for up to a day, so a block set
 * to appear at 09:00 appeared whenever that cache happened to expire. The cron
 * now refreshes a page when one of its boundaries has just passed.
 */
export function conditionBoundaries(storedJson: string, timeZone?: string): number[] {
  const text = storedJson.split(String.fromCharCode(92)).join("");
  const out: number[] = [];
  const re = /"k"\s*:\s*"(after|before)"\s*,\s*"v"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = parseInZone(m[2], timeZone);
    if (!Number.isNaN(at)) out.push(at);
  }
  return out;
}
