import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

const isProduction = process.env.NODE_ENV === "production";
const useSecureCookies =
  isProduction || process.env.NEXTAUTH_URL?.startsWith("https://");

export const { auth, handlers } = NextAuth({
  providers: process.env.GOOGLE_CLIENT_ID
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET || "local-mode-fallback-unused",
  pages: {
    signIn: "/auth/login",
  },
  // Explicit cookie flags — defense-in-depth (NextAuth defaults are already
  // secure, but making them explicit prevents silent regressions on upgrade).
  cookies: {
    sessionToken: {
      name: useSecureCookies
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: !!useSecureCookies,
      },
    },
  },
  callbacks: {
    jwt({ token, account }) {
      if (account) {
        token.authId = account.providerAccountId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.authId as string;
      }
      return session;
    },
  },
});
