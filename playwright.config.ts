import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "**/*.spec.ts",
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	use: {
		baseURL: "http://127.0.0.1:3000",
		viewport: { width: 1440, height: 1100 },
		launchOptions: {
			executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
		},
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			process.env.PLAYWRIGHT_SERVER_COMMAND ?? "bun run dev --host 127.0.0.1",
		url: "http://127.0.0.1:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
