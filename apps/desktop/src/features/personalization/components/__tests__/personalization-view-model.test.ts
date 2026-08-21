import { describe, expect, test } from "vitest";
import type { AppBinding, Personality } from "../../../../contracts";
import {
  appIconPath,
  blankPersonality,
  changePersonalities,
  indexInstalledApps,
  selectedPersonality,
  websiteDomainsFor,
} from "../personalization-view-model";

const personality = (
  id: string,
  overrides: Partial<Personality> = {},
): Personality => ({
  id,
  name: id,
  enabled: true,
  apps: [],
  websites: [],
  instructions: [],
  ...overrides,
});

describe("personalization view model", () => {
  test("builds the exact enabled blank style used by the create action", () => {
    expect(blankPersonality("new-id", "New Mode")).toEqual({
      id: "new-id",
      name: "New Mode",
      enabled: true,
      apps: [],
      websites: [],
      instructions: [],
    });
  });

  test("normalizes, deduplicates and sorts website icon requests", () => {
    const styles = [
      personality("one", {
        websites: ["HTTPS://Docs.Example.com/path", "mail.example.com"],
      }),
      personality("two", {
        websites: ["docs.example.com", "  ", "calendar.example.com"],
      }),
    ];

    expect(websiteDomainsFor(styles)).toEqual([
      "calendar.example.com",
      "docs.example.com",
      "mail.example.com",
    ]);
  });

  test("assigning an app moves the binding to one owner without touching order", () => {
    const app = { name: "Mail", bundle_id: "com.example.mail" } as AppBinding;
    const unrelated = {
      name: "Notes",
      bundle_id: "com.example.notes",
    } as AppBinding;
    const styles = [
      personality("one", { apps: [unrelated, app] }),
      personality("two"),
    ];

    expect(
      changePersonalities(styles, { kind: "assign-app", id: "two", app }),
    ).toEqual([
      personality("one", { apps: [unrelated] }),
      personality("two", { apps: [app] }),
    ]);
  });

  test("patch, replace, prepend and remove commands retain their list semantics", () => {
    const first = personality("one");
    const second = personality("two");
    const added = personality("new");
    const prepended = changePersonalities([first, second], {
      kind: "prepend",
      personality: added,
    });
    const patched = changePersonalities(prepended, {
      kind: "patch",
      id: "one",
      patch: { enabled: false },
    });
    const replaced = changePersonalities(patched, {
      kind: "replace",
      id: "two",
      update: (value) => ({ ...value, instructions: ["Keep it short"] }),
    });

    expect(
      changePersonalities(replaced, { kind: "remove", id: "new" }),
    ).toEqual([
      { ...first, enabled: false },
      { ...second, instructions: ["Keep it short"] },
    ]);
  });

  test("selection and installed-app lookup use the same fallback rules as the UI", () => {
    const styles = [personality("first"), personality("second")];
    const apps = [
      {
        name: "Mail",
        identifier: "com.example.mail",
        path: "/Applications/Mail.app",
        icon_path: "/icons/mail.png",
      },
    ];
    const indexes = indexInstalledApps(apps);
    const binding = {
      name: "MAIL",
      bundle_id: "missing-binding",
    } as AppBinding;

    expect(selectedPersonality(styles, "missing")).toBe(styles[0]);
    expect(selectedPersonality(styles, "second")).toBe(styles[1]);
    expect(appIconPath(binding, indexes)).toBe("/icons/mail.png");
  });
});
