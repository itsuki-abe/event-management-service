import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	type EngagementSnapshot,
	type ReactionKind,
	reactionKinds,
} from "./types";

const emoji: Record<ReactionKind, string> = {
	applause: "👏",
	like: "❤️",
	learn: "💡",
	hot: "🔥",
};
type Burst = { id: number; kind: ReactionKind; count: number };

// Only new reactions animate: loading a page or switching talks never replays history.
export function ReactionOverlay({
	data,
	target,
}: {
	data: EngagementSnapshot | null;
	target?: HTMLElement | null;
}) {
	const previous = useRef<EngagementSnapshot | null>(null);
	const nextId = useRef(0);
	const [bursts, setBursts] = useState<Burst[]>([]);
	useEffect(() => {
		const before = previous.current;
		previous.current = data;
		if (!data || before?.talk?.id !== data.talk?.id || !before) {
			setBursts([]);
			return;
		}
		const fresh = reactionKinds.flatMap((kind) => {
			const count = data.reactions[kind] - before.reactions[kind];
			return count > 0 ? [{ id: ++nextId.current, kind, count }] : [];
		});
		if (fresh.length) setBursts((items) => [...items, ...fresh].slice(-12));
	}, [data]);
	if (typeof document === "undefined") return null;
	return createPortal(
		<div className="reaction-overlay" aria-hidden="true">
			{bursts.map((burst) => (
				<div
					className={`reaction-burst ${burst.kind}`}
					key={burst.id}
					onAnimationEnd={(event) => {
						if (event.target === event.currentTarget)
							setBursts((items) =>
								items.filter((item) => item.id !== burst.id),
							);
					}}
				>
					{Array.from(
						{ length: Math.min(32, 18 + burst.count * 2) },
						(_, i) => (
							<span
								className="reaction-particle"
								key={i}
								style={
									{
										"--x": `${(i * 37 + burst.id * 13) % 100}%`,
										"--drift": `${((i * 53) % 300) - 150}px`,
										"--delay": `${(i % 7) * 0.08}s`,
										"--size": `${44 + (i % 5) * 14}px`,
										"--spin": `${i % 2 ? 28 : -28}deg`,
									} as CSSProperties
								}
							>
								{emoji[burst.kind]}
							</span>
						),
					)}
				</div>
			))}
		</div>,
		target ?? document.body,
	);
}
