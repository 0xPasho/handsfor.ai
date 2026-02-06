import { serverData } from "@/modules/general/utils/server-constants";
import { Config, defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/modules/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: serverData.environment.DATABASE_URL,
  },
}) satisfies Config;
