import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { clientIp } from "@/lib/rateLimit";
import { loginBlocked, verifyPassword } from "@/lib/loginGuard";
import { issueLoginProof } from "@/lib/loginProof";

/**
 * Tells the login form whether to ask for a 2FA code.
 *
 * It has to verify the password to answer that, which makes it a password
 * oracle available to anyone — so it is throttled exactly like a login, and
 * shares the login's counters so switching endpoints buys nothing.
 */
export async function POST(req: NextRequest) {
  let email: unknown, password: unknown;
  try {
    ({ email, password } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  if (loginBlocked(clientIp(req), String(email))) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const user = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${String(email).trim().toLowerCase()}`,
    columns: { id: true, password: true, totpEnabled: true },
  });

  // Unconditional, and on the same code path whether or not the account
  // exists — see `verifyPassword`.
  const match = await verifyPassword(String(password), user?.password);
  if (!user || !match) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // The password has just been verified. The proof lets the sign-in step skip
  // verifying it a second time — see loginProof.ts for why that is safe.
  return NextResponse.json({ requires2FA: !!user.totpEnabled, proof: issueLoginProof(String(email)) });
}
