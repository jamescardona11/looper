import { AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import LibraryRetranscribeModal from "./LibraryRetranscribeModal";
import LibraryTranslationsModal from "./LibraryTranslationsModal";
import { DeleteLibraryItemDialog } from "./library-detail-modals-delete-dialog";
import { completeLibraryRetranscription } from "./library-detail-modals-retranscription";
import type {
  LibraryItem,
  LibraryItemPatch,
  SpeechModel,
} from "../../../types";

type LibraryDetailModalsProps = {
  item: LibraryItem;
  models: SpeechModel[];
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  showTranslations: boolean;
  setShowTranslations: (value: boolean) => void;
  showRetranscribe: boolean;
  setShowRetranscribe: (value: boolean) => void;
  onDelete: () => void;
  onRetry: () => Promise<void>;
  onUpdate: (patch: LibraryItemPatch) => Promise<LibraryItem>;
};

export function LibraryDetailModals({
  item,
  models,
  showDeleteConfirm,
  setShowDeleteConfirm,
  showTranslations,
  setShowTranslations,
  showRetranscribe,
  setShowRetranscribe,
  onDelete,
  onRetry,
  onUpdate,
}: LibraryDetailModalsProps) {
  const closeDelete = () => setShowDeleteConfirm(false);
  const closeTranslations = () => setShowTranslations(false);
  const closeRetranscription = () => setShowRetranscribe(false);

  return (
    <>
      <ModalPresence visible={showDeleteConfirm}>
        <DeleteLibraryItemDialog onClose={closeDelete} onDelete={onDelete} />
      </ModalPresence>

      <ModalPresence visible={showTranslations}>
        <LibraryTranslationsModal
          itemId={item.id}
          itemName={item.name}
          onClose={closeTranslations}
        />
      </ModalPresence>

      <ModalPresence visible={showRetranscribe}>
        <LibraryRetranscribeModal
          item={item}
          models={models}
          onCancel={closeRetranscription}
          onConfirm={(options) =>
            completeLibraryRetranscription({
              item,
              options,
              onUpdate,
              onRetry,
              onClose: closeRetranscription,
            })
          }
        />
      </ModalPresence>
    </>
  );
}

function ModalPresence({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return <AnimatePresence>{visible ? children : null}</AnimatePresence>;
}
