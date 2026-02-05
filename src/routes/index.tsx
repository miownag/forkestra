import { SessionPanel } from "@/components/session/session-panel";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SessionPanel />;
}
