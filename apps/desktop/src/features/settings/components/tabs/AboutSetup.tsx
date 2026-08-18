import { useLingui } from "@lingui/react/macro";
import {
  ArrowCounterClockwise as RotateCcw,
  Question as HelpCircle,
} from "@phosphor-icons/react";
import ActionCardButton from "../../../../shared/ui/ActionCardButton";
import HoldActionCardButton from "../../../../shared/ui/HoldActionCardButton";
import SectionLabel from "../../../../shared/ui/SectionLabel";

export function AboutSetup({
  onRestartOnboarding,
  onOpenFAQ,
}: {
  onRestartOnboarding: () => void;
  onOpenFAQ: () => void;
}) {
  const { t } = useLingui();
  return (
    <section className="space-y-2">
      <SectionLabel>
        {t({ id: "settings.about.setup", message: "Setup & help" })}
      </SectionLabel>
      <div className="grid grid-cols-2 gap-4">
        <HoldActionCardButton
          onConfirm={onRestartOnboarding}
          accentPreset="accent"
          title={t({
            id: "settings.about.restart_onboarding",
            message: "Restart Onboarding",
          })}
          description={t({
            id: "settings.about.restart_onboarding_description",
            message: "hold to re-run setup experience",
          })}
          ariaLabel={t({
            id: "settings.about.restart_onboarding_hold_aria",
            message: "Restart Onboarding. Hold to confirm.",
          })}
          icon={<RotateCcw size={14} strokeWidth={2} />}
        />
        <ActionCardButton
          onClick={onOpenFAQ}
          title={t({ id: "settings.about.faq_help", message: "FAQ & Help" })}
          description={t({
            id: "settings.about.faq_help_description",
            message: "common questions",
          })}
          icon={<HelpCircle size={14} strokeWidth={2} />}
          accentPreset="cloud"
        />
      </div>
    </section>
  );
}
