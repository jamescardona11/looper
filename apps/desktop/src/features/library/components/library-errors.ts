import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { i18n } from "../../../i18n";

type ErrorRule = Readonly<{
  fragments: readonly string[];
  message: MessageDescriptor;
  showFfmpegHelp?: boolean;
}>;

function errorRule(
  fragments: readonly string[],
  message: MessageDescriptor,
  showFfmpegHelp = false,
): ErrorRule {
  return { fragments, message, showFfmpegHelp };
}

const IMPORT_FALLBACK = msg({
  id: "looper.library.import.failure.generic",
  message: "Import failed for one of the files.",
});

const IMPORT_RULES = [
  errorRule(
    ["selected model is not installed"],
    msg({
      id: "looper.library.import.failure.model-unavailable",
      message:
        "Selected model isn't installed. Download one in Settings -> Models.",
    }),
  ),
  errorRule(
    ["file not found"],
    msg({
      id: "looper.library.import.failure.file-missing",
      message: "File not found. It may have moved or been deleted.",
    }),
  ),
  errorRule(
    ["unsupported file format"],
    msg({
      id: "looper.library.import.failure.format-unsupported",
      message: "Unsupported file format.",
    }),
  ),
  errorRule(
    ["no supported audio tracks"],
    msg({
      id: "looper.library.import.failure.audio-track-missing",
      message: "No audio track found in this file.",
    }),
  ),
  errorRule(
    [
      "audio decode failed",
      "failed to read audio container",
      "unsupported audio codec",
      "no audio samples decoded",
    ],
    msg({
      id: "looper.library.import.failure.decode",
      message: "Couldn't decode this audio file. Try installing FFmpeg.",
    }),
  ),
  errorRule(
    ["failed to create library folder"],
    msg({
      id: "looper.library.import.failure.storage-create",
      message: "Couldn't create library storage. Check disk permissions.",
    }),
  ),
  errorRule(
    ["failed to copy original file"],
    msg({
      id: "looper.library.import.failure.original-copy",
      message: "Couldn't copy the original file into the library.",
    }),
  ),
  errorRule(
    ["wav writer init failed", "wav finalize error", "wav write error"],
    msg({
      id: "looper.library.import.failure.audio-conversion",
      message: "Couldn't convert this file to audio for transcription.",
    }),
  ),
  errorRule(
    ["invalid sample rate", "unknown sample rate"],
    msg({
      id: "looper.library.import.failure.sample-rate",
      message: "This file has an unsupported sample rate.",
    }),
  ),
];

const DELETE_FALLBACK = msg({
  id: "looper.library.delete.failure.generic",
  message: "Failed to delete the library item.",
});

const DELETE_RULES = [
  errorRule(
    ["outside the library folder"],
    msg({
      id: "looper.library.delete.failure.outside-storage",
      message:
        "Couldn't delete this item because its files are outside the library folder.",
    }),
  ),
  errorRule(
    ["storage location"],
    msg({
      id: "looper.library.delete.failure.storage-missing",
      message: "Couldn't delete this item. Library storage couldn't be found.",
    }),
  ),
  errorRule(
    ["delete library files", "delete library file"],
    msg({
      id: "looper.library.delete.failure.file-removal",
      message:
        "Couldn't delete the library files. Check permissions and try again.",
    }),
  ),
  errorRule(
    ["invalid library file path"],
    msg({
      id: "looper.library.delete.failure.invalid-path",
      message: "Couldn't delete this item due to an invalid file path.",
    }),
  ),
];

const DETAILS_RULES = [
  errorRule(
    ["selected model is not installed"],
    msg({
      id: "looper.library.item.failure.model-unavailable",
      message: "Model not installed.",
    }),
  ),
  errorRule(
    ["file not found", "audio file not found"],
    msg({
      id: "looper.library.item.failure.file-missing",
      message: "File not found.",
    }),
  ),
  errorRule(
    ["unsupported file format"],
    msg({
      id: "looper.library.item.failure.format-unsupported",
      message: "Unsupported file format.",
    }),
  ),
  errorRule(
    ["no supported audio tracks"],
    msg({
      id: "looper.library.item.failure.audio-track-missing",
      message: "No audio track found.",
    }),
  ),
  errorRule(
    [
      "invalid sample rate",
      "unknown sample rate",
      "unknown channel count",
      "unsupported wav sample format",
    ],
    msg({
      id: "looper.library.item.failure.audio-settings",
      message: "Unsupported audio settings.",
    }),
  ),
  errorRule(
    [
      "audio decode failed",
      "failed to read audio container",
      "unsupported audio codec",
      "no audio samples decoded",
    ],
    msg({
      id: "looper.library.item.failure.invalid-audio",
      message: "Not a valid audio file.",
    }),
    true,
  ),
  errorRule(
    ["ffmpeg"],
    msg({
      id: "looper.library.item.failure.ffmpeg-required",
      message: "FFmpeg required for video imports.",
    }),
    true,
  ),
  errorRule(
    ["failed to create library folder"],
    msg({
      id: "looper.library.item.failure.storage-create",
      message: "Couldn't create library storage.",
    }),
  ),
  errorRule(
    ["failed to copy original file"],
    msg({
      id: "looper.library.item.failure.original-copy",
      message: "Couldn't copy original file.",
    }),
  ),
  errorRule(
    ["insufficient disk space"],
    msg({
      id: "looper.library.item.failure.disk-space",
      message: "Not enough disk space.",
    }),
  ),
];

function findRule(message: string, rules: readonly ErrorRule[]) {
  return rules.find((rule) =>
    rule.fragments.some((fragment) => message.includes(fragment)),
  );
}

function translate(message: MessageDescriptor) {
  return i18n._(message);
}

function localizedRuleMessage(rawMessage: string, rules: readonly ErrorRule[]) {
  const normalized = rawMessage.trim().toLowerCase();
  const rule = findRule(normalized, rules);
  return rule ? translate(rule.message) : null;
}

export function formatImportErrorMessage(rawMessage: string) {
  return (
    localizedRuleMessage(rawMessage, IMPORT_RULES) ?? translate(IMPORT_FALLBACK)
  );
}

export function formatDeleteErrorMessage(rawMessage: string) {
  return (
    localizedRuleMessage(rawMessage, DELETE_RULES) ?? translate(DELETE_FALLBACK)
  );
}

export function getLibraryErrorDetails(rawMessage: string) {
  const message = rawMessage.trim();
  if (!message) {
    return {
      message: translate(
        msg({
          id: "looper.library.item.failure.import",
          message: "Import failed.",
        }),
      ),
      showFfmpegHelp: false,
    };
  }

  const rule = findRule(message.toLowerCase(), DETAILS_RULES);
  return rule
    ? {
        message: translate(rule.message),
        showFfmpegHelp: Boolean(rule.showFfmpegHelp),
      }
    : { message, showFfmpegHelp: false };
}
