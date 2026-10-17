import { createFileRoute } from "@tanstack/react-router";
import { db } from "../db";
import { events } from "../db/schema";

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: async () => {
				await db.select().from(events).limit(1);
				return Response.json({ status: "ok", database: "connected" });
			},
		},
	},
});
