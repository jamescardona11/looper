// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ModelCardShell, { WAVE_COLS, waveDots } from "./ModelCardShell";

const renderShell = (onClick?: () => void, selected?: boolean) =>
  render(
    <ModelCardShell
      accent="var(--color-success)"
      glowStrong="var(--model-wave-glow-strong-nvidia)"
      glowSoft="var(--model-wave-glow-soft-nvidia)"
      dots={waveDots("parakeet")}
      ariaLabel="Parakeet model"
      onClick={onClick}
      selected={selected}
    >
      <p>Parakeet</p>
    </ModelCardShell>,
  );

describe("ModelCardShell", () => {
  test("builds a stable bounded signal for each model identity", () => {
    const first = waveDots("parakeet");
    const repeated = waveDots("parakeet");
    const other = waveDots("whisper");

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(other);
    expect(first.every((dot) => dot >= 0 && dot < 13 * WAVE_COLS)).toBe(true);
    expect(new Set(first.map((dot) => dot % WAVE_COLS)).size).toBe(WAVE_COLS);
  });

  test("exposes selection and keyboard activation without changing its content", () => {
    const onClick = vi.fn();
    renderShell(onClick, true);
    const card = screen.getByRole("radio", { name: "Parakeet model" });

    expect(card.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Parakeet")).toBeTruthy();
  });
});
