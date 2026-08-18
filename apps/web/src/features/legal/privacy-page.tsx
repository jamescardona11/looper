import { useTranslation } from "@looper/i18n/react";
import { Link } from "@tanstack/react-router";
import { PublicLegalLayout, PublicLegalSection } from "@/shared/components/public-legal-layout";

export function PrivacyPage() {
  const { t } = useTranslation();

  const sections = [
    { id: "data-collection", title: t("privacy.s1Title") },
    { id: "data-use", title: t("privacy.s2Title") },
    { id: "cookies", title: t("privacy.s3Title") },
    { id: "third-parties", title: t("privacy.s4Title") },
    { id: "retention", title: t("privacy.s5Title") },
    { id: "security", title: t("privacy.s6Title") },
    { id: "rights", title: t("privacy.s7Title") },
    { id: "contact", title: t("privacy.s8Title") },
  ];

  return (
    <PublicLegalLayout
      title={t("legal.privacy")}
      lastUpdated={t("privacy.lastUpdatedDate")}
      intro={t("privacy.intro")}
      sections={sections}
    >
      <PublicLegalSection id="data-collection" title={t("privacy.s1Title")}>
        <p>{t("privacy.s1Body")}</p>
        <p>{t("privacy.s1Local")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="data-use" title={t("privacy.s2Title")}>
        <p>{t("privacy.s2Intro")}</p>
        <ul>
          <li>{t("privacy.s2Li1")}</li>
          <li>{t("privacy.s2Li2")}</li>
          <li>{t("privacy.s2Li3")}</li>
          <li>{t("privacy.s2Li4")}</li>
        </ul>
        <p>{t("privacy.s2NoSell")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="cookies" title={t("privacy.s3Title")}>
        <p>{t("privacy.s3Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="third-parties" title={t("privacy.s4Title")}>
        <p>{t("privacy.s4Intro")}</p>
        <ul>
          <li>
            <strong>{t("common.backend")}</strong> — {t("privacy.s4Backend")}
          </li>
          <li>
            <strong>{t("privacy.s4AIProviders")}</strong> — {t("privacy.s4AI")}
          </li>
          <li>
            <strong>Stripe, Polar, RevenueCat</strong> — {t("privacy.s4Payments")}
          </li>
          <li>
            <strong>Google, Apple, GitHub</strong> — {t("privacy.s4Auth")}
          </li>
          <li>
            <strong>PostHog</strong> — {t("privacy.s4Analytics")}
          </li>
          <li>
            <strong>Resend</strong> — {t("privacy.s4Email")}
          </li>
        </ul>
      </PublicLegalSection>

      <PublicLegalSection id="retention" title={t("privacy.s5Title")}>
        <p>{t("privacy.s5Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="security" title={t("privacy.s6Title")}>
        <p>{t("privacy.s6Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="rights" title={t("privacy.s7Title")}>
        <p>{t("privacy.s7Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="contact" title={t("privacy.s8Title")}>
        <p>
          {t("privacy.s8Body")}{" "}
          <Link
            to="/contact"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            {t("legal.contactForm")}
          </Link>
          .
        </p>
      </PublicLegalSection>
    </PublicLegalLayout>
  );
}
