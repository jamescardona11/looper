import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DESTINATIONS,
  APP_DESTINATIONS,
  COMMAND_DESTINATIONS,
  MANAGE_DESTINATIONS,
  VOICE_DESTINATIONS,
  WORKSPACE_DESTINATIONS,
} from "../navigation";

const ids = (destinations: readonly { id: string }[]) =>
  destinations.map((destination) => destination.id);

describe("app navigation groups", () => {
  it("keeps primary work outcomes together", () => {
    expect(ids(WORKSPACE_DESTINATIONS)).toEqual(["home", "agent"]);
  });

  it("groups the voice tools without promoting each one globally", () => {
    expect(ids(VOICE_DESTINATIONS)).toEqual(["library", "dictation"]);
  });

  it("separates activity from account destinations", () => {
    expect(ids(MANAGE_DESTINATIONS)).toEqual(["usage"]);
    expect(ids(ACCOUNT_DESTINATIONS)).toEqual(["billing"]);
  });

  it("keeps global launchers aligned with the sidebar journey", () => {
    const expected = ["home", "library", "agent", "dictation", "usage", "billing", "settings"];

    expect(ids(COMMAND_DESTINATIONS)).toEqual(expected);
  });

  it("labels the home destination as home in the sidebar", () => {
    expect(APP_DESTINATIONS.find((destination) => destination.id === "home")?.sidebarLabelKey).toBe(
      "nav.home",
    );
  });
});
