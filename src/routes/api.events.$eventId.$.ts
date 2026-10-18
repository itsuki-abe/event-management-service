import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { handleParticipation } from "../server/participation";

export const Route = createFileRoute("/api/events/$eventId/$")({
	server: {
		handlers: {
			GET: ({ request, params }) =>
				handleParticipation(
					env.DB,
					request,
					params.eventId,
					params._splat ?? "",
				),
			POST: ({ request, params }) =>
				handleParticipation(
					env.DB,
					request,
					params.eventId,
					params._splat ?? "",
				),
		},
	},
});
