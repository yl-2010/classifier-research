import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { SignJWT } from "jose";
import { authOptions } from "@/lib/auth-options";

const ISSUER = "notelms-next";
const AUDIENCE = "notelms-mac-api";
const TTL = "10m";

/**
 * Mint a short-lived HS256 JWT for the Mac Studio Express API.
 * Browser cannot send NextAuth cookies cross-origin to api.notelms.com,
 * so the UI calls this same-origin route, then sends Authorization: Bearer.
 *
 * AUTH_SECRET / NEXTAUTH_SECRET on Vercel must match server/.env AUTH_SECRET.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }

  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    res.status(503).json({ ok: false, error: "NEXTAUTH_SECRET not configured" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    res.status(401).json({ ok: false, error: "sign in required" });
    return;
  }

  const token = await new SignJWT({
    email,
    name: session?.user?.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(new TextEncoder().encode(secret));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    token,
    expiresIn: 600,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}
