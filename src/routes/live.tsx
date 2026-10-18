import { createFileRoute } from "@tanstack/react-router";
import { CommonsPage } from "../components/commons-page";
export const Route = createFileRoute("/live")({ component: Page });
function Page() {
	return <CommonsPage view="live" />;
}
