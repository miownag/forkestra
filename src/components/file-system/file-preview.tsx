import { useMemo } from "react";
import { Markdown } from "@/components/prompt-kit/markdown";
import { getFileExtension, isImageFile } from "@/lib/file-types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LuFileQuestion } from "react-icons/lu";

interface FilePreviewProps {
  content: string;
  filePath: string;
  projectPath: string;
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="h-full overflow-auto p-4">
      <div className="prose dark:prose-invert max-w-none">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}

function HtmlPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts"
      className="w-full h-full border-0 bg-white"
      title="HTML Preview"
    />
  );
}

function SvgPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      sandbox=""
      className="w-full h-full border-0 bg-white"
      title="SVG Preview"
    />
  );
}

function ImagePreview({
  filePath,
  projectPath,
}: {
  filePath: string;
  projectPath: string;
}) {
  const src = useMemo(() => {
    const absolutePath = `${projectPath}/${filePath}`;
    return convertFileSrc(absolutePath);
  }, [filePath, projectPath]);

  return (
    <div className="flex items-center justify-center h-full p-4 bg-muted/20">
      <img
        src={src}
        alt={filePath.split("/").pop() || filePath}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}

function UnsupportedPreview({ filePath }: { filePath: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <LuFileQuestion className="h-12 w-12 opacity-20" />
      <p className="text-sm font-medium">Preview not available</p>
      <p className="text-xs">{filePath.split("/").pop()}</p>
    </div>
  );
}

export function FilePreview({ content, filePath, projectPath }: FilePreviewProps) {
  const ext = getFileExtension(filePath);

  if (ext === "md" || ext === "markdown") {
    return <MarkdownPreview content={content} />;
  }
  if (ext === "html" || ext === "htm") {
    return <HtmlPreview content={content} />;
  }
  if (ext === "svg") {
    return <SvgPreview content={content} />;
  }
  if (isImageFile(filePath)) {
    return <ImagePreview filePath={filePath} projectPath={projectPath} />;
  }

  return <UnsupportedPreview filePath={filePath} />;
}
