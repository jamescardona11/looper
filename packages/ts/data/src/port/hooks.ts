// @looper/data — the remaining real seams around the Convex adapter.
//
// The active SKU has one backend adapter. The domain hooks themselves are
// exported directly from that adapter, rather than copied into a second
// compile-time contract. These two interfaces remain because callers
// genuinely cross them:
//   - ConvexAuth is the auth-lib seam consumed by web auth surfaces.
//   - OneShotClient is the imperative query seam consumed by account-data export and
//     other out-of-React reads.

export interface ConvexAuth {
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (provider: string, formData?: FormData) => Promise<unknown>;
  signOut: () => Promise<void>;
}

export interface OneShotClient {
  query: <T = unknown>(ref: unknown, args?: unknown) => Promise<T>;
}
