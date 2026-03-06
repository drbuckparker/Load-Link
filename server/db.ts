import { Pool, PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL;

const isNeonOrExternal = connectionString?.includes('neon.tech') || connectionString?.includes('amazonaws.com');

const poolConfig: PoolConfig = {
  connectionString,
  ...(isNeonOrExternal ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("Pool error (will reconnect):", err.message);
});

export const db = drizzle(pool, { schema });
export { pool };
