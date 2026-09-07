import type { ReactNode } from "react";
import { Eyebrow } from "@/shared/components/eyebrow";

type RequiredHeaderSlots = Record<"title", ReactNode>;
type OptionalHeaderSlots = Partial<
  Record<"eyebrow" | "description" | "actions" | "children", ReactNode>
>;
type ProductPageHeaderProps = RequiredHeaderSlots & OptionalHeaderSlots;

type HeaderCopyProps = Pick<ProductPageHeaderProps, "eyebrow" | "title" | "description">;

export function ProductPageHeader({
  eyebrow,
  title,
  description: detail,
  actions,
  children,
}: ProductPageHeaderProps) {
  return (
    <header className="mb-6 sm:mb-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <HeaderCopy eyebrow={eyebrow} title={title} description={detail} />
        {actions ? <div className="shrink-0 self-start sm:self-auto">{actions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </header>
  );
}

function HeaderCopy({ eyebrow, title, description: detail }: HeaderCopyProps) {
  return (
    <div className="min-w-0">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1
        className={
          eyebrow
            ? "mt-2 font-semibold text-2xl text-wrap-balance tracking-tight sm:text-[28px]"
            : "font-semibold text-2xl text-wrap-balance tracking-tight sm:text-[28px]"
        }
      >
        {title}
      </h1>
      {detail ? (
        <p className="mt-2 max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
