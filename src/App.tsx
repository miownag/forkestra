import { AppLayout } from "@/components/layout/AppLayout";
import { SessionPanel } from "@/components/session/SessionPanel";
import { useStreamEvents } from "@/hooks/useStreamEvents";

function App() {
  // Listen for stream events from backend
  useStreamEvents();

  return (
    <AppLayout>
      <SessionPanel />
    </AppLayout>
  );
}

export default App;
