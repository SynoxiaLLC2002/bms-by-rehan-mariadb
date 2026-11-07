import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UNAUTHORIZED } from "@/lib/authz";
import { CURRENT_VERSION } from "@/lib/version";
import manifest from "@/lib/blockManifest.json";
import { BLOCK_NOTES, DOCUMENT_FORMAT } from "@/lib/blockNotes";

// The blocks this site's editor has, for the MCP hub (mcp.synoxia.org).
//
// Each site answers for its own version: a site on an older release lists
// the blocks it can actually render, so a page built against it never uses
// one it does not have. The manifest is generated at build time from the
// editor's own specs (scripts/block-manifest.mjs).
//
//   GET /api/mcp/blocks            every block: label, hint, category, prop names
//   GET /api/mcp/blocks?type=a,b   those blocks in full: props with defaults, notes

type Manifest = { blocks: Record<string, { label: string; hint: string; category: string; insertable: boolean; content: unknown; props: Record<string, unknown>; presets?: unknown }> };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const blocks = (manifest as Manifest).blocks;
  const wanted = (req.nextUrl.searchParams.get("type") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (wanted.length) {
    const out: Record<string, unknown> = {};
    const unknown: string[] = [];
    for (const t of wanted) {
      if (blocks[t]) out[t] = { ...blocks[t], ...(BLOCK_NOTES[t] ? { notes: BLOCK_NOTES[t] } : {}) };
      else unknown.push(t);
    }
    return NextResponse.json({ version: CURRENT_VERSION, format: DOCUMENT_FORMAT, blocks: out, ...(unknown.length ? { unknown } : {}) });
  }

  const summary = Object.fromEntries(
    Object.entries(blocks).map(([type, b]) => [
      type,
      { label: b.label, hint: b.hint, category: b.category, content: b.content, props: Object.keys(b.props), ...(BLOCK_NOTES[type] ? { hasNotes: true } : {}) },
    ])
  );
  return NextResponse.json({ version: CURRENT_VERSION, format: DOCUMENT_FORMAT, blocks: summary });
}
