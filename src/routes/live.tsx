import { createFileRoute, redirect } from "@tanstack/react-router";
// Short URL for the participant LT live page.
export const Route = createFileRoute("/live")({
	beforeLoad: () => {
		throw redirect({ to: "/screen" });
	},
});
