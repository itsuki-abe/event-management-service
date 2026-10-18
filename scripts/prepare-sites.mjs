import { cp, mkdir, rm } from "node:fs/promises";

// Cloudflare emits local preview secrets; never upload those to Sites.
await rm("dist/server/.dev.vars", { force: true });
await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
