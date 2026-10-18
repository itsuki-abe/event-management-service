import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/events")({
	server: {
		handlers: {
			GET: async () => {
				const events = await env.DB.prepare(
					"SELECT id, name FROM events ORDER BY starts_at DESC, id DESC LIMIT 50",
				).all();
				return Response.json(events.results, {
					headers: { "Cache-Control": "no-store" },
				});
			},
		},
	},
});
