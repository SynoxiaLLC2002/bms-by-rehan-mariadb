// BMS's React components rendered to HTML inside Astro, with islands.
//
// BMS's server components (SiteLayout, BlockRenderer, ElementSlot…) are async
// functions, and outside Next there is no React Server Components runtime to
// await them. So the tree is walked first: every server component is called
// with its props and replaced by what it returned. What is left renders to a
// string with no JavaScript at all.
//
// Client components ("use client" files, listed in ./islands) are the
// exception: each becomes an island — rendered on its own here, wrapped in
// <bms-island data-c="<id>#<export>" data-p="<props>">, and hydrated in the
// browser by scripts/hydrate.ts. Its children are server content: they are
// rendered here into a <bms-slot> the browser keeps as it is.

import { cloneElement, createElement, isValidElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { islands } from "./islands";
import { VANILLA_IDS } from "./vanillaIds";

// Not needed on this site at all: every link here is a full page load, so the
// browser runs embedded scripts itself, and the site's head scripts are put in
// <head> by pages/[...path].astro. (It only re-ran scripts after Next's
// client-side navigation.)
const NOT_HERE = new Set(["frontend/ScriptRunner#default"]);

const CONTENTS = { display: "contents" };

let clientIds: Promise<Map<unknown, string>> | null = null;
function clientComponents(): Promise<Map<unknown, string>> {
  clientIds ??= (async () => {
    const map = new Map<unknown, string>();
    for (const [id, load] of Object.entries(islands)) {
      const mod = await load();
      for (const [name, value] of Object.entries(mod)) {
        if (typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value)) map.set(value, `${id}#${name}`);
      }
    }
    return map;
  })();
  return clientIds;
}

const slotOf = (html: string, key?: string | number) => createElement("bms-slot", { key, style: CONTENTS, dangerouslySetInnerHTML: { __html: html } });

/**
 * A prop value as [what the server renders with, what travels to the browser].
 * Plain data travels as it is. A React element (an icon passed in) is rendered
 * here to HTML and travels as { $bmsHtml } — both sides then render the same
 * <bms-slot>. Anything else (a function) cannot travel: null.
 */
async function prepare(v: unknown, key?: string | number, depth = 0): Promise<[unknown, unknown] | null> {
  if (depth > 20) return null;
  if (v === null || v === undefined) return [v, v];
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return [v, v];
  if (t === "function" || t === "symbol" || t === "bigint") return null;
  if (isValidElement(v)) {
    const html = await toHtml(v);
    return [slotOf(html, key), { $bmsHtml: html }];
  }
  if (v instanceof Date) return [v, v];
  if (Array.isArray(v)) {
    const parts = await Promise.all(v.map((x, i) => prepare(x, i, depth + 1)));
    return parts.some((p) => !p) ? null : [parts.map((p) => p![0]), parts.map((p) => p![1])];
  }
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return null;
  const server: Record<string, unknown> = {}, wire: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const p = await prepare(x, undefined, depth + 1);
    if (!p) return null;
    [server[k], wire[k]] = p;
  }
  return [server, wire];
}

const isClassComponent = (t: unknown) => typeof t === "function" && !!(t as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent;

async function island(id: string, type: unknown, props: Record<string, unknown>): Promise<ReactNode | null> {
  const { children, ...given } = props;
  const prepared = await prepare(given);
  if (!prepared) return null;
  const [serverProps, rest] = prepared as [Record<string, unknown>, Record<string, unknown>];
  // Children are server content the browser already has: kept in the DOM, not
  // repeated in the props (scripts/hydrate.ts reads them back from the slot).
  const slot = children === undefined || children === null ? null : await toHtml(children as ReactNode);
  const inner = createElement(type as never, {
    ...serverProps,
    ...(slot !== null ? { children: slotOf(slot) } : {}),
  });
  // Rendered as its own root, exactly as the browser will hydrate it, so
  // useId() and the markup agree on both sides.
  const html = await renderHtml(inner);
  // React-free in the browser (scripts/vanilla.ts): the same server HTML, no props
  // to carry; islands inside its children hydrate on their own.
  if (VANILLA_IDS.has(id)) return createElement("bms-island", { "data-v": id, style: CONTENTS, dangerouslySetInnerHTML: { __html: html } });
  return createElement("bms-island", {
    "data-c": id,
    "data-p": JSON.stringify(rest),
    ...(slot !== null ? { "data-s": "" } : {}),
    style: CONTENTS,
    dangerouslySetInnerHTML: { __html: html },
  });
}

export async function resolveAsync(node: ReactNode, depth = 0): Promise<ReactNode> {
  if (depth > 400) return node;
  if (node instanceof Promise) return resolveAsync(await node, depth + 1);
  if (Array.isArray(node)) return Promise.all(node.map((n) => resolveAsync(n, depth + 1)));
  if (!isValidElement(node)) return node;
  const { type, props } = node as { type: unknown; props: Record<string, unknown> };

  const clientId = (await clientComponents()).get(type);
  if (clientId) {
    if (NOT_HERE.has(clientId)) return null;
    const made = await island(clientId, type, props);
    if (made) return made;
    // Props that cannot travel (a function, an element): rendered, not hydrated.
  } else if (typeof type === "function" && !isClassComponent(type)) {
    // A server component: run it here, so the client components it renders
    // are reachable. One that uses hooks cannot be called outside React and
    // is left for React to render.
    let out: ReactNode | Promise<ReactNode>;
    try {
      out = (type as (p: unknown) => ReactNode | Promise<ReactNode>)(props);
    } catch {
      out = undefined as never;
      return props?.children !== undefined
        ? cloneElement(node, { children: await resolveAsync(props.children as ReactNode, depth + 1) } as never)
        : node;
    }
    return resolveAsync(await out, depth + 1);
  }
  if (props && props.children !== undefined) {
    return cloneElement(node, { children: await resolveAsync(props.children as ReactNode, depth + 1) } as never);
  }
  return node;
}

async function renderHtml(node: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

export async function toHtml(node: ReactNode): Promise<string> {
  return renderHtml(await resolveAsync(node));
}
