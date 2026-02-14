import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  onComplete?: () => void;
  deps?: any[];
}

export function Typewriter({
  text,
  speed = 50,
  delay = 0,
  className,
  onComplete,
  deps = [],
}: TypewriterProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Reset when text changes
    setDisplayedText("");
    setCurrentIndex(0);
  }, [text, ...deps]);

  useEffect(() => {
    if (currentIndex === 0 && delay > 0) {
      const delayTimeout = setTimeout(() => {
        setCurrentIndex(1);
      }, delay);
      return () => clearTimeout(delayTimeout);
    }

    if (currentIndex > 0 && currentIndex <= text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, currentIndex));
        setCurrentIndex(currentIndex + 1);
      }, speed);

      return () => clearTimeout(timeout);
    }

    if (currentIndex > text.length && onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, delay, onComplete]);

  return (
    <span className={cn("inline-block", className)}>
      {displayedText}
      {currentIndex > 0 && currentIndex <= text.length && (
        <span className="animate-pulse">|</span>
      )}
    </span>
  );
}
