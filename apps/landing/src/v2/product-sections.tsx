import mobileCapture from "../../../../assets/product/mobile-capture.png";
import mobileHome from "../../../../assets/product/mobile-dictation.png";
import mobileMeeting from "../../../../assets/product/mobile-meeting.png";

const features = [
  {
    number: "01",
    name: "Memory & Ask",
    title: "Find the thought again.",
    description:
      "Search your saved words in Memory. Ask a recording about decisions, dates or next steps, with timestamps to take you back.",
  },
  {
    number: "02",
    name: "Imports",
    title: "Already recorded? Bring it.",
    description:
      "Turn audio and video files into Library items. Import a YouTube recording to work with its transcript and notes.",
  },
  {
    number: "03",
    name: "Snippets",
    title: "Say less. Insert more.",
    description:
      "Give the phrases you repeat a shortcut. Keep reusable text beside your dictionary and writing preferences.",
  },
  {
    number: "04",
    name: "Translation",
    title: "Let the words travel.",
    description:
      "Translate a saved transcript into another language and keep the original within reach.",
  },
];

const mobileScreens = [
  {
    src: mobileHome,
    label: "01 / YOUR DAY",
    title: "A place for every thought.",
    alt: "Real Looper mobile home in Spanish, showing weekly activity and recent recordings with sample data.",
  },
  {
    src: mobileCapture,
    label: "02 / YOUR NEXT RECORDING",
    title: "A meeting. Or a moment.",
    alt: "Real Looper mobile capture menu in Spanish, offering a meeting or a voice note.",
  },
  {
    src: mobileMeeting,
    label: "03 / THE DETAILS",
    title: "Come back with context.",
    alt: "Real Looper mobile launch-review note in Spanish, with sample summary, decisions, tasks and transcript access.",
  },
];

export function MoreFeatures() {
  return (
    <section className="v2-toolkit v2-container" id="features" aria-labelledby="toolkit-title">
      <div className="v2-section-heading">
        <span className="v2-label">04 — MORE THAN THE FIRST DRAFT</span>
        <h2 id="toolkit-title">
          Keep working
          <br />
          with your words.
        </h2>
        <p>
          A recording is a starting point. Find it, ask it, reuse it, or take it into another
          language.
        </p>
      </div>
      <div className="v2-feature-list">
        {features.map((feature) => (
          <article key={feature.name}>
            <span className="v2-label">
              {feature.number} / {feature.name}
            </span>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </article>
        ))}
      </div>
      <p className="v2-fine-print">
        Desktop features. AI answers and translation depend on your configured model or provider.
      </p>
    </section>
  );
}

export function MobilePreview() {
  return (
    <section className="v2-mobile-preview" id="mobile" aria-labelledby="mobile-title">
      <div className="v2-container">
        <div className="v2-mobile-heading">
          <div>
            <span className="v2-label">05 — AWAY FROM YOUR DESK</span>
            <h2 id="mobile-title">
              Same thoughts.
              <br />
              <span>Smaller pocket.</span>
            </h2>
          </div>
          <div>
            <span className="v2-release-badge">MOBILE / LAUNCH PREVIEW</span>
            <p>
              A quick note on the way home. The meeting you want to remember. A look at Looper on
              your phone.
            </p>
            <a className="v2-text-link" href="#coming">
              See what’s coming <span aria-hidden="true">↘</span>
            </a>
          </div>
        </div>
        <section
          className="v2-phone-gallery"
          aria-label="Mobile app screenshots. Scroll to see all three."
        >
          {mobileScreens.map((screen) => (
            <figure key={screen.src}>
              <a
                href={screen.src}
                target="_blank"
                rel="noreferrer"
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({
                    block: "nearest",
                    inline: "center",
                    behavior: "instant",
                  })
                }
                aria-label={`View full-size screenshot: ${screen.title} (opens a new tab)`}
              >
                <img src={screen.src} width="660" height="1434" loading="lazy" alt={screen.alt} />
              </a>
              <figcaption>
                <span className="v2-label">{screen.label}</span>
                <h3>{screen.title}</h3>
              </figcaption>
            </figure>
          ))}
        </section>
        <p className="v2-fine-print">
          Actual app screenshots · sample data · Spanish interface. Public mobile release coming;
          store availability has not been announced.
        </p>
      </div>
    </section>
  );
}
