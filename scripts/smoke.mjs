import assert from "node:assert/strict";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const home = await fetch(new URL("/", baseUrl));
assert.equal(home.status, 200);
assert.match(await home.text(), /Welcome to TanStack Start/);
const health = await fetch(new URL("/api/health", baseUrl));
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok", database: "connected" });
console.info("SSR and Drizzle/D1 connection passed.");
