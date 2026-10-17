import { createFileRoute } from "@tanstack/react-router";
import { EventApp } from "../prototype/EventApp";
export const Route = createFileRoute("/")({ component: EventApp });
