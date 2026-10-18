import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { handleParticipation } from "../server/participation";
import { handleGuideManagement } from "../server/venue";

function handleEventRequest(request: Request, eventId: string, action: string) {
	if (action === "guide/manage")
		return handleGuideManagement(
			env.DB,
			request,
			eventId,
			"ORGANIZER_KEY" in env ? env.ORGANIZER_KEY : undefined,
		);
	return handleParticipation(env.DB, request, eventId, action);
}

export const Route = createFileRoute("/api/events/$eventId/$")({
	server: {
		handlers: {
			GET: ({ request, params }) =>
				handleEventRequest(request, params.eventId, params._splat ?? ""),
			POST: ({ request, params }) =>
				handleEventRequest(request, params.eventId, params._splat ?? ""),
		},
	},
});
