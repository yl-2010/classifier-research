/**
 * Zero-config env bootstrap for NoteLMs Mac API.
 * No hand-editing of .env required — just `npm run server`.
 *
 * Resolution order for AUTH_SECRET / NEXTAUTH_SECRET:
 *  1) process env already set
 *  2) server/.env (optional)
 *  3) web/.env.local or web/.env (Auth.js secret from Vercel pull / local Next)
 *  4) server/.auth-secret (auto-generated, gitignored)
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
  NOTELMS_DATA_DIR: "/Volumes/Samsung USB/notelms",
  LM_STUDIO_BASE_URL: "http://127.0.0.1:1234/v1",
  LM_STUDIO_MODEL: "openai/gpt-oss-20b",
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

function ensureAuthSecret() {
  const existing =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (existing && !existing.startsWith("replace-with-")) {
    process.env.AUTH_SECRET = existing;
    process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || existing;
    return { source: "env", secret: existing };
  }

  // Prefer the Next/Auth.js secret if the web app already has one locally.
  for (const rel of ["web/.env.local", "web/.env"]) {
    const parsed = parseEnvFile(path.join(repoRoot, rel));
    const fromWeb =
      parsed.NEXTAUTH_SECRET?.trim() || parsed.AUTH_SECRET?.trim() || "";
    if (fromWeb && !fromWeb.startsWith("replace-with-")) {
      process.env.AUTH_SECRET = fromWeb;
      process.env.NEXTAUTH_SECRET = fromWeb;
      return { source: rel, secret: fromWeb };
    }
  }

  const secretPath = path.join(here, ".auth-secret");
  let local = readSecretFile(secretPath);
  if (!local) {
    local = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(secretPath, `${local}\n`, { mode: 0o600 });
  }
  process.env.AUTH_SECRET = local;
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || local;
  return { source: "server/.auth-secret", secret: local };
}

// Defaults first (never override real env).
applyParsed(DEFAULTS, { overwrite: false });

// Optional server/.env — convenience only, not required.
applyParsed(parseEnvFile(path.join(here, ".env")), { overwrite: false });

const auth = ensureAuthSecret();

export const loadedAuth = auth;
