import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = 54329;
const databaseDir = ".data/postgres";
const localUrl = `postgres://postgres:postgres@127.0.0.1:${port}/inboxly`;

function postgresBinary(): string | null {
  const candidates = [
    "/opt/homebrew/opt/postgresql@18/bin/postgres",
    "/opt/homebrew/opt/postgresql@17/bin/postgres",
    "/usr/local/opt/postgresql@18/bin/postgres",
    "/usr/local/opt/postgresql@17/bin/postgres",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const which = spawnSync("which", ["postgres"], { encoding: "utf8" });
  const found = which.stdout.trim();
  return found || null;
}

function startSystemPostgres(binary: string) {
  const bin = dirname(binary);
  if (!existsSync(`${databaseDir}/PG_VERSION`)) {
    const init = spawnSync(`${bin}/initdb`, ["-D", databaseDir, "-U", "postgres", "--auth=trust", "--no-instructions"], { stdio: "inherit" });
    if (init.status !== 0) throw new Error("initdb failed");
  }
  const start = spawnSync(`${bin}/pg_ctl`, ["-D", databaseDir, "-l", ".data/postgres.log", "-o", `-p ${port}`, "start"], { stdio: "inherit" });
  if (start.status !== 0) throw new Error("pg_ctl start failed");
  const created = spawnSync(`${bin}/createdb`, ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "inboxly"], { encoding: "utf8" });
  if (created.status !== 0 && !created.stderr.includes("already exists")) {
    throw new Error(created.stderr || "createdb failed");
  }
}

function linkLibraryAliases(dir: string, depth = 0) {
  if (depth > 8) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  if (dir.endsWith(`${join("native", "lib")}`)) {
    for (const entry of entries) {
      const match = /^(.+?)\.(\d+)(?:\.\d+)*\.dylib$/.exec(entry);
      if (!match) continue;
      for (const alias of [`${match[1]}.dylib`, `${match[1]}.${match[2]}.dylib`]) {
        const dest = join(dir, alias);
        if (alias !== entry && !existsSync(dest)) symlinkSync(entry, dest);
      }
    }
    return;
  }
  for (const entry of entries) linkLibraryAliases(join(dir, entry), depth + 1);
}

async function startEmbeddedPostgres() {
  linkLibraryAliases("node_modules/.pnpm");
  const postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: true,
  });
  if (!existsSync(`${databaseDir}/PG_VERSION`)) await postgres.initialise();
  await postgres.start();
  const client = postgres.getPgClient();
  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = 'inboxly'");
  await client.end();
  if (existing.rowCount === 0) await postgres.createDatabase("inboxly");
}

async function ensureLocalPostgres() {
  if (process.env.DATABASE_URL) return;
  const binary = postgresBinary();
  if (binary) startSystemPostgres(binary);
  else await startEmbeddedPostgres();
  process.env.DATABASE_URL = localUrl;
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
  await ensureLocalPostgres();
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
