import { useTranslation } from "@looper/i18n/react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { Card } from "@/shared/components/ui";

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-0.5 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-0.5 pl-5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => (
          <h1 className="mt-3 mb-1.5 font-semibold text-base tracking-tight">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-3 mb-1.5 font-semibold text-sm tracking-tight">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-2 mb-1 font-semibold text-sm tracking-tight">{children}</h3>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-primary"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
            {children}
          </code>
        ),
        pre: ({ children }) => {
          const codeEl = children as { props?: { className?: string; children?: unknown } };
          const className = codeEl?.props?.className ?? "";
          const language = /language-(\w+)/.exec(className)?.[1] ?? null;
          const code = String(codeEl?.props?.children ?? "").replace(/\n$/, "");
          if (language === "mermaid") return <MermaidBlock code={code} />;
          return <CodeBlock language={language} code={code} />;
        },
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-border border-l-2 pl-3 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="my-3 border-border" />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-muted/40 px-2 py-1 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${Math.random().toString(36).slice(2)}`;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
        const rendered = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered.svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) return <CodeBlock language="mermaid" code={code} />;
  if (!svg) {
    return <div className="my-2 text-muted-foreground text-xs">{t("agent.renderingDiagram")}</div>;
  }
  return (
    <Card
      className="my-2 overflow-x-auto p-3"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid SVG, rendered with securityLevel "strict"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function CodeBlock({ language, code }: { language: string | null; code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <Card className="my-2 overflow-hidden">
      <div className="flex items-center justify-between border-border border-b bg-muted/60 px-3 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {language ?? "code"}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={copy}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? t("agent.copied") : t("agent.copy")}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto bg-muted/30 p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </Card>
  );
}
