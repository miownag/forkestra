import { DragArea } from "@/components/ui/drag-area";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/mcps")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <DragArea />
    </>
  );
}
