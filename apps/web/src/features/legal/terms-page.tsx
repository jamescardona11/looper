import { useTranslation } from "@looper/i18n/react";
import { Link } from "@tanstack/react-router";
import { PublicLegalLayout, PublicLegalSection } from "@/shared/components/public-legal-layout";

export function TermsPage() {
  const { t } = useTranslation();

  const sections = [
    { id: "acceptance", title: t("terms.s1Title") },
    { id: "license", title: t("terms.s2Title") },
    { id: "accounts", title: t("terms.s3Title") },
    { id: "payment", title: t("terms.s4Title") },
    { id: "intellectual-property", title: t("terms.s5Title") },
    { id: "liability", title: t("terms.s6Title") },
    { id: "termination", title: t("terms.s7Title") },
    { id: "changes", title: t("terms.s8Title") },
    { id: "contact", title: t("terms.s9Title") },
  ];

  return (
    <PublicLegalLayout
      title={t("legal.terms")}
      lastUpdated={t("terms.lastUpdatedDate")}
      intro={t("terms.intro")}
      sections={sections}
    >
      <PublicLegalSection id="acceptance" title={t("terms.s1Title")}>
        <p>{t("terms.s1Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="license" title={t("terms.s2Title")}>
        <p>{t("terms.s2Intro")}</p>
        <ul>
          <li>{t("terms.s2Li1")}</li>
          <li>{t("terms.s2Li2")}</li>
          <li>{t("terms.s2Li3")}</li>
          <li>{t("terms.s2Li4")}</li>
        </ul>
      </PublicLegalSection>

      <PublicLegalSection id="accounts" title={t("terms.s3Title")}>
        <p>
          {t("terms.s3Body")}{" "}
          <Link
            to="/contact"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            {t("legal.contactForm")}
          </Link>
          . {t("terms.s3BodySuffix")}
        </p>
      </PublicLegalSection>

      <PublicLegalSection id="payment" title={t("terms.s4Title")}>
        <p>{t("terms.s4Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="intellectual-property" title={t("terms.s5Title")}>
        <p>{t("terms.s5Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="liability" title={t("terms.s6Title")}>
        <p>{t("terms.s6Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="termination" title={t("terms.s7Title")}>
        <p>{t("terms.s7Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="changes" title={t("terms.s8Title")}>
        <p>{t("terms.s8Body")}</p>
      </PublicLegalSection>

      <PublicLegalSection id="contact" title={t("terms.s9Title")}>
        <p>
          {t("terms.s9Body")}{" "}
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
