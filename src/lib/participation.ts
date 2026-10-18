export type Participant = {
	id: number;
	nickname: string;
	profile: string | null;
	xUsername: string | null;
};
export type ParticipantDirectory = {
	event: { id: number; name: string };
	currentParticipantId: number;
	participants: Participant[];
};
export type Device = { id: number; name: string; current: boolean };
export type Participation = {
	event: { id: number; name: string };
	participant: Participant | null;
	currentDeviceId: number | null;
	devices: Device[];
};
export type Pairing = { code: string; expiresAt: number };
export type PairingPreview = { deviceName: string; expiresAt: number };

export class ParticipationApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

export async function participationApi<T>(
	eventId: string,
	action: string,
	body?: object,
): Promise<T> {
	const response = await fetch(`/api/events/${eventId}/${action}`, {
		method: body === undefined ? "GET" : "POST",
		headers:
			body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
		cache: "no-store",
	});
	const data = (await response.json()) as T & { error?: string };
	if (!response.ok)
		throw new ParticipationApiError(
			data.error ?? "通信に失敗しました。もう一度お試しください。",
			response.status,
		);
	return data as T;
}
