import { ArrowUpRight } from "lucide-react";

export function XProfileLink({
	username,
	nickname,
}: {
	username: string;
	nickname: string;
}) {
	if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;
	return (
		<a
			className="wc-x-profile"
			href={`https://x.com/${username}`}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`${nickname}さんのXプロフィール（新しいタブで開く）`}
		>
			<span aria-hidden="true">𝕏</span>
			<span>@{username}</span>
			<ArrowUpRight size={16} aria-hidden="true" />
		</a>
	);
}
