import type { InstalledApp } from "../../../data/personalization";
import type {
  AppBinding as ApplicationBinding,
  Personality as WritingMode,
} from "../../../contracts";
import { PersonalityApplications } from "./personality-modal-applications";
import { PersonalityModalHeader } from "./personality-modal-header";
import { PersonalityInstructions } from "./personality-modal-instructions";
import { PersonalityModalShell } from "./personality-modal-shell";
import { PersonalityWebsites } from "./personality-modal-websites";

export { AppIconBadge, WebsiteFavicon } from "./personality-modal-icons";

export type PendingDeletePersonality = Record<"id" | "name", string>;

type ModalData = Record<"personality", WritingMode> &
  Record<"installedApps", InstalledApp[]> &
  Record<"websiteIconBySite", Record<string, string>>;
type ModalActions = Record<"onClose" | "onDelete", () => void> & {
  onUpdate: (patch: Partial<WritingMode>) => void;
  onUpdateList: (updater: (current: WritingMode) => WritingMode) => void;
  onAssignApp: (app: ApplicationBinding) => void;
};
type PersonalityModalProps = ModalData & ModalActions;

const modalLayout = {
  body: ["flex flex-col gap-5 p-5", "flex-1 min-h-0 overflow-hidden"].join(" "),
  destinations: ["grid", "grid-cols-2", "gap-4"].join(" "),
};
const iconFallbackTextClass = "text-[9px]";

const PersonalityModal = (props: PersonalityModalProps) => (
  <PersonalityModalSession key={props.personality.id} {...props} />
);

const PersonalityModalSession = ({
  personality: mode,
  installedApps: applications,
  websiteIconBySite: siteIcons,
  onClose: close,
  onUpdate: update,
  onUpdateList: updateCollection,
  onAssignApp: assignApplication,
  onDelete: remove,
}: PersonalityModalProps) => (
  <PersonalityModalShell close={close}>
    <PersonalityModalHeader
      personality={mode}
      update={update}
      close={close}
      remove={remove}
    />
    <div className={modalLayout.body}>
      <PersonalityInstructions personality={mode} update={update} />
      <div className={modalLayout.destinations}>
        <PersonalityApplications
          personality={mode}
          installedApps={applications}
          updateList={updateCollection}
          assign={assignApplication}
          iconTextClass={iconFallbackTextClass}
        />
        <PersonalityWebsites
          personality={mode}
          icons={siteIcons}
          update={update}
          iconTextClass={iconFallbackTextClass}
        />
      </div>
    </div>
  </PersonalityModalShell>
);

export default PersonalityModal;
