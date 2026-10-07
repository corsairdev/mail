// Local `pnpm dev` only. Production uses `next start` and never runs this file.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const localUrl = "postgres://postgres:postgres@127.0.0.1:54329/mail";

function startDockerPostgres() {
  const up = spawnSync("docker", ["compose", "up", "-d", "--wait"], { stdio: "inherit" });
  if (up.status !== 0) throw new Error("Docker did not start Postgres. Install Docker and run this again.");
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  if (!process.env.DATABASE_URL) {
    startDockerPostgres();
    process.env.DATABASE_URL = localUrl;
  }
  process.env.DEMO_MODE ??= "true";
  process.env.PORT ??= "3000";
  process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
  const child = spawn("pnpm", ["exec", "next", "dev"], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
