import { useAuth } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowRight } from "@tabler/icons-react";
import { useState } from "react";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/shared/components/ui/button";

export function AnonymousButton() {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onClick = async () => {
    setError("");
    setSubmitting(true);
    try {
      await signIn("anonymous");
    } catch (cause) {
      setError(friendlyError(cause, t("auth.anonymousError")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <Button
        variant="secondary"
        onClick={onClick}
        disabled={submitting}
        className="h-11 w-full sm:h-9"
      >
        {submitting ? t("auth.starting") : t("auth.continueAnonymously")}
        <IconArrowRight className="size-3.5" />
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-center text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
