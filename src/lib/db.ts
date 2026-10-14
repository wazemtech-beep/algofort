import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

const state = globalThis as typeof globalThis & { algofortDb?: PrismaClient; algofortPool?: Pool };

function createDatabase() {
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error("Algofort DATABASE_URL is missing.");
  const url = new URL(configured);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  // With a provider CA, enforce certificate verification. Without it preserve
  // the supplied Aiven encrypted sslmode=require/libpq connection semantics.
  if (ca) {
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
  } else if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("uselibpqcompat", "true");
  }
  for (const name of ["connection_limit", "pool_timeout", "connect_timeout", "pgbouncer"]) url.searchParams.delete(name);
  const pool = new Pool({ connectionString: url.toString(), max: 1, min: 0, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, maxLifetimeSeconds: 60, allowExitOnIdle: true, application_name: "algofort", ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}) });
  pool.on("error", error => console.error("ALGOFORT_DATABASE_POOL", "code" in error ? error.code : error.name));
  if (process.env.VERCEL) attachDatabasePool(pool);
  state.algofortPool = pool;
  return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }), transactionOptions: { maxWait: 10000, timeout: 20000 } });
}

export const db = state.algofortDb ??= createDatabase();
