import { useLingui } from "@lingui/react/macro";
import { ArrowSquareOut as ExternalLink } from "@phosphor-icons/react";
import {
  type CustomerPortalSource,
  launchCustomerPortal,
  resolveCustomerPortal,
} from "./customer-portal-action";
import {
  CUSTOMER_PORTAL_BUTTON_STYLE,
  CUSTOMER_PORTAL_LABEL,
} from "./customer-portal-presentation";

type CustomerPortalLinkProps = {
  source: CustomerPortalSource;
  className?: string;
};

export default function CustomerPortalLink({
  source,
  className = CUSTOMER_PORTAL_BUTTON_STYLE,
}: CustomerPortalLinkProps) {
  const { i18n } = useLingui();
  const destination = resolveCustomerPortal(source);
  if (destination === null) return null;

  const requestPortal = () => void launchCustomerPortal(destination);

  return (
    <button type="button" className={className} onClick={requestPortal}>
      {i18n._(CUSTOMER_PORTAL_LABEL)}
      <ExternalLink size={11} aria-hidden="true" />
    </button>
  );
}
