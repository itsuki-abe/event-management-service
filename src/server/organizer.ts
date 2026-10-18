import { env } from "cloudflare:workers";

export const organizerCookieName = "lt_organizer";

export function organizerKey() {
	const key = "ORGANIZER_KEY" in env ? env.ORGANIZER_KEY : undefined;
	return typeof key === "string" &&
		key &&
		key !== "replace-with-a-long-random-key"
		? key
		: undefined;
}

export function isOrganizer(request: Request) {
	const key = organizerKey();
	const cookie = request.headers
		.get("Cookie")
		?.split(/;\s*/)
		.find((item) => item.startsWith(`${organizerCookieName}=`))
		?.slice(organizerCookieName.length + 1);
	return Boolean(key && cookie === encodeURIComponent(key));
}
