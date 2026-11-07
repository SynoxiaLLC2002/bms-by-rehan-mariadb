import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { normalizeEmail, passwordProblem } from "@/lib/password";
import { isAdmin, FORBIDDEN, isValidRole } from "@/lib/authz";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Administrators only: accounts are how people get in, and the list is every email on the site.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const result = await db.query.users.findMany({
      orderBy: [desc(users.createdAt)],
      columns: {
        id: true, name: true, email: true, role: true,
        totpEnabled: true, lastLogin: true, createdAt: true,
      },
    });
    return NextResponse.json({ users: result });
  } catch {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Administrators only: accounts are how people get in, and the list is every email on the site.
    if (!isAdmin(session)) return NextResponse.json(FORBIDDEN, { status: 403 });

    const body = await req.json();
    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    const problem = passwordProblem(body.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // The unique index would refuse it anyway, but as a bare "Failed to create
    // user". Case-insensitive, as sign-in is.
    const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
    if (taken) return NextResponse.json({ error: "Another account already uses that email address." }, { status: 409 });

    const hashedPassword = await bcrypt.hash(body.password, 12);

    const newId = randomUUID();
    await db.insert(users).values({
      // An author page from the start: off, bylines were unlinked and the author
      // URL a 404, so Google saw no author at all. An account that only moderates
      // can be switched off on its Users screen.
      publicProfile: true,
      id: newId,
      name: body.name || null,
      email,
      password: hashedPassword,
      role: isValidRole(body.role) ? body.role : "editor",
    });
    // Never the hash: only what the old RETURNING projection sent back.
    const user = await db.query.users.findFirst({ where: eq(users.id, newId), columns: { id: true, email: true, name: true, role: true } });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
