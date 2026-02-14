import { useState, useEffect, useCallback } from "react";
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
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types";
import { VscFolder, VscFile, VscChevronRight } from "react-icons/vsc";

interface FileSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  onSelect: (file: FileEntry) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}

export function FileSelector({
  open,
  onOpenChange,
  projectPath,
  onSelect,
  children,
  align = "start",
}: FileSelectorProps) {
  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const fetchEntries = useCallback(
    async (relativePath: string | null) => {
      if (!projectPath) return;
      setIsLoading(true);
      try {
        const result = await invoke<FileEntry[]>("list_directory", {
          projectPath,
          relativePath,
        });
        setEntries(result);
      } catch (err) {
        console.error("Failed to list directory:", err);
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    },
    [projectPath]
  );

  // Fetch entries when popover opens or currentDir changes
  useEffect(() => {
    if (open) {
      fetchEntries(currentDir);
    }
  }, [open, currentDir, fetchEntries]);

  // Reset state when popover closes
  useEffect(() => {
    if (!open) {
      setCurrentDir(null);
      setEntries([]);
      setFilterText("");
      setSelectedIndex(-1);
    }
  }, [open]);

  const handleNavigateInto = (entry: FileEntry) => {
    setCurrentDir(entry.path);
    setFilterText("");
  };

  const handleSelectEntry = (entry: FileEntry) => {
    onSelect(entry);
    onOpenChange(false);
  };

  const handleNavigateUp = () => {
    if (currentDir === null) return;
    const parts = currentDir.split("/");
    if (parts.length <= 1) {
      setCurrentDir(null);
    } else {
      setCurrentDir(parts.slice(0, -1).join("/"));
    }
    setFilterText("");
  };

  const filteredEntries = filterText
    ? entries.filter((e) =>
        e.name.toLowerCase().includes(filterText.toLowerCase())
      )
    : entries;

  // Reset selected index when entries change, but skip initial mount
  useEffect(() => {
    // Only reset if we actually have entries to avoid highlighting first item on load
    if (filteredEntries.length > 0 || currentDir !== null) {
      setSelectedIndex(-1);
    }
  }, [filteredEntries.length, currentDir]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isLoading || filteredEntries.length === 0) return;

      const hasBackItem = currentDir !== null;
      const totalItems = hasBackItem
        ? filteredEntries.length + 1
        : filteredEntries.length;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          // Navigate up to parent directory
          if (currentDir !== null) {
            handleNavigateUp();
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          // Expand the currently selected folder (only if something is selected)
          if (selectedIndex >= 0) {
            const adjustedIndex = hasBackItem
              ? selectedIndex - 1
              : selectedIndex;
            if (adjustedIndex >= 0 && adjustedIndex < filteredEntries.length) {
              const selectedEntry = filteredEntries[adjustedIndex];
              if (selectedEntry.is_dir) {
                handleNavigateInto(selectedEntry);
              }
            }
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : prev < 0 ? totalItems - 1 : totalItems - 1
          );
          break;

        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < 0 ? 0 : prev < totalItems - 1 ? prev + 1 : 0
          );
          break;

        case "Enter":
          e.preventDefault();
          // Enter always selects the item (file or folder)
          if (selectedIndex >= 0) {
            if (selectedIndex === 0 && hasBackItem) {
              handleNavigateUp();
            } else {
              const adjustedIndex = hasBackItem
                ? selectedIndex - 1
                : selectedIndex;
              if (
                adjustedIndex >= 0 &&
                adjustedIndex < filteredEntries.length
              ) {
                handleSelectEntry(filteredEntries[adjustedIndex]);
              }
            }
          }
          break;
      }
    },
    [
      isLoading,
      filteredEntries,
      currentDir,
      selectedIndex,
      handleNavigateUp,
      handleNavigateInto,
      handleSelectEntry,
    ]
  );

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
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          // Prevent closing when clicking inside the popover content (portal)
          // or inside the anchor area
          const target = e.target as HTMLElement;
          if (target.closest("[data-radix-popper-content-wrapper]")) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false} onKeyDown={handleKeyDown}>
          {/* Hint */}
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground/60 border-b">
            Press ← to go back, → to expand folder
          </div>
          <div className="border-b px-3 py-1.5">
            <input
              type="text"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Filter files..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : filteredEntries.length === 0 ? (
              <CommandEmpty>No files found</CommandEmpty>
            ) : (
              <CommandGroup>
                {currentDir !== null && (
                  <CommandItem
                    value=".."
                    onSelect={handleNavigateUp}
                    className={`cursor-pointer ${selectedIndex === 0 ? "bg-accent" : ""}`}
                  >
                    <span className="text-sm text-muted-foreground">..</span>
                  </CommandItem>
                )}
                {filteredEntries.map((entry, idx) => {
                  const itemIndex = currentDir !== null ? idx + 1 : idx;
                  return (
                    <CommandItem
                      key={entry.path}
                      value={entry.name}
                      onSelect={() => handleSelectEntry(entry)}
                      className={`flex items-center gap-2 cursor-pointer ${
                        selectedIndex === itemIndex ? "bg-accent" : ""
                      }`}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      {entry.is_dir ? (
                        <VscFolder className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <VscFile className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className="text-sm truncate flex-1"
                        title={entry.name}
                      >
                        {entry.name}
                      </span>
                      {entry.is_dir && (
                        <button
                          type="button"
                          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavigateInto(entry);
                          }}
                          title="Open folder"
                        >
                          <VscChevronRight className="size-3.5" />
                        </button>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
