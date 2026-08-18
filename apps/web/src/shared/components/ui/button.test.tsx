import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("does not submit a parent form by default", () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <Button>Open controls</Button>
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open controls" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("preserves an explicit submit type", () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Continue</Button>
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
