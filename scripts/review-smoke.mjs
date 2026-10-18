import assert from "node:assert/strict";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
if (!process.env.ENGAGEMENT_ADMIN_TOKEN) {
	try {
		process.loadEnvFile(".dev.vars");
	} catch {
		/* May be supplied via the environment. */
	}
}
const token = process.env.ENGAGEMENT_ADMIN_TOKEN;
assert.ok(token, "ENGAGEMENT_ADMIN_TOKEN is required.");
const access = process.env.SITES_SERVICE_TOKEN
	? { "OAI-Sites-Authorization": `Bearer ${process.env.SITES_SERVICE_TOKEN}` }
	: {};
async function review(
	method,
	body,
	{ authenticated = true, status = 200 } = {},
) {
	const response = await fetch(new URL("/api/review-setup", baseUrl), {
		method,
		headers: {
			...access,
			"Content-Type": "application/json",
			...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	const result = await response.json();
	assert.equal(response.status, status, JSON.stringify(result));
	return result;
}
async function live() {
	const response = await fetch(new URL("/api/engagement?eventId=1", baseUrl), {
		headers: access,
	});
	assert.equal(response.status, 200);
	return response.json();
}
await review("GET", undefined, { authenticated: false, status: 403 });
await review("POST", {}, { authenticated: false, status: 403 });
assert.equal((await review("GET")).enabled, true);
await review("POST", {});
const initial = await live();
try {
	await review("PATCH", { talkId: 2 }, { authenticated: false, status: 403 });
	await review("PATCH", { talkId: 999999 }, { status: 404 });
	await review("PATCH", { talkId: 2 });
	assert.equal((await live()).selectedTalkId, 2);
	await review("POST", {});
	const repeated = await live();
	assert.equal(repeated.selectedTalkId, 2);
	assert.deepEqual(repeated.reactions, (await live()).reactions);
	assert.equal(repeated.talks.length, initial.talks.length);
} finally {
	await review("PATCH", { talkId: initial.selectedTalkId ?? 1 });
}
console.info(
	"Sites確認機能: 初期データ・再実行・発表切替・権限を確認しました。",
);
