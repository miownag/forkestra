import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    <TooltipProvider>
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
          className="w-56 p-1"
          align="start"
          side="top"
          sideOffset={8}
        >
          {session.available_modes.map((m) => (
            <Tooltip key={m.mode_id} delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-full flex justify-between items-center rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                  onClick={() => handleModeSelect(m.mode_id)}
                >
                  <span className="text-xs flex-1 text-left">
                    {m.display_name}
                  </span>
                  {session.mode === m.mode_id && (
                    <LuCheck className="size-4 text-primary" />
                  )}
                </button>
              </TooltipTrigger>
              {m.description && (
                <TooltipContent
                  side="right"
                  align="center"
                  className="bg-popover text-popover-foreground border shadow-md"
                >
                  <p className="max-w-xs text-xs text-muted-foreground">
                    {m.description}
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

export { ModeSelector };
