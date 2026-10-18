import { z } from "zod";
import { decodeWifi, type Guide, guideCategories } from "../lib/venue";
import { isOrganizer } from "./organizer";

const guideCategorySchema = z.enum([
	"notice",
	"wifi",
	"toilet",
	"access",
	"rules",
	"contact",
	"hashtag",
	"other",
]);
const guideInputSchema = z
	.object({
		category: guideCategorySchema,
		title: z.string().trim().max(100),
		content: z.string().max(4000),
		isVisible: z.boolean(),
	})
	.strict()
	.superRefine((guide, context) => {
		if (
			guide.category === "wifi" &&
			guide.content.trim() &&
			!decodeWifi(guide.content)
		)
			context.addIssue({
				code: "custom",
				path: ["content"],
				message: "Wi-Fiの入力内容を確認してください。",
			});
	});
const saveGuidesSchema = z
	.object({
		guides: z.array(guideInputSchema).max(guideCategories.length),
	})
	.strict()
	.superRefine(({ guides }, context) => {
		if (new Set(guides.map((guide) => guide.category)).size !== guides.length)
			context.addIssue({
				code: "custom",
				path: ["guides"],
				message: "同じ種類の案内は1件だけ設定できます。",
			});
	});

type GuideRow = Omit<Guide, "isVisible"> & { isVisible: number };
const maxBodyBytes = 128 * 1024;

class GuideError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

async function readGuides(
	database: D1Database,
	eventId: number,
): Promise<Guide[]> {
	const rows = await database
		.prepare(
			`SELECT id, category, title, content, sort_order AS sortOrder, is_visible AS isVisible
		FROM event_guides WHERE event_id = ? ORDER BY sort_order, id`,
		)
		.bind(eventId)
		.all<GuideRow>();
	return rows.results
		.filter((row) => guideCategorySchema.safeParse(row.category).success)
		.map((row) => ({ ...row, isVisible: row.isVisible === 1 }));
}

export async function readPublicGuides(
	database: D1Database,
	eventId: number,
): Promise<Guide[]> {
	const guides = await readGuides(database, eventId);
	let hasNotice = false;
	return guides.filter((guide) => {
		if (!guide.isVisible || !guide.title.trim() || !guide.content.trim())
			return false;
		if (guide.category === "wifi" && !decodeWifi(guide.content)?.ssid.trim())
			return false;
		if (guide.category === "notice") {
			if (hasNotice) return false;
			hasNotice = true;
		}
		return true;
	});
}

async function readBody(request: Request): Promise<unknown> {
	if (
		request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
		"application/json"
	)
		throw new GuideError(415, "JSON形式で送信してください。");
	if (Number(request.headers.get("content-length")) > maxBodyBytes)
		throw new GuideError(413, "入力が大きすぎます。");
	const reader = request.body?.getReader();
	if (!reader) throw new GuideError(400, "入力内容を確認してください。");
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > maxBodyBytes) {
				await reader.cancel();
				throw new GuideError(413, "入力が大きすぎます。");
			}
			text += decoder.decode(chunk.value, { stream: true });
		}
		text += decoder.decode();
	} finally {
		reader.releaseLock();
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new GuideError(400, "入力形式を確認してください。");
	}
}

export async function handleGuideManagement(
	database: D1Database,
	request: Request,
	rawEventId: string,
	organizerKey: unknown,
): Promise<Response> {
	const headers = new Headers({
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
	});
	const respond = (data: unknown, status = 200) =>
		Response.json(data, { status, headers });
	try {
		if (!isOrganizer(request, organizerKey))
			throw new GuideError(401, "運営用リンクから開き直してください。");
		if (request.method !== "GET" && request.method !== "POST") {
			headers.set("Allow", "GET, POST");
			throw new GuideError(405, "この操作には対応していません。");
		}
		if (
			request.method === "POST" &&
			request.headers.get("origin") !== new URL(request.url).origin
		)
			throw new GuideError(403, "このページからもう一度操作してください。");
		const eventId = Number(rawEventId);
		if (!/^[1-9]\d*$/.test(rawEventId) || !Number.isSafeInteger(eventId))
			throw new GuideError(404, "イベントが見つかりません。");
		const event = await database
			.prepare("SELECT id, name FROM events WHERE id = ?")
			.bind(eventId)
			.first<{ id: number; name: string }>();
		if (!event) throw new GuideError(404, "イベントが見つかりません。");
		if (request.method === "POST") {
			const input = saveGuidesSchema.safeParse(await readBody(request));
			if (!input.success)
				throw new GuideError(
					400,
					"入力内容を確認してください。案内は種類ごとに1件、タイトル100文字・本文4000文字以内で入力できます。",
				);
			// D1 batch is transactional: failed inserts also roll back the deletion.
			await database.batch([
				database
					.prepare("DELETE FROM event_guides WHERE event_id = ?")
					.bind(eventId),
				...input.data.guides.map((guide, index) =>
					database
						.prepare(
							`INSERT INTO event_guides (event_id, category, title, content, sort_order, is_visible)
					VALUES (?, ?, ?, ?, ?, ?)`,
						)
						.bind(
							eventId,
							guide.category,
							guide.title,
							guide.category === "wifi" ? guide.content : guide.content.trim(),
							index,
							guide.isVisible ? 1 : 0,
						),
				),
			]);
		}
		return respond({ event, guides: await readGuides(database, eventId) });
	} catch (error) {
		if (error instanceof GuideError)
			return respond({ error: error.message }, error.status);
		console.error("Venue guide operation failed");
		return respond(
			{
				error:
					"案内を保存・取得できませんでした。時間をおいてもう一度お試しください。",
			},
			500,
		);
	}
}
