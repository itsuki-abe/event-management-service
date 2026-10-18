import { env } from "cloudflare:workers";
import { shareActionSchema } from "../lib/lt";
import { SHARE_TIMEOUT_SECONDS } from "./lt";
import { isOrganizer } from "./organizer";
import { ensureSession, readSession } from "./participation";

// WebRTC signaling for presenter screen shares. A viewer (projector or the
// organizer preview) posts an offer; the presenter PC polls, answers, and the
// viewer picks the answer up. ICE is gathered before sending, so no trickle.

const nowSeconds = () => Math.floor(Date.now() / 1000);
const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) =>
	Response.json({ error }, { status, headers: noStore });

const stun = [{ urls: ["stun:stun.cloudflare.com:3478"] }];

// Cloudflare Realtime TURN relays media when the two PCs cannot connect
// directly. Without TURN_KEY_ID / TURN_KEY_API_TOKEN, only STUN is used.
async function iceServers() {
	const id = "TURN_KEY_ID" in env ? env.TURN_KEY_ID : undefined;
	const token =
		"TURN_KEY_API_TOKEN" in env ? env.TURN_KEY_API_TOKEN : undefined;
	if (typeof id !== "string" || !id || typeof token !== "string" || !token)
		return stun;
	try {
		const response = await fetch(
			`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ttl: 86400 }),
			},
		);
		if (!response.ok) throw new Error(String(response.status));
		const { iceServers } = (await response.json()) as {
			iceServers: { urls: string[]; username?: string; credential?: string }[];
		};
		// Browsers block port 53, and without trickle ICE it only adds a timeout.
		return iceServers.map((server) => ({
			...server,
			urls: server.urls.filter((url) => !/:53(\?|$)/.test(url)),
		}));
	} catch (error) {
		console.error("TURN credentials failed", error);
		return stun;
	}
}

export async function postShare(request: Request) {
	if (!request.headers.get("Content-Type")?.startsWith("application/json"))
		return fail("入力形式を確認してください。", 400);
	const body = await request.text();
	if (body.length > 65536) return fail("入力が大きすぎます。", 413);
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return fail("入力形式を確認してください。", 400);
	}
	const result = shareActionSchema.safeParse(parsed);
	if (!result.success) return fail("入力内容を確認してください。", 400);
	const action = result.data;

	const event = await env.DB.prepare(
		"SELECT id FROM events ORDER BY id LIMIT 1",
	).first<{ id: number }>();
	if (!event) return fail("イベントがまだ作成されていません。", 409);
	const now = nowSeconds();
	const headers = new Headers(noStore);
	const json = (data: unknown) => Response.json(data, { headers });

	if (action.action === "ice") return json({ iceServers: await iceServers() });
	if (action.action === "offer" || action.action === "receive") {
		if (action.action === "receive") {
			const row = await env.DB.prepare(
				"SELECT answer FROM screen_share_signals WHERE id = ?",
			)
				.bind(action.id)
				.first<{ answer: string | null }>();
			if (!row) return fail("接続をやり直してください。", 404);
			return json({ answer: row.answer });
		}
		const projected = await env.DB.prepare(
			"SELECT 1 FROM event_live_state WHERE event_id = ? AND projected_session_id = ?",
		)
			.bind(event.id, action.sessionId)
			.first();
		// The projected share is public anyway; previews of others are organizer-only.
		if (!projected && !isOrganizer(request))
			return fail("運営用リンクから開き直してください。", 401);
		const id = crypto.randomUUID();
		const [, inserted] = await env.DB.batch([
			env.DB.prepare(
				"DELETE FROM screen_share_signals WHERE created_at < ?",
			).bind(now - 60),
			env.DB.prepare(`INSERT INTO screen_share_signals (id, session_id, offer, created_at)
				SELECT ?, session_id, ?, ? FROM screen_shares
				WHERE session_id = ? AND event_id = ? AND heartbeat_at > ?`).bind(
				id,
				action.sdp,
				now,
				action.sessionId,
				event.id,
				now - SHARE_TIMEOUT_SECONDS,
			),
		]);
		if (inserted.meta.changes !== 1) return fail("共有が見つかりません。", 404);
		return json({ id });
	}

	const session =
		action.action === "status" || action.action === "prepare"
			? await ensureSession(env.DB, request, event.id, headers)
			: await readSession(env.DB, request, event.id);
	if (!session) return fail("ページを開き直してください。", 401);

	switch (action.action) {
		case "status": {
			const share = await env.DB.prepare(
				"SELECT 1 FROM screen_shares WHERE session_id = ? AND heartbeat_at > 0",
			)
				.bind(session.id)
				.first();
			return json({
				sessionId: session.id,
				participantId: session.participant_id,
				shared: Boolean(share),
			});
		}
		case "prepare": {
			if (!session.participant_id)
				return fail("先に参加登録してください。", 403);
			await env.DB.batch([
				env.DB.prepare(
					"DELETE FROM screen_share_signals WHERE session_id = ?",
				).bind(session.id),
				env.DB.prepare(`INSERT INTO screen_shares (session_id, event_id, started_at, heartbeat_at)
					VALUES (?, ?, ?, ?) ON CONFLICT (session_id) DO UPDATE SET
					started_at = excluded.started_at, heartbeat_at = excluded.heartbeat_at`).bind(
					session.id,
					event.id,
					Date.now(),
					now,
				),
			]);
			return json({ ok: true });
		}
		case "poll": {
			const [updated, offers] = await env.DB.batch<{
				id: string;
				sdp: string;
			}>([
				env.DB.prepare(
					"UPDATE screen_shares SET heartbeat_at = ? WHERE session_id = ?",
				).bind(now, session.id),
				env.DB.prepare(`SELECT id, offer AS sdp FROM screen_share_signals
					WHERE session_id = ? AND answer IS NULL AND created_at > ?`).bind(
					session.id,
					now - 30,
				),
			]);
			if (updated.meta.changes !== 1)
				return fail("共有をもう一度準備してください。", 409);
			return json({ offers: offers.results });
		}
		case "answer":
			await env.DB.prepare(
				"UPDATE screen_share_signals SET answer = ? WHERE id = ? AND session_id = ?",
			)
				.bind(action.sdp, action.id, session.id)
				.run();
			return json({ ok: true });
		case "stop":
			await env.DB.batch([
				env.DB.prepare(
					"UPDATE screen_shares SET heartbeat_at = 0 WHERE session_id = ?",
				).bind(session.id),
				env.DB.prepare(
					"DELETE FROM screen_share_signals WHERE session_id = ?",
				).bind(session.id),
			]);
			return json({ ok: true });
	}
}
