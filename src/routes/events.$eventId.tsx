import { createFileRoute } from "@tanstack/react-router";
import { ParticipationPage } from "../components/participation";

export const Route = createFileRoute("/events/$eventId")({
	component: EventPage,
});
function EventPage() {
	const { eventId } = Route.useParams();
	return <ParticipationPage key={eventId} eventId={eventId} />;
}
