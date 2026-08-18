import { useLocalSearchParams } from "expo-router";
import { AgentScreen } from "@/features/agent";

export default function AskRoute() {
  const { meetingId } = useLocalSearchParams<{ meetingId?: string }>();
  return <AgentScreen meetingId={meetingId} />;
}
