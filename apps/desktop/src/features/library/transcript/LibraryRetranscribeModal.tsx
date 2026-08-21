import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { motion } from "framer-motion";
import { useMemo, useState, type MouseEvent } from "react";

import type { LibraryItem, SpeechModel } from "../../../types";
import { LibraryRetranscribeActions } from "./library-retranscribe-actions";
import { LibraryRetranscribeHeader } from "./library-retranscribe-header";
import {
  confirmedRetranscriptionOptions,
  initialRetranscriptionState,
  retranscribeModelOptions,
  retranscriptionCapabilities,
  retranscriptionSessionKey,
  type LibraryRetranscribeOptions,
} from "./library-retranscribe-model";
import { LibraryRetranscribeOptions as RetranscriptionForm } from "./library-retranscribe-options";

const OVERLAY_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};
const PANEL_MOTION = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 12 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};
const OVERLAY_CLASS = [
  "fixed inset-0 z-[95] flex items-center justify-center",
  "bg-black/60 px-6 backdrop-blur-xs",
].join(" ");
const PANEL_CLASS = [
  "relative w-[440px] max-w-[92vw] rounded-2xl",
  "border border-border-primary bg-surface-tertiary ui-shadow-modal-deep",
].join(" ");
const REMOTE_PROVIDER_COPY = msg({
  id: "library.retranscribe.remote_provider",
  message: "Remote provider",
});

type LibraryRetranscribeModalProps = {
  item: LibraryItem;
  models: SpeechModel[];
  onCancel: () => void;
  onConfirm: (options: LibraryRetranscribeOptions) => Promise<void>;
};

const LibraryRetranscribeModal = (props: LibraryRetranscribeModalProps) => {
  const { i18n } = useLingui();
  const remoteDescription = i18n._(REMOTE_PROVIDER_COPY);
  const modelOptions = useMemo(
    () => retranscribeModelOptions(props.models, remoteDescription),
    [props.models, remoteDescription],
  );
  const sessionKey = retranscriptionSessionKey(props.item, modelOptions);

  return (
    <RetranscriptionSession
      {...props}
      modelOptions={modelOptions}
      sessionKey={sessionKey}
    />
  );
};

function RetranscriptionSession({
  item,
  models,
  modelOptions,
  sessionKey,
  onCancel,
  onConfirm,
}: LibraryRetranscribeModalProps & {
  modelOptions: ReturnType<typeof retranscribeModelOptions>;
  sessionKey: string;
}) {
  const initialState = initialRetranscriptionState(item, models);
  const [storedSession, setSession] = useState(() => ({
    ...initialState,
    source: sessionKey,
    isSubmitting: false,
  }));
  const session =
    storedSession.source === sessionKey
      ? storedSession
      : {
          ...initialState,
          source: sessionKey,
          isSubmitting: storedSession.isSubmitting,
        };
  if (session !== storedSession) setSession(session);

  const capabilities = retranscriptionCapabilities(models, session.modelKey);

  const selectModel = (modelKey: string) => {
    const nextCapabilities = retranscriptionCapabilities(models, modelKey);
    setSession((current) => ({
      ...current,
      modelKey,
      showTimestamps: nextCapabilities.timestamps
        ? current.showTimestamps
        : false,
      detectSpeakers: nextCapabilities.diarization
        ? current.detectSpeakers
        : false,
    }));
  };

  const confirm = async () => {
    if (!session.modelKey) return;
    setSession((current) => ({ ...current, isSubmitting: true }));
    try {
      await onConfirm(
        confirmedRetranscriptionOptions(
          session.modelKey,
          session.showTimestamps,
          session.detectSpeakers,
          capabilities,
        ),
      );
    } finally {
      setSession((current) => ({ ...current, isSubmitting: false }));
    }
  };

  return (
    <motion.div
      {...OVERLAY_MOTION}
      className={OVERLAY_CLASS}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="retranscribe-modal-title"
    >
      <motion.div
        {...PANEL_MOTION}
        className={PANEL_CLASS}
        onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <LibraryRetranscribeHeader itemName={item.name} onCancel={onCancel} />
        <RetranscriptionForm
          modelOptions={modelOptions}
          selectedModelKey={session.modelKey}
          onSelectModel={selectModel}
          capabilities={capabilities}
          showTimestamps={session.showTimestamps}
          onShowTimestampsChange={(showTimestamps) =>
            setSession((current) => ({ ...current, showTimestamps }))
          }
          detectSpeakers={session.detectSpeakers}
          onDetectSpeakersChange={(detectSpeakers) =>
            setSession((current) => ({ ...current, detectSpeakers }))
          }
        />
        <LibraryRetranscribeActions
          canConfirm={Boolean(session.modelKey)}
          isSubmitting={session.isSubmitting}
          onCancel={onCancel}
          onConfirm={() => void confirm()}
        />
      </motion.div>
    </motion.div>
  );
}

export default LibraryRetranscribeModal;
