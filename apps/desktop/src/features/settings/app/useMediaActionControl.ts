import { useLingui } from "@lingui/react/macro";
import type React from "react";
import type { MediaAction } from "../../../contracts/index";

type ScrubStartEvent =
  React.MouseEvent<HTMLSpanElement> | React.TouchEvent<HTMLSpanElement>;

export function useMediaActionControl(
  value: MediaAction,
  onChange: (value: MediaAction) => void,
) {
  const { t } = useLingui();
  const stops = [
    {
      label: t({ id: "settings.app.auto_pause_media.off", message: "Off" }),
      value: "off" as const,
    },
    { label: "10%", value: "duck10" as const },
    { label: "25%", value: "duck25" as const },
    { label: "50%", value: "duck50" as const },
    { label: "75%", value: "duck75" as const },
    {
      label: t({
        id: "settings.app.auto_pause_media.pause",
        message: "Pause",
      }),
      value: "pause" as const,
    },
  ];
  const index = Math.max(
    0,
    stops.findIndex((stop) => stop.value === value),
  );
  const changeIndex = (nextIndex: number) => onChange(stops[nextIndex].value);

  const startScrub = (event: ScrubStartEvent) => {
    event.preventDefault();
    const startX =
      "touches" in event ? event.touches[0].clientX : event.clientX;
    let lastIndex = index;

    const move = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX =
        "touches" in moveEvent
          ? moveEvent.touches[0].clientX
          : moveEvent.clientX;
      const stepDelta = Math.round((currentX - startX) / 15);
      const nextIndex = Math.min(
        stops.length - 1,
        Math.max(0, index + stepDelta),
      );
      if (nextIndex === lastIndex) return;
      lastIndex = nextIndex;
      changeIndex(nextIndex);
    };
    const finish = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", finish);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", finish);
  };

  const description =
    value === "off"
      ? t({
          id: "settings.app.auto_pause_media.body_off",
          message: "System audio plays while recording.",
        })
      : value === "pause"
        ? t({
            id: "settings.app.auto_pause_media.body_pause",
            message: "Pauses system audio while recording.",
          })
        : t({
            id: "settings.app.auto_pause_media.body_duck",
            message: "Lowers system volume while recording.",
          });

  return { stops, index, changeIndex, startScrub, description };
}
