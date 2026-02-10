import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import type { AvailableCommand } from "@/types";

interface SlashCommandSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: AvailableCommand[];
  searchQuery: string;
  onSelect: (command: AvailableCommand) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}

export function SlashCommandSelector({
  open,
  onOpenChange,
  commands,
  searchQuery,
  onSelect,
  children,
  align = "start",
}: SlashCommandSelectorProps) {
  const filteredCommands = searchQuery
    ? commands.filter((cmd) =>
        cmd.name.toLowerCase().startsWith(searchQuery.toLowerCase()),
      )
    : commands;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div>{children}</div>
      </PopoverAnchor>
      <PopoverContent
        className="w-80 p-0"
        side="top"
        align={align}
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            {filteredCommands.length === 0 ? (
              <CommandEmpty>No commands found</CommandEmpty>
            ) : (
              <CommandGroup heading="Slash Commands">
                {filteredCommands.map((cmd) => (
                  <CommandItem
                    key={cmd.name}
                    value={cmd.name}
                    onSelect={() => onSelect(cmd)}
                    className="flex flex-col items-start gap-0.5 cursor-pointer"
                  >
                    <div className="text-sm font-medium">/{cmd.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {cmd.description}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
