import assert from "node:assert/strict";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const access = {
	headers: process.env.SITES_SERVICE_TOKEN
		? { "OAI-Sites-Authorization": `Bearer ${process.env.SITES_SERVICE_TOKEN}` }
		: {},
};
const home = await fetch(new URL("/", baseUrl), access);
assert.equal(home.status, 200);
assert.match(await home.text(), /LTライブ/);
const health = await fetch(new URL("/api/health", baseUrl), access);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok", database: "connected" });
console.info("SSR and Drizzle/D1 connection passed.");
