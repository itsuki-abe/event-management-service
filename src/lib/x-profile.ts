const reservedNames = new Set([
	"home",
	"explore",
	"search",
	"notifications",
	"messages",
	"settings",
	"intent",
	"share",
	"i",
	"compose",
	"login",
	"logout",
	"signup",
	"tos",
	"privacy",
	"account",
	"oauth",
	"hashtag",
]);

export function normalizeXUsername(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value !== "string")
		throw new Error("XのURLまたは @ユーザー名を入力してください。");
	const input = value.trim();
	if (!input) return null;
	let username = input.replace(/^@/, "");
	if (/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\//i.test(input)) {
		const url = new URL(
			/^https?:\/\//i.test(input) ? input : `https://${input}`,
		);
		if (url.username || url.password || url.port)
			throw new Error("XのプロフィールURLを入力してください。");
		username = url.pathname.replace(/^\//, "").replace(/\/$/, "");
	}
	if (
		!/^[a-zA-Z0-9_]{1,15}$/.test(username) ||
		reservedNames.has(username.toLowerCase())
	)
		throw new Error(
			"XのプロフィールURL（https://x.com/username）または @ユーザー名を入力してください。",
		);
	return username;
}
