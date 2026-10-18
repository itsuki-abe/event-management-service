import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { handleParticipation } from "./participation";

let runtime;
let database;
let nextName = 0;

beforeAll(async () => {
	runtime = new Miniflare({
		workers: [
			{
				config: {
					name: "participation-tests",
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
					env: { DB: { type: "d1", id: "participation-tests" } },
				},
			},
		],
	});
	database = await runtime.getD1Database("DB");
	const migrationFolder = new URL("../../drizzle/", import.meta.url);
	for (const name of (await readdir(migrationFolder))
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		const migration = await readFile(new URL(name, migrationFolder), "utf8");
		await database.batch(
			migration
				.split("--> statement-breakpoint")
				.filter((sql) => sql.trim())
				.map((sql) => database.prepare(sql)),
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

function client(eventId = 1, userAgent = "iPhone") {
	let cookie = "";
	return {
		get cookie() {
			return cookie;
		},
		async call(action, body, options = {}) {
			const response = await handleParticipation(
				database,
				new Request(`https://events.test/api/events/${eventId}/${action}`, {
					method: body === undefined ? "GET" : "POST",
					headers: {
						origin: "https://events.test",
						"content-type": "application/json",
						"user-agent": userAgent,
						cookie,
						...options.headers,
					},
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
				String(eventId),
				action,
			);
			const setCookie = response.headers.get("set-cookie");
			if (setCookie) cookie = setCookie.split(";")[0];
			return {
				status: response.status,
				headers: response.headers,
				data: await response.json(),
			};
		},
	};
}

async function phone(eventId = 1, nickname = `参加者${++nextName}`) {
	const device = client(eventId);
	const response = await device.call("register", {
		nickname,
		profile: "ものづくりが好きです",
		role: "organizer",
	});
	expect(response.status).toBe(201);
	return { device, state: response.data };
}

async function computer(eventId = 1) {
	const device = client(eventId, "Mozilla/5.0 (Macintosh; Intel Mac OS X)");
	const response = await device.call("pairing", {});
	expect(response.status).toBe(201);
	return { device, code: response.data.code };
}

const digest = (value) =>
	createHash("sha256").update(value.replaceAll("-", "")).digest("hex");

test("Xは任意で、URL・旧Twitter URL・ユーザー名を正規化して保存する", async () => {
	for (const [input, expected] of [
		[undefined, null],
		["", null],
		["   ", null],
		[" @workshop_123 ", "workshop_123"],
		["workshop_123", "workshop_123"],
		["https://x.com/workshop_123/", "workshop_123"],
		["https://twitter.com/workshop_123?s=21", "workshop_123"],
		["www.x.com/workshop_123", "workshop_123"],
	]) {
		const device = client();
		const registered = await device.call("register", {
			nickname: "X登録テスト",
			xUsername: input,
		});
		expect(registered.status).toBe(201);
		expect(registered.data.participant.xUsername).toBe(expected);
		expect((await device.call("session")).data.participant.xUsername).toBe(
			expected,
		);
	}
});

test("不正なXリンク・投稿URL・不正な型は保存しない", async () => {
	for (const xUsername of [
		"javascript:alert(1)",
		"https://example.com/name",
		"https://x.com.evil.test/name",
		"https://x.com/name/status/123",
		"https://x.com/intent/follow",
		"https://x.com/home",
		"https://x.com/name/extra",
		"https://user@x.com/name",
		"https://x.com:444/name",
		"@has space",
		"a".repeat(16),
		123,
		{},
		[],
	]) {
		expect(
			(await client().call("register", { nickname: "不正URL", xUsername }))
				.status,
		).toBe(400);
	}
});

test("一覧はイベント内の登録済み参加者に限定し、プロフィール以外の情報を返さない", async () => {
	const a = client();
	const registered = await a.call("register", {
		nickname: "一覧の本人",
		profile: "交流しましょう",
		xUsername: "@directory_user",
	});
	const b = await phone(1, "一覧の仲間");
	const other = await phone(2, "別イベントの人");
	expect((await client().call("participants")).status).toBe(401);
	const response = await a.call("participants");
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("no-store");
	expect(response.data.currentParticipantId).toBe(
		registered.data.participant.id,
	);
	expect(response.data.participants).toContainEqual(
		registered.data.participant,
	);
	expect(
		response.data.participants.some(
			(person) => person.id === b.state.participant.id,
		),
	).toBe(true);
	expect(
		response.data.participants.some(
			(person) => person.id === other.state.participant.id,
		),
	).toBe(false);
	for (const person of response.data.participants)
		expect(Object.keys(person).sort()).toEqual([
			"id",
			"nickname",
			"profile",
			"xUsername",
		]);
	const foreignCookie = await handleParticipation(
		database,
		new Request("https://events.test/api/events/2/participants", {
			headers: { cookie: a.cookie },
		}),
		"2",
		"participants",
	);
	expect(foreignCookie.status).toBe(401);
	await a.call("devices/revoke", { deviceId: registered.data.currentDeviceId });
	expect((await a.call("participants")).status).toBe(401);
});

test("Xの編集・削除は一覧と接続済み端末にも反映し、不正な編集は元の値を保つ", async () => {
	const mobile = await phone();
	const pc = await computer();
	await mobile.device.call("pairing/confirm", { code: pc.code });
	const saved = await mobile.device.call("profile", {
		nickname: "Xを更新",
		xUsername: "@new_profile",
	});
	expect(saved.data.participant.xUsername).toBe("new_profile");
	expect((await pc.device.call("session")).data.participant.xUsername).toBe(
		"new_profile",
	);
	expect(
		(await mobile.device.call("participants")).data.participants.find(
			(person) => person.id === mobile.state.participant.id,
		).xUsername,
	).toBe("new_profile");
	expect(
		(
			await mobile.device.call("profile", {
				nickname: "Xを更新",
				xUsername: "javascript:alert(1)",
			})
		).status,
	).toBe(400);
	expect((await mobile.device.call("session")).data.participant.xUsername).toBe(
		"new_profile",
	);
	await mobile.device.call("profile", { nickname: "Xを更新", xUsername: "" });
	expect(
		(await pc.device.call("session")).data.participant.xUsername,
	).toBeNull();
	expect(
		(await mobile.device.call("participants")).data.participants.find(
			(person) => person.id === mobile.state.participant.id,
		).xUsername,
	).toBeNull();
});

test("閲覧では登録を要求せず、存在しないイベントは拒否する", async () => {
	const response = await client().call("session");
	expect(response.status).toBe(200);
	expect(response.data.participant).toBeNull();
	expect(response.headers.has("set-cookie")).toBe(false);
	expect((await client(999).call("session")).status).toBe(404);
});

test("会場案内はイベント内の公開データだけを表示する", async () => {
	await database
		.prepare(
			"INSERT INTO event_guides (event_id, category, title, content, sort_order, is_visible) VALUES (1, 'wifi', '公開Wi-Fi', '{\"ssid\":\"Guest network\",\"password\":\"\"}', 2, 1), (1, 'notice', 'お知らせ', '受付をご利用ください', 1, 1), (1, 'rules', '非公開', 'hidden', 0, 0), (2, 'wifi', '別イベント', 'other', 0, 1)",
		)
		.run();
	const response = await client().call("guide");
	expect(response.status).toBe(200);
	expect(response.data.guides.map((guide) => guide.title)).toEqual([
		"お知らせ",
		"公開Wi-Fi",
	]);
	expect(response.headers.has("set-cookie")).toBe(false);
});

test("登録状態をCookieで復元し、権限の自己付与を許さずトークンはハッシュ保存する", async () => {
	const device = client();
	const registered = await device.call("register", {
		nickname: "  太郎  ",
		profile: "こんにちは",
		role: "organizer",
	});
	expect(registered.status).toBe(201);
	expect(registered.headers.get("set-cookie")).toContain(
		"HttpOnly; SameSite=Lax",
	);
	expect(registered.headers.get("set-cookie")).toContain("Secure");
	expect(registered.headers.get("cache-control")).toBe("no-store");
	const restored = await device.call("session");
	expect(restored.data.participant).toEqual(registered.data.participant);
	expect(restored.data.participant.nickname).toBe("太郎");
	const stored = await database
		.prepare(
			"SELECT p.role, s.token_hash FROM participants p JOIN device_sessions s ON s.participant_id = p.id WHERE p.id = ?",
		)
		.bind(restored.data.participant.id)
		.first();
	expect(stored.role).toBe("participant");
	expect(stored.token_hash).not.toBe(device.cookie.split("=")[1]);
	expect(stored.token_hash).toHaveLength(64);
	expect((await device.call("register", { nickname: "二重登録" })).status).toBe(
		409,
	);
});

test("ニックネーム重複は許可し、別人の参加者IDを渡しても本人のプロフィールだけを編集する", async () => {
	const a = await phone(1, "同じ名前");
	const b = await phone(1, "同じ名前");
	expect(a.state.participant.id).not.toBe(b.state.participant.id);
	const edited = await a.device.call("profile", {
		nickname: "新しい名前",
		profile: "更新",
		xUsername: "owner_only",
		participantId: b.state.participant.id,
	});
	expect(edited.data.participant.id).toBe(a.state.participant.id);
	expect(edited.data.participant.nickname).toBe("新しい名前");
	expect(edited.data.participant.xUsername).toBe("owner_only");
	expect(
		(await b.device.call("session")).data.participant.xUsername,
	).toBeNull();
	expect((await b.device.call("session")).data.participant.nickname).toBe(
		"同じ名前",
	);
});

test("Xのユーザ名は任意で、@と前後の空白を除いて保存・復元する", async () => {
	const anonymous = await phone();
	expect(anonymous.state.participant.xUsername).toBeNull();
	const device = client();
	const registered = await device.call("register", {
		nickname: "Xあり",
		xUsername: "  @Sample_User123  ",
	});
	expect(registered.status).toBe(201);
	expect(registered.data.participant.xUsername).toBe("Sample_User123");
	expect((await device.call("session")).data.participant.xUsername).toBe(
		"Sample_User123",
	);
	const stored = await database
		.prepare("SELECT x_username FROM participants WHERE id = ?")
		.bind(registered.data.participant.id)
		.first();
	expect(stored.x_username).toBe("Sample_User123");
});

test("Xのユーザ名を編集でき、空欄に戻すと保存済みの値を削除する", async () => {
	const { device } = await phone();
	for (const xUsername of ["a".repeat(15), "@new_name", "", null, "   "]) {
		const edited = await device.call("profile", {
			nickname: "編集",
			xUsername,
		});
		expect(edited.status).toBe(200);
		expect(edited.data.participant.xUsername).toBe(
			xUsername?.trim().replace(/^@/, "") || null,
		);
		expect((await device.call("session")).data.participant.xUsername).toBe(
			edited.data.participant.xUsername,
		);
	}
});

test("不正なXのユーザ名は登録・編集とも拒否し、保存済みプロフィールを変更しない", async () => {
	const { device } = await phone();
	for (const xUsername of [
		"@",
		"@@name",
		"a".repeat(16),
		"with space",
		"dot.name",
		"名前",
		"https://x.com/name/status/1",
		123,
		[],
		{},
	]) {
		expect(
			(await client().call("register", { nickname: "不正", xUsername })).status,
		).toBe(400);
		expect(
			(await device.call("profile", { nickname: "変更されない", xUsername }))
				.status,
		).toBe(400);
	}
	expect((await device.call("session")).data.participant.nickname).not.toBe(
		"変更されない",
	);
});

test("入力値、未登録の操作、外部Origin・Origin欠落を拒否する", async () => {
	const device = client();
	for (const nickname of ["", "   ", "あ".repeat(41)])
		expect((await device.call("register", { nickname })).status).toBe(400);
	expect(
		(
			await device.call("register", {
				nickname: "正常",
				profile: "あ".repeat(501),
			})
		).status,
	).toBe(400);
	expect((await device.call("profile", { nickname: "未登録" })).status).toBe(
		401,
	);
	expect(
		(await device.call("pairing/confirm", { code: "A".repeat(16) })).status,
	).toBe(401);
	expect(
		(
			await device.call(
				"register",
				{ nickname: "CSRF" },
				{ headers: { origin: "https://other.test" } },
			)
		).status,
	).toBe(403);
	expect(
		(
			await device.call(
				"register",
				{ nickname: "CSRF" },
				{ headers: { origin: "" } },
			)
		).status,
	).toBe(403);
});

test("スマホで明示的に確定するまでPCは未接続で、確定後はプロフィールを共有する", async () => {
	const mobile = await phone();
	const pc = await computer();
	expect((await pc.device.call("session")).data.participant).toBeNull();
	const preview = await mobile.device.call("pairing/preview", {
		code: pc.code.toLowerCase(),
	});
	expect(preview.status).toBe(200);
	expect(preview.data.deviceName).toBe("Mac");
	expect((await pc.device.call("session")).data.participant).toBeNull();
	const confirmed = await mobile.device.call("pairing/confirm", {
		code: pc.code,
	});
	expect(confirmed.status).toBe(200);
	expect(confirmed.data.devices).toHaveLength(2);
	expect((await pc.device.call("session")).data.participant).toEqual(
		mobile.state.participant,
	);
	await mobile.device.call("profile", {
		nickname: "共有した名前",
		profile: "PCでも確認",
		xUsername: "paired_user",
	});
	expect((await pc.device.call("session")).data.participant.nickname).toBe(
		"共有した名前",
	);
	expect((await pc.device.call("session")).data.participant.xUsername).toBe(
		"paired_user",
	);
	const stored = await database
		.prepare(
			"SELECT code_hash, consumed_at FROM pairing_requests WHERE code_hash = ?",
		)
		.bind(digest(pc.code))
		.first();
	expect(stored.consumed_at).toBeGreaterThan(0);
	expect(stored.code_hash).not.toBe(pc.code);
	expect(
		(await mobile.device.call("pairing/confirm", { code: pc.code })).status,
	).toBe(409);
	expect((await pc.device.call("pairing", {})).status).toBe(409);
});

test("再発行前・期限切れ・無効なコードを拒否する", async () => {
	const mobile = await phone();
	const pc = await computer();
	const refreshed = await pc.device.call("pairing", {});
	expect(refreshed.status).toBe(201);
	expect(
		(await mobile.device.call("pairing/confirm", { code: pc.code })).status,
	).toBe(409);
	await database
		.prepare("UPDATE pairing_requests SET expires_at = 0 WHERE code_hash = ?")
		.bind(digest(refreshed.data.code))
		.run();
	expect(
		(await mobile.device.call("pairing/preview", { code: refreshed.data.code }))
			.status,
	).toBe(409);
	expect(
		(await mobile.device.call("pairing/confirm", { code: refreshed.data.code }))
			.status,
	).toBe(409);
	expect(
		(await mobile.device.call("pairing/confirm", { code: "123" })).status,
	).toBe(400);
	expect(
		(await mobile.device.call("pairing/confirm", { code: "A".repeat(16) }))
			.status,
	).toBe(409);
});

test("別イベントのコード・セッション・端末にはアクセスできない", async () => {
	const mobile = await phone(1);
	const pc = await computer(2);
	expect(
		(await mobile.device.call("pairing/preview", { code: pc.code })).status,
	).toBe(409);
	expect(
		(await mobile.device.call("pairing/confirm", { code: pc.code })).status,
	).toBe(409);
	const other = await phone(2);
	expect(
		(
			await mobile.device.call("devices/revoke", {
				deviceId: other.state.currentDeviceId,
			})
		).status,
	).toBe(404);
	const leaked = await client(2).call("session", undefined, {
		headers: { cookie: mobile.device.cookie },
	});
	expect(leaked.data.participant).toBeNull();
});

test("2人が同時に同じPCを接続しても、一方だけが成功する", async () => {
	const a = await phone();
	const b = await phone();
	const pc = await computer();
	const results = await Promise.all([
		a.device.call("pairing/confirm", { code: pc.code }),
		b.device.call("pairing/confirm", { code: pc.code }),
	]);
	expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
	const winner = results[0].status === 200 ? a : b;
	expect((await pc.device.call("session")).data.participant.id).toBe(
		winner.state.participant.id,
	);
});

test("同じ未登録セッションへの同時登録で参加者を二重作成しない", async () => {
	const pc = await computer();
	const results = await Promise.all([
		pc.device.call("register", { nickname: "同時A" }),
		pc.device.call("register", { nickname: "同時B" }),
	]);
	expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
	const stored = await database
		.prepare(
			"SELECT count(*) AS count FROM participants WHERE nickname IN ('同時A', '同時B')",
		)
		.first();
	expect(stored.count).toBe(1);
});

test("他人の解除は拒否し、接続解除後の端末は復元・更新・コード利用ができない", async () => {
	const mobile = await phone();
	const stranger = await phone();
	const pc = await computer();
	await mobile.device.call("pairing/confirm", { code: pc.code });
	const pcId = (await pc.device.call("session")).data.currentDeviceId;
	expect(
		(await stranger.device.call("devices/revoke", { deviceId: pcId })).status,
	).toBe(404);
	expect(
		(await mobile.device.call("devices/revoke", { deviceId: pcId })).status,
	).toBe(200);
	expect((await pc.device.call("session")).data.participant).toBeNull();
	expect(
		(await pc.device.call("profile", { nickname: "不正な更新" })).status,
	).toBe(401);
	expect(
		(await mobile.device.call("pairing/confirm", { code: pc.code })).status,
	).toBe(409);
});

test("セッション期限切れを復元・接続時に拒否し、この端末の解除でCookieを消す", async () => {
	const mobile = await phone();
	const pc = await computer();
	await database
		.prepare("UPDATE device_sessions SET expires_at = 0 WHERE id = ?")
		.bind(mobile.state.currentDeviceId)
		.run();
	expect((await mobile.device.call("session")).data.participant).toBeNull();
	expect(
		(await mobile.device.call("pairing/confirm", { code: pc.code })).status,
	).toBe(401);
	const fresh = await phone();
	const removed = await fresh.device.call("devices/revoke", {
		deviceId: fresh.state.currentDeviceId,
	});
	expect(removed.status).toBe(200);
	expect(removed.headers.get("set-cookie")).toContain("Max-Age=0");
	expect(removed.data.participant).toBeNull();
});
