import { useEffect } from "react";

import { startLiveMeetingPublisher } from "../../data/live-meeting";
import { startConfirmedMeetingOutputDelivery } from "../../data/meeting-output-delivery";
import { startRemoteDictationConsumer } from "../../data/remote-dictation";
import { startSyncEngine } from "../../data/sync-engine";

type RuntimeService = () => () => void;

const mainWindowServices: RuntimeService[] = [
  startRemoteDictationConsumer,
  startConfirmedMeetingOutputDelivery,
  startLiveMeetingPublisher,
  startSyncEngine,
];

export function startWindowServices(
  windowLabel: string,
  services: RuntimeService[] = mainWindowServices,
) {
  if (windowLabel !== "main") return () => undefined;
  const stopServices = services.map((start) => start());
  return () => {
    for (const stop of stopServices.reverse()) stop();
  };
}

export function WindowServicesBridge({ windowLabel }: { windowLabel: string }) {
  useEffect(() => startWindowServices(windowLabel), [windowLabel]);
  return null;
}
