import { Redirect } from "expo-router";

/** Entry used by the iOS keyboard extension to bring the host app forward. */
export default function DictateDeepLink() {
  return <Redirect href="/(app)/dictation" />;
}
