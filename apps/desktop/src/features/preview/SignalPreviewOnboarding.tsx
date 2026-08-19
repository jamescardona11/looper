import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Cloud,
  DownloadSimple,
  Keyboard,
  LockSimple,
  Microphone,
  ShieldCheck,
  VideoCamera,
  Waveform,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { LooperLogo } from "../../shared/ui/LooperLogo";
import "./signal-preview-onboarding.css";

type ProcessingMode = "local" | "cloud";

const steps = [
  "Welcome",
  "Your workflow",
  "Processing",
  "Local model",
  "Permissions",
  "Calendar",
  "Ready",
] as const;

const screenMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.24, ease: "easeOut" as const },
};

function ScreenCopy({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: ReactNode;
  detail: string;
}) {
  return (
    <div className="onboarding-preview-copy">
      <p className="onboarding-preview-eyebrow">{eyebrow}</p>
      <h1 className="onboarding-preview-title">{title}</h1>
      <p className="onboarding-preview-detail">{detail}</p>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="onboarding-preview-primary"
      onClick={onClick}
    >
      {children}
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

function ChoiceCard({
  active,
  icon,
  title,
  body,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="onboarding-preview-choice"
      data-active={active}
      onClick={onClick}
    >
      <span className="onboarding-preview-choice-icon">{icon}</span>
      <span className="onboarding-preview-choice-content">
        <span className="onboarding-preview-choice-title">{title}</span>
        <span className="onboarding-preview-choice-body">{body}</span>
      </span>
      {active ? <CheckCircle size={19} weight="fill" /> : null}
    </button>
  );
}

function PermissionRow({
  granted,
  icon,
  title,
  detail,
  action,
  onClick,
}: {
  granted: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="onboarding-preview-permission">
      <span className="onboarding-preview-permission-icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="onboarding-preview-permission-title">{title}</span>
        <span className="onboarding-preview-permission-detail">{detail}</span>
      </span>
      <button
        type="button"
        className="onboarding-preview-permission-action"
        data-granted={granted}
        onClick={onClick}
      >
        {granted ? <CheckCircle size={14} weight="fill" /> : null}
        {granted ? "Granted" : action}
      </button>
    </div>
  );
}

function WorkflowArtifact() {
  const waveform = [12, 20, 30, 18, 38, 23, 15, 31, 19, 10, 27];
  return (
    <div className="onboarding-preview-artifact" aria-hidden="true">
      <div className="onboarding-preview-artifact-glow" />
      <div className="onboarding-preview-voice-chip">
        <Waveform size={15} weight="bold" />
        <span>Listening</span>
        <span className="onboarding-preview-pulse" />
      </div>
      <article className="onboarding-preview-dictation">
        <div className="flex items-center justify-between">
          <span className="onboarding-preview-artifact-label">DICTATION</span>
          <span className="font-mono ui-text-micro text-content-disabled">
            00:08
          </span>
        </div>
        <p>“Move the review to Friday and invite Ana.”</p>
        <div className="onboarding-preview-waveform">
          {waveform.map((height, index) => (
            <span key={index} style={{ height }} />
          ))}
        </div>
      </article>
      <article className="onboarding-preview-meeting">
        <div className="flex items-center gap-2">
          <span className="onboarding-preview-meeting-mark">
            <VideoCamera size={14} weight="fill" />
          </span>
          <span className="onboarding-preview-artifact-label">MEETING</span>
        </div>
        <p>Product review · starts in 12 min</p>
        <span>Local context ready</span>
      </article>
    </div>
  );
}

export default function SignalPreviewOnboarding() {
  const [index, setIndex] = useState(0);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("local");
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [accessibilityGranted, setAccessibilityGranted] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [calendarGranted, setCalendarGranted] = useState(false);

  const goNext = () =>
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  const goBack = () => setIndex((current) => Math.max(current - 1, 0));
  const nextFromProcessing = () => setIndex(processingMode === "cloud" ? 4 : 3);

  const screen = (() => {
    switch (index) {
      case 0:
        return (
          <div className="onboarding-preview-welcome">
            <div>
              <ScreenCopy
                eyebrow="YOUR VOICE, IN CONTEXT"
                title={
                  <>
                    Dictate anywhere.
                    <br />
                    Keep meetings moving.
                  </>
                }
                detail="Looper turns short thoughts into text and keeps the next meeting within reach—without making either workflow feel like a second app."
              />
              <PrimaryButton onClick={goNext}>See how it works</PrimaryButton>
            </div>
            <WorkflowArtifact />
          </div>
        );
      case 1:
        return (
          <div className="onboarding-preview-single">
            <ScreenCopy
              eyebrow="TWO WORKFLOWS, ONE VOICE LAYER"
              title="Capture the thought. Keep the conversation."
              detail="Dictation inserts your words into any app. Meetings surface relevant context and keep summaries private. Both are ready when you need them."
            />
            <div className="onboarding-preview-workflows">
              <div>
                <span className="onboarding-preview-workflow-icon">
                  <Keyboard size={19} />
                </span>
                <h2>Dictation, anywhere</h2>
                <p>
                  Hold your shortcut, speak naturally, and Looper inserts the
                  result at your cursor.
                </p>
              </div>
              <div>
                <span className="onboarding-preview-workflow-icon">
                  <VideoCamera size={19} />
                </span>
                <h2>Meetings, in context</h2>
                <p>
                  See what is next, capture when you choose, and summarize with
                  the provider you trust.
                </p>
              </div>
            </div>
            <PrimaryButton onClick={goNext}>Set up Looper</PrimaryButton>
          </div>
        );
      case 2:
        return (
          <div className="onboarding-preview-single">
            <ScreenCopy
              eyebrow="WHERE YOUR VOICE IS PROCESSED"
              title="Choose the path your voice takes."
              detail="This controls dictation. Meeting intelligence is configured separately and stays optional."
            />
            <div className="onboarding-preview-choice-list" role="radiogroup">
              <ChoiceCard
                active={processingMode === "local"}
                icon={<LockSimple size={20} weight="duotone" />}
                title="Local on this Mac"
                body="Private and offline after one model download."
                onClick={() => setProcessingMode("local")}
              />
              <ChoiceCard
                active={processingMode === "cloud"}
                icon={<Cloud size={20} weight="duotone" />}
                title="Looper Cloud"
                body="Ready immediately; audio is securely sent for transcription."
                onClick={() => setProcessingMode("cloud")}
              />
            </div>
            <PrimaryButton onClick={nextFromProcessing}>Continue</PrimaryButton>
          </div>
        );
      case 3:
        return (
          <div className="onboarding-preview-single">
            <ScreenCopy
              eyebrow="LOCAL DICTATION MODEL"
              title="Make voice private by default."
              detail="Parakeet runs on this Mac. Its download is visible, pausable, and never blocks the rest of setup."
            />
            <div className="onboarding-preview-model">
              <div className="onboarding-preview-model-mark">
                <Waveform size={23} weight="bold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2>Parakeet TDT</h2>
                    <p>Balanced · English, Spanish, Portuguese</p>
                  </div>
                  <span className="onboarding-preview-size">596 MB</span>
                </div>
                <div
                  className="onboarding-preview-model-status"
                  data-ready={modelDownloaded}
                >
                  {modelDownloaded ? (
                    <CheckCircle size={14} weight="fill" />
                  ) : (
                    <DownloadSimple size={14} />
                  )}
                  {modelDownloaded
                    ? "Ready on this Mac"
                    : "Download required for local dictation"}
                </div>
              </div>
            </div>
            <div className="onboarding-preview-inline-actions">
              <button
                type="button"
                className="onboarding-preview-secondary"
                onClick={() => setModelDownloaded(true)}
              >
                {modelDownloaded ? "Downloaded" : "Download model"}
              </button>
              <PrimaryButton onClick={goNext}>Continue</PrimaryButton>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="onboarding-preview-single">
            <ScreenCopy
              eyebrow="PERMISSIONS"
              title="Let Looper hear you and type for you."
              detail="These are native system permissions. Looper only starts recording when you invoke it."
            />
            <div className="onboarding-preview-permissions">
              <PermissionRow
                granted={microphoneGranted}
                icon={<Microphone size={19} weight="duotone" />}
                title="Microphone"
                detail="Lets Looper hear a dictation or a meeting you choose to capture."
                action="Allow"
                onClick={() => setMicrophoneGranted(true)}
              />
              <PermissionRow
                granted={accessibilityGranted}
                icon={<Keyboard size={19} weight="duotone" />}
                title="Accessibility"
                detail="Lets Looper insert your final text into the app where your cursor is waiting."
                action="Allow"
                onClick={() => setAccessibilityGranted(true)}
              />
            </div>
            <PrimaryButton onClick={goNext}>Continue</PrimaryButton>
          </div>
        );
      case 5:
        return (
          <div className="onboarding-preview-single">
            <ScreenCopy
              eyebrow="OPTIONAL MEETING CONTEXT"
              title="Let your calendar stay local."
              detail="On macOS, Looper can read local events with Meet, Zoom, Teams, or Webex links to show a heads-up. It never joins or records a meeting automatically."
            />
            <div className="onboarding-preview-calendar">
              <span className="onboarding-preview-calendar-icon">
                <CalendarBlank size={22} weight="duotone" />
              </span>
              <div className="min-w-0 flex-1">
                <h2>Calendar meeting awareness</h2>
                <p>Show upcoming meetings in the Signal Rail.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={calendarEnabled}
                className="onboarding-preview-switch"
                data-checked={calendarEnabled}
                onClick={() => setCalendarEnabled((enabled) => !enabled)}
              >
                <span />
              </button>
            </div>
            {calendarEnabled ? (
              <button
                type="button"
                className="onboarding-preview-calendar-access"
                onClick={() => setCalendarGranted(true)}
              >
                <ShieldCheck size={17} weight="duotone" />
                {calendarGranted
                  ? "Calendar access granted"
                  : "Allow local Calendar access"}
                {calendarGranted ? (
                  <CheckCircle size={15} weight="fill" />
                ) : (
                  <ArrowRight size={15} />
                )}
              </button>
            ) : null}
            <PrimaryButton onClick={goNext}>Continue</PrimaryButton>
          </div>
        );
      default:
        return (
          <div className="onboarding-preview-ready">
            <span className="onboarding-preview-ready-mark">
              <CheckCircle size={34} weight="fill" />
            </span>
            <ScreenCopy
              eyebrow="THE SIGNAL IS READY"
              title="Your voice has a place to land."
              detail="Use Fn in any app to dictate. Meetings stay contextual, private, and always under your control."
            />
            <div className="onboarding-preview-summary">
              <span>
                <Keyboard size={16} /> Dictation <kbd>Fn</kbd>
              </span>
              <span>
                <VideoCamera size={16} /> Meetings{" "}
                {calendarEnabled && calendarGranted
                  ? "with calendar context"
                  : "available on demand"}
              </span>
              <span>
                <LockSimple size={16} />{" "}
                {processingMode === "local"
                  ? "Local processing"
                  : "Looper Cloud"}
              </span>
            </div>
            <PrimaryButton onClick={() => setIndex(0)}>
              Replay prototype
            </PrimaryButton>
          </div>
        );
    }
  })();

  return (
    <div className="onboarding-preview">
      <div aria-hidden="true" className="onboarding-preview-field" />
      <header className="onboarding-preview-topbar">
        <div className="flex items-center gap-2.5">
          <span className="onboarding-preview-logo">
            <LooperLogo size="sm" />
          </span>
          <span className="font-satoshi text-[15px] font-bold tracking-[-0.04em] text-content-primary">
            Looper
          </span>
          <span className="onboarding-preview-prototype">Prototype</span>
        </div>
        <p className="font-mono ui-text-micro text-content-disabled">
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(steps.length).padStart(2, "0")}
        </p>
      </header>
      <main className="onboarding-preview-main">
        <div className="onboarding-preview-progress" aria-hidden="true">
          {steps.map((step, stepIndex) => (
            <span
              key={step}
              className={stepIndex <= index ? "is-complete" : undefined}
            />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.section key={steps[index]} {...screenMotion}>
            {screen}
          </motion.section>
        </AnimatePresence>
      </main>
      <footer className="onboarding-preview-footer">
        {index > 0 ? (
          <button
            type="button"
            className="onboarding-preview-back"
            onClick={goBack}
          >
            <ArrowLeft size={15} aria-hidden="true" /> Back
          </button>
        ) : (
          <span />
        )}
        <span className="ui-text-micro text-content-disabled">
          You can change these choices later.
        </span>
      </footer>
    </div>
  );
}
