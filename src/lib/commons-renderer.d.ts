export type CommonsView =
	| "home"
	| "guide"
	| "live"
	| "team"
	| "operator"
	| "presenter"
	| "projection";
export function mountCommons(
	target: HTMLElement,
	options: {
		view: CommonsView;
		onNavigate: (view: CommonsView) => void;
		renderQR: (target: HTMLElement, url: string) => void;
	},
): () => void;
