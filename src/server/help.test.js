import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { getHelpSession } from "./help";

let runtime;
let database;
const key = "help-test-key / 日本語";
const origin = "https://events.test";
const participantToken = "a".repeat(64);
const unregisteredToken = "b".repeat(64);
const expiredToken = "c".repeat(64);
const otherEventToken = "d".repeat(64);

beforeAll(async () => {
	runtime = new Miniflare({
		workers: [
			{
				config: {
					name: "help-tests",
					compatibilityDate: "2026-10-06",
					manifest: {
						mainModule: "worker.js",
						modules: {
							"worker.js": {
								type: "esm",
								contents:
									"export default { fetch() { return new Response('test'); } }",
							},
						},
					},
					env: { DB: { type: "d1", id: "help-tests" } },
				},
			},
		],
	});
	database = await runtime.getD1Database("DB");
	const folder = new URL("../../drizzle/", import.meta.url);
	for (const name of (await readdir(folder))
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		const sql = await readFile(new URL(name, folder), "utf8");
		await database.batch(
			sql
				.split("--> statement-breakpoint")
				.filter((part) => part.trim())
				.map((part) => database.prepare(part)),
		);
	}
}, 30_000);

afterAll(async () => {
	await runtime?.dispose();
});

beforeEach(async () => {
	await database.prepare("DELETE FROM device_sessions").run();
	await database.prepare("DELETE FROM participants").run();
	await database.prepare("DELETE FROM events").run();
	await database
		.prepare(
			"INSERT INTO events (id, name) VALUES (1, 'イベントA'), (2, 'イベントB')",
		)
		.run();
	await database
		.prepare(
			"INSERT INTO participants (id, event_id, nickname, role) VALUES (11, 1, '参加者A', 'organizer'), (22, 2, '参加者B', 'participant')",
		)
		.run();
	const expiry = Math.floor(Date.now() / 1000) + 3600;
	await database.batch(
		[
			[1, 11, participantToken, expiry],
			[1, null, unregisteredToken, expiry],
			[1, 11, expiredToken, 1],
			[2, 22, otherEventToken, expiry],
		].map(([eventId, participantId, token, expires]) =>
			database
				.prepare(
					"INSERT INTO device_sessions (event_id, participant_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
				)
				.bind(
					eventId,
					participantId,
					createHash("sha256").update(token).digest("hex"),
					expires,
				),
		),
	);
});

async function session({
	eventId = "1",
	cookie,
	configuredKey = key,
	db = database,
} = {}) {
	const url = new URL("/api/help/session", origin);
	if (eventId !== null) url.searchParams.set("eventId", eventId);
	const response = await getHelpSession(
		db,
		new Request(url, { headers: cookie ? { cookie } : {} }),
		configuredKey,
	);
	return {
		status: response.status,
		headers: response.headers,
		data: await response.json(),
	};
}

test("未ログインでも登録先イベントを案内し、閲覧でセッションを作らない", async () => {
	const before = await database
		.prepare("SELECT count(*) AS count FROM device_sessions")
		.first();
	for (const cookie of [undefined, `event_session_1=${unregisteredToken}`]) {
		const result = await session({ cookie });
		expect(result.status).toBe(200);
		expect(result.data).toEqual({
			event: { id: 1, name: "イベントA" },
			participant: null,
			organizer: false,
		});
		expect(result.headers.get("cache-control")).toBe("private, no-store");
		expect(result.headers.has("set-cookie")).toBe(false);
	}
	expect(
		await database
			.prepare("SELECT count(*) AS count FROM device_sessions")
			.first(),
	).toEqual(before);
});

test("運営用Cookieを検証し、空・未設定・初期値のキーでは運営扱いにしない", async () => {
	const cookie = `lt_organizer=${encodeURIComponent(key)}`;
	expect((await session({ cookie })).data.organizer).toBe(true);
	for (const configuredKey of [
		undefined,
		null,
		"",
		123,
		"replace-with-a-long-random-key",
	]) {
		// Explicit undefined must also reach getHelpSession rather than use the helper default.
		const response = await getHelpSession(
			database,
			new Request(`${origin}/api/help/session?eventId=1`, {
				headers: { cookie },
			}),
			configuredKey,
		);
		expect((await response.json()).organizer).toBe(false);
	}
	for (const cookie of [
		"lt_organizer=wrong",
		`not_lt_organizer=${encodeURIComponent(key)}`,
		"lt_organizer=%malformed",
	]) {
		expect((await session({ cookie })).data.organizer).toBe(false);
	}
});

test("参加者セッションから必要な表示名のみ返し、参加者のroleでは運営権限を与えない", async () => {
	const result = await session({
		cookie: `event_session_1=${participantToken}`,
	});
	expect(result.data).toEqual({
		event: { id: 1, name: "イベントA" },
		participant: { nickname: "参加者A" },
		organizer: false,
	});
	expect(result.headers.get("cache-control")).toBe("private, no-store");
	const both = await session({
		cookie: `event_session_1=${participantToken}; lt_organizer=${encodeURIComponent(key)}`,
	});
	expect(both.data).toEqual({ ...result.data, organizer: true });
});

test("偽造・形式不正・期限切れのCookieから参加者を認定しない", async () => {
	for (const token of [
		"e".repeat(64),
		"invalid",
		"A".repeat(64),
		"%malformed",
		expiredToken,
		"",
	]) {
		const result = await session({ cookie: `event_session_1=${token}` });
		expect(result.status).toBe(200);
		expect(result.data.participant).toBeNull();
	}
});

test("Cookie名の付け替えでも別イベントの参加登録を引き継がない", async () => {
	for (const cookie of [
		`event_session_1=${participantToken}`,
		`event_session_2=${participantToken}`,
	]) {
		expect(
			(await session({ eventId: "2", cookie })).data.participant,
		).toBeNull();
	}
	const result = await session({
		eventId: "2",
		cookie: `event_session_1=${participantToken}; event_session_2=${otherEventToken}`,
	});
	expect(result.data).toEqual({
		event: { id: 2, name: "イベントB" },
		participant: { nickname: "参加者B" },
		organizer: false,
	});
});

test("イベント未指定時は既存LT画面と同じ最初のイベントを使う", async () => {
	const result = await session({
		eventId: null,
		cookie: `event_session_1=${participantToken}`,
	});
	expect(result.status).toBe(200);
	expect(result.data.event).toEqual({ id: 1, name: "イベントA" });
	expect(result.data.participant).toEqual({ nickname: "参加者A" });
});

test("不正なイベントIDと存在しないイベントを明確に拒否する", async () => {
	for (const eventId of [
		"",
		"0",
		"-1",
		"01",
		"1.5",
		"1x",
		"1e2",
		" 1",
		"9007199254740992",
		"1 OR 1=1",
	]) {
		const result = await session({ eventId });
		expect(result.status).toBe(400);
		expect(result.data).toEqual({ error: "イベントのURLを確認してください。" });
		expect(result.headers.get("cache-control")).toBe("private, no-store");
	}
	const missing = await session({ eventId: "999" });
	expect(missing.status).toBe(404);
	expect(missing.headers.get("cache-control")).toBe("private, no-store");
	expect(missing.data.participant).toBeUndefined();
});

test("イベント未作成でも運営の初期設定用ガイドを判定できる", async () => {
	await database.prepare("DELETE FROM device_sessions").run();
	await database.prepare("DELETE FROM participants").run();
	await database.prepare("DELETE FROM events").run();
	for (const cookie of [undefined, `lt_organizer=${encodeURIComponent(key)}`]) {
		const result = await session({ eventId: null, cookie });
		expect(result.status).toBe(200);
		expect(result.data).toEqual({
			event: null,
			participant: null,
			organizer: Boolean(cookie),
		});
	}
	expect((await session()).status).toBe(404);
});

test("DB障害時は内部情報を返さず再試行可能なエラーを返す", async () => {
	const db = {
		prepare() {
			throw new Error("private database path and SQL details");
		},
	};
	const result = await session({ db });
	expect(result.status).toBe(500);
	expect(result.headers.get("cache-control")).toBe("private, no-store");
	expect(result.data).toEqual({
		error: "参加状態を確認できませんでした。もう一度お試しください。",
	});
});
