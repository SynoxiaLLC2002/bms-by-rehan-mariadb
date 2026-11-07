// What a non-administrator may put on a public page.
//
// The document routes already refuse `scriptHead`, `scriptBodyEnd` and
// `customCss` from anyone but an administrator: writing a post is one power,
// running script in every visitor's browser is another. But the HTML Embed
// block carries raw markup *inside* the content JSON, and content is the one
// field every role writes — so an editor or an author could paste
// `<script>` into an embed and have it served to every visitor, which is the
// exact thing the gate on the other three fields exists to prevent.
//
// This is the same rule WordPress applies through `unfiltered_html`: authors
// and editors keep their embeds (an iframe, a form, a widget), but anything
// that executes is dropped before the document is stored. An administrator's
// content is stored untouched.
//
// Applied on the way in, not on render: the renderer serves what is stored,
// and a document saved by an administrator must keep working exactly as
// written.

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*\/?>/gi;
/**
 * What may come before an attribute name. Not only whitespace: the HTML
 * tokenizer also starts a new attribute after a `/` (`<img/onerror=…>`) and
 * straight after a closing quote (`<img src="x"onerror=…>`). These rules
 * used to require whitespace, so both forms kept a live handler — or a
 * `javascript:` src, as in `<iframe/src="javascript:…">`, which runs with no
 * click — past the filter. The SVG sanitiser had the same hole.
 */
const ATTR_START = String.raw`(?<=[\s/"'])`;
/** `onclick="…"`, `onload='…'`, `onerror=…` — any inline handler. */
const ON_ATTR = new RegExp(String.raw`${ATTR_START}on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)`, "gi");
/**
 * `<base>` and `<meta http-equiv>` redirect; `<object>`/`<embed>`/`<applet>`
 * load plugins; `<animate>`/`<set>` are the SVG way to write
 * `attributeName="href" values="javascript:…"`, which browsers do run.
 */
const DANGEROUS_TAG = /<\/?(?:base|meta|object|embed|applet|animate|set|handler)\b[^>]*>/gi;
/** An `<iframe srcdoc>` is a whole HTML document in an attribute. */
const SRCDOC = new RegExp(String.raw`${ATTR_START}srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)`, "gi");
/** Anything whose value a browser resolves as a URL. */
const URL_ATTR = new RegExp(
  String.raw`(${ATTR_START}(?:href|src|action|formaction|xlink:href|ping|data)\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)`,
  "gi"
);
const STYLE_ATTR = new RegExp(String.raw`(${ATTR_START}style\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)`, "gi");

/** Schemes that execute. `data:` only matters when it carries a document. */
const EXECUTABLE_SCHEME = /^[\s\u0000-\u001f]*(?:javascript|vbscript|livescript|mocha)\s*:|^[\s\u0000-\u001f]*data\s*:\s*text\/html/i;
/** CSS that can execute, or bind behaviour to an element. */
const EXECUTABLE_CSS = /javascript\s*:|vbscript\s*:|expression\s*\(|-moz-binding|behaviou?r\s*:/i;

/**
 * A URL attribute as the *browser* will resolve it.
 *
 * Two normalisations happen before the scheme is ever read, and a sanitiser
 * that skips either one lets the payload through:
 *   • HTML entities are decoded, so `href="java&#115;cript:…"` is
 *     `href="javascript:…"` by the time it matters;
 *   • the URL parser then strips every tab, CR and LF from the whole string,
 *     so `java&Tab;script:` is `javascript:` too — the separator does not have
 *     to be at the front to be ignored.
 */
function resolvedUrl(value: string): string {
  return decodeEntities(value).replace(/[\t\n\r]/g, "");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&(tab|newline|colon|lpar|rpar|sol|excl);?/gi, (_m, name) => {
      const n = String(name).toLowerCase();
      return n === "tab" ? "\t" : n === "newline" ? "\n" : n === "colon" ? ":" : n === "lpar" ? "(" : n === "rpar" ? ")" : n === "sol" ? "/" : "!";
    });
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/** The value without its quotes, and the quote character used. */
function unquote(raw: string): string {
  const q = raw[0];
  return q === '"' || q === "'" ? raw.slice(1, -1) : raw;
}

function blankLike(raw: string): string {
  const q = raw[0];
  return q === '"' || q === "'" ? `${q}${q}` : '""';
}

/** One cleaning pass. `stripActiveHtml` repeats it — see there for why. */
function onePass(html: string): string {
  return html
    .replace(SCRIPT_TAG, "")
    .replace(DANGEROUS_TAG, "")
    .replace(SRCDOC, "")
    .replace(ON_ATTR, "")
    .replace(URL_ATTR, (whole, head: string, value: string) =>
      EXECUTABLE_SCHEME.test(resolvedUrl(unquote(value))) ? `${head}${blankLike(value)}` : whole
    )
    .replace(STYLE_ATTR, (whole, _head: string, value: string) =>
      EXECUTABLE_CSS.test(resolvedUrl(unquote(value))) ? "" : whole
    );
}

/**
 * Raw markup with everything that executes removed.
 *
 * Repeated until it stops changing, which is the whole point: a single pass
 * over `<scr<script></script>ipt>alert(1)</scr<script></script>ipt>` removes
 * the inner `<script></script>` pairs and leaves the outer fragments to close
 * up into a working `<script>alert(1)</script>`. That is a stored XSS an
 * author could have pasted into an HTML Embed and served to every visitor —
 * including an administrator, whose session it would then be running in.
 *
 * The cap stops a pathological input from looping; markup that still changes
 * after eight passes is not markup anyone wrote by hand, so it is dropped.
 */
export function stripActiveHtml(html: string): string {
  let out = html;
  for (let i = 0; i < 8; i++) {
    const next = onePass(out);
    if (next === out) return out;
    out = next;
  }
  return onePass(out) === out ? out : "";
}

function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!(t.startsWith("[") || t.startsWith("{"))) return value;
  try {
    return JSON.parse(t);
  } catch {
    return value;
  }
}

/**
 * Walks a block tree — including the JSON-string props that Row Layout
 * columns, Accordion panes and the rest keep their nested blocks in — and
 * returns a copy with every HTML Embed stripped of active content. `changed`
 * is set when anything was actually removed, so a caller can tell the author.
 */
function walk(value: unknown, depth: number, state: { changed: boolean }): unknown {
  if (depth > 16) return value;

  if (Array.isArray(value)) {
    let touched = false;
    const out = value.map((v) => {
      const next = walk(v, depth + 1, state);
      if (next !== v) touched = true;
      return next;
    });
    return touched ? out : value;
  }

  if (typeof value === "string") {
    // A prop holding serialised blocks (Row Layout `cols`, etc.).
    const inner = parsed(value);
    if (inner === value) return value;
    const walked = walk(inner, depth + 1, state);
    return walked === inner ? value : JSON.stringify(walked);
  }

  if (!value || typeof value !== "object") return value;

  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let touched = false;
  for (const [k, v] of Object.entries(o)) {
    let next = v;
    if (k === "props" && o.type === "htmlEmbed" && v && typeof v === "object") {
      const props = v as Record<string, unknown>;
      if (typeof props.html === "string") {
        const clean = stripActiveHtml(props.html);
        if (clean !== props.html) {
          next = { ...props, html: clean };
          state.changed = true;
        }
      }
    } else {
      next = walk(v, depth + 1, state);
    }
    if (next !== v) touched = true;
    out[k] = next;
  }
  return touched ? out : value;
}

/**
 * Drop `__proto__` / `constructor` / `prototype` keys from stored JSON.
 *
 * Block props are the author's JSON. The editor loads that JSON into TipTap,
 * whose mergeAttributes is the moderate prototype-pollution advisory: a
 * crafted key would run in the admin's browser, not on visitors. Stripping
 * here is cheap and closes the save path for every role.
 *
 * `state.changed` is set only when a key is actually removed. It cannot be
 * inferred by comparing the result with the input: this rebuilds every object
 * it walks, so `safe !== content` is true for *all* object content whether or
 * not anything was dropped — which is what it used to report.
 */
function stripPrototypeKeys(value: unknown, state: { changed: boolean }, depth = 0): unknown {
  if (depth > 30 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => stripPrototypeKeys(v, state, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") {
      state.changed = true;
      continue;
    }
    out[k] = stripPrototypeKeys(v, state, depth + 1);
  }
  return out;
}

/**
 * The content a document may be saved with, given who is saving it.
 *
 * Prototype keys go for everyone. Beyond that — administrators: unchanged.
 * Anyone else: HTML Embed blocks lose their scripts, inline handlers and
 * `javascript:` URLs. Non-array content passes through otherwise untouched —
 * the route validates the shape itself.
 *
 * `stripped` means something was genuinely removed. No caller reads it today,
 * but it is the value a "some of your content was removed" notice would be
 * built on, and a flag that is always true is worse than no flag at all.
 */
export function contentForRole(content: unknown, isAdminUser: boolean): { content: unknown; stripped: boolean } {
  const state = { changed: false };
  const safe = stripPrototypeKeys(content, state);
  if (isAdminUser || !Array.isArray(safe)) return { content: safe, stripped: state.changed };
  const cleaned = walk(safe, 0, state);
  return { content: cleaned, stripped: state.changed };
}
