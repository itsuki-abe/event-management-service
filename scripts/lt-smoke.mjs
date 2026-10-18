import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = new URL(process.argv[2] ?? "http://localhost:3000");
assert.ok(
	baseUrl.protocol === "http:" &&
		["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname),
	"LT smoke only runs against a local HTTP server with a fresh database.",
);
const organizerKey = process.env.ORGANIZER_KEY;
assert.ok(
	organizerKey,
	"Set ORGANIZER_KEY to the local server's organizer key.",
);
const endpoint = new URL("/api/lt", baseUrl);
const loginUrl = new URL("/api/login", baseUrl);
loginUrl.searchParams.set("key", "wrong-key");
const rejected = await fetch(loginUrl, { redirect: "manual" });
assert.equal(rejected.status, 303);
assert.equal(rejected.headers.get("Set-Cookie"), null);
loginUrl.searchParams.set("key", organizerKey);
const accepted = await fetch(loginUrl, { redirect: "manual" });
assert.equal(accepted.headers.get("Location"), "/help?role=organizer");
const cookie = accepted.headers.get("Set-Cookie")?.split(";")[0];
assert.ok(cookie, "Organizer link must set a session cookie.");

async function request(body, authenticated = true) {
	const response = await fetch(endpoint, {
		method: body ? "POST" : "GET",
		headers: body
			? {
					"Content-Type": "application/json",
					...(authenticated ? { Cookie: cookie } : {}),
				}
			: {},
		body: body ? JSON.stringify(body) : undefined,
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
	return { status: response.status, data: await response.json() };
}

async function read() {
	const result = await request();
	assert.equal(result.status, 200, JSON.stringify(result.data));
	assert.ok(Array.isArray(result.data.talks));
	assert.equal(typeof result.data.revision, "string");
	assert.equal(typeof result.data.serverNow, "number");
	return result.data;
}

let snapshot = await read();
assert.equal(
	snapshot.event,
	null,
	"Refusing to modify an existing event. Use a fresh local database.",
);
assert.deepEqual(snapshot.talks, []);

async function action(name, fields = {}, expectedStatus = 200) {
	const result = await request({
		action: name,
		revision: snapshot.revision,
		...fields,
	});
	assert.equal(
		result.status,
		expectedStatus,
		`${name}: ${JSON.stringify(result.data)}`,
	);
	if (expectedStatus === 200) snapshot = result.data;
	else assert.equal(typeof result.data.error, "string");
	return result.data;
}

async function denied(body) {
	const result = await request(body, false);
	assert.equal(result.status, 401, JSON.stringify(result.data));
	assert.equal(typeof result.data.error, "string");
	assert.equal((await read()).revision, snapshot.revision);
}

function talk(id) {
	const result = snapshot.talks.find((item) => item.id === id);
	assert.ok(result, `Missing talk ${id}`);
	return result;
}

function elapsed(state, currentTalk) {
	return (
		currentTalk.elapsedSeconds +
		(currentTalk.status === "running"
			? Math.max(0, state.serverNow - currentTalk.resumedAt)
			: 0)
	);
}

await denied({ action: "authorize" });
await action("authorize");
assert.equal(snapshot.event, null);
await denied({ action: "createEvent", name: "Unauthorized event" });
await action("createEvent", { name: "LT smoke event" });
assert.equal(snapshot.event.name, "LT smoke event");

const ids = [];
for (let index = 0; index < 3; index++) {
	await action("saveTalk", {
		title: `Talk ${index + 1}`,
		speaker: `Speaker ${index + 1}`,
		durationSeconds: 300,
	});
	ids.push(
		snapshot.talks.find((item) => item.title === `Talk ${index + 1}`).id,
	);
}
const [firstId, secondId, thirdId] = ids;
await denied({
	action: "saveTalk",
	revision: snapshot.revision,
	id: firstId,
	title: "Unauthorized edit",
	speaker: "Unknown",
	durationSeconds: 1,
});
await denied({ action: "start", revision: snapshot.revision, talkId: firstId });
assert.equal(
	(await read()).talks.find((item) => item.id === firstId).title,
	"Talk 1",
);

await action("saveTalk", {
	id: thirdId,
	title: "Edited talk",
	speaker: "Edited speaker",
	durationSeconds: 1,
});
await action("move", { talkId: thirdId, direction: "up" });
await action("move", { talkId: thirdId, direction: "up" });
await action("move", { talkId: thirdId, direction: "up" }, 409);
assert.deepEqual(
	snapshot.talks.map((item) => item.id),
	[thirdId, firstId, secondId],
);
assert.equal(talk(thirdId).durationSeconds, 1);
assert.equal(talk(thirdId).speaker, "Edited speaker");
await action("select", { talkId: thirdId });
assert.equal(snapshot.selectedTalkId, thirdId);
assert.equal(talk(thirdId).status, "pending");
assert.equal(talk(thirdId).resumedAt, null);

const startingRevision = snapshot.revision;
const competingStarts = await Promise.all([
	request({ action: "start", revision: startingRevision, talkId: thirdId }),
	request({ action: "start", revision: startingRevision, talkId: thirdId }),
]);
assert.deepEqual(
	competingStarts.map((result) => result.status).sort(),
	[200, 409],
);
snapshot = await read();
assert.equal(talk(thirdId).status, "running");
assert.equal(typeof talk(thirdId).resumedAt, "number");
assert.equal(
	snapshot.talks.filter((item) => ["running", "paused"].includes(item.status))
		.length,
	1,
);
await action("start", { talkId: thirdId }, 409);
await action("start", { talkId: firstId }, 409);

await delay(1_200);
snapshot = await read();
assert.equal(snapshot.selectedTalkId, thirdId);
assert.equal(
	talk(thirdId).status,
	"running",
	"Overtime must not end a talk automatically.",
);
assert.ok(
	elapsed(snapshot, talk(thirdId)) >= 1,
	"The shared timer must reach overtime.",
);
await action("pause", { talkId: thirdId });
assert.equal(talk(thirdId).status, "paused");
assert.equal(talk(thirdId).resumedAt, null);
const pausedElapsed = talk(thirdId).elapsedSeconds;
assert.ok(pausedElapsed >= 1);
await delay(1_100);
snapshot = await read();
assert.equal(
	talk(thirdId).status,
	"paused",
	"Reload must restore a paused timer.",
);
assert.equal(talk(thirdId).elapsedSeconds, pausedElapsed);
await action("resume", { talkId: thirdId });
assert.equal(talk(thirdId).status, "running");
assert.equal(talk(thirdId).elapsedSeconds, pausedElapsed);
await delay(1_200);
snapshot = await read();
assert.equal(
	talk(thirdId).status,
	"running",
	"Reload must restore a running timer.",
);
assert.ok(elapsed(snapshot, talk(thirdId)) > pausedElapsed);
await action("end", { talkId: thirdId });
assert.equal(talk(thirdId).status, "ended");
assert.equal(talk(thirdId).resumedAt, null);
assert.ok(
	talk(thirdId).elapsedSeconds > pausedElapsed,
	"Ending must record the actual duration.",
);
await action("reset", { talkId: thirdId });
assert.equal(talk(thirdId).status, "pending");
assert.equal(talk(thirdId).elapsedSeconds, 0);
await action("start", { talkId: thirdId });
await action("end", { talkId: thirdId });
const endedElapsed = talk(thirdId).elapsedSeconds;
await action("next", { talkId: thirdId });
assert.equal(snapshot.selectedTalkId, firstId);
assert.equal(talk(firstId).status, "pending");
assert.equal(talk(firstId).resumedAt, null);
assert.equal(talk(firstId).elapsedSeconds, 0);
const expectedRevision = snapshot.revision;
snapshot = await read();
assert.equal(snapshot.revision, expectedRevision);
assert.equal(snapshot.selectedTalkId, firstId);
assert.equal(
	talk(firstId).status,
	"pending",
	"Advancing must wait for an explicit start.",
);
assert.equal(talk(thirdId).elapsedSeconds, endedElapsed);
await action("deleteTalk", { talkId: thirdId }, 409);
await action("deleteTalk", { talkId: secondId });
assert.equal(
	snapshot.talks.some((item) => item.id === secondId),
	false,
);
console.info(
	"LT organizer link, editing, reordering, deletion, concurrent start, pause/resume, overtime, reset, end, next, and reload passed.",
);
