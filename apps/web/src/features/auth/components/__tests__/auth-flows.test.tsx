import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  signIn: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("@looper/data", () => ({
  useAuth: () => auth,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useNavigate: () => navigateMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { SignInPage } from "../../sign-in-page";
import { AnonymousAutoSignIn } from "../anonymous-auto-sign-in";
import { AnonymousButton } from "../anonymous-button";
import { EmailOtpForm } from "../email-otp-form";

function renderWithI18n(node: React.ReactNode) {
  return render(<I18nProvider defaultLocale="en">{node}</I18nProvider>);
}

beforeEach(() => {
  auth.isAuthenticated = false;
  auth.isLoading = false;
  auth.signIn.mockReset();
  auth.signIn.mockResolvedValue(undefined);
  navigateMock.mockReset();
  navigateMock.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("web auth flows", () => {
  it("starts an anonymous session once auth hydration is complete", async () => {
    render(<AnonymousAutoSignIn />);

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledWith("anonymous");
    });
  });

  it("does not auto sign in when a session already exists", () => {
    auth.isAuthenticated = true;

    render(<AnonymousAutoSignIn />);

    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("submits anonymous sign-in from the explicit button", async () => {
    renderWithI18n(<AnonymousButton />);

    fireEvent.click(screen.getByRole("button", { name: /Continue without an account/ }));

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledWith("anonymous");
    });
  });

  it("requests and verifies an email OTP with the resend provider", async () => {
    renderWithI18n(<EmailOtpForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@looper.local" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Email me a code/ }));

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledTimes(1);
    });
    expect(auth.signIn.mock.calls[0]?.[0]).toBe("resend-otp");
    expect(auth.signIn.mock.calls[0]?.[1].get("email")).toBe("ada@looper.local");

    fireEvent.change(screen.getByLabelText("Code"), {
      target: { value: "57575757" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledTimes(2);
    });
    expect(auth.signIn.mock.calls[1]?.[0]).toBe("resend-otp");
    expect(auth.signIn.mock.calls[1]?.[1].get("email")).toBe("ada@looper.local");
    expect(auth.signIn.mock.calls[1]?.[1].get("code")).toBe("57575757");
    expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
  });

  it("wires Google and Apple OAuth buttons to the expected provider ids", async () => {
    renderWithI18n(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledWith("google");
    });

    cleanup();
    auth.signIn.mockClear();
    renderWithI18n(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /Continue with Apple/ }));

    await waitFor(() => {
      expect(auth.signIn).toHaveBeenCalledWith("apple");
    });
  });
});
