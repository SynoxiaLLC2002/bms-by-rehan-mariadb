import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { canEditDocument } from "@/lib/authz";
import { db } from "@/lib/db";
import { pages, posts } from "@/lib/db/schema";
import { PREVIEW_FIELDS, putPreviewDraft } from "@/lib/previewDrafts";

/**
 * Holds the editor's unsaved state for the Preview button and returns a token
 * for /preview/<kind>/<id>?draft=<token>. Nothing is saved to the document.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { kind?: string; id?: number; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const kind = body.kind === "page" ? "page" : body.kind === "post" ? "post" : null;
  const id = Number(body.id);
  if (!kind || !Number.isInteger(id) || id <= 0 || !body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const row =
    kind === "post"
      ? await db.query.posts.findFirst({ where: eq(posts.id, id), columns: { authorId: true } })
      : await db.query.pages.findFirst({ where: eq(pages.id, id), columns: { authorId: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditDocument(session, row.authorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data: Record<string, unknown> = {};
  for (const k of PREVIEW_FIELDS) if (k in body.data) data[k] = body.data[k];
  // A document is at most a few megabytes of JSON; refuse anything absurd.
  if (JSON.stringify(data).length > 8 * 1024 * 1024) return NextResponse.json({ error: "Too large" }, { status: 413 });

  const token = putPreviewDraft({ kind, id, userId, data });
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
