import { useLingui } from "@lingui/react/macro";
import {
  ArrowRight,
  CircleNotch as Loader2,
  SignOut as LogOut,
} from "@phosphor-icons/react";
import { motion, type Variants } from "framer-motion";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import type { LicenseState } from "../../../data/license";
import CustomerPortalLink from "../../license/components/CustomerPortalLink";
import MemberCard from "../../license/components/MemberCard";
import type { PurchaseTier } from "../../license/purchaseConfig";
import {
  useActivateLicense,
  useDeactivateLicense,
  useHydrateLicenseIdentity,
  useLicenseState,
} from "../../license/queries";
import { useAccountCheckout } from "./useAccountCheckout";
import { createTimedConfirmationStore } from "../preferences/timed-confirmation-store";

const TRIAL_TOTAL_DAYS = 14;
const ACCOUNT_MOTION = {
  initial: "hidden",
  animate: "visible",
  exit: "exit",
} as const;
const ACCOUNT_STYLE = {
  root: "mx-auto w-full max-w-[480px] space-y-7",
  statusSection: "space-y-3",
  card: "flex justify-center",
  statusBar:
    "mx-auto flex w-full max-w-[400px] items-center justify-between gap-3 rounded-lg border border-border-primary px-3 py-2.5",
  statusCopy: "min-w-0",
  portal:
    "inline-flex shrink-0 items-center gap-1 ui-text-meta ui-color-muted transition-colors hover:ui-color-secondary",
  quietStatus: "truncate ui-text-meta ui-color-muted",
  trialStatus: "truncate ui-text-meta text-[var(--color-cloud)]",
  deactivate:
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 ui-text-button-sm ui-color-muted transition-colors hover:bg-surface-elevated hover:text-content-primary disabled:opacity-50",
  confirmation: "flex shrink-0 items-center gap-1.5",
  cancel:
    "h-8 rounded-md px-2 ui-text-button-sm ui-color-muted hover:bg-surface-elevated disabled:opacity-50",
  confirm:
    "inline-flex h-8 items-center gap-1 rounded-md px-2 ui-text-button-sm ui-color-error hover:bg-error/10 disabled:opacity-50",
  activation: "mx-auto max-w-[400px] border-t border-border-primary pt-5",
  activationTitle: "ui-text-label-strong ui-color-primary",
  activationForm:
    "mt-3 flex items-center gap-2 border-b border-border-secondary transition-colors focus-within:border-content-primary",
  licenseInput:
    "min-w-0 flex-1 bg-transparent px-0.5 py-2 font-mono ui-text-body-sm ui-color-primary placeholder-content-disabled outline-none",
  submit:
    "inline-flex h-7 items-center gap-1 px-1 ui-text-button-sm ui-color-secondary transition-colors hover:text-content-primary disabled:opacity-40",
  activationError: "mt-2 ui-text-meta text-error",
  errors: "mx-auto w-full max-w-[400px] space-y-1",
  error: "ui-text-meta text-error",
} as const;

type AccountViewProps = {
  licenseState: LicenseState | null;
  licenseLoading: boolean;
  activating: boolean;
  deactivating: boolean;
  openingTarget: PurchaseTier | null;
  openError: string | null;
  activationError: string | null;
  deactivationError: string | null;
  onOpenCheckout: (tier: PurchaseTier) => void;
  onActivateLicense: (key: string) => void;
  onDeactivateLicense: () => void;
};

export function AccountTab({ variants }: { variants: Variants }) {
  const license = useLicenseState();
  const activation = useActivateLicense();
  const deactivation = useDeactivateLicense();
  const checkout = useAccountCheckout();
  useHydrateLicenseIdentity(license.data);
  return (
    <motion.div key="account" variants={variants} {...ACCOUNT_MOTION}>
      <AccountView
        licenseState={license.data ?? null}
        licenseLoading={license.isLoading && !license.data}
        activating={activation.isPending}
        deactivating={deactivation.isPending}
        openingTarget={checkout.openingTarget}
        openError={checkout.error}
        activationError={readError(activation.error)}
        deactivationError={readError(deactivation.error)}
        onOpenCheckout={checkout.openCheckout}
        onActivateLicense={activation.mutate}
        onDeactivateLicense={() => deactivation.mutate()}
      />
    </motion.div>
  );
}

export function AccountView(props: AccountViewProps) {
  const active = props.licenseState?.status === "active";
  const [licenseKey, setLicenseKey] = useState("");
  const [activationAttempt, setActivationAttempt] = useState(0);
  const confirmation = useMemo(() => createTimedConfirmationStore(3_000), []);
  const confirming = useSyncExternalStore(
    confirmation.subscribe,
    confirmation.getSnapshot,
    confirmation.getSnapshot,
  );
  const activate = (event: FormEvent) => {
    event.preventDefault();
    const normalizedKey = licenseKey.trim();
    if (!normalizedKey) return;
    setActivationAttempt((attempt) => attempt + 1);
    props.onActivateLicense(normalizedKey);
  };
  const requestDeactivation = () => {
    if (confirmation.request()) props.onDeactivateLicense();
  };

  return (
    <div className={ACCOUNT_STYLE.root}>
      <section
        aria-label="Account status"
        className={ACCOUNT_STYLE.statusSection}
      >
        <div className={ACCOUNT_STYLE.card}>
          <MemberCard
            active={active}
            activating={props.activating}
            activationAttempt={activationAttempt}
            licenseLoading={props.licenseLoading}
            licenseState={props.licenseState}
            openingTarget={props.openingTarget}
            checkoutDisabled={props.openingTarget !== null}
            onOpenCheckout={props.onOpenCheckout}
          />
        </div>
        <AccountStatusBar
          state={props.licenseState}
          loading={props.licenseLoading}
          deactivating={props.deactivating}
          confirming={confirming}
          onRequestDeactivation={requestDeactivation}
          onCancelDeactivation={confirmation.cancel}
        />
        <AccountErrors errors={[props.deactivationError, props.openError]} />
      </section>
      {!active ? (
        <ActivationForm
          value={licenseKey}
          onChange={setLicenseKey}
          onSubmit={activate}
          pending={props.activating}
          error={props.activationError}
        />
      ) : null}
    </div>
  );
}

type StatusBarProps = {
  state: LicenseState | null;
  loading: boolean;
  deactivating: boolean;
  confirming: boolean;
  onRequestDeactivation: () => void;
  onCancelDeactivation: () => void;
};

function AccountStatusBar(props: StatusBarProps) {
  const activeState = props.state?.status === "active" ? props.state : null;
  return (
    <div className={ACCOUNT_STYLE.statusBar}>
      <div className={ACCOUNT_STYLE.statusCopy}>
        {activeState ? (
          <ActiveAccountStatus state={activeState} />
        ) : (
          <TrialStatus state={props.state} loading={props.loading} />
        )}
      </div>
      {activeState ? (
        <DeactivationControls
          confirming={props.confirming}
          pending={props.deactivating}
          onConfirm={props.onRequestDeactivation}
          onCancel={props.onCancelDeactivation}
        />
      ) : (
        <AccountPortalLink />
      )}
    </div>
  );
}

function ActiveAccountStatus({ state }: { state: LicenseState }) {
  const { t } = useLingui();
  const renewal = formatDate(state.expiresAt);
  return (
    <>
      {renewal ? (
        <p className={ACCOUNT_STYLE.quietStatus}>{t`Renews ${renewal}`}</p>
      ) : null}
      <AccountPortalLink />
    </>
  );
}

function AccountPortalLink() {
  return (
    <CustomerPortalLink
      source="settings_account"
      className={ACCOUNT_STYLE.portal}
    />
  );
}

function TrialStatus({
  state,
  loading,
}: {
  state: LicenseState | null;
  loading: boolean;
}) {
  const { t } = useLingui();
  if (loading) return <p aria-hidden="true">&nbsp;</p>;
  if (state?.trialActive) {
    const days = state.trialDaysRemaining;
    return (
      <p className={ACCOUNT_STYLE.trialStatus}>
        {days === 1
          ? t({
              id: "settings.account.trial.text_one",
              message: "Trial · 1 day left",
            })
          : t`Trial · ${days} of ${TRIAL_TOTAL_DAYS} days left`}
      </p>
    );
  }
  if (state?.trialEndsAt) {
    const endedAt = formatDate(state.trialEndsAt) ?? "-";
    return (
      <p className={ACCOUNT_STYLE.quietStatus}>
        {t({
          id: "settings.account.trial.text_ended_on",
          message: "Your trial ended on",
        })}{" "}
        {endedAt}
      </p>
    );
  }
  return (
    <p className={ACCOUNT_STYLE.quietStatus}>
      {t({
        id: "settings.account.trial.text_ended",
        message: "Your trial has ended",
      })}
    </p>
  );
}

type DeactivationProps = {
  confirming: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function DeactivationControls(props: DeactivationProps) {
  return props.confirming ? (
    <DeactivationConfirmation {...props} />
  ) : (
    <DeactivationRequest {...props} />
  );
}

function DeactivationRequest(props: DeactivationProps) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      onClick={props.onConfirm}
      disabled={props.pending}
      className={ACCOUNT_STYLE.deactivate}
    >
      {props.pending ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <LogOut size={12} />
      )}
      {t({
        id: "settings.account.action.deactivate",
        message: "Deactivate this device",
      })}
    </button>
  );
}

function DeactivationConfirmation(props: DeactivationProps) {
  const { t } = useLingui();
  return (
    <div className={ACCOUNT_STYLE.confirmation}>
      <button
        type="button"
        onClick={props.onCancel}
        disabled={props.pending}
        className={ACCOUNT_STYLE.cancel}
      >
        {t({
          id: "settings.account.action.deactivate_cancel",
          message: "Cancel",
        })}
      </button>
      <button
        type="button"
        onClick={props.onConfirm}
        disabled={props.pending}
        className={ACCOUNT_STYLE.confirm}
      >
        {props.pending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <LogOut size={11} />
        )}
        {t({
          id: "settings.account.action.deactivate_confirm_short",
          message: "Deactivate",
        })}
      </button>
    </div>
  );
}

type ActivationFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
  error: string | null;
};

function ActivationForm(props: ActivationFormProps) {
  const { t } = useLingui();
  return (
    <section className={ACCOUNT_STYLE.activation}>
      <h2 className={ACCOUNT_STYLE.activationTitle}>
        {t({
          id: "settings.account.section.activate",
          message: "Paste your license below",
        })}
      </h2>
      <form onSubmit={props.onSubmit} className={ACCOUNT_STYLE.activationForm}>
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={t({
            id: "settings.account.activate.placeholder",
            message: "LOOPER_…",
          })}
          aria-label={t({
            id: "settings.account.activate.input_aria",
            message: "License key",
          })}
          className={ACCOUNT_STYLE.licenseInput}
        />
        <button
          type="submit"
          disabled={props.pending || !props.value.trim()}
          className={ACCOUNT_STYLE.submit}
        >
          {props.pending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : null}
          {t({ id: "settings.account.activate.submit", message: "Activate" })}
          {!props.pending ? <ArrowRight size={12} aria-hidden="true" /> : null}
        </button>
      </form>
      {props.error ? (
        <p className={ACCOUNT_STYLE.activationError}>{props.error}</p>
      ) : null}
    </section>
  );
}

function AccountErrors({ errors }: { errors: Array<string | null> }) {
  const visible = errors.filter((error): error is string => Boolean(error));
  if (!visible.length) return null;
  return (
    <div className={ACCOUNT_STYLE.errors} role="alert">
      {visible.map((error) => (
        <p key={error} className={ACCOUNT_STYLE.error}>
          {error}
        </p>
      ))}
    </div>
  );
}

function readError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default AccountView;
