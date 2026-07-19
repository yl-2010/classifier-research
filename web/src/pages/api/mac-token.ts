import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import {
  MAC_JWT_AUDIENCE,
  MAC_JWT_ISSUER,
  mintMacToken,
} from "@/lib/mac-api";

/**
 * Mint a short-lived HS256 JWT for the Mac Studio Express API.
 * Browser cannot send NextAuth cookies cross-origin to api.notelms.com,
 * so the UI calls this same-origin route, then sends Authorization: Bearer.
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

  const token = await mintMacToken(email, session?.user?.name ?? null);

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    token,
    expiresIn: 600,
    issuer: MAC_JWT_ISSUER,
    audience: MAC_JWT_AUDIENCE,
  });
}
