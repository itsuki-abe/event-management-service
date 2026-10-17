import { useCallback, useEffect, useRef, useState } from "react";
import { createSeedState, type EventState } from "./domain";
import { parsePersistedState } from "./persistence";

const KEY = "event-management-prototype:v1";
const readState = (): EventState | null => {
	try {
		return parsePersistedState(localStorage.getItem(KEY));
	} catch {
		return null;
	}
};

export function useEventStore() {
	const [state, setState] = useState(createSeedState);
	const latest = useRef(state);
	const hasUnsavedChanges = useRef(false);
	const [notice, setNotice] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		const saved = readState();
		if (saved) {
			latest.current = saved;
			setState(saved);
		}
		const update = (event: StorageEvent) => {
			// A failed save must not let another tab or an old snapshot erase local work.
			if (event.key === KEY && !hasUnsavedChanges.current) {
				const next = readState() ?? createSeedState();
				latest.current = next;
				setState(next);
			}
		};
		window.addEventListener("storage", update);
		return () => window.removeEventListener("storage", update);
	}, []);
	const act = useCallback(
		(change: (current: EventState) => EventState, message = "更新しました") => {
			try {
				const current = hasUnsavedChanges.current
					? latest.current
					: (readState() ?? latest.current);
				const next = change(current);
				latest.current = next;
				setState(next);
				setError("");
				try {
					localStorage.setItem(
						KEY,
						JSON.stringify({ version: 1, state: next }),
					);
					hasUnsavedChanges.current = false;
				} catch {
					hasUnsavedChanges.current = true;
					setError(
						"このブラウザに保存できません。再読み込みすると変更が失われます。",
					);
				}
				setNotice(message);
				return true;
			} catch (cause) {
				setError(
					cause instanceof Error ? cause.message : "更新できませんでした",
				);
				return false;
			}
		},
		[],
	);
	return { state, act, notice, error, clearError: () => setError("") };
}
