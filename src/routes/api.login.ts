import { createFileRoute } from "@tanstack/react-router";
import { login } from "../server/lt";

export const Route = createFileRoute("/api/login")({
	server: { handlers: { GET: ({ request }) => login(request) } },
});
