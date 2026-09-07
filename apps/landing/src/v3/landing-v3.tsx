import { useState, type CSSProperties } from "react";
import { ComparisonV2 } from "../v2/comparison-v2";
import { MobilePreview, DownloadSection, FrequentlyAsked } from "./launch-sections";
import { LocalChoice } from "./local-choice";
import { FeatureStudio } from "./feature-studio";
import { DesktopPreview } from "./desktop-preview";
import { WordMachine } from "./word-machine";
import { revealWhenVisible } from "./reveal";

const releases = "https://github.com/jamescardona11/looper/releases";

function restoreHashAnchor(node: HTMLDivElement | null) {
  if (!node) return;
  const target = node.ownerDocument.getElementById(window.location.hash.slice(1));
  if (target && node.contains(target))
    target.scrollIntoView({ behavior: "instant", block: "start" });
}

export function LandingV3() {
  const [dark, setDark] = useState(false);
  const [motion, setMotion] = useState(true);
  return (
    <div
      className={`v3-page ${dark ? "dark" : "light"}`}
      data-motion={motion ? "on" : "off"}
      id="top"
      ref={restoreHashAnchor}
    >
      <a className="v3-skip" href="#main">
        Skip to content
      </a>
      <header className="v3-header v3-wrap">
        <a className="v3-logo" href="#top" aria-label="Looper home">
          looper<span aria-hidden="true">✳</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#demo">Play a little</a>
          <a href="#features">Explore</a>
          <a href="#mobile">
            On the go <span>soon</span>
          </a>
        </nav>
        <div className="v3-header-actions">
          <button
            className="v3-icon-button"
            type="button"
            aria-label={motion ? "Pause animations" : "Enable animations"}
            aria-pressed={!motion}
            onClick={() => setMotion(!motion)}
          >
            {motion ? "Ⅱ" : "▷"}
          </button>
          <button
            className="v3-icon-button"
            type="button"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={() => setDark(!dark)}
          >
            {dark ? "☼" : "◐"}
          </button>
          <a className="v3-button v3-button-small" href="#download">
            Get Looper <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
      <main id="main">
        <section className="v3-hero v3-wrap" aria-labelledby="hero-title">
          <div className="v3-hero-copy">
            <p className="v3-eyebrow">
              <span className="v3-status-dot" /> A LITTLE LESS TYPING. A LOT MORE YOU.
            </p>
            <h1 id="hero-title">
              Let it
              <br />
              <em>all out.</em>
            </h1>
            <p className="v3-hero-description">
              Turn the thoughts in your head into words, notes and your next big thing.
            </p>
            <a className="v3-button" href="#download">
              Get Looper <span aria-hidden="true">↗</span>
            </a>
            <p className="v3-platforms">macOS & Windows · Free for now</p>
          </div>
          <div className="v3-voice-world">
            <div className="v3-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="v3-thought v3-thought-one" aria-hidden="true">
              wait, I have an idea…
            </div>
            <div className="v3-thought v3-thought-two" aria-hidden="true">
              less <s>ummm</s>
            </div>
            <a className="v3-voice-puck" href="#demo" aria-label="Try the dictation demo">
              <div className="v3-puck-wave" aria-hidden="true">
                {[28, 48, 76, 100, 64, 88, 42].map((height, i) => (
                  <i key={height} style={{ "--height": `${height}%`, "--i": i } as CSSProperties} />
                ))}
              </div>
              <span>
                LET’S HEAR IT <b aria-hidden="true">↗</b>
              </span>
            </a>
            <div className="v3-thought v3-thought-three" aria-hidden="true">
              <span>YOUR NEXT BIG THING</span>starts with a little thought. <b>↗</b>
            </div>
            <p className="v3-orbit-caption">YOUR VOICE. A LITTLE MORE POSSIBILITY.</p>
          </div>
          <div className="v3-hero-bottom">
            <a className="v3-shortcut-intro" href="#demo">
              <kbd>fn</kbd>
              <span>
                Hold. Speak. Release.<small>On Mac · Your shortcut, your flow.</small>
              </span>
            </a>
            <a href="#demo">
              Take it for a spin <span aria-hidden="true">↓</span>
            </a>
          </div>
        </section>
        <div className="v3-ticker" aria-hidden="true">
          <div>
            {[0, 1].map((copy) => (
              <span key={copy}>
                THINK OUT LOUD <b>✳</b> FIND YOUR WORDS <b>✳</b> MAKE SOME ROOM <b>✳</b>{" "}
              </span>
            ))}
          </div>
        </div>
        <WordMachine />
        <DesktopPreview />
        <FeatureStudio />
        <section className="v3-memory v3-wrap" aria-labelledby="memory-title">
          <h2 id="memory-title" ref={revealWhenVisible}>
            Be in the room.
            <br />
            <em>Keep the good bits.</em>
          </h2>
          <div className="v3-memory-content">
            <p>
              Stay with the conversation. Looper captures your meeting without sending a bot, so you
              can come back to what mattered.
            </p>
            <dl>
              <div>
                <dt>Record or import.</dt>
                <dd>Capture a conversation or bring an audio file you already have.</dd>
              </div>
              <div>
                <dt>Find the thread.</dt>
                <dd>Keep recordings, transcripts and editable notes together.</dd>
              </div>
              <div>
                <dt>Ask, don’t dig.</dt>
                <dd>
                  Ask questions about saved transcripts and turn a conversation into a next step.
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <MobilePreview />
        <LocalChoice />
        <ComparisonV2 />
        <DownloadSection />
        <FrequentlyAsked />
      </main>
      <footer className="v3-footer v3-wrap">
        <div className="v3-footer-top">
          <p>
            A little less between
            <br />
            you and your ideas.
          </p>
          <nav aria-label="Footer navigation">
            <a href="https://github.com/jamescardona11/looper">GitHub ↗</a>
            <a href={releases}>Releases ↗</a>
            <a href="/">V1</a>
            <a href="/v2/">V2</a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
        <a href="#top" className="v3-footer-word" aria-label="Looper, back to top">
          looper<span aria-hidden="true">↗</span>
        </a>
      </footer>
    </div>
  );
}
