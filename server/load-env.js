/**
 * Zero-config env bootstrap for NoteLMs Mac API.
 * No hand-editing of .env required — just `npm run server`.
 *
 * Auth secret resolution (must match Vercel NEXTAUTH_SECRET for sign-in → folder):
 *  1) process env already set
 *  2) server/.env (optional)
 *  3) web/.env.local / web/.env (from `vercel env pull`)
 *  4) server/.auth-secret (last resort local-only)
 *
 * Data dir is NOT forced here — storage.js discovers the Samsung USB volume
 * the same way SocketHR uses SOCKETHR_DATA_DIR (env override optional).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const DEFAULTS = {
  PORT: "3002",
  HOST: "0.0.0.0",
  // NOTELMS_DATA_DIR intentionally unset — storage.js discovers Samsung USB.
  LM_STUDIO_BASE_URL: "http://127.0.0.1:1234/v1",
  LM_STUDIO_MODEL: "openai/gpt-oss-20b",
  // Orpheus TTS sidecar (Python) — separate from chat/classify model above.
  NOTELMS_TTS_URL: "http://127.0.0.1:5050",
  ALLOWED_ORIGINS:
    "https://notelms.com,https://www.notelms.com,http://localhost:3000,http://127.0.0.1:3000",
  JWT_ISSUER: "notelms-next",
  JWT_AUDIENCE: "notelms-mac-api",
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function applyParsed(parsed, { overwrite = false } = {}) {
  for (const [key, value] of Object.entries(parsed)) {
    if (!key) continue;
    if (!overwrite && process.env[key] != null && process.env[key] !== "") continue;
    process.env[key] = value;
  }
}

function readSecretFile(filePath) {
  try {
    const v = fs.readFileSync(filePath, "utf8").trim();
    return v || null;
  } catch {
    return null;
  }
}

function persistAuthSecret(secret) {
  const secretPath = path.join(here, ".auth-secret");
  try {
    fs.writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
  } catch {
    /* ignore */
  }
}

function isUsableSecret(value) {
  if (!value) return false;
  // vercel env pull redacts Sensitive vars as literal "[SENSITIVE]"
  if (value === "[SENSITIVE]" || value.startsWith("replace-with-")) return false;
  return value.length >= 16;
}

function ensureAuthSecret() {
  const existing =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (isUsableSecret(existing)) {
    process.env.AUTH_SECRET = existing;
    process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || existing;
    persistAuthSecret(existing);
    return { source: "env", secret: existing };
  }

  // Prefer the Next/Auth.js secret pulled from Vercel into web/.env.local
  for (const rel of ["web/.env.local", "web/.env"]) {
    const parsed = parseEnvFile(path.join(repoRoot, rel));
    const fromWeb =
      parsed.NEXTAUTH_SECRET?.trim() || parsed.AUTH_SECRET?.trim() || "";
    if (isUsableSecret(fromWeb)) {
      process.env.AUTH_SECRET = fromWeb;
      process.env.NEXTAUTH_SECRET = fromWeb;
      persistAuthSecret(fromWeb);
      return { source: rel, secret: fromWeb };
    }
  }

  const secretPath = path.join(here, ".auth-secret");
  let local = readSecretFile(secretPath);
  if (!isUsableSecret(local)) {
    local = crypto.randomBytes(32).toString("base64url");
    persistAuthSecret(local);
  }
  process.env.AUTH_SECRET = local;
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || local;
  return { source: "server/.auth-secret", secret: local };
}

applyParsed(DEFAULTS, { overwrite: false });
applyParsed(parseEnvFile(path.join(here, ".env")), { overwrite: false });

const auth = ensureAuthSecret();

export const loadedAuth = auth;
