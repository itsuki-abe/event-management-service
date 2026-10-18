import { createFileRoute, redirect } from "@tanstack/react-router";
// Short URL shown on the venue screen.
export const Route = createFileRoute("/live")({
	beforeLoad: () => {
		throw redirect({ to: "/engagement", search: { eventId: 1 } });
	},
});
