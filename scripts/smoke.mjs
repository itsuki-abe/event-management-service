import assert from "node:assert/strict";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const home = await fetch(new URL("/", baseUrl));
assert.equal(home.status, 200);
assert.match(await home.text(), /イベントのいまを、見渡そう。/);
const display = await fetch(new URL("/display", baseUrl));
assert.equal(display.status, 200);
assert.match(await display.text(), /WELCOME TO THE COMMUNITY/);
const health = await fetch(new URL("/api/health", baseUrl));
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok", database: "connected" });
console.info("SSR and Drizzle/D1 connection passed.");
