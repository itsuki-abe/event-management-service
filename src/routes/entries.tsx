import { createFileRoute } from "@tanstack/react-router";
import { LtPage } from "../components/lt";

export const Route = createFileRoute("/entries")({
	component: () => <LtPage mode="entries" />,
});
