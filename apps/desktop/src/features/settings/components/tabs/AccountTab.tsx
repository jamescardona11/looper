import { motion, type Variants } from "framer-motion";
import {
  useActivateLicense,
  useDeactivateLicense,
  useHydrateLicenseIdentity,
  useLicenseState,
} from "../../../license/queries";
import { useAccountCheckout } from "../../useAccountCheckout";
import AccountView from "../AccountView";

type AccountTabProps = {
  variants: Variants;
};

const errorMessage = (error: unknown): string | null =>
  error ? (error instanceof Error ? error.message : String(error)) : null;

const AccountTab = ({ variants }: AccountTabProps) => {
  const license = useLicenseState();
  const activation = useActivateLicense();
  const deactivation = useDeactivateLicense();
  const checkout = useAccountCheckout();
  useHydrateLicenseIdentity(license.data);

  return (
    <motion.div
      key="account"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <AccountView
        licenseState={license.data ?? null}
        licenseLoading={license.isLoading && !license.data}
        activating={activation.isPending}
        deactivating={deactivation.isPending}
        openingTarget={checkout.openingTarget}
        openError={checkout.error}
        activationError={errorMessage(activation.error)}
        deactivationError={errorMessage(deactivation.error)}
        onOpenCheckout={checkout.openCheckout}
        onActivateLicense={activation.mutate}
        onDeactivateLicense={() => deactivation.mutate()}
      />
    </motion.div>
  );
};

export default AccountTab;
