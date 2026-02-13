import type { ChatMessage as ChatMessageType } from "@/types";
import { cn } from "@/lib/utils";
import { Steps } from "./steps";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchZoomIn1 } from "iconsax-reactjs";
import { VscFile, VscFolder } from "react-icons/vsc";

interface ChatMessageProps {
  message: ChatMessageType;
}

// Component to render user message content with inline file tags
function UserMessageContent({ message }: { message: ChatMessageType }) {
  // Render based on message parts order (text and resource_link parts are interspersed)
  if (message.parts && message.parts.length > 0) {
    return (
      <p className="max-w-none whitespace-pre-wrap flex items-center">
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return <span key={index}>{part.content}</span>;
          } else if (part.type === "resource_link") {
            const isFolder = part.content.uri.endsWith("/");
            return (
              <span
                key={index}
                className="inline-flex items-center gap-1 rounded bg-muted-foreground px-1.5 py-0.5 text-xs font-medium text-muted align-baseline mx-0.5"
              >
                {isFolder ? (
                  <VscFolder className="size-3 shrink-0" />
                ) : (
                  <VscFile className="size-3 shrink-0" />
                )}
                {part.content.name}
              </span>
            );
          }
          return null;
        })}
      </p>
    );
  }

  // Fallback to plain content if no parts
  return <p className="max-w-none whitespace-pre-wrap">{message.content}</p>;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [selectedImage, setSelectedImage] = useState<{
    data: string;
    mimeType: string;
    index: number;
  } | null>(null);

  // Extract images from message parts
  const images = message.parts?.filter((p) => p.type === "image") || [];
  const hasImages = images.length > 0;

  return (
    <>
      <div
        className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
      >
        <div className="flex flex-col gap-2 max-w-full">
          {/* Text bubble */}
          {message.content && (
            <div
              className={cn(
                "rounded-lg px-4 py-3",
                isUser && "bg-primary text-primary-foreground text-sm"
              )}
            >
              {isUser ? (
                <UserMessageContent message={message} />
              ) : (
                <Steps message={message} />
              )}
            </div>
          )}

          {/* Images - displayed after the text bubble for user messages */}
          {isUser && hasImages && (
            <div className="flex flex-col gap-2">
              {images.map((imagePart, index) => {
                if (imagePart.type !== "image") return null;
                const img = imagePart.content;
                return (
                  <div
                    key={index}
                    className="group relative rounded-lg overflow-hidden border border-border max-w-sm cursor-pointer transition-all hover:shadow-lg hover:border-primary/50"
                    onClick={() =>
                      setSelectedImage({
                        data: img.data,
                        mimeType: img.mimeType,
                        index,
                      })
                    }
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt={`Uploaded image ${index + 1}`}
                      className="w-full h-auto object-contain max-h-96"
                    />
                    {/* Hover overlay with zoom icon */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-background rounded-full p-2">
                        <SearchZoomIn1
                          variant="Broken"
                          className="size-5 text-foreground"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Dialog */}
      <Dialog
        open={selectedImage !== null}
        onOpenChange={(open) => !open && setSelectedImage(null)}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Image Preview {selectedImage && `(${selectedImage.index + 1})`}
            </DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="flex items-center justify-center p-4">
              <img
                src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`}
                alt={`Full size image ${selectedImage.index + 1}`}
                className="max-w-full h-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
