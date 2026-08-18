import { useLingui } from "@lingui/react/macro";
import { motion, type Variants } from "framer-motion";
import { useState } from "react";
import {
  ArrowRight,
  CircleNotch as Loader2,
  CloudCheck,
  SignOut as LogOut,
} from "@phosphor-icons/react";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import { useSyncSession } from "../useSyncSession";

type SyncTabProps = {
  variants: Variants;
};

// This is intentionally its own tab, separate from `account` (which is 100%
// about license/billing): "Account" already
// means "license" in this app's UI, so a visible Convex sign-in surface
// reuses neither that name nor its screen.
const SyncTab = ({ variants }: SyncTabProps) => {
  const { t } = useLingui();
  const session = useSyncSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    try {
      await session.requestOtp(trimmed);
      setStep("code");
    } catch {
      // error already surfaced via session.error
    }
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      await session.verifyOtp(email.trim(), trimmed);
      setCode("");
    } catch {
      // error already surfaced via session.error
    }
  };

  return (
    <motion.div
      key="sync"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="mx-auto max-w-[400px] space-y-6"
    >
      <div>
        <h2 className="ui-text-title-strong ui-color-primary">
          {t({ id: "settings.sync.title", message: "Sign in" })}
        </h2>
        <p className="mt-1 ui-text-body-sm ui-color-muted">
          {t({
            id: "settings.sync.subtitle",
            message:
              "Sign in to sync your dictionary, replacements and Smart Modes across devices. Sync works independently of your Local or Cloud transcription choice.",
          })}
        </p>
      </div>

      {!session.available ? (
        <p className="ui-text-body-sm ui-color-muted">
          {t({
            id: "settings.sync.unavailable",
            message: "Sync isn't available in this build.",
          })}
        </p>
      ) : session.auth.status === "authenticated" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border-secondary bg-surface-elevated px-3 py-2.5">
            <CloudCheck size={16} className="text-success" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate ui-text-body-sm ui-color-primary">
              {session.auth.email ??
                t({
                  id: "settings.sync.signed_in_no_email",
                  message: "Signed in",
                })}
            </span>
            <button
              type="button"
              onClick={() => void session.signOut()}
              disabled={session.pending}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 ui-text-button-sm ui-color-muted transition-colors hover:bg-surface-secondary hover:text-content-primary disabled:opacity-50"
            >
              {session.pending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <LogOut size={12} />
              )}
              {t({ id: "settings.sync.sign_out", message: "Sign out" })}
            </button>
          </div>

          <HistoryOptInToggle
            enabled={session.historyOptIn}
            onToggle={() => session.setHistoryOptIn(!session.historyOptIn)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {step === "email" ? (
            <form
              onSubmit={submitEmail}
              className="flex items-center gap-2 border-b border-border-secondary transition-colors focus-within:border-content-primary"
            >
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t({
                  id: "settings.sync.email_placeholder",
                  message: "you@example.com",
                })}
                aria-label={t({
                  id: "settings.sync.email_aria",
                  message: "Email address",
                })}
                className="min-w-0 flex-1 bg-transparent px-0.5 py-2 ui-text-body-sm ui-color-primary placeholder-content-disabled outline-none"
              />
              <button
                type="submit"
                disabled={session.pending || email.trim().length === 0}
                className="inline-flex h-7 items-center gap-1 px-1 ui-text-button-sm ui-color-secondary transition-colors hover:text-content-primary disabled:opacity-40"
              >
                {session.pending && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                {t({
                  id: "settings.sync.send_code",
                  message: "Sign in with email",
                })}
                {!session.pending && (
                  <ArrowRight size={12} aria-hidden="true" />
                )}
              </button>
            </form>
          ) : (
            <form
              onSubmit={submitCode}
              className="flex items-center gap-2 border-b border-border-secondary transition-colors focus-within:border-content-primary"
            >
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t({
                  id: "settings.sync.code_placeholder",
                  message: "8-digit code",
                })}
                aria-label={t({
                  id: "settings.sync.code_aria",
                  message: "Verification code",
                })}
                className="min-w-0 flex-1 bg-transparent px-0.5 py-2 font-mono ui-text-body-sm ui-color-primary placeholder-content-disabled outline-none"
              />
              <button
                type="submit"
                disabled={session.pending || code.trim().length === 0}
                className="inline-flex h-7 items-center gap-1 px-1 ui-text-button-sm ui-color-secondary transition-colors hover:text-content-primary disabled:opacity-40"
              >
                {session.pending && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                {t({ id: "settings.sync.verify_code", message: "Verify" })}
              </button>
            </form>
          )}

          {step === "code" && (
            <p className="ui-text-meta ui-color-muted">
              {t`We emailed a code to ${email.trim()}.`}
              <button
                type="button"
                onClick={() => setStep("email")}
                className="ml-1 underline hover:text-content-primary"
              >
                {t({
                  id: "settings.sync.change_email",
                  message: "Use a different email",
                })}
              </button>
            </p>
          )}

          {session.error && (
            <p className="ui-text-meta text-error">{session.error}</p>
          )}
        </div>
      )}
    </motion.div>
  );
};

const HistoryOptInToggle = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) => {
  const { t } = useLingui();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-primary pt-4">
      <div className="min-w-0">
        <p className="ui-text-label-strong ui-color-primary">
          {t({
            id: "settings.sync.history_opt_in.label",
            message: "Sync transcription history",
          })}
        </p>
        <p className="mt-0.5 ui-text-meta ui-color-muted">
          {t({
            id: "settings.sync.history_opt_in.description",
            message:
              "Uploads transcript text only, never audio. When you ask Looper Agent to recall past dictations, it may search this synced text. Cloud transcription uploads audio separately when selected. Off by default.",
          })}
        </p>
      </div>
      <ToggleSwitch
        enabled={enabled}
        onToggle={onToggle}
        ariaLabel={t({
          id: "settings.sync.history_opt_in.aria",
          message: "Sync transcription history",
        })}
      />
    </div>
  );
};

export default SyncTab;
