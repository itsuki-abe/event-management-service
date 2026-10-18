import { createFileRoute } from "@tanstack/react-router";
import { VenueQrPage } from "../components/participation";

export const Route = createFileRoute("/events/$eventId_/qr")({
	component: QrPage,
});
function QrPage() {
	const { eventId } = Route.useParams();
	return <VenueQrPage key={eventId} eventId={eventId} />;
}
