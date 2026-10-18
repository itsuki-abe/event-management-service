import { createFileRoute } from "@tanstack/react-router";
import { LtPage } from "../components/lt";
export const Route = createFileRoute("/admin")({
	component: () => <LtPage mode="admin" />,
});
