import { ComparisonTable } from "./components/comparison-table";
import { Features } from "./components/features";
import { FinalCta } from "./components/final-cta";
import { Hero } from "./components/hero";
import { HowItWorks } from "./components/how-it-works";
import { LocalModel } from "./components/local-model";
import { PlatformStrip } from "./components/platform-strip";
import { Pricing } from "./components/pricing";
import { Roadmap } from "./components/roadmap";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { SmallPrint } from "./components/small-print";

/**
 * The launch page, in the order both artboards run it.
 *
 * `<HowItWorks />` is the three beats: speak anywhere, the meeting band that
 * breaks the split rhythm, then the split reversed. It is one import because the
 * design puts nothing between them; the three are exported individually too, so
 * the day something goes between them this fragment can be unpacked.
 *
 * The <main> wrapper is load-bearing beyond semantics: vite.config.ts sets
 * `renderAfterElementExists: "main h1"`, so the prerenderer waits for the hero's
 * <h1> to appear inside a <main> before it snapshots the page. Move the header
 * inside <main>, or drop the wrapper, and the build hangs rather than failing.
 */
export function App() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <PlatformStrip />
        <HowItWorks />
        <Features />
        <LocalModel />
        <ComparisonTable />
        <SmallPrint />
        <Roadmap />
        <Pricing />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
