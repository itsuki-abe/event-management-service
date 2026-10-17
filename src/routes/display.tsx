import { createFileRoute } from "@tanstack/react-router";
import { DisplayView } from "../prototype/DisplayView";
export const Route = createFileRoute("/display")({ component: DisplayView });
