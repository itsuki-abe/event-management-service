import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSnapshot, ShareAction } from "../lib/lt";

type Share = LiveSnapshot["shares"][number];

// STUN only, so presenter and projector PCs must reach each other
// directly (same venue LAN works). Add a TURN server here if the venue
// network isolates clients.
const iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function shareApi<T>(action: ShareAction): Promise<T> {
	const response = await fetch("/api/share", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(action),
	});
	const body = (await response.json()) as T & { error?: string };
	if (!response.ok)
		throw Object.assign(new Error(body.error ?? "通信に失敗しました。"), {
			status: response.status,
		});
	return body;
}

// SDP is sent once with every candidate, so signaling needs no trickle ICE.
async function gathered(peer: RTCPeerConnection) {
	if (peer.iceGatheringState === "complete") return;
	await Promise.race([
		new Promise<void>((done) =>
			peer.addEventListener("icegatheringstatechange", () => {
				if (peer.iceGatheringState === "complete") done();
			}),
		),
		sleep(3000),
	]);
}

export function useSharePublisher() {
	const [sessionId, setSessionId] = useState<number | null>(null);
	const [talkId, setTalkId] = useState<number | null>(null);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [disconnected, setDisconnected] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		void shareApi<{ sessionId: number; talkId: number | null }>({
			action: "status",
		})
			.then((status) => {
				setSessionId(status.sessionId);
				// A share left over from before a reload cannot be resumed.
				if (status.talkId !== null) {
					setTalkId(status.talkId);
					setDisconnected(true);
					void shareApi({ action: "stop" });
				}
			})
			.catch(() => undefined);
	}, []);

	const stop = useCallback(() => {
		setStream((current) => {
			for (const track of current?.getTracks() ?? []) track.stop();
			return null;
		});
		setDisconnected(true);
		void shareApi({ action: "stop" }).catch(() => undefined);
	}, []);

	const prepare = useCallback(
		async (talk: number) => {
			setError("");
			let media: MediaStream;
			try {
				media = await navigator.mediaDevices.getDisplayMedia({
					video: { frameRate: 30 },
					audio: false,
				});
			} catch (cause) {
				if (
					!(cause instanceof DOMException && cause.name === "NotAllowedError")
				)
					setError("このブラウザーでは画面共有を開始できませんでした。");
				return;
			}
			const [track] = media.getVideoTracks();
			track.contentHint = "detail";
			track.addEventListener("ended", stop);
			try {
				const result = await shareApi<{ sessionId: number }>({
					action: "prepare",
					talkId: talk,
				});
				setSessionId(result.sessionId);
			} catch (cause) {
				for (const item of media.getTracks()) item.stop();
				setError(cause instanceof Error ? cause.message : "");
				return;
			}
			setTalkId(talk);
			setDisconnected(false);
			setStream(media);
		},
		[stop],
	);

	// Answer every viewer offer while the stream is live; polling doubles as heartbeat.
	useEffect(() => {
		if (!stream) return;
		const peers = new Map<string, RTCPeerConnection>();
		let alive = true;
		let timer: ReturnType<typeof setTimeout>;
		const answer = async (id: string, sdp: string) => {
			const peer = new RTCPeerConnection({ iceServers });
			peers.set(id, peer);
			peer.addEventListener("connectionstatechange", () => {
				if (["failed", "closed"].includes(peer.connectionState)) {
					peer.close();
					peers.delete(id);
				}
			});
			for (const track of stream.getTracks()) peer.addTrack(track, stream);
			await peer.setRemoteDescription({ type: "offer", sdp });
			await peer.setLocalDescription(await peer.createAnswer());
			await gathered(peer);
			if (alive && peer.localDescription)
				await shareApi({
					action: "answer",
					id,
					sdp: peer.localDescription.sdp,
				});
		};
		const poll = async () => {
			try {
				const { offers } = await shareApi<{
					offers: { id: string; sdp: string }[];
				}>({ action: "poll" });
				for (const offer of offers)
					if (!peers.has(offer.id))
						void answer(offer.id, offer.sdp).catch(() =>
							peers.delete(offer.id),
						);
			} catch (cause) {
				if ((cause as { status?: number }).status === 409) return stop();
			}
			if (alive) timer = setTimeout(poll, 1000);
		};
		void poll();
		return () => {
			alive = false;
			clearTimeout(timer);
			for (const peer of peers.values()) peer.close();
		};
	}, [stream, stop]);

	return { sessionId, talkId, stream, disconnected, error, prepare, stop };
}

export function useShareViewer(share: Share | undefined) {
	const [stream, setStream] = useState<MediaStream | null>(null);
	const key = share?.live ? `${share.sessionId}:${share.startedAt}` : null;

	useEffect(() => {
		setStream(null);
		if (!key) return;
		const sessionId = Number(key.split(":")[0]);
		let alive = true;
		let current: RTCPeerConnection | undefined;
		let retry: ReturnType<typeof setTimeout>;
		const again = () => {
			if (!alive) return;
			clearTimeout(retry);
			retry = setTimeout(connect, 2000);
		};
		async function connect() {
			current?.close();
			const peer = new RTCPeerConnection({ iceServers });
			current = peer;
			peer.addTransceiver("video", { direction: "recvonly" });
			peer.addEventListener("track", (event) => {
				if (alive && current === peer)
					setStream(event.streams[0] ?? new MediaStream([event.track]));
			});
			peer.addEventListener("connectionstatechange", () => {
				if (current === peer && peer.connectionState === "failed") {
					setStream(null);
					again();
				}
			});
			try {
				await peer.setLocalDescription(await peer.createOffer());
				await gathered(peer);
				if (!peer.localDescription) throw new Error("No offer");
				const { id } = await shareApi<{ id: string }>({
					action: "offer",
					sessionId,
					sdp: peer.localDescription.sdp,
				});
				for (let i = 0; i < 20 && alive && current === peer; i++) {
					await sleep(1000);
					const { answer } = await shareApi<{ answer: string | null }>({
						action: "receive",
						id,
					});
					if (answer) {
						await peer.setRemoteDescription({ type: "answer", sdp: answer });
						return;
					}
				}
				if (current === peer) again();
			} catch {
				if (current === peer) again();
			}
		}
		void connect();
		return () => {
			alive = false;
			clearTimeout(retry);
			current?.close();
		};
	}, [key]);

	return stream;
}

export function ShareVideo({
	stream,
	label,
}: {
	stream: MediaStream;
	label: string;
}) {
	const ref = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		if (ref.current) ref.current.srcObject = stream;
	}, [stream]);
	return (
		<video
			ref={ref}
			className="share-video"
			aria-label={label}
			autoPlay
			muted
			playsInline
		/>
	);
}
