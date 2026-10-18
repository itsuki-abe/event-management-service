import { normalizeXUsername } from "../lib/x-profile";
import { readPublicGuides } from "./venue";

type Session = {
	id: number;
	participant_id: number | null;
	token_hash: string;
};
type ParticipantRow = {
	id: number;
	nickname: string;
	profile: string | null;
	xUsername: string | null;
};

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const PAIRING_SECONDS = 5 * 60;
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const now = () => Math.floor(Date.now() / 1000);

class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

async function hash(value: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function randomToken() {
	return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function deviceName(request: Request) {
	const ua = request.headers.get("user-agent") ?? "";
	if (/iPhone/.test(ua)) return "iPhone";
	if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua)))
		return "iPad";
	if (/Android/.test(ua)) return "Android";
	if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
	if (/Windows/.test(ua)) return "Windows PC";
	return "ブラウザー";
}

function cookieName(eventId: number) {
	return `event_session_${eventId}`;
}

export async function readSession(
	database: D1Database,
	request: Request,
	eventId: number,
) {
	const cookie = (request.headers.get("cookie") ?? "")
		.split(";")
		.map((value) => value.trim())
		.find((value) => value.startsWith(`${cookieName(eventId)}=`));
	const token = cookie?.slice(cookie.indexOf("=") + 1);
	if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
	return database
		.prepare(
			"SELECT id, participant_id, token_hash FROM device_sessions WHERE token_hash = ? AND event_id = ? AND expires_at > ?",
		)
		.bind(await hash(token), eventId, now())
		.first<Session>();
}

export async function ensureSession(
	database: D1Database,
	request: Request,
	eventId: number,
	headers: Headers,
) {
	const existing = await readSession(database, request, eventId);
	if (existing) return existing;
	const token = randomToken();
	const session = await database
		.prepare(
			"INSERT INTO device_sessions (event_id, token_hash, expires_at, device_name) VALUES (?, ?, ?, ?) RETURNING id, participant_id, token_hash",
		)
		.bind(
			eventId,
			await hash(token),
			now() + SESSION_SECONDS,
			deviceName(request),
		)
		.first<Session>();
	if (!session) throw new Error("Session creation failed");
	headers.append(
		"Set-Cookie",
		`${cookieName(eventId)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
	);
	return session;
}

function requireParticipant(
	session: Session | null,
): Session & { participant_id: number } {
	if (!session?.participant_id)
		throw new ApiError(
			401,
			"先にスマホで参加登録してください。セッションが切れた場合は再登録が必要です。",
		);
	return session as Session & { participant_id: number };
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		throw new ApiError(415, "JSON形式で送信してください。");
	if (Number(request.headers.get("content-length")) > 4096)
		throw new ApiError(413, "入力が長すぎます。");
	const text = await request.text();
	if (new TextEncoder().encode(text).length > 4096)
		throw new ApiError(413, "入力が長すぎます。");
	try {
		const data: unknown = JSON.parse(text);
		if (!data || typeof data !== "object" || Array.isArray(data))
			throw new Error();
		return data as Record<string, unknown>;
	} catch {
		throw new ApiError(400, "入力を確認してください。");
	}
}

function profileFields(body: Record<string, unknown>) {
	const nickname =
		typeof body.nickname === "string" ? body.nickname.trim() : "";
	const profile = typeof body.profile === "string" ? body.profile.trim() : "";
	if (
		!nickname ||
		Array.from(nickname).length > 40 ||
		Array.from(profile).length > 500
	)
		throw new ApiError(
			400,
			"表示名は1〜40文字、自己紹介は500文字以内で入力してください。",
		);
	let xUsername: string | null;
	try {
		xUsername = normalizeXUsername(body.xUsername);
	} catch (error) {
		throw new ApiError(
			400,
			error instanceof Error ? error.message : "Xの入力を確認してください。",
		);
	}
	return { nickname, profile: profile || null, xUsername };
}

async function codeHash(body: Record<string, unknown>) {
	const code =
		typeof body.code === "string"
			? body.code.toUpperCase().replace(/[\s-]/g, "")
			: "";
	if (
		code.length !== 16 ||
		Array.from(code).some((char) => !alphabet.includes(char))
	)
		throw new ApiError(400, "PCに表示された16文字のコードを入力してください。");
	return hash(code);
}

async function snapshot(
	database: D1Database,
	event: { id: number; name: string },
	session: Session | null,
) {
	const participant = session?.participant_id
		? await database
				.prepare(
					"SELECT id, nickname, profile, x_username AS xUsername FROM participants WHERE id = ? AND event_id = ?",
				)
				.bind(session.participant_id, event.id)
				.first<ParticipantRow>()
		: null;
	const devices = participant
		? (
				await database
					.prepare(
						"SELECT id, device_name AS name FROM device_sessions WHERE participant_id = ? AND event_id = ? AND expires_at > ? ORDER BY id",
					)
					.bind(participant.id, event.id, now())
					.all<{ id: number; name: string }>()
			).results.map((device) => ({
				...device,
				current: device.id === session?.id,
			}))
		: [];
	return { event, participant, currentDeviceId: session?.id ?? null, devices };
}

// D1 batch executes these guarded statements as one transaction. A code can bind
// only an unpaired, unexpired session; changes() ties consumption to that update.
async function confirmPairing(
	database: D1Database,
	eventId: number,
	session: Session & { participant_id: number },
	code: string,
) {
	const timestamp = now();
	const results = await database.batch([
		database
			.prepare(`UPDATE device_sessions SET participant_id = ?, updated_at = ?
			WHERE id = (SELECT device_session_id FROM pairing_requests WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?)
			AND event_id = ? AND participant_id IS NULL AND expires_at > ? AND id != ?
			AND EXISTS (SELECT 1 FROM device_sessions AS source WHERE source.id = ? AND source.token_hash = ? AND source.participant_id = ? AND source.event_id = ? AND source.expires_at > ?)
			RETURNING id`)
			.bind(
				session.participant_id,
				timestamp,
				code,
				timestamp,
				eventId,
				timestamp,
				session.id,
				session.id,
				session.token_hash,
				session.participant_id,
				eventId,
				timestamp,
			),
		database
			.prepare(
				"UPDATE pairing_requests SET consumed_at = ?, updated_at = ? WHERE code_hash = ? AND consumed_at IS NULL AND changes() = 1",
			)
			.bind(timestamp, timestamp, code),
	]);
	if (results[0].meta.changes !== 1)
		throw new ApiError(
			409,
			"このコードは期限切れ・使用済み、または接続できない端末のコードです。PCで再発行してください。",
		);
}

export async function handleParticipation(
	database: D1Database,
	request: Request,
	rawEventId: string,
	action: string,
): Promise<Response> {
	const headers = new Headers({
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
	});
	const respond = (data: unknown, status = 200) =>
		Response.json(data, { status, headers });
	try {
		const eventId = Number(rawEventId);
		if (!/^[1-9]\d*$/.test(rawEventId) || !Number.isSafeInteger(eventId))
			throw new ApiError(404, "イベントが見つかりません。");
		if (
			request.method !== "GET" &&
			(request.method !== "POST" ||
				request.headers.get("origin") !== new URL(request.url).origin)
		)
			throw new ApiError(403, "このページからもう一度操作してください。");
		const event = await database
			.prepare("SELECT id, name FROM events WHERE id = ?")
			.bind(eventId)
			.first<{ id: number; name: string }>();
		if (!event) throw new ApiError(404, "イベントが見つかりません。");
		if (request.method === "GET" && action === "guide") {
			return respond({
				event,
				guides: await readPublicGuides(database, eventId),
			});
		}
		let session = await readSession(database, request, eventId);
		if (request.method === "GET" && action === "session")
			return respond(await snapshot(database, event, session));
		if (request.method === "GET" && action === "participants") {
			const member = requireParticipant(session);
			const directory = await database
				.prepare(
					"SELECT id, nickname, profile, x_username AS xUsername FROM participants WHERE event_id = ? ORDER BY created_at, id",
				)
				.bind(eventId)
				.all<ParticipantRow>();
			return respond({
				event,
				currentParticipantId: member.participant_id,
				participants: directory.results,
			});
		}
		if (request.method !== "POST")
			throw new ApiError(404, "ページが見つかりません。");
		const body = await jsonBody(request);
		if (action === "register") {
			const { nickname, profile, xUsername } = profileFields(body);
			session = await ensureSession(database, request, eventId, headers);
			if (session.participant_id)
				throw new ApiError(
					409,
					"すでに参加登録されています。プロフィール編集をご利用ください。",
				);
			const results = await database.batch([
				database
					.prepare(`INSERT INTO participants (event_id, nickname, profile, x_username)
					SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM device_sessions WHERE id = ? AND participant_id IS NULL AND expires_at > ?) RETURNING id`)
					.bind(eventId, nickname, profile, xUsername, session.id, now()),
				database
					.prepare(
						"UPDATE device_sessions SET participant_id = last_insert_rowid(), updated_at = ? WHERE id = ? AND participant_id IS NULL AND changes() = 1",
					)
					.bind(now(), session.id),
			]);
			if (results[0].meta.changes !== 1)
				throw new ApiError(
					409,
					"登録状態が変わりました。ページを再読込してください。",
				);
			return respond(
				await snapshot(
					database,
					event,
					await readSessionById(database, session.id),
				),
				201,
			);
		}
		if (action === "profile") {
			const member = requireParticipant(session);
			const { nickname, profile, xUsername } = profileFields(body);
			const result = await database
				.prepare(`UPDATE participants SET nickname = ?, profile = ?, x_username = ?, updated_at = ? WHERE id = ? AND event_id = ?
				AND EXISTS (SELECT 1 FROM device_sessions WHERE id = ? AND participant_id = participants.id AND expires_at > ?)`)
				.bind(
					nickname,
					profile,
					xUsername,
					now(),
					member.participant_id,
					eventId,
					member.id,
					now(),
				)
				.run();
			if (result.meta.changes !== 1)
				throw new ApiError(
					401,
					"参加状態を確認できません。再読込してください。",
				);
			return respond(await snapshot(database, event, member));
		}
		if (action === "pairing") {
			session = await ensureSession(database, request, eventId, headers);
			if (session.participant_id)
				throw new ApiError(
					409,
					"この端末はすでに接続されています。別の参加者へ接続する場合は先に接続を解除してください。",
				);
			const code = Array.from(
				crypto.getRandomValues(new Uint8Array(16)),
				(byte) => alphabet[byte & 31],
			).join("");
			const expiresAt = now() + PAIRING_SECONDS;
			const results = await database.batch([
				database
					.prepare("DELETE FROM pairing_requests WHERE device_session_id = ?")
					.bind(session.id),
				database
					.prepare(`INSERT INTO pairing_requests (device_session_id, code_hash, expires_at)
					SELECT id, ?, ? FROM device_sessions WHERE id = ? AND participant_id IS NULL AND expires_at > ?`)
					.bind(await hash(code), expiresAt, session.id, now()),
			]);
			if (results[1].meta.changes !== 1)
				throw new ApiError(409, "接続状態が変わりました。再読込してください。");
			return respond({ code: code.match(/.{4}/g)?.join("-"), expiresAt }, 201);
		}
		if (action === "pairing/preview" || action === "pairing/confirm") {
			const member = requireParticipant(session);
			const code = await codeHash(body);
			if (action === "pairing/confirm") {
				await confirmPairing(database, eventId, member, code);
				return respond(await snapshot(database, event, member));
			}
			const target = await database
				.prepare(`SELECT s.device_name AS deviceName, p.expires_at AS expiresAt
				FROM pairing_requests p JOIN device_sessions s ON s.id = p.device_session_id
				WHERE p.code_hash = ? AND p.consumed_at IS NULL AND p.expires_at > ? AND s.expires_at > ? AND s.event_id = ? AND s.participant_id IS NULL AND s.id != ?`)
				.bind(code, now(), now(), eventId, member.id)
				.first();
			if (!target)
				throw new ApiError(
					409,
					"このコードは期限切れ・使用済み、または接続できない端末のコードです。PCで再発行してください。",
				);
			return respond(target);
		}
		if (action === "devices/revoke") {
			const member = requireParticipant(session);
			if (!Number.isSafeInteger(body.deviceId) || Number(body.deviceId) < 1)
				throw new ApiError(400, "端末を選択してください。");
			const results = await database.batch([
				database
					.prepare(`UPDATE device_sessions SET expires_at = 0, updated_at = ? WHERE id = ? AND participant_id = ? AND event_id = ?
					AND EXISTS (SELECT 1 FROM device_sessions AS source WHERE source.id = ? AND source.participant_id = ? AND source.expires_at > ?)`)
					.bind(
						now(),
						body.deviceId as number,
						member.participant_id,
						eventId,
						member.id,
						member.participant_id,
						now(),
					),
				database
					.prepare(
						"DELETE FROM pairing_requests WHERE device_session_id = ? AND EXISTS (SELECT 1 FROM device_sessions WHERE id = ? AND participant_id = ? AND event_id = ? AND expires_at = 0)",
					)
					.bind(
						body.deviceId as number,
						body.deviceId as number,
						member.participant_id,
						eventId,
					),
			]);
			if (!results[0].meta.changes)
				throw new ApiError(404, "接続済みの端末が見つかりません。");
			if (body.deviceId === member.id)
				headers.append(
					"Set-Cookie",
					`${cookieName(eventId)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
				);
			return respond(
				await snapshot(
					database,
					event,
					await readSession(database, request, eventId),
				),
			);
		}
		throw new ApiError(404, "ページが見つかりません。");
	} catch (error) {
		if (error instanceof ApiError)
			return respond({ error: error.message }, error.status);
		console.error(
			"Participation API failed",
			error instanceof Error ? error.message : "Unknown error",
		);
		return respond(
			{ error: "処理に失敗しました。時間をおいてもう一度お試しください。" },
			500,
		);
	}
}

async function readSessionById(database: D1Database, id: number) {
	return database
		.prepare(
			"SELECT id, participant_id, token_hash FROM device_sessions WHERE id = ? AND expires_at > ?",
		)
		.bind(id, now())
		.first<Session>();
}
