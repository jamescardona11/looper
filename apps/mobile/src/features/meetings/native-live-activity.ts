import { NativeModules, Platform } from "react-native";

interface LooperLiveActivityModule {
  start(meetingId: string, title: string, startedAt: number): Promise<string | null>;
  update(meetingId: string, phase: string, markedMoments: number): Promise<void>;
  end(meetingId: string, phase: string): Promise<void>;
}

const nativeModule = NativeModules.LooperLiveActivity as LooperLiveActivityModule | undefined;

export const meetingLiveActivity = {
  async start(meetingId: string, title: string, startedAt: number): Promise<void> {
    if (Platform.OS !== "ios" || !nativeModule) return;
    await nativeModule.start(meetingId, title, startedAt);
  },
  async update(meetingId: string, phase: string, markedMoments: number): Promise<void> {
    if (Platform.OS !== "ios" || !nativeModule) return;
    await nativeModule.update(meetingId, phase, markedMoments);
  },
  async end(meetingId: string, phase: string): Promise<void> {
    if (Platform.OS !== "ios" || !nativeModule) return;
    await nativeModule.end(meetingId, phase);
  },
};
