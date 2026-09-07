import type { Dispatch } from "react";

import {
  notifyLibraryRendererReady,
  subscribeLibraryDragDrop,
  subscribeLibraryDragEnter,
  subscribeLibraryDragLeave,
  subscribeLibraryDragOver,
  subscribeLibraryOpenImport,
} from "../../data/library";
import { subscribeLicenseCheckoutReturned } from "../../data/license";
import {
  subscribeNavigateCalendar,
  subscribeNavigateAbout,
  subscribeNavigateAppPrivacy,
  subscribeNavigateFeatureLab,
  subscribeNavigateHistory,
  subscribeNavigateModels,
  subscribeNavigateSettings,
} from "../../data/system/navigation";
import {
  subscribePillInserted,
  subscribePillMode,
  subscribePillState,
} from "../../data/capture/overlay";
import { notifySettingsRendererReady } from "../../data/settings";
import { requestUpdaterCheck } from "../../data/system/updates";
import {
  shouldShowInsertedStage,
  shouldShowWritingStage,
  signalStageFromPillState,
} from "../../features/transcriptions/home-signal-stage";
import type { HomeAction } from "./home-state";
import { useMountEffect } from "../../shared/hooks/useMountEffect";

type RemoveListener = () => void;

type SubscriptionScope = {
  disposed: boolean;
  insertedTimer: number | null;
  unlisteners: Set<RemoveListener>;
};

function createSubscriptionScope(): SubscriptionScope {
  return { disposed: false, insertedTimer: null, unlisteners: new Set() };
}

async function retainSubscription(
  scope: SubscriptionScope,
  subscription: Promise<RemoveListener>,
): Promise<boolean> {
  const unlisten = await subscription;
  if (scope.disposed) {
    unlisten();
    return false;
  }
  scope.unlisteners.add(unlisten);
  return true;
}

function disposeSubscriptions(scope: SubscriptionScope): void {
  scope.disposed = true;
  scope.unlisteners.forEach((unlisten) => unlisten());
  scope.unlisteners.clear();
  if (scope.insertedTimer !== null) {
    window.clearTimeout(scope.insertedTimer);
  }
}

function installSettingsNavigation(
  scope: SubscriptionScope,
  dispatch: Dispatch<HomeAction>,
): void {
  const registrations = [
    retainSubscription(
      scope,
      subscribeNavigateCalendar(() =>
        dispatch({ type: "open-settings", tab: "app" }),
      ),
    ),
    retainSubscription(
      scope,
      subscribeNavigateSettings(() =>
        dispatch({ type: "open-settings", tab: "general" }),
      ),
    ),
    retainSubscription(
      scope,
      subscribeNavigateAbout(() => {
        dispatch({ type: "open-settings", tab: "about" });
        void requestUpdaterCheck().catch(() => undefined);
      }),
    ),
    retainSubscription(
      scope,
      subscribeNavigateHistory(() =>
        dispatch({ type: "activate-view", view: "history" }),
      ),
    ),
    retainSubscription(
      scope,
      subscribeNavigateModels(() =>
        dispatch({ type: "open-settings", tab: "models" }),
      ),
    ),
    retainSubscription(
      scope,
      subscribeNavigateAppPrivacy(() =>
        dispatch({ type: "open-settings", tab: "app" }),
      ),
    ),
  ];

  if (import.meta.env.DEV) {
    registrations.push(
      retainSubscription(
        scope,
        subscribeNavigateFeatureLab(() =>
          dispatch({ type: "show-feature-lab" }),
        ),
      ),
    );
  }

  void Promise.all(registrations)
    .then(() => {
      if (!scope.disposed) void notifySettingsRendererReady().catch(() => {});
    })
    .catch((error: unknown) => {
      console.error("Failed to register settings navigation listeners:", error);
    });
}

function installLibraryNavigation(
  scope: SubscriptionScope,
  dispatch: Dispatch<HomeAction>,
): void {
  const revealDropTarget = (paths: string[]) => {
    if (paths.length > 0) {
      dispatch({ type: "set-drag-active", active: true });
    }
  };

  const ignoreFailure = (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  };

  ignoreFailure(
    retainSubscription(scope, subscribeLibraryDragEnter(revealDropTarget)),
  );
  ignoreFailure(
    retainSubscription(scope, subscribeLibraryDragOver(revealDropTarget)),
  );
  ignoreFailure(
    retainSubscription(
      scope,
      subscribeLibraryDragLeave(() => dispatch({ type: "dismiss-drag" })),
    ),
  );
  ignoreFailure(
    retainSubscription(
      scope,
      subscribeLibraryDragDrop((paths) => {
        dispatch({ type: "dismiss-drag" });
        if (paths.length > 0) {
          dispatch({ type: "open-import", paths });
        }
      }),
    ),
  );

  ignoreFailure(
    retainSubscription(
      scope,
      subscribeLibraryOpenImport((paths) => {
        if (paths.length > 0) {
          dispatch({ type: "open-import", paths });
        }
      }),
    ).then((retained) => {
      if (retained) void notifyLibraryRendererReady().catch(() => undefined);
    }),
  );
}

function installLicenseReturn(
  scope: SubscriptionScope,
  dispatch: Dispatch<HomeAction>,
): void {
  void retainSubscription(
    scope,
    subscribeLicenseCheckoutReturned(() =>
      dispatch({ type: "open-settings", tab: "account" }),
    ),
  ).catch(() => undefined);
}

function installPillSignals(
  scope: SubscriptionScope,
  dispatch: Dispatch<HomeAction>,
): void {
  void retainSubscription(
    scope,
    subscribePillState(({ status }) => {
      if (scope.insertedTimer !== null && status !== "idle") {
        window.clearTimeout(scope.insertedTimer);
        scope.insertedTimer = null;
      }
      dispatch({
        type: "set-signal-stage",
        stage: signalStageFromPillState(status),
      });
    }),
  ).catch(() => undefined);

  void retainSubscription(
    scope,
    subscribePillMode((payload) => {
      if (shouldShowWritingStage(payload)) {
        dispatch({ type: "set-signal-stage", stage: "writing" });
      }
    }),
  ).catch(() => undefined);

  void retainSubscription(
    scope,
    subscribePillInserted((payload) => {
      if (!shouldShowInsertedStage(payload)) return;
      dispatch({ type: "set-signal-stage", stage: "inserted" });
      if (scope.insertedTimer !== null) {
        window.clearTimeout(scope.insertedTimer);
      }
      scope.insertedTimer = window.setTimeout(() => {
        dispatch({ type: "set-signal-stage", stage: "ready" });
        scope.insertedTimer = null;
      }, 8_000);
    }),
  ).catch(() => undefined);
}

function editableSelectionTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable
  );
}

function installKeyboardShortcuts(
  dispatch: Dispatch<HomeAction>,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const modifierPressed = event.metaKey || event.ctrlKey;
    const pressedKey = event.key.toLocaleLowerCase();
    if (modifierPressed && pressedKey === "k") {
      event.preventDefault();
      dispatch({ type: "open-memory-shortcut" });
      return;
    }
    if (!modifierPressed || pressedKey !== "c") return;
    if (editableSelectionTarget(document.activeElement)) return;

    const selectedText = window.getSelection()?.toString() ?? "";
    if (selectedText.trim().length === 0) return;
    event.preventDefault();
    void navigator.clipboard.writeText(selectedText).catch((error: unknown) => {
      console.error("Failed to copy selection:", error);
    });
  };

  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}

export function useHomeNativeEventBridge(dispatch: Dispatch<HomeAction>): void {
  useMountEffect(() => {
    const scope = createSubscriptionScope();
    installSettingsNavigation(scope, dispatch);
    installLibraryNavigation(scope, dispatch);
    installLicenseReturn(scope, dispatch);
    installPillSignals(scope, dispatch);

    return () => {
      disposeSubscriptions(scope);
    };
  });
}

type HomeKeyboardBridgeProps = {
  dispatch: Dispatch<HomeAction>;
};

export function HomeKeyboardBridge({ dispatch }: HomeKeyboardBridgeProps) {
  useMountEffect(() => installKeyboardShortcuts(dispatch));
  return null;
}
