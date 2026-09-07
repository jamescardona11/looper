import type { ComponentProps, Dispatch, SetStateAction } from "react";

import type { LibraryAudioFooter } from "../player/LibraryAudioFooter";
import { isCaptureItem } from "./library-detail-policy";
import type { LibraryDetailProps } from "./library-detail-types";
import type { useLibraryPlayer } from "../player/useLibraryPlayer";

type FooterInput = {
  item: LibraryDetailProps["item"];
  player: ReturnType<typeof useLibraryPlayer>;
  canShowTimestamps: boolean;
  showTimestamps: boolean;
  setShowTimestamps: Dispatch<SetStateAction<boolean>>;
  showSegmentView: boolean;
  followTimestampsActive: boolean;
  detail: LibraryDetailProps;
};

export function createLibraryDetailFooter({
  item,
  player,
  canShowTimestamps,
  showTimestamps,
  setShowTimestamps,
  showSegmentView,
  followTimestampsActive,
  detail,
}: FooterInput): ComponentProps<typeof LibraryAudioFooter> {
  const meeting = isCaptureItem(item);
  return {
    meetingId: meeting ? item.id : undefined,
    meetingDockProps: meeting
      ? {
          audioReady: player.audioReady,
          audioError: player.audioError,
          isPlaying: player.isPlaying,
          onTogglePlayback: player.handleTogglePlayback,
          audioCurrentTime: player.audioCurrentTime,
          audioDuration: player.audioDuration,
          scrubberPercent: player.scrubberPercent,
        }
      : undefined,
    playerProps: {
      audioReady: player.audioReady,
      audioError: player.audioError,
      isPlaying: player.isPlaying,
      onTogglePlayback: player.handleTogglePlayback,
      audioCurrentTime: player.audioCurrentTime,
      audioDuration: player.audioDuration,
      scrubberMax: player.scrubberMax,
      scrubberValue: player.scrubberValue,
      scrubberPercent: player.scrubberPercent,
      onScrubChange: player.handleScrubChange,
      onScrubStart: player.handleScrubStart,
      onScrubEnd: player.handleScrubEnd,
      playbackRate: player.playbackRate,
      onPlaybackRateStep: player.handlePlaybackRateStep,
      canDecreasePlaybackRate: player.canDecreasePlaybackRate,
      canIncreasePlaybackRate: player.canIncreasePlaybackRate,
      onRateScrubStart: player.handleRateScrubStart,
      canShowTimestamps,
      showTimestamps,
      setShowTimestamps,
      showSegmentView,
      followTimestampsActive,
      onFollowTimestampsChange: detail.onFollowTimestampsChange,
      onUpdate: detail.onUpdate,
    },
  };
}
