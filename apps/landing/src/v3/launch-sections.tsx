import type { CSSProperties } from "react";
import dictationImage from "../../../../assets/product/mobile-dictation.png";
import captureImage from "../../../../assets/product/mobile-capture.png";
import meetingImage from "../../../../assets/product/mobile-meeting.png";
import { revealWhenVisible } from "./reveal";
const releases = "https://github.com/jamescardona11/looper/releases";
const faq = [
  [
    "What can I do with Looper?",
    "Dictate into your apps, record bot-free meetings, import audio, organize notes and ask questions about saved transcripts. Styles, snippets and vocabulary help make the output your own.",
  ],
  [
    "Does my audio leave my computer?",
    "Local transcription runs on your computer. If you select a cloud transcription or AI provider, the content required for that feature is sent to that provider. Local transcription does not make every AI feature offline.",
  ],
  [
    "Is it free?",
    "Looper is free for now. Local models run on your hardware. Cloud providers may charge separately when you use your own API key.",
  ],
  [
    "Can I use it on my phone?",
    "Mobile is coming. The screens on this page are real captures from our mobile app with sample data, not a public App Store or Google Play release.",
  ],
  [
    "Can I keep the original?",
    "You can return to your recordings and transcripts, edit notes and export your work. Translating or cleaning up text does not require you to give up the original transcript.",
  ],
  [
    "Where is the source code?",
    "Looper’s source is public under AGPLv3. You can inspect the implementation and follow development on GitHub.",
  ],
];

const mobileScreens = [
  {
    id: "mobile-dictation",
    navigationLabel: "Dictation",
    src: dictationImage,
    label: "Your day, in words",
    alt: "Real Looper mobile home screen in Spanish with dictation activity and recent notes",
  },
  {
    id: "mobile-capture",
    navigationLabel: "Capture",
    src: captureImage,
    label: "Catch the moment",
    alt: "Real Looper mobile capture sheet with meeting and voice note options",
  },
  {
    id: "mobile-meeting",
    navigationLabel: "Meeting",
    src: meetingImage,
    label: "Take the next step",
    alt: "Real Looper mobile meeting note with launch decisions and next steps",
  },
];

export function MobilePreview() {
  return (
    <section className="v3-mobile" id="mobile" aria-labelledby="mobile-title">
      <div className="v3-wrap v3-mobile-heading" ref={revealWhenVisible}>
        <div>
          <span className="v3-coming-label">IN THE MAKING · MOBILE</span>
          <h2 id="mobile-title">
            Good ideas
            <br />
            <em>go places.</em>
          </h2>
        </div>
        <p>
          A thought on a walk.
          <br />A conversation worth keeping.
          <br />
          Soon, a little Looper in your pocket.
        </p>
      </div>
      <section className="v3-phones" aria-label="Mobile app previews" ref={revealWhenVisible}>
        {mobileScreens.map((screen, i) => (
          <figure key={screen.src} id={screen.id} style={{ "--phone-index": i } as CSSProperties}>
            <img src={screen.src} alt={screen.alt} width="660" height="1434" loading="lazy" />
            <figcaption>{screen.label}</figcaption>
          </figure>
        ))}
      </section>
      <nav className="v3-phone-nav" aria-label="Mobile preview screens">
        {mobileScreens.map((screen) => (
          <a key={screen.id} href={`#${screen.id}`}>
            {screen.navigationLabel}
          </a>
        ))}
      </nav>
      <p className="v3-mobile-note">Real app captures · Sample data · Mobile launch coming</p>
    </section>
  );
}

export function DownloadSection() {
  return (
    <section className="v3-download" id="download" aria-labelledby="download-title">
      <div className="v3-wrap">
        <div className="v3-download-top">
          <span className="v3-coming-label">FREE FOR NOW</span>
          <p>
            A small download.
            <br />A little more room in your day.
          </p>
        </div>
        <h2 id="download-title" ref={revealWhenVisible}>
          Got a thought?
          <br />
          <em>Let it out.</em>
        </h2>
        <div className="v3-download-links">
          <a className="v3-button" href={`${releases}/latest/download/Looper_darwin_aarch64.dmg`}>
            Download for macOS
          </a>
          <a
            className="v3-button v3-button-outline"
            href={`${releases}/latest/download/Looper_windows_x64_setup.exe`}
          >
            Download for Windows
          </a>
        </div>
        <p className="v3-download-note">
          macOS 14+ · Apple Silicon / Windows x64
          <br />
          Local models use your hardware. Your cloud provider may charge separately.
        </p>
        <div className="v3-roadmap">
          <span>And there’s more on the way.</span>
          <p>
            Mobile <span>Coming</span>
          </p>
          <p>
            Sync across devices <span>Coming</span>
          </p>
          <a href={releases}>Follow the releases</a>
        </div>
      </div>
    </section>
  );
}

export function FrequentlyAsked() {
  return (
    <section className="v3-faq v3-wrap" aria-labelledby="faq-title">
      <h2 id="faq-title">
        A few things
        <br />
        <em>you might ask.</em>
      </h2>
      <div>
        {faq.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <span aria-hidden="true">+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
