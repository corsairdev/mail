// Local `pnpm dev` only. Production uses `next start` and never runs this file.
import { spawn, spawnSync } from "node:child_process";

const localUrl = "postgres://postgres:postgres@127.0.0.1:54329/mail";

if (!process.env.DATABASE_URL) {
  const up = spawnSync("docker", ["compose", "up", "-d", "--wait"], { stdio: "inherit" });
  if (up.status !== 0) {
    console.error("Docker did not start Postgres.");
    process.exit(1);
  }
  process.env.DATABASE_URL = localUrl;
}

process.env.DEMO_MODE ??= "true";
process.env.PORT ??= "3000";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";

const child = spawn("next", ["dev"], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
