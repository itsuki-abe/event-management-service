export function SpeakerAvatar({ name }: { name: string }) {
	const variant =
		Array.from(name).reduce(
			(sum, character) => sum + (character.codePointAt(0) ?? 0),
			0,
		) % 2;
	return (
		<img
			className="wc-speaker-avatar"
			src={
				variant
					? "/assets/commons/avatar-misaki.png"
					: "/assets/commons/avatar-ken.png"
			}
			width={48}
			height={48}
			alt=""
			decoding="async"
		/>
	);
}
