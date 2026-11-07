import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { consumeTotp } from "@/lib/totp";
import { verifyLoginProof } from "@/lib/loginProof";
import { clientIp } from "@/lib/rateLimit";
import { loginBlocked, verifyPassword } from "@/lib/loginGuard";
import authConfig from "../../auth.config";
import { headers } from "next/headers";
import type { Session } from "next-auth";
import { bearerTokenOf, sessionForToken } from "@/lib/apiTokens";
import { sessionOverride } from "@/lib/authOverride";

/**
 * What a session is bound to besides the user id.
 *
 * Sessions are JWTs, which the server never stores — so changing a password
 * used to leave every existing session valid until it expired on its own. A
 * cookie stolen before the change kept working after it, which is the one
 * moment a person most expects it to stop. The token now carries the tail of
 * the password hash it was issued against; `auth()` compares it with the
 * database (at most once every five minutes per session, so it is not a
 * query on every request) and drops the session when they differ. A password
 * change is therefore a sign-out everywhere within five minutes — except for
 * the browser that made the change, which the users route refreshes with the
 * new value.
 */
export function passwordVersion(hash: string | null | undefined): string {
  return (hash ?? "").slice(-16);
}

const RECHECK_MS = 5 * 60 * 1000;

/** The longest a session lives from sign-in, however often it is used. */
const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

const nextAuth = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.pv = (user as { pv?: string }).pv;
        token.pvc = Date.now();
        token.si = Date.now();
        return token;
      }
      // However active, a session ends SESSION_ABSOLUTE_MS after sign-in: the
      // seven-day lifetime (auth.config) slides with every visit, so on its
      // own a regularly used — or stolen — cookie never expired. A session
      // from before this existed starts its count now rather than ending.
      if (typeof token.si !== "number") token.si = Date.now();
      else if (Date.now() - token.si > SESSION_ABSOLUTE_MS) return null;
      // The users route, after this same browser changed its own password.
      // Anything else sent here is checked against the database like any
      // other value, so a made-up one only signs the caller out sooner.
      if (trigger === "update" && typeof (session as { pv?: unknown })?.pv === "string") {
        token.pv = (session as { pv: string }).pv;
        token.pvc = Date.now();
        return token;
      }
      const checked = typeof token.pvc === "number" ? token.pvc : 0;
      if (Date.now() - checked < RECHECK_MS || typeof token.sub !== "string") return token;
      const row = await db.query.users.findFirst({ where: eq(users.id, token.sub), columns: { password: true, role: true } });
      // Deleted account, or a password that is no longer the one this token
      // was issued for: the session ends here.
      if (!row || passwordVersion(row.password) !== token.pv) return null;
      // A role change reaches the session the same way, instead of waiting
      // for the token to expire.
      token.role = row.role;
      token.pvc = Date.now();
      return token;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpToken: { label: "2FA Code", type: "text" },
        proof: { label: "Proof", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        // Shares its counters with `/api/auth/check-2fa`, which verifies a
        // password too — throttling only one of them would leave the other
        // wide open.
        const ip = clientIp(request as unknown as { headers: { get(n: string): string | null } });
        if (loginBlocked(ip, String(credentials.email))) return null;

        const user = await db.query.users.findFirst({
          where: sql`lower(${users.email}) = ${String(credentials.email).trim().toLowerCase()}`,
        });

        // `/api/auth/check-2fa` verified this password seconds ago and said
        // so with a signed, email-bound, two-minute proof; honouring it is
        // what keeps a login at one bcrypt compare instead of two. Without a
        // valid proof — a direct call to the provider, an expired step — the
        // password is verified here as before.
        //
        // The compare runs even when there is no such user, so response time
        // does not say which email addresses have accounts.
        const proven = verifyLoginProof(credentials.proof as string | undefined, String(credentials.email));
        const passwordMatch = proven
          ? true
          : await verifyPassword(credentials.password as string, user?.password);
        if (!user || !passwordMatch) return null;

        if (user.totpEnabled && user.totpSecret) {
          const token = (credentials.totpToken as string) ?? "";
          if (!(await consumeTotp(user.id, token, user.totpSecret))) return null;
        }

        // Update last login timestamp
        await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

        return { id: user.id, email: user.email, name: user.name, role: user.role, pv: passwordVersion(user.password) };
      },
    }),
  ],
});

export const { handlers, signIn, signOut, unstable_update } = nextAuth;

/** The browser session only — for the routes an API token must never reach. */
export const sessionAuth: () => Promise<Session | null> = () => nextAuth.auth();

/**
 * Who is calling: an API token (`Authorization: Bearer bms_…`, see
 * lib/apiTokens.ts) when one is presented, otherwise the browser session.
 *
 * A token that is presented and does not check out is a refusal, not a fall
 * back to the cookie — a program with a revoked token should get 401, not
 * whatever session happens to share its cookie jar.
 */
export async function auth(): Promise<Session | null> {
  const set = sessionOverride.getStore();
  if (set) return set;
  let token: string | null = null;
  try {
    token = bearerTokenOf((await headers()).get("authorization"));
  } catch {
    // Outside a request (build, static generation): no header to read.
  }
  if (token) return sessionForToken(token);
  return nextAuth.auth();
}
