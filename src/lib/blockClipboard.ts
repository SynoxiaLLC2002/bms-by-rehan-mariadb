// Copy and paste of whole blocks — a Row Layout with every column and
// everything inside, an Icon List with all its items — between places in a
// document and between documents.
//
// The editor's own copy is text-shaped: it copies what the cursor spans. A
// block selected in the List View is a different thing — the author means
// "this whole element, as it is". So the block is put on the clipboard as
// JSON, exactly as the document stores it, and pasted back as blocks. The
// clipboard only allows plain text and HTML for arbitrary data, so the JSON
// travels as text with a marker; anything else pasted is left to the editor.
//
// Ids are stripped before copying, all the way down — including the blocks
// inside a row's columns, which live JSON-encoded in a prop. Two blocks with
// one id would corrupt the document; the editor assigns fresh ones on insert.

export const MARKER = "__bms_block__";

type AnyBlock = Record<string, unknown>;

function looksLikeBlock(v: unknown): v is AnyBlock {
  return typeof v === "object" && v !== null && typeof (v as AnyBlock).type === "string" && ("props" in (v as AnyBlock) || "content" in (v as AnyBlock) || "children" in (v as AnyBlock));
}

/** Deep copy with every block id removed, including inside JSON-encoded props. */
export function stripIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripIds) as T;
  if (typeof value === "string") {
    // A prop holding serialised blocks (Row Layout columns, tab panes…).
    if ((value.startsWith("[") || value.startsWith("{")) && value.includes('"type"')) {
      try {
        const parsed = JSON.parse(value);
        return JSON.stringify(stripIds(parsed)) as T;
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const out: AnyBlock = {};
    for (const [k, v] of Object.entries(value as AnyBlock)) {
      if (k === "id" && looksLikeBlock(value)) continue;
      out[k] = stripIds(v);
    }
    return out as T;
  }
  return value;
}

export function serializeBlocks(blocks: AnyBlock[]): string {
  return JSON.stringify({ [MARKER]: 1, blocks: stripIds(blocks) });
}

/** The blocks in a pasted string, or null when it is not one of ours. */
export function parseBlocks(text: string): AnyBlock[] | null {
  const t = text.trim();
  if (!t.startsWith("{") || !t.includes(MARKER)) return null;
  try {
    const data = JSON.parse(t) as { [MARKER]?: number; blocks?: unknown };
    if (data[MARKER] !== 1 || !Array.isArray(data.blocks)) return null;
    return data.blocks.filter(looksLikeBlock);
  } catch {
    return null;
  }
}

export async function copyBlocks(blocks: AnyBlock[]): Promise<boolean> {
  const text = serializeBlocks(blocks);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API refused (insecure context, permissions). Fall back to the
    // deprecated path, which still works for a user-initiated key press.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export async function readClipboardBlocks(): Promise<AnyBlock[] | null> {
  try {
    const text = await navigator.clipboard.readText();
    return parseBlocks(text);
  } catch {
    return null;
  }
}
