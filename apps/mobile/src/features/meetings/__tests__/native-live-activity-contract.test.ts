import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readNativeFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("meeting live activity native contract", () => {
  it("keeps the host bridge, shared attributes, widget and Expo config aligned", () => {
    const config = readNativeFile("../../../../app.config.ts");
    const bridge = readNativeFile("../../../../native/ios/LooperLiveActivityModule.swift");
    const attributes = readNativeFile(
      "../../../../targets/widgets/_shared/MeetingActivityAttributes.swift",
    );
    const widget = readNativeFile("../../../../targets/widgets/MeetingLiveActivity.swift");

    expect(config).toContain("NSSupportsLiveActivities: true");
    expect(bridge).toContain("Activity<MeetingActivityAttributes>");
    expect(attributes).toContain("struct MeetingActivityAttributes: ActivityAttributes");
    expect(widget).toContain("ActivityConfiguration(for: MeetingActivityAttributes.self)");
    expect(widget).toContain("DynamicIsland");
  });

  it("makes the home-screen widget an explicit deep link instead of claiming background capture", () => {
    const widget = readNativeFile("../../../../targets/widgets/QuickDictationWidget.swift");

    expect(widget).toContain('URL(string: "looper://dictation")');
    expect(widget).toContain("Abre Looper listo para escuchar");
  });
});
