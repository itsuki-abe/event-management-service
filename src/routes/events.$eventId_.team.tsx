import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "../components/venue";
export const Route = createFileRoute("/events/$eventId_/team")({
	component: TeamRoute,
});
function TeamRoute() {
	const { eventId } = Route.useParams();
	return <TeamPage key={eventId} eventId={eventId} />;
}
