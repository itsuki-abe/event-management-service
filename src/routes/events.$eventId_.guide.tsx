import { createFileRoute } from "@tanstack/react-router";
import { VenuePage } from "../components/venue";
export const Route = createFileRoute("/events/$eventId_/guide")({
	component: GuidePage,
});
function GuidePage() {
	const { eventId } = Route.useParams();
	return <VenuePage key={eventId} eventId={eventId} />;
}
