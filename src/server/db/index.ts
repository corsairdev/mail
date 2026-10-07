import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";
import { CORSAIR_SQL } from "./corsair-sql";

export type AppDb = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let db: AppDb | undefined;
let ready: Promise<void> | undefined;

export function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Run pnpm dev so the local Postgres starts, or export DATABASE_URL.");
  }
  pool ??= new Pool({ connectionString: url, max: 8 });
  return pool;
}

export function getDb(): AppDb {
  db ??= drizzle(getPool(), { schema });
  return db;
}

export function ensureReady(): Promise<void> {
  ready ??= (async () => {
    const database = getDb();
    await migrate(database, { migrationsFolder: "./drizzle" });
    await getPool().query(CORSAIR_SQL);
  })();
  return ready;
}

export { schema };
