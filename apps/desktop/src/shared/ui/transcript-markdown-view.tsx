import { createElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";

type TranscriptElement = keyof Pick<
  HTMLElementTagNameMap,
  "blockquote" | "code" | "em" | "li" | "ol" | "p" | "pre" | "strong" | "ul"
>;

function styledTranscriptElement(tag: TranscriptElement, className: string) {
  return function TranscriptElementView({
    children,
  }: {
    children?: ReactNode;
  }) {
    return createElement(tag, { className }, children);
  };
}

const transcriptComponents: Components = {
  p: styledTranscriptElement("p", "mb-2 last:mb-0"),
  strong: styledTranscriptElement(
    "strong",
    "font-semibold text-content-primary",
  ),
  em: styledTranscriptElement("em", "italic"),
  code: styledTranscriptElement(
    "code",
    "px-1 py-0.5 rounded-sm bg-surface-elevated ui-text-body-sm font-mono ui-color-primary",
  ),
  pre: styledTranscriptElement(
    "pre",
    "mb-2 overflow-x-auto rounded-md bg-surface-elevated p-2 ui-text-body-sm [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none",
  ),
  blockquote: styledTranscriptElement(
    "blockquote",
    "mb-2 border-l border-border-secondary pl-3 ui-color-secondary",
  ),
  ul: styledTranscriptElement(
    "ul",
    "mb-2 list-disc list-outside space-y-0.5 pl-4 last:mb-0",
  ),
  ol: styledTranscriptElement(
    "ol",
    "mb-2 list-decimal list-outside space-y-0.5 pl-4 last:mb-0",
  ),
  li: styledTranscriptElement("li", "ui-text-body pl-0.5"),
};

const transcriptElements = [
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

function TranscriptMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      allowedElements={transcriptElements}
      components={transcriptComponents}
      remarkPlugins={[remarkBreaks]}
      skipHtml
    >
      {text}
    </ReactMarkdown>
  );
}

export default memo(TranscriptMarkdown);
