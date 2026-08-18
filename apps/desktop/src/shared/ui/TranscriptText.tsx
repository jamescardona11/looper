import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";

type TranscriptTextProps = {
  text: string;
};

const TRANSCRIPT_ELEMENTS = [
  "blockquote",
  "br",
  "code",
  "em",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
] as const;

function Paragraph({ children }: { children?: ReactNode }) {
  return <p className="mb-2 last:mb-0">{children}</p>;
}

function InlineCode({ children }: { children?: ReactNode }) {
  return (
    <code className="px-1 py-0.5 rounded-sm bg-surface-elevated ui-text-body-sm font-mono ui-color-primary">
      {children}
    </code>
  );
}

const TRANSCRIPT_COMPONENTS: Components = {
  p: Paragraph,
  strong: ({ children }) => (
    <strong className="font-semibold text-content-primary">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: InlineCode,
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-surface-elevated p-2 ui-text-body-sm [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l border-border-secondary pl-3 ui-color-secondary">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-disc list-outside space-y-0.5 pl-4 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal list-outside space-y-0.5 pl-4 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="ui-text-body pl-0.5">{children}</li>,
};

function TranscriptText({ text }: TranscriptTextProps) {
  return (
    <ReactMarkdown
      allowedElements={TRANSCRIPT_ELEMENTS}
      components={TRANSCRIPT_COMPONENTS}
      remarkPlugins={[remarkBreaks]}
      skipHtml
    >
      {text}
    </ReactMarkdown>
  );
}

export default memo(TranscriptText);
