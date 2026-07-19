import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { ensureMacUserFolder } from "@/lib/mac-api";

/**
 * Same-origin helper: provision the signed-in user's Mac Studio folder.
 * Useful if the Auth.js signIn event could not reach the Mac (tunnel down).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    res.status(401).json({ ok: false, error: "sign in required" });
    return;
  }

  const result = await ensureMacUserFolder(email, session?.user?.name ?? null);
  if (!result.ok) {
    res.status(502).json({ ok: false, error: result.error || "mac ensure failed" });
    return;
  }

  res.status(result.created ? 201 : 200).json(result);
}
