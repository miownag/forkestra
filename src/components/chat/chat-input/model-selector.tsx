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
import { TbBrain } from "react-icons/tb";

interface IProps {
  session?: Session;
}

const ModelSelector: FC<IProps> = ({ session }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const currentModel = session?.available_models.find(
    (m) => m.model_id === session?.model
  );
  const { setSessionModel } = useSelectorSessionStore(["setSessionModel"]);

  const handleModelSelect = async (modelId: string) => {
    if (!session) return;

    try {
      await setSessionModel(session.id, modelId);
      setPopoverOpen(false);
    } catch (error) {
      console.error("Failed to change model:", error);
    }
  };

  return (
    <TooltipProvider>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          {currentModel ? (
            <button className="flex items-center gap-1 p-1.5 rounded-md cursor-pointer text-muted-foreground hover:bg-secondary-foreground/5!">
              <TbBrain className="text-muted-foreground/75" />
              <span className="text-xs">{currentModel.display_name}</span>
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
          {session?.available_models.map((m) => (
            <Tooltip key={m.model_id} delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                  onClick={() => handleModelSelect(m.model_id)}
                >
                  <span className="text-xs flex-1 text-left">
                    {m.display_name}
                  </span>
                  {session?.model === m.model_id && (
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

export { ModelSelector };
