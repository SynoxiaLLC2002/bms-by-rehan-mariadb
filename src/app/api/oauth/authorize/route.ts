import { NextRequest, NextResponse } from "next/server";
import { checkAuthorize, OAuthError, readClient, redirectWith } from "@/lib/oauth";
import { siteBase } from "@/lib/mcpHttp";

// The authorization endpoint. It only checks the request and hands the
// browser to /admin/connect — the Allow screen, behind the admin login — with
// the same query string. Problems with the app itself are shown here, never
// sent to a return address we have not verified (that would be an open
// redirect); anything else goes back to the app, as OAuth expects.

function page(message: string): NextResponse {
  const esc = message.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Could not connect</title>` +
      `<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}main{max-width:28rem;padding:2rem;background:#fff;border:1px solid #e2e8f0;border-radius:12px}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#475569;margin:0}</style>` +
      `</head><body><main><h1>Could not connect</h1><p>${esc}</p></main></body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    checkAuthorize(q);
  } catch (e) {
    if (!(e instanceof OAuthError)) throw e;
    const client = readClient(q.get("client_id"));
    const uri = q.get("redirect_uri") ?? "";
    // Only a verified return address gets the error; otherwise say it here.
    if (client && client.redirectUris.includes(uri) && e.code !== "invalid_client") {
      return NextResponse.redirect(redirectWith(uri, { error: e.code, error_description: e.message, state: q.get("state") ?? "" }));
    }
    return page(e.message);
  }
  const { base } = await siteBase();
  return NextResponse.redirect(`${base}/admin/connect?${q.toString()}`);
}
