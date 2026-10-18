import { ArrowUpRight } from "lucide-react";

export function XProfileLink({
	url,
	nickname,
}: {
	url: string;
	nickname: string;
}) {
	return (
		<a
			className="wc-x-profile"
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`${nickname}さんのXプロフィール（新しいタブで開く）`}
		>
			<span aria-hidden="true">𝕏</span>
			<span>@{url.split("/").pop()}</span>
			<ArrowUpRight size={16} aria-hidden="true" />
		</a>
	);
}
