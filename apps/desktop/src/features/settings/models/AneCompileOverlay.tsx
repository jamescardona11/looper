import { useSyncExternalStore } from "react";

import { aneCompileStore } from "./ane-compile-store";
import { AneCompileDialog } from "./ane-compile-dialog";

export default function AneCompileOverlay() {
  const activeModel = useSyncExternalStore(
    aneCompileStore.subscribe,
    aneCompileStore.getSnapshot,
    aneCompileStore.getSnapshot,
  );
  return <AneCompileDialog modelLabel={activeModel} />;
}
