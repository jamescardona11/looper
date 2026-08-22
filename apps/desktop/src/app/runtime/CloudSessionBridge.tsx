import { useEffect } from "react";

import {
  createConvexClient,
  ensureAnonymousSession,
  setCloudAuthToken,
  subscribeAccessToken,
  subscribeViewer,
} from "../../data/sync/convex-auth";

export function CloudSessionBridge() {
  useEffect(() => {
    const client = createConvexClient();
    if (!client) return;

    ensureAnonymousSession(client);
    const stopTokenSync = subscribeAccessToken((token) => {
      void setCloudAuthToken(token).catch(() => undefined);
    });
    const stopViewerSync = subscribeViewer(client, () => undefined);

    return () => {
      stopTokenSync();
      stopViewerSync();
      void client.close();
    };
  }, []);

  return null;
}
