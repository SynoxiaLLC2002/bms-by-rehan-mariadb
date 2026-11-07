import type { NextAuthConfig } from "next-auth";

export default {
  pages: { signIn: "/admin/login" },
  // Seven days without a visit and the session ends. NextAuth's default was
  // 30 days, renewed on every use — an admin who used the site weekly was
  // never signed out, and a stolen cookie stayed good until the password
  // changed. An absolute limit from sign-in is enforced in lib/auth.ts.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
