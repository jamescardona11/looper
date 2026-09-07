import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@formkit/auto-animate/react", () => ({
  useAutoAnimate: () => [vi.fn()],
}));

vi.mock("@looper/data", () => ({
  useThreads: () => ({
    threads: [
      {
        _id: "thread-1",
        title: "Launch notes",
        archived: false,
        pinned: false,
        lastMessageAt: Date.now(),
        messageCount: 3,
      },
    ],
    create: vi.fn(),
    rename: vi.fn(),
    archive: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/agent", search: { thread: "thread-1" } } }),
}));

import { ThreadSidebar } from "../thread-sidebar";

afterEach(cleanup);

describe("ThreadSidebar", () => {
  it("keeps compact thread actions tappable on mobile", () => {
    render(
      <I18nProvider defaultLocale="en">
        <ThreadSidebar />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "New recording question" })).toHaveClass(
      "size-11",
      "sm:size-7",
    );
    expect(screen.getByRole("searchbox")).toHaveClass("h-11", "sm:h-8");
    expect(screen.getByRole("button", { name: "Thread actions" })).toHaveClass(
      "size-11",
      "sm:size-5",
    );
  });
});
