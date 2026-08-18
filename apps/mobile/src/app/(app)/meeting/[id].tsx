import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { MeetingDetailScreen } from "@/features/meetings";

export default function MeetingRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <MeetingDetailScreen
      meetingId={id}
      onAsk={(meetingId) => router.push(`/ask?meetingId=${encodeURIComponent(meetingId)}` as Href)}
      onBack={() => router.replace("/")}
    />
  );
}
