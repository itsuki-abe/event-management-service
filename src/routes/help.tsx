import { createFileRoute } from "@tanstack/react-router";
import { UsageGuidePage } from "../components/usage-guide";

export const Route = createFileRoute("/help")({
	validateSearch: (search: Record<string, unknown>) => ({
		eventId:
			search.eventId === undefined
				? undefined
				: /^[1-9]\d*$/.test(String(search.eventId)) &&
						Number.isSafeInteger(Number(search.eventId))
					? Number(search.eventId)
					: String(search.eventId),
		role:
			search.role === "organizer"
				? ("organizer" as const)
				: search.role === "participant"
					? ("participant" as const)
					: undefined,
		welcome: String(search.welcome) === "1" ? 1 : undefined,
	}),
	head: () => ({ meta: [{ title: "使い方ガイド | Workshop Commons" }] }),
	component: HelpRoute,
});

function HelpRoute() {
	const search = Route.useSearch();
	return (
		<UsageGuidePage
			key={`${search.eventId}-${search.role}`}
			eventId={
				search.eventId === undefined ? undefined : String(search.eventId)
			}
			role={search.role}
			welcome={search.welcome === 1}
		/>
	);
}
