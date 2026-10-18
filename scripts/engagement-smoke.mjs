import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

// Run against local sample data, never against a production event.
const baseUrl = process.argv[2] ?? "http://localhost:3000";
if (!process.env.ORGANIZER_KEY) {
	try {
		process.loadEnvFile(".dev.vars");
	} catch {
		/* May be supplied directly via the environment. */
	}
}
const token = process.env.ORGANIZER_KEY;
assert.ok(token, "Set ORGANIZER_KEY or create .dev.vars first.");
const login = await fetch(
	new URL(`/api/login?key=${encodeURIComponent(token)}`, baseUrl),
	{ redirect: "manual" },
);
assert.equal(login.headers.get("location"), "/help?role=organizer");
const organizerCookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(organizerCookie, "Organizer login must set a session cookie.");
let cookie = "";
async function request(method, payload, { admin = false, status = 200 } = {}) {
	const response = await fetch(new URL("/api/engagement", baseUrl), {
		method,
		headers: {
			"Content-Type": "application/json",
			Cookie: [cookie, admin ? organizerCookie : ""].filter(Boolean).join("; "),
		},
		body: JSON.stringify({ eventId: 1, ...payload }),
	});
	const setCookie = response.headers.get("set-cookie");
	if (setCookie) cookie = setCookie.split(";")[0];
	const result = await response.json();
	assert.equal(response.status, status, JSON.stringify(result));
	return result;
}
async function read(talkId = 1, admin = false) {
	const response = await fetch(
		new URL(
			`/api/engagement?eventId=1&talkId=${talkId}${admin ? "&admin=1" : ""}`,
			baseUrl,
		),
		{ headers: admin ? { Cookie: organizerCookie } : {} },
	);
	assert.equal(response.status, 200);
	return response.json();
}
const initial = await read(1, true);
const settings = {
	action: "settings",
	commentsEnabled: initial.commentsEnabled,
	commentsProjectionEnabled: initial.commentsProjectionEnabled,
};
const created = [];
try {
	await request("PATCH", settings, { status: 403 });
	const denied = await fetch(
		new URL("/api/engagement?eventId=1&admin=1", baseUrl),
	);
	assert.equal(denied.status, 403);
	await request(
		"PATCH",
		{ ...settings, commentsEnabled: true },
		{ admin: true },
	);
	await request(
		"POST",
		{
			action: "comment",
			talkId: 1,
			displayName: "動作確認",
			body: "a".repeat(201),
		},
		{ status: 400 },
	);
	await request(
		"POST",
		{ action: "reaction", talkId: 1, kind: "unknown" },
		{ status: 400 },
	);
	await request(
		"POST",
		{ action: "reaction", talkId: 999999, kind: "like" },
		{ status: 404 },
	);
	await request(
		"POST",
		{ action: "comment", talkId: 1, body: "名前がない投稿" },
		{ status: 400 },
	);
	const comment = await request(
		"POST",
		{
			action: "comment",
			talkId: 1,
			displayName: "動作確認",
			body: "🧵".repeat(200),
		},
		{ status: 201 },
	);
	created.push(comment.id);
	assert.ok(cookie, "Posting should create an anonymous HttpOnly session.");
	const fromOtherDevice = await read(1);
	assert.equal(
		fromOtherDevice.comments.find((c) => c.id === comment.id)?.body,
		"🧵".repeat(200),
	);
	assert.ok(!(await read(2)).comments.some((c) => c.id === comment.id));
	const before = (await read(1)).reactions;
	for (const kind of ["applause", "like", "learn", "hot"]) {
		await request(
			"POST",
			{ action: "reaction", talkId: 1, kind },
			{ status: 201 },
		);
		assert.equal((await read(1)).reactions[kind], before[kind] + 1);
		await delay(1050);
	}
	const secondBefore = (await read(2)).reactions.like;
	await request(
		"POST",
		{ action: "reaction", talkId: 2, kind: "like" },
		{ status: 201 },
	);
	assert.equal((await read(2)).reactions.like, secondBefore + 1);
	assert.equal((await read(1)).reactions.like, before.like + 1);
	// Multiple simultaneous requests from the same session cannot all be accepted.
	const burst = await Promise.all(
		Array.from({ length: 4 }, () =>
			fetch(new URL("/api/engagement", baseUrl), {
				method: "POST",
				headers: { "Content-Type": "application/json", Cookie: cookie },
				body: JSON.stringify({
					eventId: 1,
					talkId: 1,
					action: "reaction",
					kind: "applause",
				}),
			}),
		),
	);
	assert.ok(burst.some((response) => response.status === 429));
	assert.ok(burst.every((response) => [201, 429].includes(response.status)));
	await request(
		"PATCH",
		{ action: "hide", commentId: comment.id },
		{ status: 403 },
	);
	await request(
		"PATCH",
		{ action: "hide", commentId: comment.id },
		{ admin: true },
	);
	assert.ok(!(await read(1)).comments.some((c) => c.id === comment.id));
	assert.ok(
		(await read(1, true)).comments.find((c) => c.id === comment.id)?.hiddenAt,
	);
	await request(
		"PATCH",
		{ ...settings, commentsEnabled: false, commentsProjectionEnabled: true },
		{ admin: true },
	);
	await request(
		"POST",
		{
			action: "comment",
			talkId: 1,
			displayName: "動作確認",
			body: "停止中の投稿",
		},
		{ status: 409 },
	);
	const paused = await read(1);
	assert.equal(paused.commentsEnabled, false);
	assert.equal(paused.commentsProjectionEnabled, true);
	await request(
		"PATCH",
		{ ...settings, commentsEnabled: true, commentsProjectionEnabled: false },
		{ admin: true },
	);
	const resumed = await request(
		"POST",
		{
			action: "comment",
			talkId: 2,
			displayName: "動作確認",
			body: "受付再開の確認",
		},
		{ status: 201 },
	);
	created.push(resumed.id);
	assert.ok((await read(2)).comments.some((c) => c.id === resumed.id));
	const crossOrigin = await fetch(new URL("/api/engagement", baseUrl), {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json",
			Origin: "https://other.example",
			Cookie: organizerCookie,
		},
		body: JSON.stringify({
			eventId: 1,
			action: "reaction",
			talkId: 1,
			kind: "like",
		}),
	});
	assert.equal(crossOrigin.status, 403);
	console.info(
		"交流API: 4種の集計・発表の分離・200文字・受付停止/再開・非表示・運営権限・連打制限を確認しました。",
	);
} finally {
	for (const commentId of created)
		await request("PATCH", { action: "hide", commentId }, { admin: true });
	await request("PATCH", settings, { admin: true });
}
