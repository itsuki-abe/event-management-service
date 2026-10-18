import { createFileRoute } from "@tanstack/react-router";
import { ParticipantsPage } from "../components/participants";

export const Route = createFileRoute("/events/$eventId_/participants")({
	component: ParticipantsRoute,
});

function ParticipantsRoute() {
	const { eventId } = Route.useParams();
	return <ParticipantsPage key={eventId} eventId={eventId} />;
}
