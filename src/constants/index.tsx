import { cn } from "@/lib/utils";
import { CodeBlockWithHeader } from "@/components/chat/chat-message/code-block";
import { Components } from "react-markdown";

function extractLanguage(className?: string): string {
  if (!className) return "plaintext";
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : "plaintext";
}

const CUSTOM_COMPONENTS_FOR_MARKDOWN: Partial<Components> = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <span
          className={cn(
            className,
            "bg-muted rounded-sm px-1 font-google-sans-code text-sm",
          )}
          {...props}
        >
          {children}
        </span>
      );
    }
    const language = extractLanguage(className);

    return (
      <CodeBlockWithHeader language={language}>
        {children as string}
      </CodeBlockWithHeader>
    );
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>;
  },
  a: function AnchorComponent({ href, children, ...props }) {
    return (
      <a
        href={href}
        className="text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
        target="_blank"
        {...props}
      >
        {children}
      </a>
    );
  },
};

export { CUSTOM_COMPONENTS_FOR_MARKDOWN };
