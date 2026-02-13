import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { VscFile, VscFolder } from "react-icons/vsc";

// The React component that renders the inline file tag
function FileTagView({ node }: ReactNodeViewProps) {
  const { name, isDir } = node.attrs as FileTagAttrs;
  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground align-baseline mx-0.5"
        contentEditable={false}
      >
        {isDir ? (
          <VscFolder className="size-3 shrink-0" />
        ) : (
          <VscFile className="size-3 shrink-0" />
        )}
        {name}
      </span>
    </NodeViewWrapper>
  );
}

export interface FileTagAttrs {
  path: string;
  name: string;
  uri: string;
  mimeType: string | null;
  isDir: boolean;
}

export const FileTag = Node.create({
  name: "fileTag",
  group: "inline",
  inline: true,
  atom: true, // non-editable, treated as a single unit

  addAttributes() {
    return {
      path: { default: "" },
      name: { default: "" },
      uri: { default: "" },
      mimeType: { default: null },
      isDir: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-file-tag]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-file-tag": "" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileTagView);
  },
});
