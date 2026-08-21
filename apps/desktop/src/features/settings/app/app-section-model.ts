import type { AppSection } from "./AppTab.types";

export function isAppSectionVisible(
  activeSection: AppSection | undefined,
  section: AppSection,
) {
  return activeSection === undefined || activeSection === section;
}
