import { defineConfig } from "drizzle-kit";
import { requireDatabaseUrl } from "./server/databaseUrl";

const { connectionString: dbUrl } = requireDatabaseUrl();

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
