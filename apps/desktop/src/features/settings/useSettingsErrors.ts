import { useCallback, useState } from "react";

import type { SettingsTab } from "./settings-navigation";

export type SettingsErrorTab = Exclude<SettingsTab, "account" | "sync">;

type SettingsIssue = {
  message: string;
  sourceTab: SettingsErrorTab;
};

export function useSettingsErrors(activeTab: SettingsTab) {
  const [issue, setIssue] = useState<SettingsIssue | null>(null);

  const clear = useCallback(() => setIssue(null), []);
  const show = useCallback(
    (message: string, sourceTab?: SettingsErrorTab) => {
      const fallbackTab =
        activeTab === "account" || activeTab === "sync" ? "general" : activeTab;
      setIssue({ message, sourceTab: sourceTab ?? fallbackTab });
    },
    [activeTab],
  );
  const showShortcut = useCallback(
    (message: string) => show(message, "general"),
    [show],
  );
  const showProvider = useCallback(
    (message: string) => show(message, "providers"),
    [show],
  );

  return { issue, clear, show, showShortcut, showProvider };
}
