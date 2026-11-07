import { NextRequest, NextResponse } from "next/server";
import { readUploadClaim } from "@/lib/uploadUrl";
import { sessionForTokenId } from "@/lib/apiTokens";
import { sessionOverride } from "@/lib/authOverride";
import { POST as upload } from "../route";

/** The media library's own limit (app/api/media MAX_BYTES). */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * `PUT /api/media/direct?t=…` (or POST): a file sent to a signed upload address
 * from the connector's create_upload_url (lib/uploadUrl.ts). The body is the
 * file itself (`curl --upload-file`), or a form with a `file` field (`curl -F`).
 * It is stored by the ordinary upload route, as the token that asked for the
 * address — same checks, same conversion, same answer.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const claim = readUploadClaim(req.nextUrl.searchParams.get("t") ?? "");
  if (!claim) return NextResponse.json({ error: "This upload address is invalid or has expired. Ask for a new one (create_upload_url)." }, { status: 403 });
  const session = await sessionForTokenId(claim.tid);
  if (!session) return NextResponse.json({ error: "The API token behind this address was revoked or has expired." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "The file is larger than 10 MB." }, { status: 413 });
  }

  let file: File;
  if ((req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    const got = (await req.formData()).get("file");
    if (!(got instanceof File)) return NextResponse.json({ error: 'Send the file as the body, or as a form field named "file".' }, { status: 400 });
    file = new File([await got.arrayBuffer()], claim.n, { type: claim.m });
  } else {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length) return NextResponse.json({ error: "No file in the request body." }, { status: 400 });
    if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "The file is larger than 10 MB." }, { status: 413 });
    file = new File([bytes], claim.n, { type: claim.m });
  }

  const form = new FormData();
  form.append("file", file);
  const inner = new NextRequest(new URL("/api/media", req.url), { method: "POST", body: form });
  return sessionOverride.run(session, () => upload(inner));
}

export const PUT = handle;
export const POST = handle;
