import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { handleParticipation } from "./participation";
import { handleGuideManagement, readPublicGuides } from "./venue";

let runtime;
let database;
const key = "venue-test-key / 日本語";
const origin = "https://events.test";
const draft = (category = "notice", values = {}) => ({
	category,
	title: "会場のお知らせ",
	content: "受付でお声がけください。",
	isVisible: true,
	...values,
});

beforeAll(async () => {
	runtime = new Miniflare({
		workers: [
			{
				config: {
					name: "venue-tests",
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
					env: { DB: { type: "d1", id: "venue-tests" } },
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
	await database
		.prepare(
			"INSERT INTO events (id, name) VALUES (1, 'イベントA'), (2, 'イベントB')",
		)
		.run();
}, 30_000);

afterAll(async () => {
	await runtime?.dispose();
});
beforeEach(async () => {
	await database.prepare("DELETE FROM event_guides").run();
});

async function manage(body, options = {}) {
	const eventId = options.eventId ?? "1";
	const headers = new Headers({
		cookie: `lt_organizer=${encodeURIComponent(key)}`,
		origin,
		"content-type": "application/json",
		...options.headers,
	});
	if (options.withoutCookie) headers.delete("cookie");
	if (options.withoutOrigin) headers.delete("origin");
	const response = await handleGuideManagement(
		database,
		new Request(`${origin}/api/events/${eventId}/guide/manage`, {
			method: options.method ?? (body === undefined ? "GET" : "POST"),
			headers,
			body:
				body === undefined
					? undefined
					: options.raw
						? body
						: JSON.stringify(body),
		}),
		String(eventId),
		"key" in options ? options.key : key,
	);
	return {
		status: response.status,
		headers: response.headers,
		data: await response.json(),
	};
}

test("未認証・誤ったキー・未設定キーでは管理データを読み書きできない", async () => {
	for (const options of [
		{ withoutCookie: true },
		{ headers: { cookie: "lt_organizer=invalid" } },
		{ key: undefined },
		{ key: "" },
		{ key: "replace-with-a-long-random-key" },
	]) {
		expect((await manage(undefined, options)).status).toBe(401);
		expect((await manage({ guides: [draft()] }, options)).status).toBe(401);
	}
	expect(await readPublicGuides(database, 1)).toEqual([]);
});

test("保存には同一OriginとJSONを要求し、取得はOrigin不要", async () => {
	expect((await manage(undefined, { withoutOrigin: true })).status).toBe(200);
	for (const options of [
		{ withoutOrigin: true },
		{ headers: { origin: "https://other.test" } },
		{ headers: { origin: "null" } },
	]) {
		expect((await manage({ guides: [draft()] }, options)).status).toBe(403);
	}
	expect(
		(
			await manage(
				{ guides: [] },
				{ headers: { "content-type": "text/plain" } },
			)
		).status,
	).toBe(415);
	expect((await manage(undefined, { method: "DELETE" })).status).toBe(405);
});

test("イベントが存在しない場合や不正なIDを拒否する", async () => {
	for (const eventId of ["999", "0", "-1", "1x", "1.5"]) {
		expect([400, 404]).toContain((await manage(undefined, { eventId })).status);
		expect([400, 404]).toContain(
			(await manage({ guides: [] }, { eventId })).status,
		);
	}
});

test("JSON・カテゴリ・型・重複・文字数を検証し、不正入力で既存案内を消さない", async () => {
	expect((await manage({ guides: [draft()] })).status).toBe(200);
	const invalid = [
		null,
		{},
		{ guides: "no" },
		{ guides: [null] },
		{ guides: [draft("unknown")] },
		{ guides: [draft("notice"), draft("notice")] },
		{ guides: Array.from({ length: 9 }, () => draft()) },
		{ guides: [draft("notice", { title: 1 })] },
		{ guides: [draft("notice", { isVisible: "false" })] },
		{ guides: [draft("notice", { title: "あ".repeat(101) })] },
		{ guides: [draft("rules", { content: "あ".repeat(4001) })] },
		{ guides: [draft("wifi", { content: "not json" })] },
		{ guides: [draft("wifi", { content: "[]" })] },
		{
			guides: [
				draft("wifi", { content: JSON.stringify({ ssid: 1, password: "p" }) }),
			],
		},
		{
			guides: [
				draft("wifi", {
					content: JSON.stringify({ ssid: "x".repeat(129), password: "p" }),
				}),
			],
		},
		{
			guides: [
				draft("wifi", {
					content: JSON.stringify({ ssid: "s", password: "x".repeat(129) }),
				}),
			],
		},
		{
			guides: [
				draft("wifi", {
					content: JSON.stringify({
						ssid: "s",
						password: "p",
						note: "あ".repeat(1001),
					}),
				}),
			],
		},
	];
	for (const body of invalid) expect((await manage(body)).status).toBe(400);
	expect((await manage("{bad json", { raw: true })).status).toBe(400);
	expect(
		(await manage({ guides: [] }, { headers: { "content-length": "131073" } }))
			.status,
	).toBe(413);
	expect((await manage("あ".repeat(50_000), { raw: true })).status).toBe(413);
	expect((await manage()).data.guides.map((guide) => guide.title)).toEqual([
		"会場のお知らせ",
	]);
});

test("イベントごとに全件置換し、順序・公開設定・下書きを管理画面で復元する", async () => {
	await manage(
		{ guides: [draft("notice", { title: "別イベント" })] },
		{ eventId: "2" },
	);
	const response = await manage({
		guides: [
			draft("rules", { title: "  会場ルール  ", isVisible: false }),
			draft("notice", { title: "", content: "" }),
			draft("wifi", { content: "" }),
		],
	});
	expect(response.status).toBe(200);
	expect(response.data.event).toEqual({ id: 1, name: "イベントA" });
	expect(response.headers.get("cache-control")).toBe("no-store");
	expect(
		response.data.guides.map(({ category, title, sortOrder, isVisible }) => ({
			category,
			title,
			sortOrder,
			isVisible,
		})),
	).toEqual([
		{ category: "rules", title: "会場ルール", sortOrder: 0, isVisible: false },
		{ category: "notice", title: "", sortOrder: 1, isVisible: true },
		{
			category: "wifi",
			title: "会場のお知らせ",
			sortOrder: 2,
			isVisible: true,
		},
	]);
	expect((await manage()).data).toEqual(response.data);
	expect(await readPublicGuides(database, 1)).toEqual([]);
	expect((await readPublicGuides(database, 2))[0].title).toBe("別イベント");
	expect((await manage({ guides: [] })).data.guides).toEqual([]);
	expect((await readPublicGuides(database, 2))[0].title).toBe("別イベント");
});

test("Wi-FiのSSIDとパスワードは前後の空白・記号を含めて保存し公開する", async () => {
	const wifi = {
		ssid: "  Venue & Guest 日本語  ",
		password: "  p@ss & <word>\\\"'  ",
		note: "入口で接続できます",
	};
	expect(
		(
			await manage({
				guides: [
					draft("wifi", { title: "Wi-Fi", content: JSON.stringify(wifi) }),
				],
			})
		).status,
	).toBe(200);
	const guides = await readPublicGuides(database, 1);
	expect(JSON.parse(guides[0].content)).toEqual(wifi);
	expect(JSON.parse((await manage()).data.guides[0].content)).toEqual(wifi);
});

test("公開APIは未登録で閲覧でき、非公開・空欄・壊れたWi-Fiを返さない", async () => {
	const entries = [
		["notice", "お知らせ", "受付はこちら", 0, 1],
		["notice", "重複お知らせ", "二重", 1, 1],
		["rules", "非公開", "秘密", 2, 0],
		["toilet", "", "トイレ", 3, 1],
		["contact", "連絡先", "  ", 4, 1],
		["wifi", "Wi-Fi", "invalid", 5, 1],
		["wifi", "Wi-Fi空SSID", '{"ssid":"  ","password":"p"}', 6, 1],
		["access", "アクセス", "駅から徒歩5分", 7, 1],
	];
	await database.batch(
		entries.map((values) =>
			database
				.prepare(
					"INSERT INTO event_guides (event_id,category,title,content,sort_order,is_visible) VALUES (1,?,?,?,?,?)",
				)
				.bind(...values),
		),
	);
	await manage(
		{ guides: [draft("other", { title: "他の会場" })] },
		{ eventId: "2" },
	);
	const response = await handleParticipation(
		database,
		new Request(`${origin}/api/events/1/guide`),
		"1",
		"guide",
	);
	expect(response.status).toBe(200);
	expect(response.headers.has("set-cookie")).toBe(false);
	const result = await response.json();
	expect(result.event).toEqual({ id: 1, name: "イベントA" });
	expect(result.guides.map((guide) => guide.title)).toEqual([
		"お知らせ",
		"アクセス",
	]);
});

test("保存途中のDBエラーでも元の案内一式を保つ", async () => {
	await manage({ guides: [draft()] });
	const original = (await manage()).data.guides;
	await database
		.prepare(
			"CREATE TRIGGER venue_test_failure BEFORE INSERT ON event_guides WHEN NEW.title = 'FAIL' BEGIN SELECT RAISE(ABORT, 'venue fixture failure'); END",
		)
		.run();
	try {
		const result = await manage({
			guides: [
				draft("notice", { title: "置換途中" }),
				draft("rules", { title: "FAIL" }),
			],
		});
		expect(result.status).toBe(500);
		expect(JSON.stringify(result.data)).not.toContain("venue fixture failure");
		expect((await manage()).data.guides).toEqual(original);
	} finally {
		await database.prepare("DROP TRIGGER venue_test_failure").run();
	}
});
