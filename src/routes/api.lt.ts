import { createFileRoute } from "@tanstack/react-router";
import { getLive, postLive } from "../server/lt";

export const Route = createFileRoute("/api/lt")({
	server: {
		handlers: {
			GET: getLive,
			POST: ({ request }) => postLive(request),
		},
	},
});
