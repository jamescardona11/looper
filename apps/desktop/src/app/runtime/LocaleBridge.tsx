import { useEffect } from "react";

import { useSettings } from "../../features/settings/preferences/queries";
import { activateLocale } from "../../i18n";

export function LocaleBridge() {
  const locale = useSettings(undefined, true).data?.app_locale;

  useEffect(() => {
    activateLocale(locale);
  }, [locale]);

  return null;
}
