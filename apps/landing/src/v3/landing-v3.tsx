import { type CSSProperties, useState } from "react";
import { ComparisonV2 } from "../v2/comparison-v2";
import { DesktopPreview } from "./desktop-preview";
import { FeatureStudio } from "./feature-studio";
import { DownloadSection, FrequentlyAsked, MobilePreview } from "./launch-sections";
import { LocalChoice } from "./local-choice";
import { revealWhenVisible } from "./reveal";
import { WordMachine } from "./word-machine";

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
          <a className="v3-github-link" href="https://github.com/jamescardona11/looper">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.303-5.467-1.334-5.467-5.931 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.524.118-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0 1 12 5.8c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.656 1.652.244 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.625-5.479 5.922.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.694.825.576C20.565 21.796 24 17.3 24 12c0-6.627-5.373-12-12-12Z" />
            </svg>
            GitHub
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
            Get Looper
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
              Get Looper
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
              <span>LET’S HEAR IT</span>
            </a>
            <div className="v3-thought v3-thought-three" aria-hidden="true">
              <span>YOUR NEXT BIG THING</span>starts with a little thought.
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
        <ComparisonV2 showLinkArrows={false} />
        <DownloadSection />
        <FrequentlyAsked />
      </main>
      <footer className="v3-footer v3-wrap">
        <div className="v3-footer-top">
          <div className="v3-footer-brand">
            <a href="#top" className="v3-footer-logo" aria-label="Looper, back to top">
              looper
            </a>
            <p>
              A little less between
              <br />
              you and your ideas.
            </p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="https://github.com/jamescardona11/looper">GitHub</a>
            <a href={releases}>Releases</a>
            <a href="/v1/">V1</a>
            <a href="/v2/">V2</a>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
