import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsStore } from "@/stores";

interface PostMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionName: string;
  onKeep: () => void;
  onCleanup: () => void;
}

export function PostMergeDialog({
  open,
  onOpenChange,
  sessionName,
  onKeep,
  onCleanup,
}: PostMergeDialogProps) {
  const [remember, setRemember] = useState(false);
  const setPostMergeAction = useSettingsStore((s) => s.setPostMergeAction);

  const handleKeep = () => {
    if (remember) {
      setPostMergeAction("keep");
    }
    onKeep();
    onOpenChange(false);
  };

  const handleCleanup = () => {
    if (remember) {
      setPostMergeAction("cleanup");
    }
    onCleanup();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Successful</DialogTitle>
          <DialogDescription>
            Session &quot;{sessionName}&quot; has been merged successfully. What
            would you like to do with the session and its worktree?
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <label
            htmlFor="remember"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Remember this choice, don&apos;t ask again
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleKeep}>
            Keep Session
          </Button>
          <Button onClick={handleCleanup}>Clean Up Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
