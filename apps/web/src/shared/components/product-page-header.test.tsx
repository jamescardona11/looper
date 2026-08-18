import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductPageHeader } from "./product-page-header";

afterEach(cleanup);

describe("ProductPageHeader", () => {
  it("keeps the complete slot hierarchy and presentation contract", () => {
    const { container } = render(
      <ProductPageHeader
        eyebrow={<span>Voice tools</span>}
        title={<em>Dictation</em>}
        description={<strong>Write anywhere</strong>}
        actions={<button type="button">Create</button>}
      >
        <nav aria-label="Voice modes">Modes</nav>
      </ProductPageHeader>,
    );

    const header = container.firstElementChild;
    expect(header).toHaveProperty("tagName", "HEADER");
    expect(header).toHaveClass("mb-8");
    expect(header?.children).toHaveLength(2);

    const layout = header?.children.item(0);
    expect(layout).toHaveClass(
      "flex",
      "flex-col",
      "gap-4",
      "sm:flex-row",
      "sm:items-end",
      "sm:justify-between",
    );
    expect(layout?.children).toHaveLength(2);

    const copy = layout?.children.item(0);
    expect(copy).toHaveClass("min-w-0");
    expect(copy?.children).toHaveLength(3);
    expect(copy?.children.item(0)).toHaveClass(
      "font-mono",
      "text-[11px]",
      "text-muted-foreground",
      "uppercase",
      "tracking-wide",
    );
    expect(copy?.children.item(1)).toHaveClass(
      "mt-3",
      "font-medium",
      "text-3xl",
      "tracking-tight",
      "sm:text-4xl",
    );
    expect(copy?.children.item(2)).toHaveClass(
      "mt-2",
      "max-w-2xl",
      "text-muted-foreground",
      "text-sm",
      "leading-relaxed",
      "sm:text-base",
    );
    expect(within(copy as HTMLElement).getByText("Voice tools").tagName).toBe("SPAN");
    expect(within(copy as HTMLElement).getByText("Dictation").tagName).toBe("EM");
    expect(within(copy as HTMLElement).getByText("Write anywhere").tagName).toBe("STRONG");

    expect(layout?.children.item(1)).toHaveClass("shrink-0", "self-start", "sm:self-auto");
    expect(screen.getByRole("button", { name: "Create" })).toBeVisible();
    expect(header?.children.item(1)).toHaveClass("mt-6");
    expect(screen.getByRole("navigation", { name: "Voice modes" })).toHaveTextContent("Modes");
  });

  it("omits optional regions without leaving wrapper elements", () => {
    const { container } = render(<ProductPageHeader eyebrow="Workspace" title="Home" />);

    const header = container.firstElementChild;
    expect(header?.children).toHaveLength(1);
    expect(header?.firstElementChild?.children).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Home");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Write anywhere")).not.toBeInTheDocument();
  });

  it("preserves the existing falsey-slot behavior", () => {
    const { container } = render(
      <ProductPageHeader eyebrow="Scope" title="Usage" description={0} actions={0}>
        {0}
      </ProductPageHeader>,
    );

    const header = container.firstElementChild;
    expect(header?.children).toHaveLength(1);
    expect(header?.firstElementChild?.children).toHaveLength(1);
    expect(header).not.toHaveTextContent("0");
  });
});
