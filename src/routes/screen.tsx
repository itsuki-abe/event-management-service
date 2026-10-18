import { createFileRoute } from "@tanstack/react-router";
import { LtPage } from "../components/lt";
export const Route = createFileRoute("/screen")({
	component: () => <LtPage mode="screen" />,
});
