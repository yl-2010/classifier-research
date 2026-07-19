import { SignJWT } from "jose";

export const MAC_JWT_ISSUER = "notelms-next";
export const MAC_JWT_AUDIENCE = "notelms-mac-api";

export function getMacApiBase(): string {
  const fromEnv = process.env.NOTELMS_API_BASE || process.env.NEXT_PUBLIC_NOTELMS_API_BASE;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim().replace(/\/$/, "");
  return "https://api.notelms.com";
}

export async function mintMacToken(email: string, name?: string | null): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET not configured");
  }
  const normalized = email.trim().toLowerCase();
  return new SignJWT({
    email: normalized,
    name: name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(normalized)
    .setIssuer(MAC_JWT_ISSUER)
    .setAudience(MAC_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

/**
 * Tell the Mac Studio API to create the user's email folder if missing.
 * Safe to call on every Google sign-in (new or returning).
 */
export async function ensureMacUserFolder(
  email: string,
  name?: string | null
): Promise<{ ok: boolean; created?: boolean; folder?: string; error?: string }> {
  const apiBase = getMacApiBase();
  try {
    const token = await mintMacToken(email, name);
    const res = await fetch(`${apiBase}/api/ensure-user`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: name ?? null }),
      // Don't hang the sign-in redirect forever if the Mac/tunnel is down.
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      created?: boolean;
      folder?: string;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `ensure-user ${res.status}` };
    }
    return {
      ok: true,
      created: Boolean(data.created),
      folder: data.folder,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
