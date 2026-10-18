import { defineConfig } from "drizzle-kit";

// Sites uses a fresh review database, independent of the main deployment.
export default defineConfig({
	out: "./sites/drizzle",
	schema: "./src/db/schema.ts",
	dialect: "sqlite",
});
