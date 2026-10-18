import { createFileRoute } from "@tanstack/react-router";
import { getLive, postLive } from "../server/lt";

export const Route = createFileRoute("/api/lt")({
	server: {
		handlers: {
			GET: ({ request }) => getLive(request),
			POST: ({ request }) => postLive(request),
		},
	},
});
