import { useRouterState } from "@tanstack/react-router";
import { isAppPath } from "@/app/navigation";
import { FeedbackWidget } from "@/shared/components/feedback-widget";

export default function FeedbackRuntime({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isProductRoute = isAppPath(pathname) || pathname === "/admin";

  return (
    <FeedbackWidget
      avoidMobileComposer={pathname === "/agent"}
      anchorMobileHeader={isProductRoute}
      hideMobile={!isProductRoute}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
