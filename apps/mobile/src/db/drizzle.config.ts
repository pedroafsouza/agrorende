import { defineConfig } from "drizzle-kit";

/** Dev-only: `npx drizzle-kit generate --config src/db/drizzle.config.ts` from apps/mobile. */
export default defineConfig({
  dialect: "sqlite",
  driver: "expo",
  schema: "./src/db/schema.ts",
  out: "./src/db/drizzle",
});
