import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { motion, type Variants } from "framer-motion";
import LanguageModelPanel from "../LanguageModelPanel";
import MeetingIntelligencePanel from "../MeetingIntelligencePanel";
import SpeechModelPanel from "../SpeechModelPanel";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import type {
  LlmProvider,
  MeetingAiProvider,
  RemoteSpeechProvider,
} from "../../../../types";

export type WritingProviderSettings = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  provider: LlmProvider;
  setProvider: (value: LlmProvider) => void;
  endpoint: string;
  setEndpoint: (value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  availableModels: string[];
  fetchAvailableModels: () => void;
};

export type SpeechProviderSettings = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  provider: RemoteSpeechProvider;
  setProvider: (value: RemoteSpeechProvider) => void;
  endpoint: string;
  setEndpoint: (value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  availableModels: string[];
  fetchAvailableModels: () => void;
};

export type MeetingProviderSettings = {
  provider: MeetingAiProvider;
  setProvider: (value: MeetingAiProvider) => void;
  model: string;
  setModel: (value: string) => void;
};

type ProvidersTabProps = {
  variants: Variants;
  meeting: MeetingProviderSettings;
  speech: SpeechProviderSettings;
  writing: WritingProviderSettings;
};

const ProvidersTab = ({
  variants,
  meeting,
  speech,
  writing,
}: ProvidersTabProps) => {
  const { t } = useLingui();
  return (
    <motion.div
      key="providers"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col gap-6"
    >
      <MeetingIntelligencePanel
        provider={meeting.provider}
        setProvider={meeting.setProvider}
        model={meeting.model}
        setModel={meeting.setModel}
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ProviderColumn
          label={t({
            id: "settings.providers.speech_label",
            message: "Speech",
          })}
        >
          <SpeechModelPanel
            enabled={speech.enabled}
            setEnabled={speech.setEnabled}
            provider={speech.provider}
            setProvider={speech.setProvider}
            endpoint={speech.endpoint}
            setEndpoint={speech.setEndpoint}
            apiKey={speech.apiKey}
            setApiKey={speech.setApiKey}
            model={speech.model}
            setModel={speech.setModel}
            availableModels={speech.availableModels}
            fetchAvailableModels={speech.fetchAvailableModels}
          />
        </ProviderColumn>

        <ProviderColumn
          label={t({
            id: "settings.providers.language_label",
            message: "Language",
          })}
        >
          <LanguageModelPanel
            llmEnabled={writing.enabled}
            setLlmEnabled={writing.setEnabled}
            llmProvider={writing.provider}
            setLlmProvider={writing.setProvider}
            llmEndpoint={writing.endpoint}
            setLlmEndpoint={writing.setEndpoint}
            llmApiKey={writing.apiKey}
            setLlmApiKey={writing.setApiKey}
            llmModel={writing.model}
            setLlmModel={writing.setModel}
            availableModels={writing.availableModels}
            fetchAvailableModels={writing.fetchAvailableModels}
          />
        </ProviderColumn>
      </div>
    </motion.div>
  );
};

const ProviderColumn = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <section className="space-y-2">
    <SectionLabel>{label}</SectionLabel>
    {children}
  </section>
);

export default ProvidersTab;
