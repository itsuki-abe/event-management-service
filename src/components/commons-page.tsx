import { CircleNotchIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { CommonsView } from "../lib/commons-renderer.js";
import { mountCommons } from "../lib/commons-renderer.js";

const paths = {
	home: "/",
	guide: "/venue",
	live: "/live",
	team: "/team",
	operator: "/admin",
	presenter: "/presenter",
	projection: "/screen",
} as const;
export function CommonsPage({ view }: { view: CommonsView }) {
	const ref = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();
	useEffect(() => {
		if (!ref.current) return;
		const roots: ReturnType<typeof createRoot>[] = [];
		const destroy = mountCommons(ref.current, {
			view,
			onNavigate: (next) => {
				void navigate({ to: paths[next] });
			},
			renderQR: (target, url) => {
				const root = createRoot(target);
				root.render(<QRCodeSVG value={url} size={148} marginSize={2} />);
				roots.push(root);
			},
		});
		return () => {
			destroy();
			queueMicrotask(() => {
				for (const root of roots) root.unmount();
			});
		};
	}, [view, navigate]);
	return (
		<div ref={ref} className="commons-root">
			<div className="app-loading">
				<CircleNotchIcon size={32} />
				WORKSHOP COMMONS
			</div>
		</div>
	);
}
