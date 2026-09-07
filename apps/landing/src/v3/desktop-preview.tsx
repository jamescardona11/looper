import desktopHome from "../../../../assets/product/desktop-home-capture.jpeg";
import { revealWhenVisible } from "./reveal";

export function DesktopPreview() {
  return (
    <section className="v3-desktop v3-wrap" id="desktop" aria-labelledby="desktop-title">
      <div className="v3-desktop-copy" ref={revealWhenVisible}>
        <span className="v3-eyebrow">INSIDE LOOPER</span>
        <h2 id="desktop-title">
          This is where
          <br />
          <em>it all lands.</em>
        </h2>
        <p>A shortcut to get the words out. A home to come back to them.</p>
        <ol className="v3-shortcut-steps">
          <li>
            <kbd>fn</kbd>
            <div>
              <strong>Hold. Speak. Release.</strong>
              <p>
                On Mac, hold your shortcut to dictate. Release to insert the words into your app.
              </p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">↩</span>
            <div>
              <strong>Come back to your words.</strong>
              <p>Your dictation history lives in Looper, alongside meetings and Memory.</p>
            </div>
          </li>
        </ol>
        <p className="v3-desktop-shortcut-note">
          Use your configured shortcut on Windows. Shortcuts are customizable.
        </p>
      </div>
      <figure className="v3-desktop-capture" ref={revealWhenVisible}>
        <a
          href={desktopHome}
          target="_blank"
          rel="noreferrer"
          aria-label="View full-size Looper desktop capture (opens a new tab)"
        >
          <img
            src={desktopHome}
            width="900"
            height="750"
            loading="lazy"
            alt="Real Looper desktop app showing the Hold Fn shortcut, recent dictations and navigation to Meetings and Memory, with sample data in Spanish."
          />
          <span className="v3-capture-expand" aria-hidden="true">
            Take a closer look ↗
          </span>
        </a>
        <figcaption>Desktop app · Sample data · Captured August 22, 2026</figcaption>
      </figure>
    </section>
  );
}
