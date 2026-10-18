export const organizerCookieName = "lt_organizer";

export function organizerKey(value: unknown): string | undefined {
	return typeof value === "string" &&
		value.length > 0 &&
		value !== "replace-with-a-long-random-key"
		? value
		: undefined;
}

export function isOrganizer(request: Request, value: unknown): boolean {
	const key = organizerKey(value);
	if (!key) return false;
	const cookie = request.headers
		.get("cookie")
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${organizerCookieName}=`))
		?.slice(organizerCookieName.length + 1);
	return cookie === encodeURIComponent(key);
}
