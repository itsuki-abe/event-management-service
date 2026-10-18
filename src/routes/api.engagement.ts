import { createFileRoute } from "@tanstack/react-router";
import { handleEngagement } from "../features/engagement/server";

export const Route = createFileRoute("/api/engagement")({
	server: {
		handlers: {
			GET: ({ request }) => handleEngagement(request),
			POST: ({ request }) => handleEngagement(request),
			PATCH: ({ request }) => handleEngagement(request),
		},
	},
});
