import { createFileRoute } from "@tanstack/react-router";
import { CommonsPage } from "../components/commons-page";
export const Route = createFileRoute("/venue")({ component: Page });
function Page() {
	return <CommonsPage view="guide" />;
}
