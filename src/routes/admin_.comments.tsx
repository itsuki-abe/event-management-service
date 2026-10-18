import { createFileRoute } from "@tanstack/react-router";
import { EngagementPage } from "../features/engagement/EngagementPage";

export const Route = createFileRoute("/admin_/comments")({
	validateSearch: (search: Record<string, unknown>) => ({
		eventId:
			Number.isSafeInteger(Number(search.eventId)) && Number(search.eventId) > 0
				? Number(search.eventId)
				: 1,
	}),
	component: Admin,
});
function Admin() {
	const { eventId } = Route.useSearch();
	return <EngagementPage key={eventId} eventId={eventId} admin />;
}
