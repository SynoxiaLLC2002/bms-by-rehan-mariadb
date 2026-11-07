// Static styles for the blocks whose layout needs real CSS rather than inline
// styles — responsive grids, pseudo-elements and states.
//
// Kept out of siteCss's settings-driven builders because none of this depends
// on a setting: it is the same on every site, so it is a plain constant string
// the minifier can hoist.

import { TEXT_ADVANCED_CSS } from "./textAdvanced";

/**
 * The Advanced Button's base look.
 *
 * Its own builder rather than an inline chunk of `blockCss` because the editor
 * canvas needs it too: the canvas renders the real `ButtonGroup` but never
 * loads the site stylesheet, so without this a button there would be unstyled
 * text. `ButtonGroup` emits it beside the block's own rules when previewing.
 *
 * Doubled class on the base rule on purpose: the theme's `.btn` / `.btn-2` are
 * emitted *after* this in `allSiteCss`, so at equal specificity they would win
 * and a themed button would go back to inline-block — which breaks icon
 * alignment and full width. `.bmsbtn.bmsbtn` is one point higher and settles it
 * without `!important`.
 */
export function buttonBaseCss(): string {
  return [
    `.bmsbtns{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:1.25rem 0}`,
    `.bmsbtn.bmsbtn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;box-sizing:border-box;text-decoration:none;line-height:1.2;cursor:pointer;font:inherit;text-align:center;transition:background .2s,color .2s,border-color .2s,box-shadow .2s,transform .2s}`,
    // The two theme-independent looks. Both are overridable by every control in
    // the panel; they only decide what an untouched button looks like.
    `.bmsbtn.is-fill{background:var(--color-primary,#0ea5e9);color:var(--color-primary-fg,#fff);border:0;border-radius:8px}`,
    `.bmsbtn.is-fill:not(.has-hv):hover{filter:brightness(.92)}`,
    `.bmsbtn.is-outline{background:transparent;color:var(--color-primary,#0ea5e9);border:2px solid currentColor;border-radius:8px}`,
    `.bmsbtn.is-outline:not(.has-hv):hover{background:var(--color-primary,#0ea5e9);color:var(--color-primary-fg,#fff)}`,
    // Sizes only set what the author has not. A button that carries its own
    // padding or font size gets a rule of higher specificity from the block's
    // own stylesheet, so these are the floor rather than a fight.
    `.bmsbtn.is-sm{padding:6px 12px;font-size:.8125rem}`,
    `.bmsbtn.is-md{padding:10px 18px;font-size:.9375rem}`,
    `.bmsbtn.is-lg{padding:14px 26px;font-size:1.0625rem}`,
    `.bmsbtn.is-xl{padding:18px 34px;font-size:1.1875rem}`,
    `.bmsbtn.is-full{width:100%}`,
    `.bmsbtn.is-icon-only{aspect-ratio:1;padding-inline:0;min-width:2.75em}`,
    // A border set in the panel needs a style and a colour to show at all — the
    // width alone renders nothing.
    `.bmsbtn.has-bd{border-style:solid;border-color:currentColor}`,
    `.bmsbtn-ico{display:inline-flex;align-items:center;justify-content:center;line-height:1;flex:none}`,
    `.bmsbtn-label{display:inline-block}`,
    // Reveal on hover — animating max-width rather than width so the icon needs
    // no measured size, and the collapsed state costs no layout.
    `.bmsbtn.is-reveal .bmsbtn-ico{max-width:0;opacity:0;overflow:hidden;transform:translateX(-.2em);transition:max-width .25s,opacity .25s,transform .25s}`,
    `.bmsbtn.is-reveal:hover .bmsbtn-ico,.bmsbtn.is-reveal:focus-visible .bmsbtn-ico{max-width:2.5em;opacity:1;transform:none}`,
    `@media(prefers-reduced-motion:reduce){.bmsbtn.bmsbtn,.bmsbtn.is-reveal .bmsbtn-ico{transition:none}}`
  ].join("");
}

/**
 * Stand-ins for the theme's own button colours, for the editor canvas only.
 *
 * `.btn` and `.btn-2` are built from Customizer settings that the admin app
 * does not load, so a Theme Base button would otherwise preview as bare text.
 * Single-class selectors, and emitted before the block's own rules, so anything
 * the author sets still wins on equal specificity.
 *
 * Never emitted on the published page — there the real theme rules exist.
 */
export function buttonEditorCss(): string {
  return [
    `.btn{background:var(--color-primary,#0ea5e9);color:var(--color-primary-fg,#fff);border-radius:8px;font-weight:600}`,
    `.btn-2{background:var(--color-secondary,#64748b);color:#fff;border-radius:8px;font-weight:600}`,
  ].join("");
}

/**
 * The Advanced Icon List's base look.
 *
 * Its own builder for the same reason the button's is: the editor canvas
 * renders the real component but never loads the site stylesheet, so without
 * this an icon list there would be an unstyled stack of text.
 *
 * Everything here is a floor the panel overrides — the block's own rules are
 * emitted after these and at higher specificity (two classes vs one).
 */
export function iconListBaseCss(): string {
  return [
    // Grid rather than flex: "List Columns" is the whole point of the block,
    // and a one-column grid behaves exactly like a stacked list.
    `.bmsil{display:grid;grid-template-columns:1fr;row-gap:5px;column-gap:0;margin:1rem 0;padding:0;list-style:none}`,
    `.bmsil .bmsil-item{display:flex;align-items:flex-start;gap:10px;margin:0}`,
    `.bmsil .bmsil-ico{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:1;color:var(--color-primary,#0ea5e9)}`,
    `.bmsil .bmsil-txt{min-width:0}`,
    // An inline `[word](url)` link. Underlined by default because it sits
    // inside a sentence -- without it, a linked word in a list is invisible
    // until hovered. Colour is inherited so the list's own Link Colour, if
    // set, still governs.
    `.bmsil .bmsil-link{color:inherit;text-decoration:underline;text-underline-offset:.15em}`,
    `.bmsil .bmsil-link:hover,.bmsil .bmsil-link:focus-visible{text-decoration-thickness:2px}`,
    // The shaped treatments. `em` so the frame tracks Icon Size instead of
    // needing a second control to stay in proportion.
    `.bmsil.is-stacked .bmsil-ico,.bmsil.is-outline .bmsil-ico{border-radius:999px;width:2em;height:2em}`,
    `.bmsil.is-square .bmsil-ico,.bmsil.is-squareOutline .bmsil-ico{border-radius:.25em;width:2em;height:2em}`,
    `.bmsil.is-outline .bmsil-ico,.bmsil.is-squareOutline .bmsil-ico{background:transparent}`,
    // The same treatments again, as a modifier on the icon itself — that is how
    // a single item overrides the list's choice, since the list class cannot
    // vary per row.
    `.bmsil .bmsil-ico.is-stacked,.bmsil .bmsil-ico.is-outline{border-radius:999px;width:2em;height:2em}`,
    `.bmsil .bmsil-ico.is-square,.bmsil .bmsil-ico.is-squareOutline{border-radius:.25em;width:2em;height:2em}`,
    `.bmsil .bmsil-ico.is-stacked,.bmsil .bmsil-ico.is-square{background:var(--color-primary,#0ea5e9);color:var(--color-primary-fg,#fff)}`,
    `.bmsil .bmsil-ico.is-outline,.bmsil .bmsil-ico.is-squareOutline{background:transparent;border:2px solid currentColor}`,
    // A linked item still has to lay its icon out beside its label, so the
    // anchor takes over the row's flex box rather than sitting inside it.
    `.bmsil .bmsil-link{display:flex;align-items:inherit;gap:inherit;min-width:0}`,
    // A link inside an item should not look different from the label unless the
    // author says so.
    `.bmsil a{color:inherit;text-decoration:inherit}`,
    // The highlighted run of a label. Transparent by default so the controls,
    // not this rule, decide what a highlight looks like.
    `.bmsil .bmsil-hl{background:transparent;color:inherit;border-radius:.2em}`,
    `.bmsil a:hover{opacity:.85}`,
    // One column on the narrowest screens, whatever the desktop count — a
    // four-column icon list at 360px is unreadable.
    `@media(max-width:480px){.bmsil{grid-template-columns:1fr}}`,
  ].join("");
}

/**
 * The Advanced Accordion's base look.
 *
 * Its own builder for the same reason the button's and the icon list's are: the
 * editor canvas renders the real component but never loads the site stylesheet.
 */
export function accordionBaseCss(): string {
  return [
    // Grid, so "Column Layout" is a change of one property. One column behaves
    // exactly like the stacked accordion it replaces.
    `.bmsacc-title-wrap{margin:0}`,
    `.bmsacc{display:grid;grid-template-columns:1fr;gap:10px;margin:1.5rem 0;align-content:start}`,
    `.bmsacc .bmsacc-pane{border-radius:10px;overflow:hidden;background:transparent}`,
    `.bmsacc .bmsacc-title{display:flex;align-items:center;gap:.75rem;width:100%;box-sizing:border-box;padding:14px 16px;margin:0;font:inherit;font-weight:600;text-align:start;background:transparent;color:inherit;border:0;cursor:pointer;transition:background .2s,color .2s,border-color .2s}`,
    `.bmsacc .bmsacc-title:hover{background:rgba(100,116,139,.06)}`,
    // The label takes the slack so the glyph can sit on either edge without a
    // second rule per side.
    `.bmsacc .bmsacc-label{flex:1 1 auto;min-width:0}`,
    `.bmsacc .bmsacc-ico{flex:none;display:inline-flex;align-items:center;justify-content:center;line-height:1;font-size:1.15em;transition:transform .2s}`,
    `.bmsacc .bmsacc-title-ico{flex:none;display:inline-flex;align-items:center;line-height:1;font-size:1.1em}`,
    // Only the styles that reuse one glyph turn it; plus/minus swaps the mark.
    `.bmsacc.is-spin .bmsacc-pane.is-open > .bmsacc-title .bmsacc-ico{transform:rotate(180deg)}`,
    `.bmsacc .bmsacc-body{padding:14px 16px;border-top:1px solid rgba(100,116,139,.18);line-height:1.65}`,
    `.bmsacc .bmsacc-body p:last-child{margin-bottom:0}`,
    `@media(prefers-reduced-motion:reduce){.bmsacc .bmsacc-title,.bmsacc .bmsacc-ico{transition:none}}`,
    // A pane collapsed by the component stays in the DOM so crawlers and
    // in-page search still see every answer.
    `.bmsacc .bmsacc-body[hidden]{display:none}`,
  ].join("");
}

/**
 * The Advanced Table of Contents' base look.
 *
 * Its own builder for the same reason the other advanced blocks have one: the
 * editor canvas renders the real component but never loads the site stylesheet.
 */
export function tocBaseCss(): string {
  return [
    `.bmstoc{border:1px solid rgba(100,116,139,.22);border-radius:10px;padding:16px 18px;margin:1.5rem 0;background:transparent}`,
    `.bmstoc .bmstoc-title{display:flex;align-items:center;gap:.6rem;width:100%;box-sizing:border-box;margin:0 0 10px;padding:0;font:inherit;font-weight:600;text-align:start;background:transparent;color:inherit;border:0}`,
    // Only a collapsible ToC's title is a button an author can click — a
    // plain heading is not, so the pointer and reset only apply there.
    `.bmstoc.is-collapsible .bmstoc-title{cursor:pointer}`,
    `.bmstoc:not(.is-collapsible) .bmstoc-ico{display:none}`,
    `.bmstoc .bmstoc-ico{flex:none;display:inline-flex;align-items:center;justify-content:center;line-height:1;font-size:1.05em;transition:transform .2s}`,
    // Direct child of the title bar (the whole bar is the toggle): the icon
    // itself takes the slack. Inside `.bmstoc-ico-btn` (title-click disabled,
    // only the icon toggles) the button takes it instead.
    `.bmstoc .bmstoc-title > .bmstoc-ico{margin-inline-start:auto}`,
    `.bmstoc .bmstoc-ico-btn{flex:none;margin-inline-start:auto;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:0;padding:0;cursor:pointer;color:inherit;font:inherit}`,
    `.bmstoc.is-spin.is-open .bmstoc-ico{transform:rotate(180deg)}`,
    `.bmstoc .bmstoc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}`,
    // Each level nests under the one before it — depth is set inline per
    // entry, so this only has to know the unit.
    `.bmstoc .bmstoc-item{margin:0;padding-inline-start:calc(var(--bmstoc-depth,0) * 1.1em)}`,
    `.bmstoc-d1{--bmstoc-depth:1}.bmstoc-d2{--bmstoc-depth:2}.bmstoc-d3{--bmstoc-depth:3}.bmstoc-d4{--bmstoc-depth:4}.bmstoc-d5{--bmstoc-depth:5}`,
    `.bmstoc .bmstoc-link{color:inherit;text-decoration:none;display:inline-block;padding:.15em 0}`,
    // A single running count, not per-level "1.1" numbering — the list is
    // flat with indentation standing in for nesting, so a real nested
    // counter has nothing to nest inside.
    `.bmstoc.is-numbered .bmstoc-list{counter-reset:bmstoc}`,
    `.bmstoc.is-numbered .bmstoc-item{counter-increment:bmstoc}`,
    `.bmstoc.is-numbered .bmstoc-link::before{content:counter(bmstoc) ". ";opacity:.6;font-variant-numeric:tabular-nums}`,
    `.bmstoc.is-underline .bmstoc-link:hover,.bmstoc.is-underline .bmstoc-link.is-active{text-decoration:underline}`,
    `.bmstoc .bmstoc-link.is-active{font-weight:600}`,
    `@media(prefers-reduced-motion:reduce){.bmstoc .bmstoc-ico{transition:none}}`,
    // A collapsed ToC's list stays in the DOM so crawlers and in-page search
    // still see every entry — same reasoning as the Accordion's panes.
    `.bmstoc .bmstoc-body[hidden]{display:none}`,
  ].join("");
}

/**
 * The Advanced Table's base look.
 *
 * Its own builder for the same reason the other advanced blocks have one: the
 * editor canvas renders the real component but never loads the site stylesheet.
 */
export function tableBaseCss(): string {
  return [
    `.bmstbl{margin:1.5rem 0}`,
    // The scroller, not the block, takes the overflow — a wide table must not
    // widen the page or its column.
    `.bmstbl .bmstbl-scroll{overflow-x:auto;max-width:100%}`,
    `.bmstbl .bmstbl-table{width:100%;border-collapse:collapse;font-size:.925rem}`,
    `.bmstbl .bmstbl-table th,.bmstbl .bmstbl-table td{padding:10px 14px;border:1px solid rgba(100,116,139,.24);text-align:start;vertical-align:top}`,
    `.bmstbl .bmstbl-table th{font-weight:600;background:rgba(100,116,139,.08)}`,
    `.bmstbl .bmstbl-caption{caption-side:bottom;padding-top:.6rem;font-size:.8rem;opacity:.7;text-align:start}`,
    // Styles. Each only sets what makes it that style, so the panel's own
    // colours still win.
    `.bmstbl.is-stripes tbody tr:nth-child(even) td{background:rgba(100,116,139,.07)}`,
    `.bmstbl.is-minimal .bmstbl-table th,.bmstbl.is-minimal .bmstbl-table td{border-left:0;border-right:0}`,
    `.bmstbl.is-minimal .bmstbl-table th{background:transparent}`,
    `.bmstbl.is-bordered .bmstbl-table{border:2px solid rgba(100,116,139,.32)}`,
    `.bmstbl .bmstbl-table tfoot td{font-weight:600;background:rgba(100,116,139,.06)}`,
  ].join("");
}

/**
 * Rules only the editor canvas needs: focus rings and placeholders for the
 * contenteditable parts of the Icon List, Table and Info Box. The published
 * page never renders a contenteditable, so these used to sit in the site
 * stylesheet doing nothing for every visitor; each view appends them beside
 * its base CSS when it renders inert on the canvas.
 */
export function editableCanvasCss(): string {
  return [
    `.bmsil [contenteditable]:focus{outline:2px solid var(--color-primary,#0ea5e9);outline-offset:2px;border-radius:2px}`,
    `.bmstbl .bmstbl-cell{display:block;min-height:1.2em;outline:none}`,
    `.bmstbl .bmstbl-cell:focus{outline:2px solid var(--color-primary,#0ea5e9);outline-offset:1px;border-radius:2px}`,
    `.bmsib [contenteditable]:focus{outline:2px solid var(--color-primary,#0ea5e9);outline-offset:2px;border-radius:2px}`,
    // An empty part on the canvas still has to be findable and clickable,
    // so it shows what it is instead of collapsing to nothing.
    `.bmsib [contenteditable]:empty::before{content:attr(data-ph);opacity:.4}`,
  ].join("");
}

/**
 * The Advanced Info Box's base look.
 *
 * Its own builder for the same reason the other advanced blocks have one: the
 * editor canvas renders the real component but never loads the site stylesheet.
 *
 * The four `is-*` variant rules are the pre-Advanced block's palette. They stay
 * because old content stores one of those names, and they are written at one
 * class of specificity below the block's own rules, so every colour control in
 * the panel still wins over them.
 */
export function infoBoxBaseCss(): string {
  return [
    `.bmsib{margin:1.5rem 0}`,
    // The wrap is the box: it is the element that takes the background, border
    // and shadow, so the outer element stays free for the `bx` spacing box.
    `.bmsib .bmsib-wrap{display:flex;flex-direction:column;align-items:flex-start;gap:1rem;box-sizing:border-box;color:inherit;text-decoration:none;transition:background .2s,border-color .2s,box-shadow .2s,transform .2s}`,
    `.bmsib.is-media-left .bmsib-wrap{flex-direction:row}`,
    `.bmsib.is-media-right .bmsib-wrap{flex-direction:row-reverse}`,
    // Media beside the text must not be squeezed by a long paragraph, and the
    // body must be free to shrink instead.
    `.bmsib .bmsib-media{flex:none;display:flex;max-width:100%;line-height:1}`,
    // Stacked, the body takes the card's full width so the text wraps against
    // the padding rather than shrink-wrapping to the title. Beside the media it
    // must not stretch, or Media Vertical Align would have nothing to move.
    `.bmsib .bmsib-body{min-width:0;flex:1 1 auto;align-self:stretch}`,
    `.bmsib.is-media-left .bmsib-body,.bmsib.is-media-right .bmsib-body{align-self:auto}`,
    // One frame for all three media types, so a glyph, a number and an image
    // share the same border, radius and background controls.
    `.bmsib .bmsib-ico{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;line-height:1;font-size:2.5rem;color:var(--color-primary,#0ea5e9);border-style:solid;border-width:0;border-color:transparent;transition:color .2s,background .2s,border-color .2s,transform .3s}`,
    `.bmsib .bmsib-img{display:block;max-width:100%;height:auto}`,
    `.bmsib .bmsib-title{margin:0;font-size:1.25rem;font-weight:600;line-height:1.3;transition:color .2s}`,
    `.bmsib .bmsib-text{margin:.5rem 0 0;line-height:1.65;white-space:pre-line;transition:color .2s}`,
    `.bmsib .bmsib-text:first-child{margin-top:0}`,
    // Learn More is inline-flex so it works as a text link and as a button
    // without a second set of rules.
    `.bmsib .bmsib-learn{display:inline-flex;align-items:center;gap:.4em;margin-top:.85rem;box-sizing:border-box;font-weight:600;color:var(--color-primary,#0ea5e9);text-decoration:none;border-style:solid;border-width:0;border-color:transparent;transition:color .2s,background .2s,border-color .2s}`,
    `.bmsib .bmsib-learn-ico{flex:none;line-height:1}`,
    // Whole-box links must not inherit the theme's link colour, or every part
    // of the box would turn blue at once.
    `.bmsib a.bmsib-wrap:hover{text-decoration:none}`,
    // Icon hover animations. On the box rather than the glyph: an info box is
    // one target, and the pointer rarely crosses the icon itself.
    `.bmsib.is-anim-flip:hover .bmsib-ico{transform:rotateY(180deg)}`,
    `.bmsib.is-anim-rotate:hover .bmsib-ico{transform:rotate(360deg)}`,
    `.bmsib.is-anim-grow:hover .bmsib-ico{transform:scale(1.15)}`,
    `.bmsib.is-anim-shrink:hover .bmsib-ico{transform:scale(.85)}`,
    `.bmsib.is-anim-slide:hover .bmsib-ico{transform:translateY(-.35em)}`,
    `.bmsib.is-anim-pulse:hover .bmsib-ico{animation:bmsib-pulse .7s ease-in-out infinite}`,
    `.bmsib.is-anim-bounce:hover .bmsib-ico{animation:bmsib-bounce .7s ease-in-out infinite}`,
    `@keyframes bmsib-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}`,
    `@keyframes bmsib-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-.3em)}}`,
    `@media(prefers-reduced-motion:reduce){.bmsib .bmsib-wrap,.bmsib .bmsib-ico,.bmsib .bmsib-title,.bmsib .bmsib-text,.bmsib .bmsib-learn{transition:none}.bmsib .bmsib-ico{animation:none!important;transform:none!important}}`,
    // The pre-Advanced palette. One class less specific than the block's own
    // rules, so every colour control still overrides them.
    `.bmsib.is-info .bmsib-wrap{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:1rem 1.15rem;color:#1e3a8a}`,
    `.bmsib.is-success .bmsib-wrap{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:1rem 1.15rem;color:#14532d}`,
    `.bmsib.is-warning .bmsib-wrap{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:1rem 1.15rem;color:#78350f}`,
    `.bmsib.is-error .bmsib-wrap{background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:1rem 1.15rem;color:#7f1d1d}`,
    `.bmsib.is-info .bmsib-ico,.bmsib.is-success .bmsib-ico,.bmsib.is-warning .bmsib-ico,.bmsib.is-error .bmsib-ico{color:currentColor;font-size:1.5rem}`,
    // Media beside the text is the first thing to break at phone widths.
    `@media(max-width:480px){.bmsib.is-media-left .bmsib-wrap,.bmsib.is-media-right .bmsib-wrap{flex-direction:column}}`,
  ].join("");
}

export function blockCss(): string {
  return [
    TEXT_ADVANCED_CSS,
    // First and last block in the content flow.
    //
    // Blocks carry their own vertical rhythm (a Row Layout has 24px), which is
    // right between blocks and wrong at the ends: it puts a band of page
    // background above the first block that no setting could remove — not
    // "unboxed", which only clears the article's own padding, and not Content
    // Vertical Spacing, which only clears the shell's. The second pair of rules
    // reaches through the wrapper that per-block spacing adds.
    // App Info box. Colours come from the site's variables so it matches the
    // theme; the button uses the primary colour like every other button.
    `.bmsapp{border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:18px 20px;margin:24px 0;background:rgba(0,0,0,.02)}`,
    `.bmsapp-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap}`,
    `.bmsapp-icon{width:72px;height:72px;border-radius:16px;object-fit:cover;flex:none}`,
    `.bmsapp-title{flex:1;min-width:160px}`,
    `.bmsapp-name{margin:0;font-weight:700;font-size:1.25em;line-height:1.2}`,
    `.bmsapp-dev{margin:2px 0 0;opacity:.7;font-size:.9em}`,
    `.bmsapp-rating{margin:6px 0 0;display:flex;align-items:center;gap:8px;font-size:.85em;opacity:.85}`,
    `.bmsapp-stars span{color:#d1d5db}.bmsapp-stars span.on,.bmsapp-stars span.half{color:#f59e0b}`,
    `.bmsapp-btn{display:inline-flex;align-items:center;gap:8px;background:var(--color-primary,#0ea5e9);color:var(--color-primary-fg,#fff)!important;text-decoration:none!important;font-weight:600;padding:12px 20px;border-radius:10px;line-height:1;flex:none}`,
    `.bmsapp-btn small{font-weight:400;opacity:.85;font-size:.8em}`,
    `.bmsapp-btn:hover{filter:brightness(.95)}`,
    `.bmsapp-specs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 18px;margin:16px 0 0;padding:14px 0 0;border-top:1px solid rgba(0,0,0,.08)}`,
    `.bmsapp-spec dt{font-size:.75em;text-transform:uppercase;letter-spacing:.04em;opacity:.6;margin:0}`,
    `.bmsapp-spec dd{margin:2px 0 0;font-weight:600}`,
    `.bmsapp-foot{margin-top:16px}`,
    `.bmsapp-empty{opacity:.5;font-style:italic}`,
    `.dark .bmsapp,[data-theme=dark] .bmsapp{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.04)}`,
    `.dark .bmsapp-specs,[data-theme=dark] .bmsapp-specs{border-color:rgba(255,255,255,.12)}`,

    `.prose-content > :first-child{margin-top:0}`,
    `.prose-content > :last-child{margin-bottom:0}`,
    `.prose-content > .bx:first-child > :first-child{margin-top:0}`,
    `.prose-content > .bx:last-child > :last-child{margin-bottom:0}`,

    // Row Layout columns. Content sitting flush against a column edge reads as
    // broken the moment the Section has a background colour, so every column
    // carries a small inset by default. It is a class rather than a stored
    // prop, which means the Section's own padding control still wins — an
    // author who sets padding gets exactly what they asked for, and one who
    // sets nothing gets something sensible.
    // The flex defaults every column carried inline (see SECTION_DEFAULTS in
    // BlockRenderer), and the two positioned wrappers inside a row that each
    // wrote `position:relative;z-index:1` on every instance.
    `.bms-col{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;padding-inline:14px;padding-block:10px}`,
    `.bms-row-in{position:relative;z-index:1}`,
    // Defaults the smaller blocks used to write inline on every instance; an
    // author's own value still goes inline and wins.
    `.bms-spacer{display:flex;align-items:center;height:40px}.bms-spacer hr{width:100%;border-style:solid;border-color:#e2e8f0;border-top-width:1px}`,
    `.bms-callout{background-color:#fef9c3}`,
    `.bms-prog-fill{background-color:var(--color-primary,#0ea5e9)}`,
    `.bms-cform-wrap{max-width:640px}`,
    `.bms-cta-btn{background-color:var(--color-primary,#0ea5e9)}`,
    `.bms-gal-img{border-radius:10px}`,
    `.social-icons{gap:10px}`,
    `.star-rating-track{font-size:22px}.star-rating-fill{color:#f59e0b}`,
    `.bms-col-in{z-index:1}`,
    // Image Advanced: alignment, figure and image constants. Seventeen images
    // on one measured page each carried these as four inline styles.
    `.bmsia{display:flex;justify-content:flex-start}`,
    `.bmsia-c{justify-content:center}`,
    `.bmsia-r{justify-content:flex-end}`,
    `.bmsia-fig{margin:0;width:100%;max-width:100%;overflow:hidden}`,
    `.bmsia-box{position:relative}`,
    `.bmsia-fig img{display:block;width:100%;height:auto;object-fit:cover}`,
    `@media(max-width:600px){.bms-col{padding-inline:10px}}`,

    // Gallery — the inline grid-template-columns is the author's choice; these
    // rules only stop it overflowing on small screens.
    `@media(max-width:767px){.gallery{grid-template-columns:repeat(2,minmax(0,1fr)) !important}}`,
    `@media(max-width:420px){.gallery{grid-template-columns:1fr !important}}`,

    buttonBaseCss(),
    iconListBaseCss(),
    accordionBaseCss(),
    tableBaseCss(),
    tocBaseCss(),
    infoBoxBaseCss(),

    // Social icons
    `.social-icon{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-weight:700;transition:transform .15s,opacity .15s;text-decoration:none}`,
    `.social-icon:hover{transform:translateY(-2px);opacity:.85}`,
    `.social-icon.is-outline{border:1px solid currentColor}`,
    `.social-icon.is-plain{width:auto !important;height:auto !important}`,

    // Star rating — one filled layer clipped over a grey base, so half stars
    // work without splitting glyphs.
    `.star-rating-track{position:relative;display:inline-block;white-space:nowrap;line-height:1}`,
    `.star-rating-base{color:currentColor;opacity:.22}`,
    `.star-rating-fill{position:absolute;inset-block:0;left:0;overflow:hidden;white-space:nowrap}`,

    // Pricing table
    `.pricing-table{grid-template-columns:repeat(var(--pt-cols,3),minmax(0,1fr))}`,
    `@media(max-width:900px){.pricing-table{grid-template-columns:repeat(2,minmax(0,1fr))}}`,
    `@media(max-width:600px){.pricing-table{grid-template-columns:1fr}}`,
    `.pricing-plan{border:1px solid rgba(100,116,139,.22);border-radius:14px;padding:1.5rem;display:flex;flex-direction:column}`,
    `.pricing-plan.is-featured{border-color:var(--color-primary,#0ea5e9);box-shadow:0 10px 30px rgba(15,23,42,.10)}`,
    `.pricing-features{flex:1}`,

    // Post grid
    `.postgrid-items{grid-template-columns:repeat(var(--pg-cols,3),minmax(0,1fr))}`,
    `@media(max-width:900px){.postgrid-items{grid-template-columns:repeat(2,minmax(0,1fr))}}`,
    `@media(max-width:600px){.postgrid-items{grid-template-columns:1fr}}`,

    // Show more — the fade is decorative, so it is a pseudo-element rather than
    // an extra node, and it disappears once expanded.
    `.showmore-body.is-faded::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4.5rem;background:linear-gradient(to bottom,transparent,var(--content-bg,#fff))}`,
    `.showmore-btn{color:var(--color-primary,#0ea5e9)}`,
    `.showmore-btn:hover{opacity:.75}`,

    // Image compare
    `.imgcmp-frame{position:relative;line-height:0;touch-action:pan-y}`,
    `.imgcmp-line{width:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.18);transform:translateX(-1px);pointer-events:none}`,
    `.imgcmp-tag{position:absolute;bottom:.75rem;font-size:.7rem;font-weight:600;letter-spacing:.02em;text-transform:uppercase;background:rgba(15,23,42,.72);color:#fff;padding:.2rem .5rem;border-radius:.35rem;pointer-events:none;line-height:1.4}`,
    `.imgcmp-tag.is-before{left:.75rem}`,
    `.imgcmp-tag.is-after{right:.75rem}`,
    `.imgcmp-range:focus-visible + .imgcmp-tag,.imgcmp-range:focus-visible{outline:2px solid var(--color-primary,#0ea5e9);outline-offset:2px}`,

    // Icon block
    `.icon-block-mark.is-shaped{align-items:center;justify-content:center}`,

    // HTML embed — author markup can be any width, so it must not break the page.
    `.html-embed{max-width:100%;overflow-x:auto}`,
    `.html-embed iframe{max-width:100%}`,

    // Contact form. Inputs inherit the page's colours rather than declaring
    // their own, so a dark theme needs no separate rules.
    `.cform-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}`,
    `.cform-field{grid-column:span 2}`,
    `.cform-field.is-half{grid-column:span 1}`,
    `@media(max-width:600px){.cform-field.is-half{grid-column:span 2}}`,
    `.cform-label{display:block;font-size:.8rem;font-weight:600;margin-bottom:.35rem;opacity:.8}`,
    `.cform-input{width:100%;padding:.6rem .75rem;border:1px solid rgba(100,116,139,.32);border-radius:.55rem;background:transparent;color:inherit;font:inherit;font-size:.925rem;transition:border-color .15s,box-shadow .15s}`,
    `.cform-input:focus{outline:none;border-color:var(--color-primary,#0ea5e9);box-shadow:0 0 0 3px rgba(14,165,233,.16)}`,
    `.cform-input.has-error{border-color:#dc2626}`,
    `.cform-input.has-error:focus{box-shadow:0 0 0 3px rgba(220,38,38,.15)}`,
    `textarea.cform-input{resize:vertical;min-height:7rem}`,
    `.cform-check{display:flex;align-items:flex-start;gap:.55rem;font-size:.9rem;cursor:pointer}`,
    `.cform-check input{margin-top:.2rem}`,
    `.cform-error{color:#dc2626;font-size:.78rem;margin-top:.3rem}`,
    `.cform-actions{margin-top:1.15rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}`,
    `.cform-actions .btn:disabled{opacity:.6;cursor:not-allowed}`,
    // Off-screen rather than display:none — some bots skip hidden inputs.
    `.cform-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}`,
    `.cform-done{padding:1.1rem 1.25rem;border-radius:.7rem;background:rgba(16,185,129,.10);border:1px solid rgba(16,185,129,.30)}`,
  ].join("");
}
