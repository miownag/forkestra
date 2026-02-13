import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSelectorSessionStore } from "@/stores";
import { Session } from "@/types";
import { FC, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { Layer } from "iconsax-reactjs";

interface IProps {
  session?: Session;
}

const ModeSelector: FC<IProps> = ({ session }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const currentMode = session?.available_modes.find(
    (m) => m.mode_id === session?.mode
  );
  const { setSessionMode } = useSelectorSessionStore(["setSessionMode"]);

  const handleModeSelect = async (modeId: string) => {
    if (!session) return;

    try {
      await setSessionMode(session.id, modeId);
      setPopoverOpen(false);
    } catch (error) {
      console.error("Failed to change mode:", error);
    }
  };

  // Don't render if no modes available
  if (!session?.available_modes || session.available_modes.length === 0) {
    return null;
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        {currentMode ? (
          <button className="flex items-center gap-1 p-1.5 rounded-md cursor-pointer text-muted-foreground hover:bg-secondary-foreground/5!">
            <Layer className="size-4" />
            <span className="text-xs">{currentMode.display_name}</span>
          </button>
        ) : (
          <span />
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-lg p-1"
        align="start"
        side="top"
        sideOffset={8}
      >
        {session.available_modes.map((m) => (
          <button
            key={m.mode_id}
            type="button"
            className="w-full flex justify-between items-center rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
            onClick={() => handleModeSelect(m.mode_id)}
          >
            <div className="flex flex-col justify-between">
              <span className="text-xs flex-1 text-left">{m.display_name}</span>
              {m.description && (
                <p className="text-xs text-muted-foreground">{m.description}</p>
              )}
            </div>
            {session.mode === m.mode_id && (
              <LuCheck className="size-4 text-primary" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

export { ModeSelector };
