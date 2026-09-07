const repositoryUrl = "https://github.com/jamescardona11/looper";

export function ComingNext() {
  return (
    <section className="v2-coming v2-container" id="coming" aria-labelledby="coming-title">
      <div className="v2-coming-intro">
        <span className="v2-label">07 — THE NEXT CHAPTER</span>
        <h2 id="coming-title">
          Coming next.
          <br />
          <span>Coming together.</span>
        </h2>
        <p>From the desk to your phone, with your words along for the ride.</p>
        <a className="v2-text-link" href={`${repositoryUrl}/releases`}>
          Follow the releases <span aria-hidden="true">↗</span>
        </a>
      </div>
      <ol className="v2-roadmap">
        <li>
          <span className="v2-label">01 / DESKTOP</span>
          <div>
            <h3>The starting point.</h3>
            <p>
              Dictation, recordings and a local Library. Check the release notes for available macOS
              and Windows builds.
            </p>
          </div>
          <span className="v2-roadmap-status">Preview</span>
        </li>
        <li>
          <span className="v2-label">02 / MOBILE</span>
          <div>
            <h3>Away from the keyboard.</h3>
            <p>
              The app is taking shape on iPhone and Android. Public distribution is the next step;
              no store release date yet.
            </p>
          </div>
          <span className="v2-roadmap-status">Coming</span>
        </li>
        <li>
          <span className="v2-label">03 / CONTINUITY</span>
          <div>
            <h3>Pick up where you left off.</h3>
            <p>
              Sync and web review are in development. Availability depends on the release and your
              account setup.
            </p>
          </div>
          <span className="v2-roadmap-status">In progress</span>
        </li>
      </ol>
    </section>
  );
}

export function PricingV2() {
  return (
    <section className="v2-pricing v2-container" id="pricing" aria-labelledby="pricing-v2-title">
      <div className="v2-price-card">
        <span className="v2-label">08 — PRICING / TODAY</span>
        <h2 id="pricing-v2-title">
          Free
          <br />
          <span>for now.</span>
        </h2>
        <p>
          Get to know Looper. Explore the current desktop release and make room for your own words.
        </p>
        <a className="v2-button" href={`${repositoryUrl}/releases`}>
          Explore releases <span aria-hidden="true">↗</span>
        </a>
        <span className="v2-label">OPEN SOURCE · AGPLv3</span>
      </div>
      <div className="v2-price-details">
        <h3>
          A few things
          <br />
          worth knowing.
        </h3>
        <dl>
          <div>
            <dt>Local transcription</dt>
            <dd>
              Runs on your hardware after downloading a speech model. No cloud transcription service
              is needed for local mode.
            </dd>
          </div>
          <div>
            <dt>Your cloud provider</dt>
            <dd>
              Cloud features are optional. If you use your own API key, your provider’s usage
              charges and terms apply separately.
            </dd>
          </div>
          <div>
            <dt>What comes later</dt>
            <dd>
              Future Looper plans and sync pricing have not been announced. “Free for now” is the
              current offer, not a lifetime pricing promise.
            </dd>
          </div>
        </dl>
        <a className="v2-text-link" href={`${repositoryUrl}#getting-started`}>
          Current release information <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
