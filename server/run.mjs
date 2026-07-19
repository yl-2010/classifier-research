/**
 * Bootstrap NoteLMs Express: ensure .env exists, then start index.js with --env-file.
 * Avoids `node: .env: not found` when someone hasn't copied .env.example yet.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, ".env");
const examplePath = path.join(here, ".env.example");

if (!fs.existsSync(envPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error("[notelms-server] missing .env and .env.example");
    process.exit(1);
  }
  fs.copyFileSync(examplePath, envPath);
  console.warn(
    "[notelms-server] created server/.env from .env.example — set AUTH_SECRET to match Vercel NEXTAUTH_SECRET, then restart."
  );
}

const watch = process.argv.includes("--watch");
const nodeArgs = watch
  ? ["--watch", "--env-file=.env", "index.js"]
  : ["--env-file=.env", "index.js"];

const child = spawn(process.execPath, nodeArgs, {
  cwd: here,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
