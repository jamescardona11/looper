import { COMPETITORS } from "../components/comparison-data";
import type { FocusEvent } from "react";

function revealColumn(event: FocusEvent<HTMLAnchorElement>) {
  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}

// V2 uses a fresh editorial review; V1 keeps its original comparison snapshot.
const rows = [
  {
    name: "Dictation in your apps",
    looper: "Yes",
    others: ["Yes", "Not advertised", "Not advertised", "Not advertised"],
  },
  {
    name: "Bot-free meetings",
    looper: "Yes",
    others: ["Yes · Mac", "Yes", "Yes", "Yes"],
  },
  {
    name: "Local transcription",
    looper: "Yes",
    others: ["Cloud only", "Not advertised", "Yes", "Yes"],
  },
  {
    name: "Bring your own AI key",
    looper: "Yes",
    others: ["Not advertised", "Not advertised", "Yes", "Yes · summaries"],
  },
  {
    name: "Public source code",
    looper: "AGPLv3",
    others: ["Not advertised", "Not advertised", "MIT", "Community · MIT"],
  },
  {
    name: "Public mobile app",
    looper: "Coming",
    others: ["iOS + Android¹", "iOS + Android", "Not advertised", "Not advertised"],
  },
] as const;

export function ComparisonV2({ showLinkArrows = true }: { showLinkArrows?: boolean }) {
  return (
    <section className="v2-compare v2-container" id="compare" aria-labelledby="compare-title">
      <div className="v2-section-heading">
        <span className="v2-label">06 — FIND YOUR FIT</span>
        <h2 id="compare-title">
          Different tools.
          <br />
          Real tradeoffs.
        </h2>
        <p>
          Looper brings dictation, meeting notes and local transcription together. Other tools
          already offer a public mobile app. Here’s where things stand.
        </p>
      </div>
      <p className="v2-table-hint v2-label" id="compare-scroll-hint">
        SCROLL THE TABLE TO EXPLORE ALL FIVE TOOLS →
      </p>
      <section
        className="v2-comparison-scroll"
        aria-label="Product comparison"
        aria-describedby="compare-scroll-hint"
      >
        <table>
          <caption className="v2-sr-only">
            Looper and four alternatives, reviewed September 6, 2026
          </caption>
          <thead>
            <tr>
              <th scope="col">What matters to you</th>
              <th scope="col">
                <a href="https://github.com/jamescardona11/looper" onFocus={revealColumn}>
                  looper{showLinkArrows && " ↗"}
                </a>
              </th>
              {COMPETITORS.map((competitor) => (
                <th scope="col" key={competitor.name}>
                  <a href={competitor.url} onFocus={revealColumn}>
                    {competitor.name}
                    {showLinkArrows && " ↗"}
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td>{row.looper}</td>
                {COMPETITORS.map((competitor, index) => (
                  <td key={competitor.name}>{row.others[index]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="v2-comparison-notes">
        <p>
          “Not advertised” means we didn’t find it on the linked product pages, not that it is
          impossible. Features and availability vary by plan and platform.
        </p>
        <p>
          ¹ Wispr’s mobile apps offer dictation;{" "}
          <a href="https://wisprflow.ai/notetaker">Notetaker</a> is Mac-only. Its{" "}
          <a href="https://wisprflow.ai/privacy">privacy page</a> describes cloud transcription.
        </p>
        <span className="v2-label">SOURCES: LINKED PRODUCT PAGES · REVIEWED SEPTEMBER 6, 2026</span>
      </div>
    </section>
  );
}
