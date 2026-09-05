import { useRef } from "react";
import meetingPreview from "../../../../assets/product/desktop-note-detail.png";
import { WaveformMark } from "../components/ui/icons";
import { VoiceDemo } from "./voice-demo";

const repositoryUrl = "https://github.com/jamescardona11/looper";
const navLinks = [
  { href: "#demo", label: "Try the demo" },
  { href: "#meetings", label: "Meetings" },
  { href: "#local", label: "Your data" },
];
const mobileNavLinks = [...navLinks, { href: "#get-looper", label: "Get Looper" }];

function Header() {
  const menuRef = useRef<HTMLDetailsElement>(null);

  return (
    <header className="v2-header v2-container">
      <a className="v2-wordmark" href="#top">
        <WaveformMark size={28} />
        looper<span className="v2-edition">V.02</span>
      </a>
      <nav className="v2-desktop-nav" aria-label="Main navigation">
        {navLinks.map(({ href, label }) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
      <a className="v2-header-cta" href="#get-looper">
        Get Looper <span aria-hidden="true">↗</span>
      </a>
      <details ref={menuRef} className="v2-mobile-menu">
        <summary aria-label="Open navigation">
          <span />
          <span />
        </summary>
        <nav aria-label="Mobile navigation">
          {mobileNavLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => {
                if (menuRef.current) menuRef.current.open = false;
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </details>
    </header>
  );
}

export function LandingV2() {
  return (
    <div className="v2-page">
      <a className="v2-skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <section className="v2-hero v2-container" id="top" aria-labelledby="v2-title">
          <div className="v2-hero-kicker">
            <span className="v2-label">A LITTLE LESS BETWEEN YOU AND YOUR WORDS</span>
            <span className="v2-label v2-hero-index">VOICE TOOLKIT / 001</span>
          </div>
          <div className="v2-hero-copy">
            <h1 id="v2-title">
              Less typing.
              <br />
              More <span>you.</span>
              <span className="v2-title-signal" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
            </h1>
            <div className="v2-hero-aside">
              <p>
                Speak your mind. Looper turns it into text in your apps and notes you can come back
                to.
              </p>
              <a className="v2-button" href="#demo">
                Give it a spin <span aria-hidden="true">↗</span>
              </a>
              <span className="v2-hero-note">Local transcription. Your choice of cloud.</span>
            </div>
          </div>
          <VoiceDemo />
          <div className="v2-compatibility">
            <span>AT HOME ON YOUR DESKTOP</span>
            <p>
              macOS <span>/</span> Windows <span>/</span> Linux
            </p>
            <span>BUILT AROUND THE WAY YOU WORK</span>
          </div>
        </section>

        <section className="v2-workflow v2-container" aria-labelledby="workflow-title">
          <div className="v2-section-heading">
            <span className="v2-label">01 — FIND YOUR FLOW</span>
            <h2 id="workflow-title">
              A thought shouldn’t
              <br />
              need a new tab.
            </h2>
            <p>
              An email. A message. That idea you don’t want to lose. Keep your cursor where it is.
            </p>
          </div>
          <ol className="v2-steps">
            <li>
              <span className="v2-step-number">01</span>
              <div className="v2-key-art" aria-hidden="true">
                <span>fn</span>
              </div>
              <h3>Hold a key.</h3>
              <p>Your shortcut brings Looper to the app you’re already in.</p>
            </li>
            <li>
              <span className="v2-step-number">02</span>
              <div className="v2-speech-art" aria-hidden="true">
                <WaveformMark size={32} />
                <span>Actually, here’s the idea…</span>
              </div>
              <h3>Say it your way.</h3>
              <p>Think out loud. Your dictionary and voice profile keep the words familiar.</p>
            </li>
            <li>
              <span className="v2-step-number">03</span>
              <div className="v2-insert-art" aria-hidden="true">
                <span>Here’s the idea.</span>
                <i />
              </div>
              <h3>Let it land.</h3>
              <p>Release to insert your text. The original stays in your history.</p>
            </li>
          </ol>
        </section>

        <section
          className="v2-meetings v2-container"
          id="meetings"
          aria-labelledby="meetings-title"
        >
          <div className="v2-meeting-copy">
            <span className="v2-label">02 — STAY IN THE CONVERSATION</span>
            <h2 id="meetings-title">
              Be there.
              <br />
              <span>Keep the details.</span>
            </h2>
            <p>
              Record the meeting from your computer. Come back to the transcript, decisions and the
              moment someone said the important thing.
            </p>
            <a className="v2-text-link" href="#source">
              Every note has a source <span aria-hidden="true">↘</span>
            </a>
            <div className="v2-meeting-detail">
              <span className="v2-status-dot" /> Your audio. No extra meeting guest.
            </div>
          </div>
          <figure className="v2-meeting-figure">
            <div className="v2-preview-label">
              <span className="v2-label">THE MEETING NOTE</span>
              <span aria-hidden="true">↗</span>
            </div>
            <img
              src={meetingPreview}
              width="1350"
              height="858"
              loading="lazy"
              alt="Looper meeting note design showing original audio, decisions, moments and transcript."
            />
            <figcaption>Product design preview · example meeting</figcaption>
          </figure>
        </section>

        <section
          className="v2-details v2-container"
          id="source"
          aria-label="Your words and your source"
        >
          <article className="v2-source-card">
            <span className="v2-label">KEEP THE ORIGINAL</span>
            <h3>
              Polished words.
              <br />
              Nothing lost.
            </h3>
            <p>Cleanup is an edit you can undo. Your original words and recording stay close.</p>
            <div className="v2-source-example">
              <span>WHAT YOU SAID</span>
              <p>“so, um, let’s try it on Monday”</p>
              <div aria-hidden="true">↓</div>
              <span>READY TO SEND</span>
              <p>Let’s try it on Monday.</p>
            </div>
          </article>
          <article className="v2-dictionary-card">
            <span className="v2-label">MAKE IT SOUND LIKE YOU</span>
            <h3>
              Your vocabulary.
              <br />
              Not a best guess.
            </h3>
            <p>
              Names, shorthand, the words you use every day. Give them a place in your dictionary.
            </p>
            <div className="v2-dictionary-example">
              <div>
                <span>Looper</span>
                <span>Product name</span>
              </div>
              <div>
                <span>Figma</span>
                <span>Tool</span>
              </div>
              <div>
                <span>María</span>
                <span>First name</span>
              </div>
            </div>
          </article>
        </section>

        <section className="v2-local v2-container" id="local" aria-labelledby="local-title">
          <div className="v2-local-device" aria-hidden="true">
            <div className="v2-device-top">
              <WaveformMark size={24} />
              <span>LOCAL ENGINE</span>
              <i />
            </div>
            <div className="v2-chip">
              <span>looper</span>
              <span>ON YOUR MACHINE</span>
            </div>
            <div className="v2-device-bottom">
              <span>SPEECH → TEXT</span>
              <span>NETWORK NOT REQUIRED*</span>
            </div>
          </div>
          <div className="v2-local-copy">
            <span className="v2-label">03 — KNOW WHERE IT GOES</span>
            <h2 id="local-title">
              Your voice.
              <br />
              Your machine.
              <br />
              <span>Your call.</span>
            </h2>
            <p>
              Choose a local speech model to transcribe on your computer. Prefer a cloud provider?
              That’s a choice you make.
            </p>
            <p className="v2-local-note">
              * Local transcription works offline after the model is downloaded. Cloud
              transcription, cloud cleanup and sync use online services when enabled.
            </p>
            <a className="v2-text-link" href={repositoryUrl}>
              Look under the hood <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>

        <section
          className="v2-closing v2-container"
          id="get-looper"
          aria-labelledby="closing-title"
        >
          <div>
            <span className="v2-label">LESS FRICTION. MORE THOUGHT.</span>
            <h2 id="closing-title">
              It starts with
              <br />
              <span>your voice.</span>
            </h2>
          </div>
          <div className="v2-closing-actions">
            <a className="v2-button" href={`${repositoryUrl}/releases`}>
              Explore releases <span aria-hidden="true">↗</span>
            </a>
            <p>Find available builds and release notes.</p>
            <a className="v2-text-link" href={repositoryUrl}>
              View the open-source project <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
      <footer className="v2-footer v2-container">
        <a href="#top" className="v2-wordmark">
          <WaveformMark size={25} />
          looper
        </a>
        <p>A little more room to think.</p>
        <nav aria-label="Footer">
          <a href="/">Compare with V1</a>
          <a href={repositoryUrl}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </footer>
    </div>
  );
}
