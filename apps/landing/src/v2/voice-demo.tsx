import { useState } from "react";
import { WaveformMark } from "./waveform-mark";

const examples = [
  {
    id: "message",
    label: "A message",
    destination: "Team chat",
    title: "A little more human.",
    raw: "hey um I had another thought about the homepage, let's give the demo more room and move the details further down, no rush though we can look at it tomorrow",
    clean:
      "Hey, I had another thought about the homepage. Let’s give the demo more room and move the details further down. No rush — we can look at it tomorrow.",
    duration: "00:12",
  },
  {
    id: "email",
    label: "An email",
    destination: "Email draft",
    title: "The email, already written.",
    raw: "hi Maya thanks for walking me through the project earlier um could you send over the timeline and the design files when you get a chance thanks",
    clean:
      "Hi Maya,\n\nThanks for walking me through the project earlier. Could you send over the timeline and design files when you get a chance?\n\nThanks!",
    duration: "00:11",
  },
  {
    id: "note",
    label: "A quick note",
    destination: "Personal notes",
    title: "Catch it before it goes.",
    raw: "okay idea for next week um try a shorter planning meeting, send the agenda the day before and leave the last ten minutes for questions",
    clean:
      "Idea for next week:\n\nTry a shorter planning meeting. Send the agenda the day before and leave the last ten minutes for questions.",
    duration: "00:10",
  },
] as const;

const waveform = Array.from({ length: 57 }, (_, index) => ({
  id: `bar-${index}`,
  height: 12 + Math.abs(Math.sin(index * 0.72) * Math.cos(index * 0.19)) * 78,
}));

export function VoiceDemo() {
  const [selectedId, setSelectedId] = useState<(typeof examples)[number]["id"]>("message");
  const [showOriginal, setShowOriginal] = useState(false);
  const example = examples.find(({ id }) => id === selectedId) ?? examples[0];

  return (
    <section className="v2-demo" id="demo" aria-label="Interactive voice-to-text example">
      <div className="v2-demo-toolbar">
        <span className="v2-label">
          <span className="v2-status-dot" /> THE VOICE → TEXT STUDIO
        </span>
        <fieldset className="v2-example-picker">
          <legend className="sr-only">Choose an example</legend>
          {examples.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={selectedId === id}
              onClick={() => {
                setSelectedId(id);
                setShowOriginal(false);
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="v2-demo-body">
        <div className="v2-voice-input">
          <div className="v2-input-label">
            <span className="v2-label">01 / YOUR VOICE</span>
            <span className="v2-label">{example.duration}</span>
          </div>
          <div className="v2-waveform" aria-hidden="true">
            {waveform.map(({ id, height }) => (
              <span key={id} style={{ height: `${height}%` }} />
            ))}
          </div>
          <p key={example.id} className="v2-spoken">
            “{example.raw}”
          </p>
          <div className="v2-input-footer">
            <WaveformMark size={20} />
            <span>Start with a thought.</span>
            <kbd>fn</kbd>
          </div>
        </div>

        <div className="v2-text-output">
          <div className="v2-output-label">
            <span className="v2-label">02 / YOUR WORDS, READY</span>
            <span className="v2-destination">{example.destination}</span>
          </div>
          <div className="v2-result" aria-live="polite" aria-atomic="true">
            <h2>{example.title}</h2>
            <p key={`${example.id}-${showOriginal}`} className="v2-result-text">
              {showOriginal ? example.raw : example.clean}
            </p>
          </div>
          <div className="v2-output-footer">
            <span>
              <span aria-hidden="true">↳</span> Still sounds like you.
            </span>
            <button
              type="button"
              aria-pressed={showOriginal}
              onClick={() => setShowOriginal(!showOriginal)}
            >
              {showOriginal ? "Show cleaned text" : "See original"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </div>
      <p className="v2-demo-caption">
        <span>Interactive example · no microphone needed</span>
        <span>Your shortcut. Your app. Your flow.</span>
      </p>
    </section>
  );
}
