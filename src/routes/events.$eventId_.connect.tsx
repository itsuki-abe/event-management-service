import { createFileRoute } from "@tanstack/react-router";
import { ParticipationPage } from "../components/participation";

export const Route = createFileRoute("/events/$eventId_/connect")({
	component: ConnectPage,
});
function ConnectPage() {
	const { eventId } = Route.useParams();
	return <ParticipationPage key={eventId} eventId={eventId} desktop />;
}
