import AnsiToHtml from "ansi-to-html";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface AnsiRendererProps {
  content: string;
  className?: string;
}

/**
 * Filter out problematic escape sequences that ansi-to-html doesn't handle well
 */
function filterEscapeSequences(text: string): string {
  return (
    text
      // Bracketed paste mode
      .replace(/\x1b\[\?2004[hl]/g, "")
      // Focus events
      .replace(/\x1b\[\?1004[hl]/g, "")
      // Mouse tracking
      .replace(/\x1b\[\?1000[hl]/g, "")
      .replace(/\x1b\[\?1002[hl]/g, "")
      .replace(/\x1b\[\?1006[hl]/g, "")
      // Application keypad mode
      .replace(/\x1b[=>]/g, "")
      // Cursor visibility
      .replace(/\x1b\[\?25[hl]/g, "")
      // Alternate screen buffer
      .replace(/\x1b\[\?1049[hl]/g, "")
      // Clear screen/line sequences
      .replace(/\x1b\[[0-9]*[JK]/g, "")
      // Cursor movement sequences (preserve newlines)
      .replace(/\x1b\[[0-9;]*[Hf]/g, "")
      .replace(/\x1b\[[0-9]*[ABCD]/g, "")
      // OSC sequences (window title, etc)
      .replace(/\x1b\][0-9;]*\x07/g, "")
      .replace(/\x1b\][0-9;]*\x1b\\/g, "")
      // Device status reports
      .replace(/\x1b\[[0-9]*n/g, "")
      // Bell character
      .replace(/\x07/g, "")
  );
}

export function AnsiRenderer({ content, className }: AnsiRendererProps) {
  const html = useMemo(() => {
    // Filter out problematic sequences first
    const filtered = filterEscapeSequences(content);

    const converter = new AnsiToHtml({
      newline: true,
      escapeXML: true,
    });
    try {
      return converter.toHtml(filtered);
    } catch {
      return filtered;
    }
  }, [content]);

  return (
    <pre
      className={cn(
        "font-mono text-sm whitespace-pre-wrap break-all",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
