import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { getHelpSession } from "../server/help";

export const Route = createFileRoute("/api/help")({
	server: {
		handlers: {
			GET: ({ request }) =>
				getHelpSession(
					env.DB,
					request,
					"ORGANIZER_KEY" in env ? env.ORGANIZER_KEY : undefined,
				),
		},
	},
});
