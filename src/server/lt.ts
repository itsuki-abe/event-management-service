import { env } from "cloudflare:workers";
import { z } from "zod";
import {
	elapsedSeconds,
	type LiveAction,
	liveActionSchema,
	liveSnapshotSchema,
} from "../lib/lt";
import {
	organizerCookieName as cookieName,
	isOrganizer,
	organizerKey,
} from "./organizer";

class LiveError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
export const SHARE_TIMEOUT_SECONDS = 8;
const noStore = { "Cache-Control": "no-store" };

export async function readSnapshot(organizer = false) {
	const [events, talks, states, shares, participants] = await env.DB.batch<
		Record<string, unknown>
	>([
		env.DB.prepare("SELECT id, name FROM events ORDER BY id LIMIT 1"),
		env.DB.prepare(`SELECT t.id, t.title, p.nickname AS speaker, t.speaker_id AS speakerId, t.sort_order AS sortOrder,
			t.duration_seconds AS durationSeconds, t.status, t.resumed_at AS resumedAt,
			t.elapsed_seconds AS elapsedSeconds FROM talks t
			JOIN participants p ON p.id = t.speaker_id AND p.event_id = t.event_id
			WHERE t.event_id = (SELECT id FROM events ORDER BY id LIMIT 1)
			ORDER BY t.sort_order, t.id`),
		env.DB.prepare(`SELECT selected_talk_id AS selectedTalkId, revision FROM event_live_state
			WHERE event_id = (SELECT id FROM events ORDER BY id LIMIT 1)`),
		env.DB.prepare(`SELECT s.session_id AS sessionId, d.participant_id AS participantId,
			s.started_at AS startedAt, s.heartbeat_at > ? AS live FROM screen_shares s
			JOIN device_sessions d ON d.id = s.session_id AND d.participant_id IS NOT NULL
			WHERE s.event_id = (SELECT id FROM events ORDER BY id LIMIT 1)
			ORDER BY s.started_at DESC`).bind(nowSeconds() - SHARE_TIMEOUT_SECONDS),
		// Registered participants are the ones signed in on some device.
		env.DB.prepare(`SELECT id, nickname FROM participants p
			WHERE event_id = (SELECT id FROM events ORDER BY id LIMIT 1) AND ?
			AND EXISTS (SELECT 1 FROM device_sessions d WHERE d.participant_id = p.id AND d.expires_at > ?)
			ORDER BY id`).bind(organizer ? 1 : 0, nowSeconds()),
	]);
	const state = z
		.object({
			selectedTalkId: z.number().nullable(),
			revision: z.string(),
		})
		.parse(
			states.results[0] ?? {
				selectedTalkId: null,
				revision: "0",
			},
		);
	return liveSnapshotSchema.parse({
		event: events.results[0] ?? null,
		talks: talks.results,
		selectedTalkId: state.selectedTalkId,
		shares: shares.results.map((share) => ({
			...share,
			live: Boolean(share.live),
		})),
		participants: organizer ? participants.results : undefined,
		revision: state.revision,
		serverNow: Date.now() / 1000,
	});
}

async function applyAction(action: LiveAction) {
	const snapshot = await readSnapshot(true);
	if (action.action === "authorize") return snapshot;
	if (action.action === "createEvent") {
		if (snapshot.event) throw new LiveError("イベントは作成済みです。", 409);
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM events)",
			).bind(action.name),
			env.DB.prepare(`INSERT INTO event_live_state (event_id, revision)
				SELECT id, ? FROM events ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING`).bind(
				crypto.randomUUID(),
			),
		]);
		return readSnapshot(true);
	}
	if (!snapshot.event)
		throw new LiveError("イベントを先に作成してください。", 409);
	if (action.revision !== snapshot.revision)
		throw new LiveError(
			"別の操作が反映されました。最新の状態で再操作してください。",
			409,
		);

	const eventId = snapshot.event.id;
	const revision = crypto.randomUUID();
	const now = nowSeconds();
	const guard =
		"EXISTS (SELECT 1 FROM event_live_state WHERE event_id = ? AND revision = ?)";
	const mutations: D1PreparedStatement[] = [];
	const statement = (query: string, ...values: (number | string | null)[]) =>
		env.DB.prepare(query).bind(...values, eventId, revision);
	const active = snapshot.talks.find(
		(talk) => talk.status === "running" || talk.status === "paused",
	);

	if (action.action === "saveTalk") {
		const talk =
			action.id === undefined
				? undefined
				: snapshot.talks.find((item) => item.id === action.id);
		if (action.id !== undefined && (!talk || talk.status !== "pending")) {
			throw new LiveError("未開始の発表だけ編集できます。", 409);
		}
		if (!snapshot.participants?.some((item) => item.id === action.speakerId))
			throw new LiveError("参加登録済みの発表者を選んでください。", 409);
		if (talk) {
			mutations.push(
				statement(
					`UPDATE talks SET title = ?, speaker_id = ?, duration_seconds = ?, updated_at = ?
				WHERE id = ? AND event_id = ? AND ${guard}`,
					action.title,
					action.speakerId,
					action.durationSeconds,
					now,
					talk.id,
					eventId,
				),
			);
		} else {
			mutations.push(
				statement(
					`INSERT INTO talks (event_id, speaker_id, title, sort_order, duration_seconds)
				SELECT ?, ?, ?, ?, ? WHERE ${guard}`,
					eventId,
					action.speakerId,
					action.title,
					Math.max(0, ...snapshot.talks.map((item) => item.sortOrder)) + 1,
					action.durationSeconds,
				),
			);
			mutations.push(
				statement(
					`UPDATE event_live_state SET selected_talk_id =
				(SELECT id FROM talks WHERE event_id = ? ORDER BY id DESC LIMIT 1)
				WHERE event_id = ? AND selected_talk_id IS NULL AND ${guard}`,
					eventId,
					eventId,
				),
			);
		}
	} else {
		const talk = snapshot.talks.find((item) => item.id === action.talkId);
		if (!talk) throw new LiveError("発表が見つかりません。", 404);
		if (action.action === "deleteTalk") {
			if (talk.status !== "pending")
				throw new LiveError("未開始の発表だけ削除できます。", 409);
			mutations.push(
				statement(
					`UPDATE event_live_state SET selected_talk_id = NULL
				WHERE event_id = ? AND selected_talk_id = ? AND ${guard}`,
					eventId,
					talk.id,
				),
				statement(
					`DELETE FROM talks WHERE id = ? AND event_id = ? AND ${guard}`,
					talk.id,
					eventId,
				),
			);
		} else if (action.action === "move") {
			const order = [...snapshot.talks];
			const from = order.indexOf(talk);
			const to = from + (action.direction === "up" ? -1 : 1);
			if (to < 0 || to >= order.length)
				throw new LiveError("これ以上移動できません。", 409);
			[order[from], order[to]] = [order[to], order[from]];
			for (const [index, item] of order.entries())
				mutations.push(
					statement(
						`UPDATE talks SET sort_order = ? WHERE id = ? AND event_id = ? AND ${guard}`,
						index + 1,
						item.id,
						eventId,
					),
				);
		} else if (action.action === "select") {
			if (active)
				throw new LiveError("発表を終了してから切り替えてください。", 409);
			mutations.push(
				statement(
					`UPDATE event_live_state SET selected_talk_id = ? WHERE event_id = ? AND ${guard}`,
					talk.id,
					eventId,
				),
			);
		} else {
			if (snapshot.selectedTalkId !== talk.id)
				throw new LiveError("選択中の発表に操作してください。", 409);
			switch (action.action) {
				case "start":
					if (talk.status !== "pending" || active)
						throw new LiveError("未開始の発表だけ開始できます。", 409);
					mutations.push(
						statement(
							`UPDATE talks SET status = 'running', resumed_at = ?, updated_at = ?
						WHERE id = ? AND event_id = ? AND ${guard}`,
							now,
							now,
							talk.id,
							eventId,
						),
					);
					break;
				case "pause":
					if (talk.status !== "running")
						throw new LiveError("発表中のみ一時停止できます。", 409);
					mutations.push(
						statement(
							`UPDATE talks SET status = 'paused', elapsed_seconds = ?, resumed_at = NULL, updated_at = ?
						WHERE id = ? AND event_id = ? AND ${guard}`,
							elapsedSeconds(talk, now),
							now,
							talk.id,
							eventId,
						),
					);
					break;
				case "resume":
					if (talk.status !== "paused")
						throw new LiveError("一時停止中のみ再開できます。", 409);
					mutations.push(
						statement(
							`UPDATE talks SET status = 'running', resumed_at = ?, updated_at = ?
						WHERE id = ? AND event_id = ? AND ${guard}`,
							now,
							now,
							talk.id,
							eventId,
						),
					);
					break;
				case "end":
					if (talk.status !== "running" && talk.status !== "paused")
						throw new LiveError(
							"発表中または一時停止中のみ終了できます。",
							409,
						);
					mutations.push(
						statement(
							`UPDATE talks SET status = 'ended', elapsed_seconds = ?, resumed_at = NULL, ended_at = ?, updated_at = ?
						WHERE id = ? AND event_id = ? AND ${guard}`,
							elapsedSeconds(talk, now),
							now,
							now,
							talk.id,
							eventId,
						),
					);
					break;
				case "reset":
					if (talk.status === "pending")
						throw new LiveError("開始前の発表です。", 409);
					mutations.push(
						statement(
							`UPDATE talks SET status = 'pending', elapsed_seconds = 0, resumed_at = NULL, ended_at = NULL, updated_at = ?
						WHERE id = ? AND event_id = ? AND ${guard}`,
							now,
							talk.id,
							eventId,
						),
					);
					break;
				case "next": {
					const next = snapshot.talks.find(
						(item) =>
							item.status === "pending" &&
							(item.sortOrder > talk.sortOrder ||
								(item.sortOrder === talk.sortOrder && item.id > talk.id)),
					);
					if (!next) throw new LiveError("次の発表がありません。", 409);
					mutations.push(
						statement(
							`UPDATE talks SET status = 'ended', elapsed_seconds = ?, resumed_at = NULL, ended_at = ?, updated_at = ?
						WHERE id = ? AND event_id = ? AND status != 'ended' AND ${guard}`,
							elapsedSeconds(talk, now),
							now,
							now,
							talk.id,
							eventId,
						),
					);
					mutations.push(
						statement(
							`UPDATE event_live_state SET selected_talk_id = ? WHERE event_id = ? AND ${guard}`,
							next.id,
							eventId,
						),
					);
					break;
				}
			}
		}
	}
	const [result] = await env.DB.batch([
		env.DB.prepare(
			"UPDATE event_live_state SET revision = ?, updated_at = ? WHERE event_id = ? AND revision = ?",
		).bind(revision, now, eventId, action.revision),
		...mutations,
	]);
	if (result.meta.changes !== 1)
		throw new LiveError(
			"別の操作が反映されました。最新の状態で再操作してください。",
			409,
		);
	return readSnapshot(true);
}

export async function getLive(request: Request) {
	try {
		return Response.json(await readSnapshot(isOrganizer(request)), {
			headers: noStore,
		});
	} catch (error) {
		console.error("LT snapshot failed", error);
		return Response.json(
			{ error: "発表情報を取得できませんでした。" },
			{ status: 500, headers: noStore },
		);
	}
}

export function login(request: Request) {
	const url = new URL(request.url);
	const key = organizerKey();
	const valid = key !== undefined && url.searchParams.get("key") === key;
	return new Response(null, {
		status: 303,
		headers: {
			Location: valid ? "/admin" : "/admin?invalid",
			"Cache-Control": "no-store",
			...(valid && {
				"Set-Cookie": `${cookieName}=${encodeURIComponent(key)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${url.protocol === "https:" ? "; Secure" : ""}`,
			}),
		},
	});
}

export async function postLive(request: Request) {
	if (
		!isOrganizer(request) ||
		!request.headers.get("Content-Type")?.startsWith("application/json")
	) {
		return Response.json(
			{ error: "運営用リンクから開き直してください。" },
			{ status: 401, headers: noStore },
		);
	}
	try {
		if (Number(request.headers.get("Content-Length")) > 16384)
			throw new LiveError("入力が大きすぎます。", 413);
		const body = await request.text();
		if (body.length > 16384) throw new LiveError("入力が大きすぎます。", 413);
		const action = liveActionSchema.safeParse(JSON.parse(body));
		if (!action.success)
			throw new LiveError("入力内容を確認してください。", 400);
		return Response.json(await applyAction(action.data), { headers: noStore });
	} catch (error) {
		if (error instanceof LiveError)
			return Response.json(
				{ error: error.message },
				{ status: error.status, headers: noStore },
			);
		if (error instanceof SyntaxError)
			return Response.json(
				{ error: "入力形式を確認してください。" },
				{ status: 400, headers: noStore },
			);
		console.error("LT operation failed", error);
		return Response.json(
			{ error: "保存できませんでした。再度お試しください。" },
			{ status: 500, headers: noStore },
		);
	}
}
