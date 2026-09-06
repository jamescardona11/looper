import { useState, type CSSProperties } from "react";
import { revealWhenVisible } from "./reveal";

const examples = [
  {
    label: "The message",
    raw: "hey um I had an idea for the launch let's give the demo more room and keep the first screen simple",
    clean:
      "Hey, I had an idea for the launch. Let’s give the demo more room and keep the first screen simple.",
    tag: "A thought, ready to share.",
  },
  {
    label: "The email",
    raw: "hi Maya thanks for the walkthrough earlier uh could you send the design files when you get a chance thanks",
    clean:
      "Hi Maya,\n\nThanks for the walkthrough earlier. Could you send the design files when you get a chance?\n\nThanks!",
    tag: "The email, already written.",
  },
  {
    label: "La idea",
    raw: "bueno eh una idea para mañana podemos enviar la agenda antes y dejar diez minutos para preguntas",
    clean: "Una idea para mañana: enviar la agenda antes y dejar diez minutos para preguntas.",
    tag: "Tus ideas, con tus palabras.",
  },
] as const;

const waveHeights = Array.from({ length: 35 }, (_, i) => 16 + Math.abs(Math.sin(i * 1.3)) * 72);

export function WordMachine() {
  const [selected, setSelected] = useState(0);
  const [replay, setReplay] = useState(0);
  const [original, setOriginal] = useState(false);
  const example = examples[selected] ?? examples[0];
  return (
    <section
      className="v3-machine v3-wrap"
      id="demo"
      aria-labelledby="machine-title"
      ref={revealWhenVisible}
    >
      <div className="v3-machine-heading">
        <span className="v3-eyebrow">THE WORD PLAYGROUND</span>
        <h2 id="machine-title">
          A little messy in.
          <br />
          <em>A little magic out.</em>
        </h2>
        <p>Try a thought. See what a little cleanup can do.</p>
      </div>
      <fieldset className="v3-switch">
        <legend className="sr-only">Choose a dictation example</legend>
        {examples.map((item, index) => (
          <button
            type="button"
            key={item.label}
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              setOriginal(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
      <div className="v3-machine-stage" key={`${selected}-${replay}`}>
        <div className="v3-raw">
          <span className="v3-micro">YOUR THOUGHT, UNFILTERED</span>
          <p lang={selected === 2 ? "es" : "en"}>“{example.raw}”</p>
          <div className="v3-wave" aria-hidden="true">
            {waveHeights.map((height, i) => (
              <i
                key={height}
                style={
                  {
                    "--i": i,
                    "--height": `${height}%`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
        <span className="v3-transform-arrow" aria-hidden="true">
          ↗
        </span>
        <div className="v3-clean">
          <span className="v3-micro">{original ? "THE ORIGINAL" : "YOUR WORDS, READY"}</span>
          <p
            className="v3-output"
            lang={selected === 2 ? "es" : "en"}
            aria-live="polite"
            aria-atomic="true"
          >
            {original ? example.raw : <span className="v3-output-text">{example.clean}</span>}
          </p>
          <span className="v3-result-note">{example.tag}</span>
        </div>
      </div>
      <div className="v3-demo-controls">
        <p>Illustrative examples. No microphone or AI connection.</p>
        <div>
          <button
            type="button"
            onClick={() => {
              setReplay(replay + 1);
              setOriginal(false);
            }}
          >
            Replay transformation <span aria-hidden="true">↻</span>
          </button>
          <button type="button" aria-pressed={original} onClick={() => setOriginal(!original)}>
            {original ? "Show cleaned text" : "See original"}
          </button>
        </div>
      </div>
    </section>
  );
}
