import { useAuth } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconLogout } from "@tabler/icons-react";
import { Button } from "@/shared/components/ui/button";

export function SignOutButton() {
  const { signOut } = useAuth();
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" onClick={() => void signOut()}>
      <IconLogout className="size-4" />
      {t("auth.signOut")}
    </Button>
  );
}
