import { useState } from "react";
import { revealWhenVisible } from "./reveal";
export function LocalChoice() {
  const [local, setLocal] = useState(true);
  return (
    <section
      className="v3-local v3-wrap"
      id="local"
      aria-labelledby="local-title"
      ref={revealWhenVisible}
    >
      <div className="v3-local-copy">
        <span className="v3-eyebrow">YOUR SETUP. YOUR CALL.</span>
        <h2 id="local-title">
          A little more
          <br />
          <em>on your terms.</em>
        </h2>
        <p>
          Run transcription locally, or connect your own cloud provider. Choose where the work
          happens.
        </p>
        <a className="v3-text-link" href="https://github.com/jamescardona11/looper">
          Open source. Open to a look.
        </a>
      </div>
      <div className="v3-routing">
        <fieldset className="v3-switch">
          <legend className="sr-only">Explore transcription modes</legend>
          <button type="button" aria-pressed={local} onClick={() => setLocal(true)}>
            On your computer
          </button>
          <button type="button" aria-pressed={!local} onClick={() => setLocal(false)}>
            In the cloud
          </button>
        </fieldset>
        <div className="v3-route-drawing" key={String(local)} aria-hidden="true">
          <span className="v3-route-node">You</span>
          <span className="v3-route-line" />
          <span className="v3-route-node v3-route-destination">
            {local ? "Your Mac / PC" : "Your provider"}
          </span>
        </div>
        <div className="v3-route-description" aria-live="polite">
          <h3>{local ? "Your audio stays here." : "Your key. Your model."}</h3>
          <p>
            {local
              ? "With local transcription, audio is processed on your computer. Speed depends on your hardware and model."
              : "Connect a supported provider with your own API key. Audio or text is sent to that provider for the features you choose."}
          </p>
        </div>
        <small>Cloud AI features may still send text to your selected provider.</small>
      </div>
    </section>
  );
}
