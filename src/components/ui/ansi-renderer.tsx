import AnsiToHtml from "ansi-to-html";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface AnsiRendererProps {
  content: string;
  className?: string;
}

export function AnsiRenderer({ content, className }: AnsiRendererProps) {
  const html = useMemo(() => {
    const converter = new AnsiToHtml({
      newline: true,
      escapeXML: true,
    });
    try {
      return converter.toHtml(content);
    } catch {
      return content;
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
