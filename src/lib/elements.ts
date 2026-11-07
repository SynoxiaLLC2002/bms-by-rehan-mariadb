// Elements: reusable block content injected at a layout hook.
//
// Kept free of database imports so the admin screens can share these constants
// without dragging Drizzle and the schema into the browser bundle. The loader
// lives in ElementSlot, the only thing that reads them.
//
// The point is that an announcement bar or a CTA under every post is authored
// once, in the same editor as everything else, instead of being hard-coded into
// the layout. Where it appears is a hook; which pages it appears on is a
// condition — both plain data, so the whole thing stays statically renderable.

import { PAGE_TYPES, type PageType } from "@/lib/headerConditions";

export const ELEMENT_HOOKS = [
  { id: "before_header",  label: "Above header",   hint: "Top of the page, before the header" },
  { id: "after_header",   label: "Below header",   hint: "Between the header and the content" },
  { id: "before_content", label: "Above content",  hint: "Inside the content column, before the article" },
  { id: "after_content",  label: "Below content",  hint: "Inside the content column, after the article" },
  { id: "before_footer",  label: "Above footer",   hint: "Full width, just before the footer" },
  { id: "after_footer",   label: "Below footer",   hint: "Bottom of the page, after the footer" },
] as const;

export type ElementHook = (typeof ELEMENT_HOOKS)[number]["id"];

export const ELEMENT_HOOK_IDS: readonly string[] = ELEMENT_HOOKS.map((h) => h.id);

export const hookLabel = (id: string) =>
  ELEMENT_HOOKS.find((h) => h.id === id)?.label ?? id;

/** The page types an element can be targeted at — the same set headers use. */
export const ELEMENT_PAGE_TYPES = PAGE_TYPES;

export interface ElementConditions {
  /** Empty means every page type. */
  include?: string[];
  /** Always wins over include. */
  exclude?: string[];
  /**
   * Content languages this element appears in; empty means all of them.
   *
   * Kept inside the same JSON as the page-type rules rather than in a column
   * of its own: it is read only alongside them, and a JSON key needs no
   * migration on a live database.
   */
  languages?: string[];
}

export interface SiteElement {
  id: number;
  name: string;
  content: unknown;
  hook: string;
  status: string;
  priority: number;
  conditions: ElementConditions;
}

export function parseConditions(raw: unknown): ElementConditions {
  if (!raw || typeof raw !== "object") return {};
  const v = raw as ElementConditions;
  return {
    include: Array.isArray(v.include) ? v.include.filter((x) => typeof x === "string") : [],
    exclude: Array.isArray(v.exclude) ? v.exclude.filter((x) => typeof x === "string") : [],
    languages: Array.isArray(v.languages) ? v.languages.filter((x) => typeof x === "string") : [],
  };
}

/**
 * Does this element belong on a page of this type?
 *
 * Exclude beats include, so "everywhere except the front page" is one rule
 * rather than a list of every other page type.
 */
export function matchesPage(el: SiteElement, pageType: PageType, language?: string): boolean {
  const { include = [], exclude = [], languages = [] } = el.conditions;
  // An element aimed at some languages stays off pages whose language is
  // unknown, rather than guessing — a French banner on an English page is
  // the mistake this exists to prevent.
  if (languages.length > 0 && !(language && languages.includes(language))) return false;
  if (exclude.includes(pageType)) return false;
  if (include.length === 0) return true;
  return include.includes(pageType);
}
