import { NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { getUpdateStatus, selfUpdate, updateMethod } from "@/lib/version";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import type { NextRequest } from "next/server";

/** Current version, published version, and what an update would involve. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  return NextResponse.json(await getUpdateStatus(), {
    // The point of the screen is to know the current state remotely.
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Applies an update, by asking the host to rebuild.
 *
 * The app cannot update itself — it is compiled, and on a serverless host its
 * filesystem is read-only. What it can do is trigger the thing that *can*: a
 * deploy hook pulls the latest code and rebuilds, which is the same operation a
 * `git push` would cause.
 *
 * Rate limited despite being admin-only: each call starts a build, and builds
 * cost money and can queue behind each other. An impatient double-click should
 * not become two deployments.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

  if (rateLimited("deploy", clientIp(req), { max: 3, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json(
      { error: "A build was just requested. Give it a few minutes before trying again." },
      { status: 429 }
    );
  }

  // cPanel and other servers: install the signed release in place (scripts/self-update.cjs).
  const self = selfUpdate();
  if (self) {
    const body = await req.json().catch(() => ({}));
    try {
      if (body?.action === "rollback") {
        self.rollback();
        return NextResponse.json({ ok: true, message: "Going back to the previous version. The site restarts in a few seconds." });
      }
      const version = await self.apply();
      return NextResponse.json({ ok: true, version, message: `Version ${version} is installed. The site restarts in a few seconds.` });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "The update failed." }, { status: 400 });
    }
  }

  if (updateMethod() !== "deploy-hook") {
    return NextResponse.json(
      {
        error:
          "This site has no deploy hook configured, so it cannot rebuild itself. Set DEPLOY_HOOK_URL, or update from the command line.",
      },
      { status: 400 }
    );
  }

  const hook = process.env.DEPLOY_HOOK_URL as string;
  try {
    const res = await fetch(hook, { method: "POST", signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `The deploy hook refused the request (${res.status}).` },
        { status: 502 }
      );
    }
    // A build takes minutes and finishes long after this response. Saying
    // "started" rather than "updated" is the difference between a screen that
    // tells the truth and one that lies for two minutes.
    return NextResponse.json({
      ok: true,
      started: true,
      message: "Build started. The site updates once it finishes — usually a couple of minutes.",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the deploy hook." }, { status: 502 });
  }
}
