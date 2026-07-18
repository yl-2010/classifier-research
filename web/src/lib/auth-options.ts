import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // State-only checks: PKCE verifier cookies can fail behind some CDN/proxy setups.
      checks: ["state"],
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email.toLowerCase();
      }
      if (user?.name) {
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email =
          (typeof token.email === "string" && token.email) ||
          session.user.email ||
          null;
        session.user.name =
          (typeof token.name === "string" && token.name) ||
          session.user.name ||
          null;
      }
      return session;
    },
  },
};
