import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useScmStore } from "@/stores";
import type { ConflictContent } from "@/types";
import { toast } from "sonner";

interface ConflictResolverProps {
  sessionId: string;
  repoPath: string;
  filePath: string;
  onClose: () => void;
  onResolved: () => void;
}

export function ConflictResolver({
  sessionId,
  repoPath,
  filePath,
  onClose,
  onResolved,
}: ConflictResolverProps) {
  const { fetchConflictContent, resolveConflict } = useScmStore();
  const [content, setContent] = useState<ConflictContent | null>(null);
  const [working, setWorking] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchConflictContent(repoPath, filePath)
      .then((c) => {
        setContent(c);
        setWorking(c.working);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load conflict content:", err);
        toast.error("Failed to load conflict content");
        setLoading(false);
      });
  }, [repoPath, filePath, fetchConflictContent]);

  const handleAcceptOurs = () => {
    if (content?.ours) {
      setWorking(content.ours);
    }
  };

  const handleAcceptTheirs = () => {
    if (content?.theirs) {
      setWorking(content.theirs);
    }
  };

  const handleAcceptBoth = () => {
    if (content?.ours && content?.theirs) {
      setWorking(content.ours + "\n" + content.theirs);
    }
  };

  const handleResolve = async () => {
    try {
      await resolveConflict(sessionId, repoPath, filePath, working);
      toast.success(`Resolved: ${filePath}`);
      onResolved();
    } catch (err) {
      toast.error(`Failed to resolve conflict: ${err}`);
    }
  };

  const fileName = filePath.split("/").pop() || filePath;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading conflict...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-2 flex items-center justify-between shrink-0 bg-muted/20">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{fileName}</span>
          <span className="text-orange-500 text-xs font-medium">
            CONFLICT
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm px-2 cursor-pointer"
        >
          Close
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/10 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleAcceptOurs}
          disabled={!content?.ours}
        >
          Accept Ours
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleAcceptTheirs}
          disabled={!content?.theirs}
        >
          Accept Theirs
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleAcceptBoth}
          disabled={!content?.ours || !content?.theirs}
        >
          Accept Both
        </Button>
      </div>

      {/* Side-by-side view */}
      {content?.ours && content?.theirs && (
        <div className="flex border-b shrink-0" style={{ maxHeight: "30%" }}>
          <div className="flex-1 border-r overflow-auto">
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-muted/30 border-b sticky top-0">
              OURS (current)
            </div>
            <pre className="text-xs font-mono p-2 leading-relaxed whitespace-pre-wrap break-all">
              {content.ours}
            </pre>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-muted/30 border-b sticky top-0">
              THEIRS (incoming)
            </div>
            <pre className="text-xs font-mono p-2 leading-relaxed whitespace-pre-wrap break-all">
              {content.theirs}
            </pre>
          </div>
        </div>
      )}

      {/* Working copy editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-muted/30 border-b shrink-0">
          WORKING COPY (editable)
        </div>
        <textarea
          value={working}
          onChange={(e) => setWorking(e.target.value)}
          className="flex-1 text-xs font-mono p-2 leading-relaxed bg-background resize-none outline-none"
          spellCheck={false}
        />
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 flex items-center justify-end shrink-0">
        <Button size="sm" className="h-7 text-xs" onClick={handleResolve}>
          Mark as Resolved
        </Button>
      </div>
    </div>
  );
}
