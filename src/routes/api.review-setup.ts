import { createFileRoute } from "@tanstack/react-router";
import { handleReviewSetup } from "../features/engagement/server";

export const Route = createFileRoute("/api/review-setup")({
	server: {
		handlers: {
			GET: ({ request }) => handleReviewSetup(request),
			POST: ({ request }) => handleReviewSetup(request),
			PATCH: ({ request }) => handleReviewSetup(request),
		},
	},
});
