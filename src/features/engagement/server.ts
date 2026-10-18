import { env } from "cloudflare:workers";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
	deviceSessions,
	eventLiveState,
	events,
	participants,
	reactions,
	talkComments,
	talks,
} from "../../db/schema";
import { isOrganizer } from "../../server/organizer";
import { type EngagementSnapshot, reactionKinds } from "./types";

class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}
const json = (value: unknown, status = 200, headers?: HeadersInit) =>
	Response.json(value, {
		status,
		headers: { "Cache-Control": "no-store", ...headers },
	});
const positiveId = (value: unknown) => {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
		throw new ApiError(400, "イベント・発表IDが不正です。");
	return value;
};
async function hash(token: string) {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(bytes), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}
async function requireOrganizer(request: Request) {
	if (
		!isOrganizer(
			request,
			"ORGANIZER_KEY" in env ? env.ORGANIZER_KEY : undefined,
		)
	)
		throw new ApiError(403, "運営用リンクから開いてください。");
}
async function participant(
	request: Request,
	eventId: number,
	nickname: string,
) {
	const cookieName = `engagement_${eventId}`;
	const token = request.headers
		.get("cookie")
		?.split(";")
		.map((s) => s.trim())
		.find((s) => s.startsWith(`${cookieName}=`))
		?.slice(cookieName.length + 1);
	if (token) {
		const [session] = await db
			.select({ id: participants.id, expiresAt: deviceSessions.expiresAt })
			.from(deviceSessions)
			.innerJoin(
				participants,
				eq(deviceSessions.participantId, participants.id),
			)
			.where(
				and(
					eq(deviceSessions.tokenHash, await hash(token)),
					eq(participants.eventId, eventId),
				),
			)
			.limit(1);
		if (session && session.expiresAt.getTime() > Date.now())
			return { id: session.id, cookie: undefined };
	}
	const newToken = crypto.randomUUID() + crypto.randomUUID();
	const [created] = await db
		.insert(participants)
		.values({ eventId, nickname })
		.returning({ id: participants.id });
	const id = created.id;
	await db.insert(deviceSessions).values({
		eventId,
		participantId: id,
		tokenHash: await hash(newToken),
		expiresAt: new Date(Date.now() + 86400000),
	});
	return {
		id,
		cookie: `${cookieName}=${newToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
	};
}
async function getEvent(eventId: number) {
	const [event] = await db
		.select({ id: events.id, title: events.name })
		.from(events)
		.where(eq(events.id, eventId));
	if (!event)
		throw new ApiError(
			404,
			"イベントが見つかりません。ローカルではサンプルデータを準備してください。",
		);
	return event;
}
async function snapshot(request: Request) {
	const url = new URL(request.url);
	const eventId = positiveId(Number(url.searchParams.get("eventId")));
	const admin = url.searchParams.get("admin") === "1";
	if (admin) await requireOrganizer(request);
	const event = await getEvent(eventId);
	const [state] = await db
		.select()
		.from(eventLiveState)
		.where(eq(eventLiveState.eventId, eventId));
	const talkRows = await db
		.select({
			id: talks.id,
			title: talks.title,
			speakerName: participants.nickname,
			status: talks.status,
			durationSeconds: talks.durationSeconds,
			elapsedSeconds: talks.elapsedSeconds,
			resumedAt: talks.resumedAt,
		})
		.from(talks)
		.innerJoin(participants, eq(talks.speakerId, participants.id))
		.where(eq(talks.eventId, eventId))
		.orderBy(asc(talks.sortOrder));
	const talkList = talkRows.map((talk) => ({
		...talk,
		resumedAt: talk.resumedAt?.getTime() ?? null,
	}));
	const talkId = url.searchParams.has("talkId")
		? positiveId(Number(url.searchParams.get("talkId")))
		: state?.selectedTalkId;
	const talk = talkList.find((t) => t.id === talkId) ?? null;
	if (url.searchParams.has("talkId") && !talk)
		throw new ApiError(404, "発表が見つかりません。");
	const totals: EngagementSnapshot["reactions"] = {
		applause: 0,
		like: 0,
		learn: 0,
		hot: 0,
	};
	let comments: EngagementSnapshot["comments"] = [];
	if (talk) {
		const counts = await db
			.select({ kind: reactions.kind, count: count() })
			.from(reactions)
			.where(eq(reactions.talkId, talk.id))
			.groupBy(reactions.kind);
		for (const item of counts)
			if (reactionKinds.includes(item.kind as (typeof reactionKinds)[number]))
				totals[item.kind as (typeof reactionKinds)[number]] = item.count;
		comments = (
			await db
				.select({
					id: talkComments.id,
					talkId: talkComments.talkId,
					displayName: talkComments.displayName,
					body: talkComments.body,
					createdAt: talkComments.createdAt,
					hiddenAt: talkComments.hiddenAt,
				})
				.from(talkComments)
				.where(
					and(
						eq(talkComments.talkId, talk.id),
						admin ? undefined : isNull(talkComments.hiddenAt),
					),
				)
				.orderBy(desc(talkComments.createdAt), desc(talkComments.id))
				.limit(200)
		)
			.reverse()
			.map((comment) => ({
				...comment,
				createdAt: comment.createdAt.getTime(),
				hiddenAt: comment.hiddenAt?.getTime() ?? null,
			}));
	}
	return json({
		event,
		talks: talkList,
		selectedTalkId: state?.selectedTalkId ?? null,
		talk,
		commentsEnabled: state?.commentsEnabled ?? false,
		commentsProjectionEnabled: state?.commentsProjectionEnabled ?? false,
		reactions: totals,
		comments,
	} satisfies EngagementSnapshot);
}
async function mutate(request: Request) {
	const origin = request.headers.get("origin");
	if (origin && origin !== new URL(request.url).origin)
		throw new ApiError(403, "別サイトからの操作はできません。");
	if (!request.headers.get("content-type")?.startsWith("application/json"))
		throw new ApiError(415, "JSONで送信してください。");
	if (Number(request.headers.get("content-length")) > 8192)
		throw new ApiError(413, "送信内容が大きすぎます。");
	const raw = await request.text();
	if (raw.length > 8192) throw new ApiError(413, "送信内容が大きすぎます。");
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(raw);
	} catch {
		throw new ApiError(400, "送信内容が不正です。");
	}
	if (!body || typeof body !== "object" || Array.isArray(body))
		throw new ApiError(400, "送信内容が不正です。");
	const eventId = positiveId(body.eventId);
	await getEvent(eventId);
	if (request.method === "PATCH") {
		await requireOrganizer(request);
		if (body.action === "settings") {
			if (
				typeof body.commentsEnabled !== "boolean" ||
				typeof body.commentsProjectionEnabled !== "boolean"
			)
				throw new ApiError(400, "受付・投影の状態を指定してください。");
			await db
				.insert(eventLiveState)
				.values({
					eventId,
					commentsEnabled: body.commentsEnabled,
					commentsProjectionEnabled: body.commentsProjectionEnabled,
				})
				.onConflictDoUpdate({
					target: eventLiveState.eventId,
					set: {
						commentsEnabled: body.commentsEnabled,
						commentsProjectionEnabled: body.commentsProjectionEnabled,
					},
				});
		} else if (body.action === "hide") {
			if (
				typeof body.commentId !== "number" ||
				!Number.isSafeInteger(body.commentId)
			)
				throw new ApiError(400, "コメントIDが不正です。");
			const result = await db
				.update(talkComments)
				.set({ hiddenAt: new Date() })
				.where(
					and(
						eq(talkComments.id, body.commentId),
						sql`${talkComments.talkId} IN (SELECT id FROM talks WHERE event_id = ${eventId})`,
					),
				)
				.returning({ id: talkComments.id });
			if (!result.length) throw new ApiError(404, "コメントが見つかりません。");
		} else throw new ApiError(400, "操作が不正です。");
		return json({ ok: true });
	}
	if (body.action !== "reaction" && body.action !== "comment")
		throw new ApiError(400, "操作が不正です。");
	const talkId = positiveId(body.talkId);
	const [talk] = await db
		.select({ id: talks.id })
		.from(talks)
		.where(and(eq(talks.id, talkId), eq(talks.eventId, eventId)));
	if (!talk) throw new ApiError(404, "このイベントの発表が見つかりません。");
	const nickname =
		typeof body.displayName === "string" ? body.displayName.trim() : "ゲスト";
	if (
		body.action === "comment" &&
		(typeof body.displayName !== "string" ||
			!nickname ||
			Array.from(nickname).length > 40 ||
			typeof body.body !== "string" ||
			!body.body.trim() ||
			Array.from(body.body).length > 200)
	)
		throw new ApiError(
			400,
			"表示名は1〜40文字、本文は1〜200文字で入力してください。",
		);
	if (
		body.action === "reaction" &&
		!reactionKinds.includes(body.kind as (typeof reactionKinds)[number])
	)
		throw new ApiError(400, "リアクションの種類が不正です。");
	const user = await participant(
		request,
		eventId,
		body.action === "comment" ? nickname : "ゲスト",
	);
	const now = Math.floor(Date.now() / 1000);
	let id: number;
	if (body.action === "reaction") {
		// One atomic insert prevents parallel requests bypassing the one-second interval.
		const result = await db.all<{
			id: number;
		}>(sql`INSERT INTO reactions (event_id, talk_id, participant_id, kind, created_at)
			SELECT ${eventId}, ${talkId}, ${user.id}, ${body.kind as string}, ${now}
			WHERE NOT EXISTS (SELECT 1 FROM reactions WHERE participant_id = ${user.id} AND created_at > ${now - 1}) RETURNING id`);
		if (!result.length)
			return json(
				{ error: "少し待ってからリアクションしてください。" },
				429,
				user.cookie ? { "Set-Cookie": user.cookie } : undefined,
			);
		id = result[0].id;
	} else {
		// Check acceptance in the INSERT too, including when a stale screen submits.
		const result = await db.all<{
			id: number;
		}>(sql`INSERT INTO talk_comments (event_id, talk_id, participant_id, display_name, body, created_at)
			SELECT ${eventId}, ${talkId}, ${user.id}, ${nickname}, ${(body.body as string).trim()}, ${now}
			WHERE EXISTS (SELECT 1 FROM event_live_state WHERE event_id = ${eventId} AND comments_enabled = 1) RETURNING id`);
		if (!result.length)
			return json(
				{
					error: "コメントの受付は停止中です。入力内容はそのまま残っています。",
				},
				409,
				user.cookie ? { "Set-Cookie": user.cookie } : undefined,
			);
		id = result[0].id;
		await db
			.update(participants)
			.set({ nickname })
			.where(eq(participants.id, user.id));
	}
	return json(
		{ ok: true, id },
		201,
		user.cookie ? { "Set-Cookie": user.cookie } : undefined,
	);
}
export async function handleEngagement(request: Request) {
	try {
		return await (request.method === "GET"
			? snapshot(request)
			: mutate(request));
	} catch (error) {
		if (error instanceof ApiError)
			return json({ error: error.message }, error.status);
		console.error("Engagement API failed", error);
		return json(
			{ error: "通信に失敗しました。少し待ってから再試行してください。" },
			500,
		);
	}
}
