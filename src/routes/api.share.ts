import { createFileRoute } from "@tanstack/react-router";
import { postShare } from "../server/share";

export const Route = createFileRoute("/api/share")({
	server: {
		handlers: {
			POST: ({ request }) => postShare(request),
		},
	},
});
