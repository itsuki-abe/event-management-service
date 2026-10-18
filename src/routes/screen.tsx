import { createFileRoute } from "@tanstack/react-router";
import { CommonsPage } from "../components/commons-page";
export const Route = createFileRoute("/screen")({ component: Page });
function Page() {
	return <CommonsPage view="projection" />;
}
