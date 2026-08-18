import { useMemo, useState, useSyncExternalStore } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowRight,
  CircleNotch as Loader2,
  SignOut as LogOut,
} from "@phosphor-icons/react";
import CustomerPortalLink from "../../license/components/CustomerPortalLink";
import MemberCard from "../../license/components/MemberCard";
import type { LicenseState } from "../../../data/license";
import type { PurchaseTier } from "../../license/purchaseConfig";
import { createTimedConfirmationStore } from "../timed-confirmation-store";

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

const TRIAL_TOTAL_DAYS = 14;
const portalLinkClassName =
  "inline-flex shrink-0 items-center gap-1 ui-text-meta ui-color-muted transition-colors hover:ui-color-secondary";

const AccountView = ({
  licenseState,
  licenseLoading,
  activating,
  deactivating,
  openingTarget,
  openError,
  activationError,
  deactivationError,
  onOpenCheckout,
  onActivateLicense,
  onDeactivateLicense,
}: AccountViewProps) => {
  const active = licenseState?.status === "active";
  const [licenseKey, setLicenseKey] = useState("");
  const [activationAttempt, setActivationAttempt] = useState(0);
  const confirmation = useMemo(() => createTimedConfirmationStore(3_000), []);
  const confirmingDeactivation = useSyncExternalStore(
    confirmation.subscribe,
    confirmation.getSnapshot,
    confirmation.getSnapshot,
  );

  const activate = (event: React.FormEvent) => {
    event.preventDefault();
    const key = licenseKey.trim();
    if (!key) return;
    setActivationAttempt((attempt) => attempt + 1);
    onActivateLicense(key);
  };
  const requestDeactivation = () => {
    if (confirmation.request()) onDeactivateLicense();
  };

  return (
    <div className="mx-auto w-full max-w-[480px] space-y-7">
      <section aria-label="Account status" className="space-y-3">
        <div className="flex justify-center">
          <MemberCard
            active={active}
            activating={activating}
            activationAttempt={activationAttempt}
            licenseLoading={licenseLoading}
            licenseState={licenseState}
            openingTarget={openingTarget}
            checkoutDisabled={openingTarget !== null}
            onOpenCheckout={onOpenCheckout}
          />
        </div>

        <AccountStatusBar
          state={licenseState}
          loading={licenseLoading}
          deactivating={deactivating}
          confirmingDeactivation={confirmingDeactivation}
          onRequestDeactivation={requestDeactivation}
          onCancelDeactivation={confirmation.cancel}
        />
        <AccountErrors errors={[deactivationError, openError]} />
      </section>

      {!active && (
        <ActivationForm
          value={licenseKey}
          onChange={setLicenseKey}
          onSubmit={activate}
          pending={activating}
          error={activationError}
        />
      )}
    </div>
  );
};

const AccountStatusBar = ({
  state,
  loading,
  deactivating,
  confirmingDeactivation,
  onRequestDeactivation,
  onCancelDeactivation,
}: {
  state: LicenseState | null;
  loading: boolean;
  deactivating: boolean;
  confirmingDeactivation: boolean;
  onRequestDeactivation: () => void;
  onCancelDeactivation: () => void;
}) => {
  const { t } = useLingui();
  const active = state?.status === "active";
  const renewal = active ? formatDate(state.expiresAt) : null;

  return (
    <div className="mx-auto flex w-full max-w-[400px] items-center justify-between gap-3 rounded-lg border border-border-primary px-3 py-2.5">
      <div className="min-w-0">
        {active ? (
          <>
            {renewal && (
              <p className="truncate ui-text-meta ui-color-muted">
                {t`Renews ${renewal}`}
              </p>
            )}
            <CustomerPortalLink
              source="settings_account"
              className={portalLinkClassName}
            />
          </>
        ) : (
          <TrialStatus state={state} loading={loading} />
        )}
      </div>

      {active ? (
        <DeactivationControls
          confirming={confirmingDeactivation}
          pending={deactivating}
          onConfirm={onRequestDeactivation}
          onCancel={onCancelDeactivation}
        />
      ) : (
        <CustomerPortalLink
          source="settings_account"
          className={portalLinkClassName}
        />
      )}
    </div>
  );
};

const TrialStatus = ({
  state,
  loading,
}: {
  state: LicenseState | null;
  loading: boolean;
}) => {
  const { t } = useLingui();
  if (loading) return <p aria-hidden="true">&nbsp;</p>;
  if (state?.trialActive) {
    const days = state.trialDaysRemaining;
    return (
      <p className="truncate ui-text-meta text-[var(--color-cloud)]">
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
      <p className="truncate ui-text-meta ui-color-muted">
        {t({
          id: "settings.account.trial.text_ended_on",
          message: "Your trial ended on",
        })}{" "}
        {endedAt}
      </p>
    );
  }
  return (
    <p className="truncate ui-text-meta ui-color-muted">
      {t({
        id: "settings.account.trial.text_ended",
        message: "Your trial has ended",
      })}
    </p>
  );
};

const DeactivationControls = ({
  confirming,
  pending,
  onConfirm,
  onCancel,
}: {
  confirming: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const { t } = useLingui();
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 ui-text-button-sm ui-color-muted transition-colors hover:bg-surface-elevated hover:text-content-primary disabled:opacity-50"
      >
        {pending ? (
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
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="h-8 rounded-md px-2 ui-text-button-sm ui-color-muted hover:bg-surface-elevated disabled:opacity-50"
      >
        {t({
          id: "settings.account.action.deactivate_cancel",
          message: "Cancel",
        })}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 ui-text-button-sm ui-color-error hover:bg-error/10 disabled:opacity-50"
      >
        {pending ? (
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
};

const ActivationForm = ({
  value,
  onChange,
  onSubmit,
  pending,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  pending: boolean;
  error: string | null;
}) => {
  const { t } = useLingui();
  return (
    <section className="mx-auto max-w-[400px] border-t border-border-primary pt-5">
      <h2 className="ui-text-label-strong ui-color-primary">
        {t({
          id: "settings.account.section.activate",
          message: "Paste your license below",
        })}
      </h2>
      <form
        onSubmit={onSubmit}
        className="mt-3 flex items-center gap-2 border-b border-border-secondary transition-colors focus-within:border-content-primary"
      >
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t({
            id: "settings.account.activate.placeholder",
            message: "LOOPER_…",
          })}
          aria-label={t({
            id: "settings.account.activate.input_aria",
            message: "License key",
          })}
          className="min-w-0 flex-1 bg-transparent px-0.5 py-2 font-mono ui-text-body-sm ui-color-primary placeholder-content-disabled outline-none"
        />
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="inline-flex h-7 items-center gap-1 px-1 ui-text-button-sm ui-color-secondary transition-colors hover:text-content-primary disabled:opacity-40"
        >
          {pending && <Loader2 size={12} className="animate-spin" />}
          {t({ id: "settings.account.activate.submit", message: "Activate" })}
          {!pending && <ArrowRight size={12} aria-hidden="true" />}
        </button>
      </form>
      {error && <p className="mt-2 ui-text-meta text-error">{error}</p>}
    </section>
  );
};

const AccountErrors = ({ errors }: { errors: Array<string | null> }) => {
  const visibleErrors = errors.filter((error): error is string =>
    Boolean(error),
  );
  if (!visibleErrors.length) return null;
  return (
    <div className="mx-auto w-full max-w-[400px] space-y-1" role="alert">
      {visibleErrors.map((error) => (
        <p key={error} className="ui-text-meta text-error">
          {error}
        </p>
      ))}
    </div>
  );
};

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
