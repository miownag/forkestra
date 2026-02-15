import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  LuLightbulb,
  LuChevronLeft,
  LuChevronRight,
  LuX,
} from "react-icons/lu";

export interface TipItem {
  id: string;
  content: React.ReactNode;
}

interface RotatingTipProps {
  tips: TipItem[];
  interval?: number;
  className?: string;
  showNavigation?: boolean;
  showIndicator?: boolean;
  autoPlay?: boolean;
  pauseOnHover?: boolean;
  showCloseButton?: boolean;
  showBgAndBorder?: boolean;
  onClose?: () => void;
}

export function RotatingTip({
  tips,
  interval = 5000,
  className,
  showNavigation = true,
  showIndicator = true,
  autoPlay = true,
  pauseOnHover = true,
  showCloseButton = true,
  showBgAndBorder = true,
  onClose,
}: RotatingTipProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % tips.length);
  }, [tips.length]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length);
  }, [tips.length]);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleClose = useCallback(() => {
    setIsClosed(true);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!autoPlay || isPaused || tips.length <= 1) return;

    const timer = setInterval(goToNext, interval);
    return () => clearInterval(timer);
  }, [autoPlay, isPaused, interval, goToNext, tips.length]);

  if (tips.length === 0 || isClosed) return null;

  const currentTip = tips[currentIndex];

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        showBgAndBorder && "border border-primary/20! bg-primary/10",
        className
      )}
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
    >
      <LuLightbulb className="size-3.5 text-primary shrink-0" />

      <div className="flex-1 min-w-0 overflow-hidden">
        <div
          key={currentTip.id}
          className={cn(
            "text-xs text-muted-foreground/80 truncate",
            "animate-in fade-in slide-in-from-bottom-1 duration-300"
          )}
        >
          {currentTip.content}
        </div>
      </div>

      {showNavigation && tips.length > 1 && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={goToPrev}
            className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground/50 hover:text-primary/70 transition-colors"
            aria-label="Previous tip"
          >
            <LuChevronLeft className="size-3" />
          </button>
          <button
            onClick={goToNext}
            className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground/50 hover:text-primary/70 transition-colors"
            aria-label="Next tip"
          >
            <LuChevronRight className="size-3" />
          </button>
        </div>
      )}

      {showIndicator && tips.length > 1 && (
        <div className="flex items-center gap-1 shrink-0">
          {tips.map((_, index) => (
            <button
              key={index}
              onClick={() => goToIndex(index)}
              className={cn(
                "w-1 h-1 rounded-full transition-all duration-300",
                index === currentIndex
                  ? "bg-primary/60 w-2"
                  : "bg-primary/20 hover:bg-primary/40"
              )}
              aria-label={`Go to tip ${index + 1}`}
            />
          ))}
        </div>
      )}

      {showCloseButton && (
        <button
          onClick={handleClose}
          className="p-0.5 rounded-md hover:bg-muted text-muted-foreground/40 transition-colors shrink-0 cursor-pointer"
          aria-label="Close tips"
        >
          <LuX className="size-3" />
        </button>
      )}
    </div>
  );
}
