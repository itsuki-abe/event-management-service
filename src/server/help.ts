import type { HelpSession } from "../lib/usage-guide";
import { isOrganizer } from "./organizer";
import { readSession } from "./participation";

export async function getHelpSession(
	database: D1Database,
	request: Request,
	organizerKey: unknown,
) {
	const headers = { "Cache-Control": "private, no-store" };
	const eventId = new URL(request.url).searchParams.get("eventId");
	if (
		eventId !== null &&
		(!/^[1-9]\d*$/.test(eventId) || !Number.isSafeInteger(Number(eventId)))
	) {
		return Response.json(
			{ error: "イベントのURLを確認してください。" },
			{ status: 400, headers },
		);
	}
	try {
		const event = await (eventId === null
			? database.prepare("SELECT id, name FROM events ORDER BY id LIMIT 1")
			: database
					.prepare("SELECT id, name FROM events WHERE id = ?")
					.bind(Number(eventId))
		).first<{ id: number; name: string }>();
		if (eventId !== null && !event) {
			return Response.json(
				{
					error:
						"このイベントが見つかりません。案内されたURLを確認してください。",
				},
				{ status: 404, headers },
			);
		}
		const session = event
			? await readSession(database, request, event.id)
			: null;
		const participant = session?.participant_id
			? await database
					.prepare(
						"SELECT nickname FROM participants WHERE id = ? AND event_id = ?",
					)
					.bind(session.participant_id, event?.id)
					.first<{ nickname: string }>()
			: null;
		return Response.json(
			{
				event,
				participant,
				organizer: isOrganizer(request, organizerKey),
			} satisfies HelpSession,
			{ headers },
		);
	} catch {
		return Response.json(
			{ error: "参加状態を確認できませんでした。もう一度お試しください。" },
			{ status: 500, headers },
		);
	}
}
