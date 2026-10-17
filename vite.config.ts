import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		cloudflare({
			viteEnvironment: { name: "ssr" },
			inspectorPort:
				process.env.DISABLE_DEV_INSPECTOR === "1" ? false : undefined,
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
