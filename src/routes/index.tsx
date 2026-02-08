import { SessionPanel } from "@/components/session/session-panel";
import { SessionTabBar } from "@/components/layout/session-tab-bar";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <SessionTabBar />
      <div className="flex-1 overflow-y-auto">
        <SessionPanel />
      </div>
    </>
  );
}
