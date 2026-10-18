import { createFileRoute } from "@tanstack/react-router";
import { GuideAdminPage } from "../components/guide-admin";

export const Route = createFileRoute("/admin_/guide")({
	validateSearch: (search: Record<string, unknown>) => ({
		eventId: /^[1-9]\d*$/.test(String(search.eventId))
			? String(search.eventId)
			: "1",
	}),
	component: GuideAdminRoute,
});

function GuideAdminRoute() {
	const { eventId } = Route.useSearch();
	return <GuideAdminPage key={eventId} eventId={eventId} />;
}
