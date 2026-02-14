import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronsUpDown, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface BranchSearchSelectProps {
  projectPath: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function BranchSearchSelect({
  projectPath,
  value,
  onChange,
  placeholder = "Select branch...",
}: BranchSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectPath) {
      setBranches([]);
      return;
    }

    const fetchBranches = async () => {
      setLoading(true);
      try {
        const result = await invoke<string[]>("list_branches", {
          projectPath,
        });
        setBranches(result);
      } catch (err) {
        console.error("Failed to fetch branches:", err);
        setBranches([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();
  }, [projectPath]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={!projectPath}
        >
          <span className="flex items-center gap-2 truncate" title={value}>
            <GitBranch className="h-4 w-4 shrink-0 opacity-50" />
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="Search branches..." />
          <CommandList>
            <CommandEmpty>
              {loading ? "Loading..." : "No branch found."}
            </CommandEmpty>
            <CommandGroup>
              {branches.map((branch) => (
                <CommandItem
                  key={branch}
                  value={branch}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === branch ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {branch}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
