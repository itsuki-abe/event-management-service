import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Uses an isolated local D1 database; never touches a deployed or development DB.
const root = resolve(import.meta.dirname, "..");
const persistence = await mkdtemp(join(tmpdir(), "lt-entries-"));
const qaEnv = {
	...process.env,
	CI: "true",
	WRANGLER_SEND_METRICS: "false",
	WRANGLER_LOG_PATH: join(persistence, "wrangler.log"),
};
const key = crypto.randomUUID();
const admin = `lt_organizer=${key}`;
let server;
let logs = "";
const cli = (args) =>
	spawnSync(
		process.execPath,
		["node_modules/wrangler/bin/wrangler.js", ...args],
		{
			cwd: root,
			encoding: "utf8",
			env: qaEnv,
		},
	);
try {
	const migration = cli([
		"d1",
		"migrations",
		"apply",
		"DB",
		"--local",
		"--persist-to",
		persistence,
	]);
	assert.equal(migration.status, 0, migration.stderr || migration.stdout);
	const probe = createServer();
	probe.listen(0, "127.0.0.1");
	await once(probe, "listening");
	const port = probe.address().port;
	await new Promise((done) => probe.close(done));
	const baseURL = `http://127.0.0.1:${port}`;
	server = spawn(
		process.execPath,
		[
			"node_modules/wrangler/bin/wrangler.js",
			"dev",
			"--config",
			"dist/server/wrangler.json",
			"--ip",
			"127.0.0.1",
			"--port",
			String(port),
			"--persist-to",
			persistence,
			"--var",
			`ORGANIZER_KEY:${key}`,
		],
		{
			cwd: root,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: qaEnv,
		},
	);
	for (const stream of [server.stdout, server.stderr])
		stream.on("data", (chunk) => {
			logs = (logs + chunk).slice(-12000);
		});
	let ready = false;
	for (let i = 0; i < 120 && !ready; i++) {
		assert.equal(server.exitCode, null, "QA server exited before readiness");
		try {
			ready = (
				await fetch(`${baseURL}/api/health`, {
					signal: AbortSignal.timeout(500),
				})
			).ok;
		} catch {}
		if (!ready) await delay(250);
	}
	assert.ok(ready, "QA server did not become ready");
	async function api(path, cookie = "", body, status = 200, extraHeaders = {}) {
		const response = await fetch(`${baseURL}${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers: {
				Cookie: cookie,
				Origin: baseURL,
				"Content-Type": "application/json",
				...extraHeaders,
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const data = await response.json();
		assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
		return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
	}
	const read = async (cookie = "") => (await api("/api/lt", cookie)).data;
	const act = async (cookie, action, fields = {}, status = 200) =>
		(
			await api(
				"/api/lt",
				cookie,
				{
					revision: (await read(cookie)).revision,
					action,
					...fields,
				},
				status,
			)
		).data;
	assert.equal((await read()).event, null);
	await act(admin, "createEvent", { name: "LTエントリー確認イベント" });
	const alice = await api(
		"/api/events/1/register",
		"",
		{ nickname: "発表希望者A" },
		201,
	);
	const bob = await api(
		"/api/events/1/register",
		"",
		{ nickname: "発表希望者B" },
		201,
	);
	const pairing = await api("/api/events/1/pairing", "", {}, 201);
	await api("/api/events/1/pairing/confirm", alice.cookie, {
		code: pairing.data.code,
	});
	const pc = pairing.cookie;
	assert.equal((await read(pc)).participantId, alice.data.participant.id);
	const fields = {
		title: "発表A",
		durationSeconds: 300,
		requestId: crypto.randomUUID(),
	};
	await act("", "enterTalk", fields, 401);
	await act(alice.cookie, "enterTalk", {
		...fields,
		speakerId: bob.data.participant.id,
	});
	let snapshot = await read(alice.cookie);
	const first = snapshot.myEntries[0].id;
	assert.equal(snapshot.myEntries[0].speakerId, alice.data.participant.id);
	await act(alice.cookie, "enterTalk", { ...fields, revision: "stale-retry" });
	assert.equal(
		(await read()).talks.length,
		1,
		"A retry must not create another entry",
	);
	assert.equal((await read(pc)).myEntries[0].id, first);
	await act(
		bob.cookie,
		"editEntry",
		{ talkId: first, title: "不正な編集", durationSeconds: 60 },
		403,
	);
	await act(bob.cookie, "cancelEntry", { talkId: first }, 403);
	await act(alice.cookie, "move", { talkId: first, direction: "down" }, 401);
	await act(
		alice.cookie,
		"rejectEntry",
		{ talkId: first, reason: "不正な拒否" },
		401,
	);
	await act(alice.cookie, "editEntry", {
		talkId: first,
		title: "発表A（更新）",
		durationSeconds: 210,
	});
	assert.equal((await read(pc)).myEntries[0].title, "発表A（更新）");
	const secondData = await act(bob.cookie, "enterTalk", {
		title: "発表B",
		durationSeconds: 300,
		requestId: crypto.randomUUID(),
	});
	const second = secondData.myEntries[0].id;
	const stale = (await read()).revision;
	await act(admin, "move", { talkId: second, direction: "up" });
	assert.deepEqual(
		(await read(pc)).talks.map((talk) => talk.id),
		[second, first],
	);
	await act(
		alice.cookie,
		"editEntry",
		{ revision: stale, talkId: first, title: "古い編集", durationSeconds: 1 },
		409,
	);
	await act(admin, "select", { talkId: second });
	await act(admin, "rejectEntry", {
		talkId: second,
		reason: "今回の発表枠の都合",
	});
	snapshot = await read();
	assert.deepEqual(
		snapshot.talks.map((talk) => talk.id),
		[first],
	);
	assert.equal(
		snapshot.selectedTalkId,
		first,
		"Rejecting the selected entry must select a remaining pending talk",
	);
	assert.deepEqual(snapshot.myEntries, []);
	assert.equal(snapshot.excludedEntries, undefined);
	assert.ok(!JSON.stringify(snapshot).includes("今回の発表枠の都合"));
	assert.ok(
		!JSON.stringify(await read(alice.cookie)).includes("今回の発表枠の都合"),
	);
	const rejected = (await read(bob.cookie)).myEntries[0];
	assert.equal(rejected.entryStatus, "rejected");
	assert.equal(rejected.rejectionReason, "今回の発表枠の都合");
	assert.equal((await read(admin)).excludedEntries[0].id, second);
	await act(
		bob.cookie,
		"editEntry",
		{ talkId: second, title: "拒否後の編集", durationSeconds: 300 },
		409,
	);
	await api(`/api/engagement?eventId=1&talkId=${second}`, "", undefined, 404);
	await api(
		"/api/engagement",
		bob.cookie,
		{ eventId: 1, talkId: second, action: "reaction", kind: "like" },
		404,
	);
	await act(admin, "select", { talkId: second }, 404);
	await act(admin, "start", { talkId: first });
	await act(
		alice.cookie,
		"editEntry",
		{ talkId: first, title: "開始後の編集", durationSeconds: 10 },
		409,
	);
	await act(alice.cookie, "cancelEntry", { talkId: first }, 409);
	await act(admin, "rejectEntry", { talkId: first, reason: "開始後" }, 409);
	await act(admin, "pause", { talkId: first });
	await act(admin, "resume", { talkId: first });
	await act(admin, "end", { talkId: first });
	await act(admin, "reset", { talkId: first });
	const raceEntry = await act(alice.cookie, "enterTalk", {
		title: "開始と取消の競合",
		durationSeconds: 300,
		requestId: crypto.randomUUID(),
	});
	const raceId = raceEntry.myEntries.find(
		(entry) => entry.title === "開始と取消の競合",
	).id;
	await act(admin, "select", { talkId: raceId });
	const raceRevision = (await read()).revision;
	const race = await Promise.all(
		[
			{ cookie: admin, action: "start" },
			{ cookie: alice.cookie, action: "cancelEntry" },
		].map(async ({ cookie, action }) => {
			const result = await fetch(`${baseURL}/api/lt`, {
				method: "POST",
				headers: {
					Cookie: cookie,
					Origin: baseURL,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					action,
					revision: raceRevision,
					talkId: raceId,
				}),
			});
			return result.status;
		}),
	);
	assert.equal(race.filter((status) => status === 200).length, 1);
	assert.ok(race.every((status) => [200, 404, 409].includes(status)));
	const raceState = (await read(alice.cookie)).myEntries.find(
		(entry) => entry.id === raceId,
	);
	assert.ok(
		raceState.entryStatus === "cancelled"
			? raceState.status === "pending"
			: raceState.status === "running",
	);
	if (raceState.status === "running") {
		await act(admin, "end", { talkId: raceId });
		await act(admin, "reset", { talkId: raceId });
		await act(alice.cookie, "cancelEntry", { talkId: raceId });
	}
	await act(admin, "select", { talkId: first });
	for (const invalid of [
		{ title: "   " },
		{ durationSeconds: 0 },
		{ durationSeconds: 86401 },
		{ requestId: "invalid" },
	]) {
		await act(
			alice.cookie,
			"enterTalk",
			{
				title: "入力検証",
				durationSeconds: 300,
				requestId: crypto.randomUUID(),
				...invalid,
			},
			400,
		);
	}
	const repeat = {
		action: "enterTalk",
		title: "同時再送の発表",
		durationSeconds: 300,
		requestId: crypto.randomUUID(),
		revision: (await read()).revision,
	};
	await Promise.all([
		api("/api/lt", alice.cookie, repeat),
		api("/api/lt", pc, repeat),
	]);
	snapshot = await read(alice.cookie);
	assert.equal(
		snapshot.myEntries.filter((entry) => entry.title === repeat.title).length,
		1,
	);
	const third = snapshot.myEntries.find(
		(entry) => entry.title === repeat.title,
	).id;
	await act(alice.cookie, "cancelEntry", { talkId: third });
	assert.equal(
		(await read(pc)).myEntries.find((entry) => entry.id === third).entryStatus,
		"cancelled",
	);
	assert.ok(!(await read()).talks.some((entry) => entry.id === third));
	await api(
		"/api/lt",
		alice.cookie,
		{
			...repeat,
			requestId: crypto.randomUUID(),
			revision: (await read()).revision,
		},
		403,
		{ Origin: "https://other.test" },
	);
	const secondEvent = cli([
		"d1",
		"execute",
		"DB",
		"--local",
		"--persist-to",
		persistence,
		"--command",
		"INSERT INTO events (id, name) VALUES (2, '別イベント')",
	]);
	assert.equal(secondEvent.status, 0, secondEvent.stderr);
	const outsider = await api(
		"/api/events/2/register",
		"",
		{ nickname: "別イベント参加者" },
		201,
	);
	await act(
		outsider.cookie,
		"enterTalk",
		{ ...fields, requestId: crypto.randomUUID() },
		401,
	);
	assert.equal((await read(outsider.cookie)).participantId, null);
	const state = await api("/api/events/1/session", pc);
	await api("/api/events/1/devices/revoke", alice.cookie, {
		deviceId: state.data.currentDeviceId,
	});
	await act(
		pc,
		"enterTalk",
		{ ...fields, requestId: crypto.randomUUID() },
		401,
	);
	await act(admin, "saveTalk", {
		title: "次の発表",
		speakerId: bob.data.participant.id,
		durationSeconds: 300,
	});
	console.info(
		"LT entry API QA passed: self-entry, paired device, ownership, ordering, private rejection, cancellation, idempotent concurrent retry, stale revision, timer lifecycle, event isolation, revoked session, cross-origin rejection.",
	);
	if (process.argv.includes("--serve")) {
		const folder = join(root, "output/playwright/lt-entries");
		await mkdir(folder, { recursive: true });
		for (const [name, cookie] of Object.entries({
			admin,
			alice: alice.cookie,
			bob: bob.cookie,
		})) {
			const [cookieName, ...value] = cookie.split("=");
			await writeFile(
				join(folder, `${name}.local.json`),
				JSON.stringify({
					cookies: [
						{
							name: cookieName,
							value: value.join("="),
							domain: "127.0.0.1",
							path: "/",
							httpOnly: true,
							secure: false,
							sameSite: "Lax",
						},
					],
					origins: [],
				}),
			);
		}
		console.info(
			`QA server ready: ${baseURL} (temporary database; Ctrl+C to stop)`,
		);
		await new Promise((done) => {
			process.once("SIGINT", done);
			process.once("SIGTERM", done);
			process.stdin.setEncoding("utf8");
			process.stdin.on("data", (chunk) => {
				if (chunk.trim() === "stop") {
					process.stdin.pause();
					done();
				}
			});
		});
	}
} catch (error) {
	console.error(logs.replaceAll(key, "[test-key]"));
	throw error;
} finally {
	if (server && server.exitCode === null) {
		const exited = once(server, "exit");
		try {
			process.kill(-server.pid, "SIGTERM");
		} catch {}
		await Promise.race([exited, delay(3000)]);
		if (server.exitCode === null) {
			try {
				process.kill(-server.pid, "SIGKILL");
			} catch {}
		}
	}
	await rm(persistence, { recursive: true, force: true });
}
