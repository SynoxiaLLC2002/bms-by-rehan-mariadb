import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

// BMS 2.0: MariaDB. Migrations live in drizzle-mysql/ — the Postgres history
// in drizzle/ belongs to 1.9.x and is never replayed here (AUDIT-2026-10-21.md).
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle-mysql",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
