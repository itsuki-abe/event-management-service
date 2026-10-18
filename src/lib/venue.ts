export type GuideCategory =
	| "notice"
	| "wifi"
	| "toilet"
	| "access"
	| "rules"
	| "contact"
	| "hashtag"
	| "other";

export type Guide = {
	id: number;
	category: GuideCategory;
	title: string;
	content: string;
	sortOrder: number;
	isVisible: boolean;
};

export const guideCategories: ReadonlyArray<{
	category: GuideCategory;
	title: string;
	description: string;
}> = [
	{
		category: "notice",
		title: "重要なお知らせ",
		description: "参加者に最初に伝えたい案内",
	},
	{ category: "wifi", title: "Wi-Fi", description: "ネットワーク名と接続情報" },
	{ category: "toilet", title: "トイレ", description: "場所や利用できる設備" },
	{
		category: "access",
		title: "入退館",
		description: "会場への入り方や再入場の案内",
	},
	{
		category: "rules",
		title: "ハウスルール",
		description: "飲食・撮影など会場での過ごし方",
	},
	{
		category: "contact",
		title: "問い合わせ先",
		description: "困ったときの連絡先や受付",
	},
	{
		category: "hashtag",
		title: "ハッシュタグ",
		description: "感想や写真の共有に使うタグ",
	},
	{
		category: "other",
		title: "その他",
		description: "参加者に伝えたい追加の案内",
	},
];

export type WifiDetails = { ssid: string; password: string; note: string };

export function decodeWifi(content: string): WifiDetails | null {
	try {
		const value: unknown = JSON.parse(content);
		if (!value || typeof value !== "object" || Array.isArray(value))
			return null;
		const fields = value as Record<string, unknown>;
		if (
			typeof fields.ssid !== "string" ||
			typeof fields.password !== "string" ||
			(fields.note !== undefined && typeof fields.note !== "string") ||
			fields.ssid.length > 128 ||
			fields.password.length > 128 ||
			(typeof fields.note === "string" && fields.note.length > 1000)
		)
			return null;
		return {
			ssid: fields.ssid,
			password: fields.password,
			note: typeof fields.note === "string" ? fields.note : "",
		};
	} catch {
		return null;
	}
}
