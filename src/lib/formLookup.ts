// The saved definition of a contact form, found by its block id.
//
// The submit endpoint used to take the field list, the required rules and the
// form's name from the request body. The browser was telling the server what
// to check, so anything that could POST could drop a required field, invent
// new ones, or submit as a form that does not exist — each one stored and
// each one mailed to the owner. The block's id is all the browser sends now;
// the definition comes from the content it was saved in.

import { rawQuery } from "@/lib/db/raw";

export interface SavedForm {
  formName: string;
  fields: string;
}

/** Block ids are UUIDs from BlockNote; anything else is not worth a query. */
const ID = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * Tables whose `content` column holds block JSON, and where a form can sit.
 *
 * Not LIMIT 1: a page duplicated before copies were given fresh block ids
 * carries the same form id as its original, and taking whichever row came
 * back first validated visitors against the other copy's fields. Every match
 * is returned and the caller picks the one the submission fits.
 */
const SOURCES = [
  "SELECT content AS c FROM posts WHERE deleted_at IS NULL AND content LIKE ? ORDER BY updated_at DESC LIMIT 5",
  "SELECT content AS c FROM pages WHERE deleted_at IS NULL AND content LIKE ? ORDER BY updated_at DESC LIMIT 5",
  "SELECT content AS c FROM elements WHERE content LIKE ? LIMIT 5",
  "SELECT content AS c FROM users WHERE content LIKE ? LIMIT 5",
];

const MAX_DEPTH = 64;

/**
 * Walks parsed content for the contact-form block with this id.
 *
 * Containers keep their inner blocks in different places — `children`, a Row
 * Layout's `cols` (JSON text inside a prop), tab and accordion panels — so the
 * walk visits every array and object, and parses any string prop that holds
 * JSON, rather than knowing each container's layout.
 */
function find(node: unknown, id: string, depth = 0): Record<string, unknown> | null {
  if (depth > MAX_DEPTH || node == null) return null;
  if (typeof node === "string") {
    const t = node.trimStart();
    if ((t.startsWith("[") || t.startsWith("{")) && node.includes(id)) {
      try {
        return find(JSON.parse(t), id, depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      const hit = find(v, id, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.id === id && o.type === "contactForm") return (o.props ?? {}) as Record<string, unknown>;
    for (const v of Object.values(o)) {
      const hit = find(v, id, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Every saved definition of the form with this block id, newest first, deduplicated. */
export async function savedForms(blockId: unknown): Promise<SavedForm[]> {
  const id = typeof blockId === "string" ? blockId : "";
  if (!ID.test(id)) return [];
  const out: SavedForm[] = [];
  for (const sql of SOURCES) {
    let rows: { c: string | null }[] = [];
    try {
      rows = await rawQuery<{ c: string | null }>(sql, [`%${id}%`]);
    } catch {
      continue; // A table or column not migrated yet on this database.
    }
    for (const row of rows) {
      if (!row.c) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.c);
      } catch {
        continue;
      }
      const props = find(parsed, id);
      if (!props) continue;
      const form: SavedForm = {
        formName: String(props.formName || "Contact").slice(0, 120),
        fields: typeof props.fields === "string" ? props.fields : JSON.stringify(props.fields ?? []),
      };
      if (!out.some((f) => f.fields === form.fields && f.formName === form.formName)) out.push(form);
    }
  }
  return out;
}
