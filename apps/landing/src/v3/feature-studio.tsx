import { useState } from "react";
import { revealWhenVisible } from "./reveal";

export function FeatureStudio() {
  const [tone, setTone] = useState("Work");
  const [expanded, setExpanded] = useState(false);
  const [language, setLanguage] = useState("Español");
  return (
    <section className="v3-studio v3-wrap" id="features" aria-labelledby="studio-title">
      <div className="v3-studio-intro" ref={revealWhenVisible}>
        <h2 id="studio-title">
          Your words.
          <br />
          <em>Your kind of weird.</em>
        </h2>
        <p>The names you know. The phrases you repeat. The way you sound.</p>
      </div>
      <div className="v3-scenes">
        <article className="v3-scene v3-scene-tone">
          <div className="v3-scene-copy">
            <span className="v3-micro">STYLES</span>
            <h3>
              Same you.
              <br />
              Different room.
            </h3>
            <p>
              Your work voice and your group-chat voice don’t have to be the same. Set styles for
              your apps and websites.
            </p>
          </div>
          <div className="v3-style-demo">
            <fieldset className="v3-switch">
              <legend className="sr-only">Choose a writing style</legend>
              {["Work", "Friends"].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tone === value}
                  onClick={() => setTone(value)}
                >
                  {value}
                </button>
              ))}
            </fieldset>
            <div key={tone} className="v3-demo-paper">
              <span className="v3-micro">
                {tone === "Work" ? "THE FOLLOW-UP" : "THE GROUP CHAT"}
              </span>
              <p aria-live="polite">
                {tone === "Work"
                  ? "Thanks for today. Shall we pick this up tomorrow at 10?"
                  : "Loved catching up! Same time tomorrow?"}
              </p>
              <span aria-hidden="true">↗</span>
            </div>
            <small>Style example · output depends on your model</small>
          </div>
        </article>
        <article className="v3-scene v3-scene-snippet">
          <div className="v3-scene-copy">
            <span className="v3-micro">SNIPPETS & VOCABULARY</span>
            <h3>
              Big ideas.
              <br />
              Tiny shortcuts.
            </h3>
            <p>
              A phrase becomes your full signature. A name becomes familiar. Make room for the words
              that are yours.
            </p>
          </div>
          <div className="v3-snippet-demo">
            <span className="v3-spoken-chip">“my sign-off”</span>
            <span className="v3-snippet-arrow" aria-hidden="true">
              ↓
            </span>
            <button
              type="button"
              className="v3-snippet-paper"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <span className="v3-signature" key="expanded">
                  Talk soon,
                  <br />
                  <strong>María</strong>
                  <br />
                  <small>Product designer · Looper</small>
                </span>
              ) : (
                <span>
                  Expand the snippet <b aria-hidden="true">↗</b>
                </span>
              )}
            </button>
            <small>Interactive example</small>
          </div>
        </article>
        <article className="v3-scene v3-scene-language">
          <div className="v3-scene-copy">
            <span className="v3-micro">LANGUAGES</span>
            <h3>
              Thoughts don’t
              <br />
              need a passport.
            </h3>
            <p>
              Dictate in your language. Translate saved transcripts when you need to. Language
              support depends on the model you choose.
            </p>
          </div>
          <div className="v3-language-demo">
            <div className="v3-language-orbit" aria-hidden="true">
              <span>hola</span>
              <span>hello</span>
              <span>bonjour</span>
            </div>
            <fieldset className="v3-switch">
              <legend className="sr-only">Choose a language example</legend>
              {["Español", "English"].map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={language === value}
                  onClick={() => setLanguage(value)}
                >
                  {value}
                </button>
              ))}
            </fieldset>
            <p key={language} lang={language === "Español" ? "es" : "en"} aria-live="polite">
              {language === "Español"
                ? "Las buenas ideas empiezan con una conversación."
                : "Good ideas start with a conversation."}
            </p>
            <small>Illustrative language examples</small>
          </div>
        </article>
      </div>
    </section>
  );
}
