export const reactionKinds = ["applause", "like", "learn", "hot"] as const;
export type ReactionKind = (typeof reactionKinds)[number];
export const reactionLabels: Record<
	ReactionKind,
	{ icon: string; label: string }
> = {
	applause: { icon: "front_hand", label: "拍手" },
	like: { icon: "thumb_up", label: "いいね" },
	learn: { icon: "lightbulb", label: "学び" },
	hot: { icon: "local_fire_department", label: "熱い" },
};
export type Talk = {
	id: number;
	title: string;
	speakerName: string;
	status: "pending" | "running" | "paused" | "ended";
	durationSeconds: number;
	elapsedSeconds: number;
	resumedAt: number | null;
};
export type Comment = {
	id: number;
	talkId: number;
	displayName: string;
	body: string;
	createdAt: number;
	hiddenAt: number | null;
};
export type EngagementSnapshot = {
	event: { id: number; title: string };
	talks: Talk[];
	selectedTalkId: number | null;
	talk: Talk | null;
	commentsEnabled: boolean;
	commentsProjectionEnabled: boolean;
	reactions: Record<ReactionKind, number>;
	comments: Comment[];
};
