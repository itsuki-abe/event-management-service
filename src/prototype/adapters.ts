/** Explicit demo-only boundaries. No requests or personal data leave the browser. */
export const decisionsAdapter = {
	mode: "mock" as const,
	status: "仕様確認待ち",
	description:
		"Decisions API の提供元・認証方式・ユーザー管理の責務は未確定です。現在は架空の参加者データを使用しています。",
};

export function getMockLiveContext(title: string) {
	return {
		mode: "mock" as const,
		label: "GPT-LIVE · 固定サンプル",
		summary: `「${title}」の発表補助を置くスペースです。実際の音声認識・要約・AI応答は接続されていません。`,
		terms: [
			{
				term: "プロトタイプ",
				explanation:
					"動きや体験を確かめるための試作品。完成品の前に仮説を試します。",
			},
			{
				term: "フィードバックループ",
				explanation: "試す → 反応を集める → 改善する、の繰り返し。",
			},
		],
	};
}
